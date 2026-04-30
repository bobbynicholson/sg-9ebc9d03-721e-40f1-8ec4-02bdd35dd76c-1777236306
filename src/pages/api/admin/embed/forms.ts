/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Admin CRUD for embed_form_configs.
 *
 *   GET    /api/admin/embed/forms        -- list forms for caller's company
 *   POST   /api/admin/embed/forms        -- create a form
 *   PATCH  /api/admin/embed/forms?id=ID  -- update a form
 *   DELETE /api/admin/embed/forms?id=ID  -- delete a form
 *
 * Auth: company_admin | admin | owner | super_admin. Tenant isolation
 * enforced server-side -- only super_admin may touch other tenants'
 * forms (via `?company_id=...`).
 */

// Note: the user_role DB enum has no 'owner' -- the actual admin-tier
// roles are super_admin / company_admin / admin. Keep this list in sync
// with src/types/app.ts UserRole + the public.user_role enum.
const CALLER_ROLES_ALLOWED = new Set([
  "super_admin",
  "company_admin",
  "admin",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;

function sanitiseInput(body: any) {
  const out: Record<string, any> = {};
  if (typeof body.slug === "string") out.slug = body.slug.trim().toLowerCase();
  if (typeof body.name === "string") out.name = body.name.trim().slice(0, 200);
  if (typeof body.template_id === "string")
    out.template_id = body.template_id.slice(0, 100);
  if (Array.isArray(body.fields)) out.fields = body.fields;
  if (body.theme && typeof body.theme === "object") out.theme = body.theme;
  if (typeof body.success_message === "string")
    out.success_message = body.success_message.slice(0, 1000);
  if (typeof body.redirect_url === "string")
    out.redirect_url = body.redirect_url.slice(0, 2000);
  if (typeof body.is_active === "boolean") out.is_active = body.is_active;
  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ssrClient = createPagesServerClient({ req, res });
  const {
    data: { user: callerAuth },
  } = await ssrClient.auth.getUser();

  if (!callerAuth) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { data: callerProfile, error: profileErr } = await ssrClient
    .from("profiles")
    .select("role, active_role, company_id")
    .eq("id", callerAuth.id)
    .single();

  if (profileErr || !callerProfile) {
    return res.status(403).json({ error: "Caller profile not found" });
  }

  const callerRole =
    (callerProfile as any).active_role || (callerProfile as any).role;
  if (!CALLER_ROLES_ALLOWED.has(callerRole)) {
    return res.status(403).json({ error: "Forbidden: insufficient role" });
  }

  const callerCompanyId = (callerProfile as any).company_id as string | null;
  const isSuperAdmin = callerRole === "super_admin";

  // Service-role client for the actual writes -- the user-bound client is
  // only for auth/role resolution. Tenant scoping is enforced explicitly
  // below.
  const db = getServiceSupabase();

  const id = typeof req.query.id === "string" ? req.query.id : null;
  const requestedCompanyId =
    typeof req.query.company_id === "string" ? req.query.company_id : null;

  // Resolve the operating company. Non-super-admins are pinned to their own.
  const operatingCompanyId = isSuperAdmin
    ? requestedCompanyId || callerCompanyId
    : callerCompanyId;

  if (!operatingCompanyId) {
    return res
      .status(400)
      .json({ error: "Missing company context for caller" });
  }

  try {
    if (req.method === "GET") {
      const { data, error } = await (db as any)
        .from("embed_form_configs")
        .select("*")
        .eq("company_id", operatingCompanyId)
        .order("created_at", { ascending: false });

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, forms: data || [] });
    }

    if (req.method === "POST") {
      const body = (req.body || {}) as any;
      const input = sanitiseInput(body);

      if (!input.slug || !SLUG_RE.test(input.slug)) {
        return res
          .status(400)
          .json({ error: "Invalid slug, lower-case letters, digits and dashes only" });
      }
      if (!input.name) {
        return res.status(400).json({ error: "Form name is required" });
      }
      if (!input.template_id) {
        return res.status(400).json({ error: "template_id is required" });
      }

      const { data, error } = await (db as any)
        .from("embed_form_configs")
        .insert([
          {
            ...input,
            company_id: operatingCompanyId,
            is_active: input.is_active ?? true,
            views_count: 0,
            submissions_count: 0,
          },
        ])
        .select("*")
        .single();

      if (error) {
        if ((error as any).code === "23505") {
          return res
            .status(409)
            .json({ error: "A form with that slug already exists" });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json({ ok: true, form: data });
    }

    if (req.method === "PATCH") {
      if (!id) return res.status(400).json({ error: "Missing form id" });

      // Verify the row belongs to the operating company before mutating.
      const { data: existing } = await (db as any)
        .from("embed_form_configs")
        .select("id, company_id")
        .eq("id", id)
        .maybeSingle();

      if (!existing) {
        return res.status(404).json({ error: "Form not found" });
      }
      if (
        !isSuperAdmin &&
        (existing as any).company_id !== callerCompanyId
      ) {
        return res
          .status(403)
          .json({ error: "Cannot modify another tenant's form" });
      }

      const body = (req.body || {}) as any;
      const input = sanitiseInput(body);
      if (input.slug && !SLUG_RE.test(input.slug)) {
        return res.status(400).json({ error: "Invalid slug" });
      }

      const { data, error } = await (db as any)
        .from("embed_form_configs")
        .update(input)
        .eq("id", id)
        .select("*")
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, form: data });
    }

    if (req.method === "DELETE") {
      if (!id) return res.status(400).json({ error: "Missing form id" });

      const { data: existing } = await (db as any)
        .from("embed_form_configs")
        .select("id, company_id")
        .eq("id", id)
        .maybeSingle();

      if (!existing) {
        return res.status(404).json({ error: "Form not found" });
      }
      if (
        !isSuperAdmin &&
        (existing as any).company_id !== callerCompanyId
      ) {
        return res
          .status(403)
          .json({ error: "Cannot delete another tenant's form" });
      }

      const { error } = await (db as any)
        .from("embed_form_configs")
        .delete()
        .eq("id", id);

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("[admin/embed/forms] handler error", err);
    return res
      .status(500)
      .json({ error: err?.message || "Internal Server Error" });
  }
}
