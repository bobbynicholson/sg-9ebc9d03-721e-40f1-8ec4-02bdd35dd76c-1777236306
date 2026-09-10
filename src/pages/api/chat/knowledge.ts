/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import { readFile, unlink } from "fs/promises";
import type { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import { PDFParse } from "pdf-parse";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";
import { createKnowledgeEmbeddings, getKnowledgeEmbeddingMetadata, reviewKnowledgeSource } from "@/server/chatbot/brain";
import { validateCompanyAdminKnowledgeScope, validateKnowledgeContent } from "@/server/chatbot/knowledgeSafety";
import { ROLE_KNOWLEDGE_PACKS, type RoleKnowledgePack } from "@/lib/chatbot/roleKnowledge";
import { fetchWebsiteSource } from "@/server/chatbot/websiteSource";

const MANAGER_ROLES = new Set(["super_admin", "owner", "company_admin"]);
const SOURCE_MANAGER_ROLES = new Set(["super_admin", "owner"]);
const PLATFORM_SCOPE_ERROR = "Only platform administrators can create platform-wide knowledge or assign the Platform admin role. Company owners can create company-scoped knowledge for company roles.";
const COMPANY_ADMIN_SCOPE_ERROR = "Company administrators can manage company-wide knowledge only. Role-specific guides, page and section context, role PDFs, and role-scoped website sources can be managed only by the company owner.";
const OWNER_SCOPE_ERROR = "Only the company owner or platform administrator can manage AI Brain sources.";
const INVALID_REFERENCE_URL_ERROR = "Reference URL must be a valid http or https URL. Use the website source panel when the page itself should be fetched.";
const KNOWLEDGE_UNAVAILABLE_MESSAGE = "Approved assistant knowledge is waiting for the latest workspace update.";
const SOURCE_SELECT = "id, name, source_type, source_url, status, metadata, created_at, updated_at";
const ALLOWED_ROLES = new Set([
  "owner", "company_admin", "region_admin", "sales_admin", "admin", "kitchen_manager", "kitchen_staff",
  "shopping_manager", "shopping_staff", "shopping", "driver", "waiter", "cleaning_manager", "cleaning_staff",
  "client", "staff", "super_admin",
]);

function knowledgeTablesUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /ai_brain_(sources|documents)|schema cache|relation .* does not exist|could not find the table/i.test(message);
}

export const config = { api: { bodyParser: false, responseLimit: "8mb" } };

async function ensureJsonBody(req: NextApiRequest): Promise<void> {
  if ((req as any).body && typeof (req as any).body === "object") return;
  const body = await new Promise<string>((resolve, reject) => {
    const parts: Buffer[] = [];
    req.on("data", (part) => parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part)));
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", reject);
  });
  try {
    (req as any).body = body ? JSON.parse(body) : {};
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function parsePdfUpload(req: NextApiRequest): Promise<{ fields: Record<string, string>; file: any }> {
  const form = formidable({
    maxFileSize: 20 * 1024 * 1024,
    maxFiles: 1,
    multiples: false,
    filter: ({ mimetype, originalFilename }) => mimetype === "application/pdf" || originalFilename?.toLowerCase().endsWith(".pdf") === true,
  });
  const [rawFields, rawFiles] = await form.parse(req);
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawFields)) fields[key] = Array.isArray(value) ? String(value[0] || "") : String(value || "");
  const file = Array.isArray(rawFiles.file) ? rawFiles.file[0] : rawFiles.file;
  if (!file) throw new Error("Choose a PDF file to upload");
  return { fields, file };
}

async function extractPdf(file: any): Promise<{ text: string; pages: number; filename: string }> {
  const buffer = await readFile(file.filepath);
  if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new Error("This file is not a valid PDF. Upload the original PDF document again.");
  const parser = new PDFParse({ data: buffer });
  try {
    let parsed: any;
    try {
      parsed = await parser.getText();
    } catch {
      throw new Error("This PDF could not be read. It may be damaged, encrypted, or image-only. Upload a readable text-based PDF.");
    }
    const text = validateKnowledgeContent(parsed.text);
    return { text, pages: Number(parsed.total || 0), filename: String(file.originalFilename || "uploaded.pdf") };
  } finally {
    await parser.destroy();
  }
}

const KNOWLEDGE_CHUNK_SIZE = 1_800;

function chunks(text: string): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const output: string[] = [];
  let current = "";
  const pushBounded = (value: string) => {
    let remaining = value.trim();
    while (remaining.length > KNOWLEDGE_CHUNK_SIZE) {
      let cut = remaining.lastIndexOf(" ", KNOWLEDGE_CHUNK_SIZE);
      if (cut < Math.floor(KNOWLEDGE_CHUNK_SIZE * 0.55)) cut = KNOWLEDGE_CHUNK_SIZE;
      output.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) output.push(remaining);
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length > KNOWLEDGE_CHUNK_SIZE) {
      if (current) {
        pushBounded(current);
        current = "";
      }
      pushBounded(paragraph);
      continue;
    }
    if (current && current.length + paragraph.length + 2 > KNOWLEDGE_CHUNK_SIZE) {
      pushBounded(current);
      current = "";
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) pushBounded(current);
  return output;
}

function safeReferenceUrl(value: unknown): string | null {
  const raw = String(value || "").trim().slice(0, 500);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function validatedReferenceUrl(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const url = safeReferenceUrl(raw);
  if (!url) throw new Error(INVALID_REFERENCE_URL_ERROR);
  return url;
}

function roleMetadata(value: unknown, allowPlatformRole = true, allowRoleScoped = true): Record<string, unknown> {
  let rawRoles = value;
  if (typeof value === "string") {
    try { rawRoles = JSON.parse(value); } catch { rawRoles = []; }
  }
  if (!Array.isArray(rawRoles)) return {};
  const roles = [...new Set(rawRoles.map(String).filter((item) => ALLOWED_ROLES.has(item)))];
  if (!allowPlatformRole && roles.includes("super_admin")) throw new Error(PLATFORM_SCOPE_ERROR);
  if (!allowRoleScoped && roles.length) throw new Error(COMPANY_ADMIN_SCOPE_ERROR);
  return roles.length ? { roles } : {};
}

function isRoleScopedSource(source: any): boolean {
  return (Array.isArray(source?.metadata?.roles) && source.metadata.roles.length > 0) || Boolean(source?.metadata?.role_pack);
}

async function insertSource(db: any, userId: string, companyId: string | null, input: { name: string; content: string; sourceType?: string; sourceUrl?: string | null; metadata?: Record<string, unknown> }) {
  const name = String(input.name || "").trim().slice(0, 160);
  const content = validateKnowledgeContent(input.content);
  const sourceType = ["settings", "text", "pdf", "web"].includes(input.sourceType || "") ? input.sourceType : "text";
  const sourceUrl = validatedReferenceUrl(input.sourceUrl);
  if (!name || !content) throw new Error("name and content are required");
  if (content.length > 200_000) throw new Error("Knowledge source is too large");

  const digest = crypto.createHash("sha256").update(content).digest("hex");
  const sourceChunks = chunks(content);
  const embeddings = await createKnowledgeEmbeddings(sourceChunks, { strict: true });
  const { data: source, error: sourceError } = await db.from("ai_brain_sources").insert({
    company_id: companyId,
    name,
    source_type: sourceType,
    source_url: sourceUrl,
    content_hash: digest,
    status: "ready",
    metadata: { ...(input.metadata || {}), managed_by: "chat-knowledge-api", characters: content.length, chunks: sourceChunks.length, ...getKnowledgeEmbeddingMetadata(), embedding_status: "ready", embedded_chunks: sourceChunks.length, embedded_at: new Date().toISOString() },
    created_by: userId,
  }).select(SOURCE_SELECT).single();
  if (sourceError || !source) throw new Error(sourceError?.message || "Could not create source");

  const documentRows = sourceChunks.map((chunk, index) => ({
    source_id: source.id,
    company_id: companyId,
    content: chunk,
    chunk_index: index,
    embedding: embeddings[index]?.length === 1536 ? `[${embeddings[index].join(",")}]` : null,
    metadata: { source_name: name, ...roleMetadata((input.metadata || {}).roles) },
  }));
  const { error: documentError } = await db.from("ai_brain_documents").insert(documentRows);
  if (documentError) {
    let rollback = db.from("ai_brain_sources").delete().eq("id", source.id);
    rollback = companyId ? rollback.eq("company_id", companyId) : rollback.is("company_id", null);
    await rollback;
    throw new Error(documentError.message);
  }
  return { source, chunks: documentRows.length };
}

async function replaceIndexedSource(db: any, input: {
  sourceId: string;
  companyId: string | null;
  name: string;
  sourceType: string;
  sourceUrl: string | null;
  contentHash: string;
  metadata: Record<string, unknown>;
  documents: Array<{ content: string; chunk_index: number; embedding: string | null; metadata: Record<string, unknown> }>;
}) {
  const { data, error } = await db.rpc("replace_ai_brain_source", {
    p_source_id: input.sourceId,
    p_company_id: input.companyId,
    p_name: input.name,
    p_source_type: input.sourceType,
    p_source_url: input.sourceUrl,
    p_content_hash: input.contentHash,
    p_metadata: input.metadata,
    p_documents: input.documents,
  });
  if (error) throw new Error(error.message);
  return Number(data || input.documents.length);
}

async function resyncSource(db: any, companyId: string | null, sourceId: string, companyAdminScope = false, platformScope = false) {
  let sourceQuery = db.from("ai_brain_sources").select("id, name, source_type, source_url, content_hash, metadata").eq("id", sourceId);
  sourceQuery = companyId ? sourceQuery.eq("company_id", companyId) : sourceQuery.is("company_id", null);
  const { data: source, error: sourceError } = await sourceQuery.maybeSingle();
  if (sourceError || !source) throw new Error(sourceError?.message || "Source not found");
  if (source.source_type === "web") {
    if (!source.source_url) throw new Error("This website source has no URL to resync");
    const fetched = await fetchWebsiteSource(source.source_url);
    const safeText = validateKnowledgeContent(fetched.text);
    if (companyAdminScope) validateCompanyAdminKnowledgeScope(source.name, safeText);
    await reviewKnowledgeSource({ sourceName: source.name, content: safeText, companyAdminScope, platformScope });
    const sourceChunks = chunks(safeText);
    const embeddings = await createKnowledgeEmbeddings(sourceChunks, { strict: true });
    const now = new Date().toISOString();
    const metadata = { ...(source.metadata || {}), characters: fetched.text.length, chunks: sourceChunks.length, page_title: fetched.title, requested_url: fetched.requestedUrl, fetched_url: fetched.finalUrl, last_fetched_at: fetched.fetchedAt, last_resynced_at: now, sync_mode: "refetch", ...getKnowledgeEmbeddingMetadata(), embedding_status: "ready", embedded_chunks: sourceChunks.length, embedded_at: now };
    const documentRows = sourceChunks.map((chunk, index) => ({ content: chunk, chunk_index: index, embedding: `[${embeddings[index].join(",")}]`, metadata: { source_name: source.name, ...roleMetadata(source.metadata?.roles) } }));
    await replaceIndexedSource(db, { sourceId, companyId, name: source.name, sourceType: "web", sourceUrl: fetched.finalUrl, contentHash: crypto.createHash("sha256").update(fetched.text).digest("hex"), metadata, documents: documentRows });
    return { sourceId, chunks: sourceChunks.length, mode: "refetched" };
  }
  let documentsQuery = db.from("ai_brain_documents").select("id, content, chunk_index, metadata").eq("source_id", sourceId);
  documentsQuery = companyId ? documentsQuery.eq("company_id", companyId) : documentsQuery.is("company_id", null);
  const { data: documents, error: documentError } = await documentsQuery.order("chunk_index", { ascending: true });
  if (documentError) throw new Error(documentError.message);
  const storedText = (documents || []).map((item: any) => String(item.content || "")).join("\n\n");
  validateKnowledgeContent(storedText);
  if (companyAdminScope) validateCompanyAdminKnowledgeScope(source.name, storedText);
  await reviewKnowledgeSource({ sourceName: source.name, content: storedText, companyAdminScope, platformScope });
  const embeddings = await createKnowledgeEmbeddings((documents || []).map((item: any) => String(item.content || "")), { strict: true });
  const now = new Date().toISOString();
  const metadata = { ...(source.metadata || {}), last_resynced_at: now, ...getKnowledgeEmbeddingMetadata(), embedding_status: "ready", embedded_chunks: (documents || []).length, embedded_at: now };
  const documentRows = (documents || []).map((document: any, index: number) => ({ content: String(document.content || ""), chunk_index: Number(document.chunk_index || index), embedding: `[${embeddings[index].join(",")}]`, metadata: document.metadata || { source_name: source.name } }));
  await replaceIndexedSource(db, { sourceId, companyId, name: source.name, sourceType: source.source_type, sourceUrl: source.source_url || null, contentHash: source.content_hash || "", metadata, documents: documentRows });
  return { sourceId, chunks: (documents || []).length };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(req.method || "")) {
    res.setHeader("Allow", "GET, POST, PATCH, PUT, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const db = createPagesServerClient({ req, res }) as any;
  const { data: { user } } = await db.auth.getUser();
  if (!user) return res.status(401).json({ error: "Sign in first" });
  const { data: profile } = await db.from("profiles").select("role, active_role, company_id").eq("id", user.id).maybeSingle();
  const callerRoles = [profile?.role, profile?.active_role].filter(Boolean).map(String);
  // Only the canonical profile role grants platform scope. An active/delegated
  // role must never elevate a company administrator to global knowledge.
  const isPlatformAdmin = String(profile?.role || "") === "super_admin";
  // Platform administrators operate on the global (NULL company_id) scope.
  // A stale company_id on a platform profile must never make a platform
  // source look like a company source or permit cross-scope writes.
  const companyId = isPlatformAdmin ? null : profile?.company_id as string | null;
  if (!companyId && !isPlatformAdmin) return res.status(400).json({ error: "Your profile has no company context" });
  if (!callerRoles.some((candidate) => MANAGER_ROLES.has(candidate))) return res.status(403).json({ error: "Only company owners and administrators can manage brain sources" });
  const profileRole = String(profile?.role || "");
  const isCompanyAdmin = profileRole === "company_admin";
  const canManageSources = MANAGER_ROLES.has(profileRole);
  const canManageRoleScopedSources = SOURCE_MANAGER_ROLES.has(profileRole);
  if (req.method !== "GET" && !canManageSources) return res.status(403).json({ error: OWNER_SCOPE_ERROR });
  const isMultipart = String(req.headers["content-type"] || "").toLowerCase().includes("multipart/form-data");
  if (!isMultipart && ["POST", "PATCH", "PUT", "DELETE"].includes(req.method || "")) {
    try { await ensureJsonBody(req); } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid request body" }); }
  }

  if (req.method === "GET") {
      const sourceId = typeof req.query.sourceId === "string" ? req.query.sourceId : null;
    if (sourceId) {
      let sourceQuery = db.from("ai_brain_sources").select(SOURCE_SELECT).eq("id", sourceId);
      let documentsQuery = db.from("ai_brain_documents").select("id, content, chunk_index").eq("source_id", sourceId);
      sourceQuery = companyId ? sourceQuery.eq("company_id", companyId) : sourceQuery.is("company_id", null);
      documentsQuery = companyId ? documentsQuery.eq("company_id", companyId) : documentsQuery.is("company_id", null);
      const [{ data: source, error: sourceError }, { data: documents, error: documentError }] = await Promise.all([
        sourceQuery.maybeSingle(),
        documentsQuery.order("chunk_index", { ascending: true }),
      ]);
      if (sourceError || documentError) {
        const error = sourceError || documentError;
        if (knowledgeTablesUnavailable(error?.message)) return res.status(200).json({ available: false, message: KNOWLEDGE_UNAVAILABLE_MESSAGE, sources: [] });
        return res.status(404).json({ error: error?.message || "Source not found" });
      }
      if (!source) return res.status(404).json({ error: "Source not found" });
      return res.status(200).json({ source, content: (documents || []).map((item: any) => item.content).join("\n\n") });
    }
    let sourcesQuery = db.from("ai_brain_sources").select(SOURCE_SELECT);
    sourcesQuery = companyId ? sourcesQuery.eq("company_id", companyId) : sourcesQuery.is("company_id", null);
    const { data, error } = await sourcesQuery.order("updated_at", { ascending: false });
    if (error) {
      if (knowledgeTablesUnavailable(error)) return res.status(200).json({ available: false, message: KNOWLEDGE_UNAVAILABLE_MESSAGE, sources: [] });
      return res.status(500).json({ error: error.message, code: "KNOWLEDGE_SOURCE_LOAD_FAILED", retryable: true });
    }
    return res.status(200).json({ sources: data || [] });
  }

  if (req.method === "POST" && isMultipart) {
    let uploadPath: string | null = null;
    try {
      const { fields, file } = await parsePdfUpload(req);
      uploadPath = file.filepath;
      const pdf = await extractPdf(file);
      if (isCompanyAdmin) validateCompanyAdminKnowledgeScope(fields.name || pdf.filename, pdf.text);
      await reviewKnowledgeSource({ sourceName: fields.name || pdf.filename, content: pdf.text, companyAdminScope: isCompanyAdmin, platformScope: isPlatformAdmin });
      const selectedRoles = roleMetadata(fields.roles, isPlatformAdmin, canManageRoleScopedSources);
      const result = await insertSource(db, user.id, companyId, {
        name: fields.name || pdf.filename.replace(/\.pdf$/i, ""),
        content: pdf.text,
        sourceType: "pdf",
        sourceUrl: fields.sourceUrl || null,
        metadata: { original_filename: pdf.filename, pages: pdf.pages, sync_mode: "reembed", ...selectedRoles },
      });
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Could not process PDF" });
    } finally {
      if (uploadPath) await unlink(uploadPath).catch(() => undefined);
    }
  }

  if (req.method === "POST" && req.body?.preset === "role-packs") {
    if (!canManageRoleScopedSources) return res.status(403).json({ error: COMPANY_ADMIN_SCOPE_ERROR });
    try {
      const created: Array<{ id: string; name: string }> = [];
      const updated: Array<{ id: string; name: string }> = [];
      const skipped: string[] = [];
      const oldGroupedKeys = new Set(["owner-admin", "kitchen", "shopping", "driver", "cleaning", "client"]);
      let roleSourcesQuery = db.from("ai_brain_sources").select("id, metadata");
      roleSourcesQuery = companyId ? roleSourcesQuery.eq("company_id", companyId) : roleSourcesQuery.is("company_id", null);
      const { data: existingRoleSources, error: roleSourcesError } = await roleSourcesQuery;
      if (roleSourcesError) throw new Error(roleSourcesError.message);
      for (const source of existingRoleSources || []) {
        if (!oldGroupedKeys.has(String(source.metadata?.role_pack || ""))) continue;
        let deleteQuery = db.from("ai_brain_sources").delete().eq("id", source.id);
        deleteQuery = companyId ? deleteQuery.eq("company_id", companyId) : deleteQuery.is("company_id", null);
        const { error: deleteError } = await deleteQuery;
        if (deleteError) throw new Error(deleteError.message);
      }
      const rolePacks = isPlatformAdmin
        ? ROLE_KNOWLEDGE_PACKS as RoleKnowledgePack[]
        : (ROLE_KNOWLEDGE_PACKS as RoleKnowledgePack[]).filter((pack) => !pack.roles.includes("super_admin"));
      for (const pack of rolePacks) {
        const pdfFilename = `cateringms-${pack.key}-guide.pdf`;
        let existingQuery = db.from("ai_brain_sources").select("id, name, source_type, metadata").eq("name", pack.name);
        existingQuery = companyId ? existingQuery.eq("company_id", companyId) : existingQuery.is("company_id", null);
        const { data: existing, error: existingError } = await existingQuery.maybeSingle();
        if (existingError) throw new Error(existingError.message);
        if (existing) {
          if (existing.metadata?.role_pack === pack.key && existing.source_type !== "pdf") {
            const metadata = { ...(existing.metadata || {}), role_pack: pack.key, roles: pack.roles, original_filename: pdfFilename, pages: 1, sync_mode: "reembed", managed_by: "chat-knowledge-api" };
            let sourceUpdate = db.from("ai_brain_sources").update({ source_type: "pdf", metadata, updated_at: new Date().toISOString() }).eq("id", existing.id);
            sourceUpdate = companyId ? sourceUpdate.eq("company_id", companyId) : sourceUpdate.is("company_id", null);
            const { error: updateError } = await sourceUpdate;
            if (updateError) throw new Error(updateError.message);
            updated.push({ id: existing.id, name: existing.name });
          }
          skipped.push(existing.name);
          continue;
        }
        const result = await insertSource(db, user.id, companyId, { name: pack.name, content: pack.content, sourceType: "pdf", metadata: { role_pack: pack.key, roles: pack.roles, original_filename: pdfFilename, pages: 1, sync_mode: "reembed" } });
        created.push({ id: result.source.id, name: result.source.name });
      }
      return res.status(201).json({ created, updated, count: created.length + updated.length, createdCount: created.length, updatedCount: updated.length, skipped, skippedCount: skipped.length });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Could not load role packs" });
    }
  }

  if (req.method === "POST" && req.body?.sourceType === "web") {
    try {
      const websiteUrl = safeReferenceUrl(req.body?.sourceUrl);
      if (!websiteUrl) throw new Error("Enter a valid public http or https website URL");
      const fetched = await fetchWebsiteSource(websiteUrl);
      if (isCompanyAdmin) validateCompanyAdminKnowledgeScope(req.body?.name || websiteUrl, fetched.text);
      await reviewKnowledgeSource({ sourceName: String(req.body?.name || websiteUrl), content: fetched.text, companyAdminScope: isCompanyAdmin, platformScope: isPlatformAdmin });
      const result = await insertSource(db, user.id, companyId, {
        name: String(req.body?.name || fetched.title || new URL(fetched.finalUrl).hostname).trim(),
        content: fetched.text,
        sourceType: "web",
        sourceUrl: fetched.finalUrl,
        metadata: { ...roleMetadata(req.body?.metadata?.roles, isPlatformAdmin, canManageRoleScopedSources), sync_mode: "refetch", page_title: fetched.title, requested_url: fetched.requestedUrl, fetched_url: fetched.finalUrl, last_fetched_at: fetched.fetchedAt },
      });
      return res.status(201).json({ ...result, fetchedUrl: fetched.finalUrl, title: fetched.title });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Could not fetch website" });
    }
  }

  if (req.method === "POST") {
    try {
      const input = req.body || {};
      const selectedRoles = roleMetadata(input.metadata?.roles, isPlatformAdmin, canManageRoleScopedSources);
      if (isCompanyAdmin) validateCompanyAdminKnowledgeScope(input.name, input.content);
      await reviewKnowledgeSource({ sourceName: String(input.name || "Company knowledge"), content: String(input.content || ""), companyAdminScope: isCompanyAdmin, platformScope: isPlatformAdmin });
      const result = await insertSource(db, user.id, companyId, {
        ...input,
        // Accept only the server-controlled role scope. Arbitrary client
        // metadata must not forge role_pack or another owner-managed marker.
        metadata: selectedRoles,
      });
      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Could not create source" });
    }
  }

  const sourceId = String(req.body?.sourceId || "").trim();
  if (req.method === "DELETE") {
    if (!sourceId) return res.status(400).json({ error: "sourceId is required" });
    let sourceLookup = db.from("ai_brain_sources").select("id, metadata").eq("id", sourceId);
    sourceLookup = companyId ? sourceLookup.eq("company_id", companyId) : sourceLookup.is("company_id", null);
    const { data: sourceToDelete, error: lookupError } = await sourceLookup.maybeSingle();
    if (lookupError) return res.status(400).json({ error: lookupError.message });
    if (!sourceToDelete) return res.status(404).json({ error: "Source not found or you do not have permission to delete it" });
    if (!canManageRoleScopedSources && isRoleScopedSource(sourceToDelete)) return res.status(403).json({ error: COMPANY_ADMIN_SCOPE_ERROR });
    let deleteQuery = db.from("ai_brain_sources").delete().eq("id", sourceId);
    deleteQuery = companyId ? deleteQuery.eq("company_id", companyId) : deleteQuery.is("company_id", null);
    const { error: deleteError } = await deleteQuery;
    if (deleteError) return res.status(400).json({ error: deleteError.message });
    return res.status(200).json({ deleted: true, sourceId });
  }
  if (req.method === "PUT") {
    let sourceIdsQuery = db.from("ai_brain_sources").select("id, metadata");
    sourceIdsQuery = companyId ? sourceIdsQuery.eq("company_id", companyId) : sourceIdsQuery.is("company_id", null);
    const { data: resyncSources, error: resyncSourcesError } = await sourceIdsQuery;
    if (resyncSourcesError) return res.status(400).json({ error: resyncSourcesError.message });
    const selectedSources = sourceId ? (resyncSources || []).filter((item: any) => item.id === sourceId) : (resyncSources || []);
    if (!canManageRoleScopedSources && selectedSources.some(isRoleScopedSource)) return res.status(403).json({ error: COMPANY_ADMIN_SCOPE_ERROR });
    const sourceIds = selectedSources.map((item: any) => item.id);
    try {
      const results = [];
      for (const id of sourceIds) results.push(await resyncSource(db, companyId, id, isCompanyAdmin, isPlatformAdmin));
      return res.status(200).json({ resynced: results.length, sources: results });
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : "Could not resync sources" });
    }
  }

  if (!sourceId) return res.status(400).json({ error: "sourceId is required" });
  let existingQuery = db.from("ai_brain_sources").select("id, metadata").eq("id", sourceId);
  existingQuery = companyId ? existingQuery.eq("company_id", companyId) : existingQuery.is("company_id", null);
  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError || !existing) return res.status(404).json({ error: existingError?.message || "Source not found" });
  if (!canManageRoleScopedSources && isRoleScopedSource(existing)) return res.status(403).json({ error: COMPANY_ADMIN_SCOPE_ERROR });
  try {
    const name = String(req.body?.name || "").trim().slice(0, 160);
    const content = String(req.body?.content || "").trim();
    const requestedSourceType = ["settings", "text", "pdf", "web"].includes(req.body?.sourceType) ? req.body.sourceType : "text";
    if (requestedSourceType === "web") {
      const websiteUrl = safeReferenceUrl(req.body?.sourceUrl);
      if (!websiteUrl) return res.status(400).json({ error: "Enter a valid public http or https website URL" });
      const fetched = await fetchWebsiteSource(websiteUrl);
      const safeText = validateKnowledgeContent(fetched.text);
      if (isCompanyAdmin) validateCompanyAdminKnowledgeScope(name, safeText);
      await reviewKnowledgeSource({ sourceName: name, content: safeText, companyAdminScope: isCompanyAdmin, platformScope: isPlatformAdmin });
      const sourceChunks = chunks(safeText);
      const embeddings = await createKnowledgeEmbeddings(sourceChunks, { strict: true });
      const now = new Date().toISOString();
      const selectedRoles = roleMetadata(req.body?.metadata?.roles, isPlatformAdmin, canManageRoleScopedSources);
      const metadata = { ...(existing.metadata || {}), sync_mode: "refetch", page_title: fetched.title, requested_url: fetched.requestedUrl, fetched_url: fetched.finalUrl, last_fetched_at: fetched.fetchedAt, characters: fetched.text.length, chunks: sourceChunks.length, updated_by: user.id, ...getKnowledgeEmbeddingMetadata(), embedding_status: "ready", embedded_chunks: sourceChunks.length, embedded_at: now, ...selectedRoles };
      const documentRows = sourceChunks.map((chunk, index) => ({ content: chunk, chunk_index: index, embedding: `[${embeddings[index].join(",")}]`, metadata: { source_name: name, ...selectedRoles } }));
      await replaceIndexedSource(db, { sourceId, companyId, name, sourceType: "web", sourceUrl: fetched.finalUrl, contentHash: crypto.createHash("sha256").update(fetched.text).digest("hex"), metadata, documents: documentRows });
      return res.status(200).json({ updated: true, sourceId, chunks: sourceChunks.length, fetchedUrl: fetched.finalUrl });
    }
    if (!name || !content) return res.status(400).json({ error: "name and content are required" });
    if (content.length > 200_000) return res.status(413).json({ error: "Knowledge source is too large" });
      const safeContent = validateKnowledgeContent(content);
      if (isCompanyAdmin) validateCompanyAdminKnowledgeScope(name, safeContent);
      await reviewKnowledgeSource({ sourceName: name, content: safeContent, companyAdminScope: isCompanyAdmin, platformScope: isPlatformAdmin });
      const sourceChunks = chunks(safeContent);
    const embeddings = await createKnowledgeEmbeddings(sourceChunks, { strict: true });
    const now = new Date().toISOString();
    const selectedRoles = roleMetadata(req.body?.metadata?.roles, isPlatformAdmin, canManageRoleScopedSources);
    const metadata = { ...(existing.metadata || {}), managed_by: "chat-knowledge-api", characters: content.length, chunks: sourceChunks.length, updated_by: user.id, ...getKnowledgeEmbeddingMetadata(), embedding_status: "ready", embedded_chunks: sourceChunks.length, embedded_at: now, ...selectedRoles };
    const documentRows = sourceChunks.map((chunk, index) => ({ content: chunk, chunk_index: index, embedding: `[${embeddings[index].join(",")}]`, metadata: { source_name: name, ...selectedRoles } }));
      await replaceIndexedSource(db, { sourceId, companyId, name, sourceType: requestedSourceType, sourceUrl: validatedReferenceUrl(req.body?.sourceUrl), contentHash: crypto.createHash("sha256").update(safeContent).digest("hex"), metadata, documents: documentRows });
    return res.status(200).json({ updated: true, sourceId, chunks: sourceChunks.length });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Could not update source" });
  }
}

export default withApiLogging(handler);
