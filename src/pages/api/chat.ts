/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";
import {
  buildLiveContext,
  generateChatReply,
  resolveChatIdentity,
  retrieveKnowledge,
} from "@/server/chatbot/brain";
import type { ChatFrontendContext, ChatIdentity } from "@/server/chatbot/brain";
import { getRelevantNavigation } from "@/lib/chatbot/navigation";
import type { ChatTraceStep } from "@/lib/chatbot/responseRenderer";
import { getRelevantWorkflows } from "@/lib/chatbot/workflows";
import { getChatAccessPolicy } from "@/server/chatbot/accessPolicy";
import { routeChatQuestion } from "@/server/chatbot/router";
import { loadDynamicTools, selectDynamicTools } from "@/server/chatbot/dynamicTools";

const MAX_MESSAGE_LENGTH = 4_000;
const MAX_GROUNDING_PASSES = 2;
const SESSION_IDLE_TIMEOUT_MS = 45 * 60 * 1_000;
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const DEV_USER_ID = "00000000-0000-0000-0000-000000000000";

type ChatErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "UNAUTHENTICATED"
  | "PROFILE_UNAVAILABLE"
  | "HISTORY_LOAD_FAILED"
  | "CHAT_ID_REQUIRED"
  | "CHAT_NOT_FOUND"
  | "CHAT_LOOKUP_FAILED"
  | "CHAT_DELETE_FAILED"
  | "MESSAGE_REQUIRED"
  | "MESSAGE_TOO_LONG"
  | "COMPANY_CONTEXT_MISSING"
  | "SESSION_CREATE_FAILED"
  | "USER_MESSAGE_SAVE_FAILED"
  | "ASSISTANT_MESSAGE_SAVE_FAILED"
  | "CHAT_REPLY_UNAVAILABLE";

function chatError(
  res: NextApiResponse,
  status: number,
  code: ChatErrorCode,
  message: string,
  retryable = true,
  extra: Record<string, unknown> = {},
) {
  return res.status(status).json({ error: message, code, retryable, ...extra });
}

function sessionHasExpired(session: { started_at?: string | null; ended_at?: string | null }, lastActivityAt?: string | null) {
  if (session.ended_at) return true;
  const now = Date.now();
  const startedAt = Date.parse(String(session.started_at || ""));
  const activityAt = Date.parse(String(lastActivityAt || session.started_at || ""));
  if (!Number.isFinite(startedAt) || !Number.isFinite(activityAt)) return false;
  return now - startedAt >= SESSION_MAX_AGE_MS || now - activityAt >= SESSION_IDLE_TIMEOUT_MS;
}

function isLocalDevBypass(req: NextApiRequest): boolean {
  const host = String(req.headers.host || "").split(":")[0].toLowerCase();
  const devFlag = String(req.query.dev || "").toLowerCase();
  const referrer = String(req.headers.referer || "");
  return process.env.NODE_ENV !== "production"
    && (host === "localhost" || host === "127.0.0.1")
    && (["true", "1"].includes(devFlag) || /[?&]dev(?:=true|=1)(?:&|$)/i.test(referrer));
}

function getLocalDevIdentity(): { user: { id: string }; identity: ChatIdentity } {
  return {
    user: { id: DEV_USER_ID },
    identity: {
      userId: DEV_USER_ID,
      companyId: null,
      role: "super_admin",
      fullName: "DEV MODE - Super Admin",
      regionId: null,
      regionsCovered: [],
    },
  };
}

async function closeExpiredSession(db: any, sessionId: string, userId: string) {
  await db.from("chat_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .is("ended_at", null);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST", "DELETE"].includes(req.method || "")) {
    res.setHeader("Allow", "GET, POST, DELETE");
    return chatError(res, 405, "METHOD_NOT_ALLOWED", "This chat request is not supported.", false);
  }

  const db = createPagesServerClient({ req, res }) as any;
  const localDevBypass = isLocalDevBypass(req);
  const devAuth = localDevBypass ? getLocalDevIdentity() : null;
  const { data: { user: authenticatedUser } } = devAuth ? { data: { user: devAuth.user } } : await db.auth.getUser();
  const user = authenticatedUser;
  if (!user) return chatError(res, 401, "UNAUTHENTICATED", "Please sign in before using the assistant.", false);
  const identity = localDevBypass ? devAuth?.identity || null : await resolveChatIdentity(db, user.id);
  if (!identity) return chatError(res, 403, "PROFILE_UNAVAILABLE", "Your account profile is not available yet. Please contact an administrator.", false);
  const isPlatformAdmin = identity.role === "super_admin";

  if (req.method === "GET") {
    let sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : null;
    const requestedSessionId = Boolean(sessionId);

    // A caller may have retained a session id from an earlier page state.
    // Validate it before loading messages and apply the same idle/max-age
    // rules as POST. An expired session must never fall through to a
    // user-wide message query, otherwise an old morning conversation can be
    // shown as if it were the current chat.
    if (sessionId) {
      let requestedSessionQuery = db.from("chat_sessions").select("id, user_role, started_at, ended_at")
        .eq("id", sessionId).eq("user_id", user.id).eq("user_role", identity.role);
      requestedSessionQuery = identity.companyId
        ? requestedSessionQuery.eq("company_id", identity.companyId)
        : requestedSessionQuery.is("company_id", null);
      const { data: requestedSession } = await requestedSessionQuery.maybeSingle();
      if (!requestedSession) {
        sessionId = null;
      } else {
        const { data: lastMessage } = await db.from("chat_messages").select("created_at")
          .eq("session_id", requestedSession.id).eq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (sessionHasExpired(requestedSession, lastMessage?.created_at)) {
          await closeExpiredSession(db, requestedSession.id, user.id);
          sessionId = null;
        }
      }
    }

    if (!sessionId && !requestedSessionId) {
      let latestSessionQuery = db.from("chat_sessions").select("id, user_role, started_at, ended_at")
        .eq("user_id", user.id).eq("user_role", identity.role);
      latestSessionQuery = identity.companyId
        ? latestSessionQuery.eq("company_id", identity.companyId)
        : latestSessionQuery.is("company_id", null);
      const { data: latestSession } = await latestSessionQuery.order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (latestSession) {
        const { data: lastMessage } = await db.from("chat_messages").select("created_at")
          .eq("session_id", latestSession.id).eq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (sessionHasExpired(latestSession, lastMessage?.created_at)) {
          await closeExpiredSession(db, latestSession.id, user.id);
        } else {
          sessionId = latestSession.id;
        }
      }
    }

    // No active session means a genuinely fresh chat. Do not query by only
    // user_id here: that would merge messages from every prior session.
    if (!sessionId) return res.status(200).json({ sessionId: null, messages: [], role: identity.role });

    const { data, error } = await db.from("chat_messages")
      .select("id, session_id, role, content, metadata, created_at")
      .eq("user_id", user.id).eq("session_id", sessionId)
      .order("created_at", { ascending: true }).limit(50);
    if (error) {
      console.error("[api/chat] history load failed:", error.message);
      return chatError(res, 500, "HISTORY_LOAD_FAILED", "Your chat history could not be loaded. Please try again.");
    }
    return res.status(200).json({ sessionId, messages: data || [], role: identity.role });
  }

  if (req.method === "DELETE") {
    const sessionId = String(req.query.sessionId || req.body?.sessionId || "").trim();
    if (!sessionId) return chatError(res, 400, "CHAT_ID_REQUIRED", "Select a chat before trying to remove it.", false);
    let sessionQuery = db.from("chat_sessions").select("id")
      .eq("id", sessionId).eq("user_id", user.id);
    sessionQuery = identity.companyId
      ? sessionQuery.eq("company_id", identity.companyId)
      : sessionQuery.is("company_id", null);
    const { data: session, error: sessionError } = await sessionQuery.maybeSingle();
    if (sessionError) {
      console.error("[api/chat] chat lookup failed:", sessionError.message);
      return chatError(res, 500, "CHAT_LOOKUP_FAILED", "This chat could not be opened right now. Please try again.");
    }
    if (!session) return chatError(res, 404, "CHAT_NOT_FOUND", "That chat is no longer available.", false);
    const { error: deleteError } = await db.from("chat_sessions").delete().eq("id", sessionId).eq("user_id", user.id);
    if (deleteError) {
      console.error("[api/chat] chat deletion failed:", deleteError.message);
      return chatError(res, 500, "CHAT_DELETE_FAILED", "This chat could not be removed right now. Please try again.");
    }
    return res.status(200).json({ deleted: true, sessionId });
  }

  const message = String(req.body?.message || "").trim();
  if (!message) return chatError(res, 400, "MESSAGE_REQUIRED", "Type a message first.", false);
  if (message.length > MAX_MESSAGE_LENGTH) return chatError(res, 413, "MESSAGE_TOO_LONG", "Please shorten your message to 4,000 characters or fewer.", false);
  // Platform super admins intentionally have no tenant company_id. Their
  // conversation is platform-scoped; every other role must stay tenant-bound.
  if (!identity.companyId && !isPlatformAdmin) return chatError(res, 400, "COMPANY_CONTEXT_MISSING", "Your account is not linked to a company yet. Ask an administrator to finish setup.", false);
  const clientMessageId = typeof req.body?.clientMessageId === "string"
    ? req.body.clientMessageId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100)
    : "";
  const temporary = req.body?.temporary === true || req.body?.temporary === "true";

  let sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : null;
  let sessionReset = false;
  let persistenceAvailable = !temporary;
  if (!temporary && sessionId) {
    let sessionQuery = db.from("chat_sessions").select("id, user_role, started_at, ended_at")
      .eq("id", sessionId).eq("user_id", user.id).eq("user_role", identity.role);
    sessionQuery = identity.companyId
      ? sessionQuery.eq("company_id", identity.companyId)
      : sessionQuery.is("company_id", null);
    const { data: session, error } = await sessionQuery.maybeSingle();
    if (error || !session) {
      sessionId = null;
      sessionReset = true;
    } else {
      const { data: lastMessage } = await db.from("chat_messages").select("created_at")
        .eq("session_id", session.id).eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (sessionHasExpired(session, lastMessage?.created_at)) {
        await closeExpiredSession(db, session.id, user.id);
        sessionId = null;
        sessionReset = true;
      }
    }
  }
  if (!temporary && !sessionId) {
    const { data: session, error } = await db.from("chat_sessions").insert({
      company_id: identity.companyId,
      user_id: user.id,
      user_role: identity.role,
    }).select("id").single();
    if (error || !session) {
      // Older deployments still have tenant-only chat tables. Keep the
      // platform assistant usable while the nullable-scope migration runs;
      // tenant chats continue to fail closed.
      if (!isPlatformAdmin) {
        console.error("[api/chat] chat session creation failed:", error?.message || "unknown error");
        return chatError(res, 500, "SESSION_CREATE_FAILED", "A new chat could not be started right now. Please try again.");
      }
      persistenceAvailable = false;
      sessionId = null;
      console.warn("[api/chat] platform chat persistence unavailable; continuing transiently until platform chat migration is applied");
    } else {
      sessionId = session.id;
    }
  }

  const history = Array.isArray(req.body?.history)
    ? req.body.history.filter((item: any) => ["user", "assistant"].includes(item?.role) && typeof item?.content === "string").slice(-8)
    : [];
  if (persistenceAvailable && sessionId) {
    const { error: userMessageError } = await db.from("chat_messages").insert({
      session_id: sessionId,
      company_id: identity.companyId,
      user_id: user.id,
      role: "user",
      content: message,
      metadata: { role: identity.role, ...(clientMessageId ? { client_message_id: clientMessageId } : {}) },
    });
    if (userMessageError) {
      if (!isPlatformAdmin) {
        console.error("[api/chat] user message save failed:", userMessageError.message);
        return chatError(res, 500, "USER_MESSAGE_SAVE_FAILED", "Your message could not be saved right now. Please try again.");
      }
      persistenceAvailable = false;
      console.warn("[api/chat] platform user message persistence unavailable; continuing transiently until platform chat migration is applied");
    }
  }

  try {
    let route = routeChatQuestion(message);
    // Custom tool phrases are manager-defined, so the static intent router
    // cannot know them in advance. Check those definitions before deciding a
    // question is knowledge-only; an exact custom match is current data.
    if (!route.useLiveData && route.useKnowledge) {
      const matchingCustomTool = selectDynamicTools(await loadDynamicTools(db, identity), message, 1)[0];
      if (matchingCustomTool) {
        route = {
          route: "live_data",
          useKnowledge: false,
          useLiveData: true,
          explanation: `The question matches the approved ${matchingCustomTool.name} tool.`,
        };
      }
    }
    // Knowledge-only questions do not need a policy read because no live
    // tools are executed. Avoid two database round trips on greetings and
    // basic product questions; live-data and hybrid routes remain gated.
    const accessPolicy = route.useLiveData
      ? await getChatAccessPolicy(db, identity.companyId, identity.role)
      : null;
    const workflow = getRelevantWorkflows(message, identity.role, 1)[0];
    const trace: ChatTraceStep[] = [
      { id: "plan", type: "plan", title: "Understood your request", status: "completed", detail: route.explanation },
    ];
    if (workflow) {
      trace.push({ id: "workflow", type: "plan", title: `Mapped the ${workflow.label.toLowerCase()} process`, status: "completed", detail: `${workflow.steps.length} role-approved steps are available below.` });
    }
    const [liveContext, initialKnowledge] = await Promise.all([
      route.useLiveData
        ? buildLiveContext(db, identity, accessPolicy || undefined, message)
        : Promise.resolve("LIVE DATA ROUTE: This question was classified as knowledge-first. Do not invent current records; use indexed stable knowledge and navigation only."),
      route.useKnowledge ? retrieveKnowledge(db, identity.companyId, identity.role, message) : Promise.resolve([]),
    ]);
    let knowledge = initialKnowledge;
    if (route.useLiveData) {
      trace.push({ id: "live-data", type: "database", title: "Checked approved live data", status: "completed", detail: "Used role-scoped application tools at question time." });
    } else {
      trace.push({ id: "live-data", type: "database", title: "Live data not needed", status: "skipped", detail: "This answer uses stable knowledge and navigation." });
    }
    if (route.useKnowledge) {
      trace.push({ id: "knowledge-search", type: "search", title: "Searched approved knowledge", status: knowledge.length ? "completed" : "failed", detail: knowledge.length ? `${knowledge.length} relevant source${knowledge.length === 1 ? "" : "s"} found.` : "No exact source matched on the first pass." });
      if (!knowledge.length && MAX_GROUNDING_PASSES > 1) {
        const broaderQuery = `${message} CateringMS ${identity.role} operating guidance procedure`;
        const retryKnowledge = await retrieveKnowledge(db, identity.companyId, identity.role, broaderQuery);
        const seen = new Set(knowledge.map((item) => `${item.source}\n${item.content}`));
        knowledge = [...knowledge, ...retryKnowledge.filter((item) => !seen.has(`${item.source}\n${item.content}`))].slice(0, 5);
        trace.push({ id: "knowledge-retry", type: "verification", title: "Checked broader approved guidance", status: knowledge.length ? "completed" : "failed", detail: knowledge.length ? `${knowledge.length} source${knowledge.length === 1 ? "" : "s"} available after the second pass.` : "No approved source supports a specific answer." });
      }
    } else {
      trace.push({ id: "knowledge-search", type: "search", title: "Approved knowledge not needed", status: "skipped", detail: "The request is answered from current authorized data." });
    }
    trace.push({ id: "verification", type: "verification", title: route.useKnowledge && !knowledge.length ? "Evidence gap reported" : "Grounding verified", status: route.useKnowledge && !knowledge.length ? "failed" : "completed", detail: route.useKnowledge && !knowledge.length ? "The final answer must state what could not be verified." : "The final answer is restricted to the gathered context." });
    const currentSections = Array.isArray(req.body?.currentSections)
      ? req.body.currentSections
        .filter((item: any) => typeof item?.id === "string" && typeof item?.label === "string")
        .map((item: any) => ({ id: item.id.slice(0, 120), label: item.label.slice(0, 240), ref: typeof item.ref === "string" ? item.ref.slice(0, 160) : undefined, kind: typeof item.kind === "string" ? item.kind.slice(0, 30) : undefined }))
        .slice(0, 80)
      : [];
    const navigation = getRelevantNavigation(message, identity.role, 3, {
      pathname: typeof req.body?.currentPath === "string" ? req.body.currentPath : "",
      sections: currentSections,
    });
    const currentControls = Array.isArray(req.body?.currentControls)
      ? req.body.currentControls
        .filter((item: any) => typeof item?.label === "string")
        .map((item: any) => ({ label: item.label.replace(/\s+/g, " ").trim().slice(0, 160), kind: typeof item.kind === "string" ? item.kind.slice(0, 30) : undefined }))
        .filter((item: any) => item.label.length >= 2)
        .slice(0, 120)
      : [];
    const currentTags = Array.isArray(req.body?.currentTags)
      ? req.body.currentTags
        .filter((tag: any) => typeof tag === "string")
        .map((tag: string) => tag.replace(/\s+/g, " ").trim().slice(0, 100))
        .filter(Boolean)
        .slice(0, 80)
      : [];
    const frontend: ChatFrontendContext = {
      pathname: typeof req.body?.currentPath === "string" ? req.body.currentPath.slice(0, 300) : undefined,
      sections: currentSections,
      controls: currentControls,
      tags: currentTags,
    };
    const answer = await generateChatReply({ identity, message, history, liveContext, knowledge, navigation, route, workflow, frontend });
    const rendered = { ...answer.rendered, ...(workflow ? { workflow } : {}), trace: [...trace, { id: "final", type: "final" as const, title: "Answer prepared", status: "completed" as const }] };
    const assistantRow = {
      session_id: sessionId,
      company_id: identity.companyId,
      user_id: user.id,
      role: "assistant",
      // Store the direct message as the canonical chat content. The full
      // structured payload is kept in metadata for the rich renderer and
      // remains backwards-compatible with existing chat history rows.
      content: rendered.message,
      metadata: {
        provider: answer.provider,
        retrieval_count: answer.retrievalCount,
        response_payload: rendered,
        role: identity.role,
        live_data_enabled: accessPolicy?.liveDataEnabled ?? false,
        intent_route: route.route,
        navigation,
        ...(clientMessageId ? { client_message_id: clientMessageId } : {}),
      },
    };
    let assistantMessage: any = null;
    if (persistenceAvailable && sessionId) {
      const result = await db.from("chat_messages").insert(assistantRow).select("id, session_id, role, content, metadata, created_at").single();
      assistantMessage = result.data;
      if (result.error || !assistantMessage) {
        if (!isPlatformAdmin) {
          console.error("[api/chat] assistant message save failed:", result.error?.message || "unknown error");
          return chatError(res, 500, "ASSISTANT_MESSAGE_SAVE_FAILED", "The answer was prepared but could not be saved. Please try again.", true, { sessionId });
        }
        persistenceAvailable = false;
        console.warn("[api/chat] platform assistant message persistence unavailable; returning transient response until platform chat migration is applied");
      }
    }
    if (!assistantMessage) {
      assistantMessage = {
        id: `transient-${Date.now()}`,
        session_id: null,
        role: "assistant",
        content: rendered.message,
        metadata: assistantRow.metadata,
        created_at: new Date().toISOString(),
      };
    }
    if (persistenceAvailable && sessionId) {
      const { error: touchError } = await db.from("chat_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", sessionId).eq("user_id", user.id);
      if (touchError) console.warn("[api/chat] could not update session activity:", touchError.message);
    }
    return res.status(200).json({ sessionId, sessionReset, message: assistantMessage, sources: knowledge.map((item) => item.source), navigation, response_payload: rendered, intent_route: route.route, temporary });
  } catch (error) {
    console.error("[api/chat] reply failed:", error);
    return chatError(res, 503, "CHAT_REPLY_UNAVAILABLE", "I could not prepare an answer right now. Please try again in a moment.", true, { sessionId });
    /* Legacy response removed; the structured error above is the only response path.
      error: "I couldn’t prepare an answer right now. Please try again in a moment.",
      sessionId,
    }); */
  }
}

export default withApiLogging(handler);
