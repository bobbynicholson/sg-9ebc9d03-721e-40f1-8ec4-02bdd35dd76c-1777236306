/**
 * Shadowed safety re-export. The slug rewrite in next.config.mjs
 * (afterFiles) sends /:slug/admin/users to /admin/users?company_slug=:slug
 * before this dynamic route resolves, so src/pages/admin/users.tsx is the
 * page that actually serves. This file exists only so any resolution path
 * that DOES reach the dynamic route (client-side edge cases, future config
 * drift) renders the same page instead of a stale fork. It previously held
 * a divergent, sidebar-less copy of the staff page - never served, but a
 * trap for anyone editing "the users page".
 */
import AdminUsers from "@/pages/admin/users";

export default AdminUsers;
