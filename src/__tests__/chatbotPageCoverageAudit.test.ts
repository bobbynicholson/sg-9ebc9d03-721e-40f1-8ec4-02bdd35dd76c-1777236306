import fs from "node:fs";
import path from "node:path";
import { NAVIGATION_REFS } from "@/lib/chatbot/navigation";
import { CHAT_ACCESS_ROLES } from "@/server/chatbot/accessPolicy";

const PAGES_ROOT = path.join(process.cwd(), "src", "pages");

function pageRoutes(directory: string, prefix = ""): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "api" || entry.name.startsWith("_") || entry.name.startsWith(".")) return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return pageRoutes(absolute, `${prefix}/${entry.name}`);
    if (!/\.(tsx|ts)$/.test(entry.name) || /^(404|500|403)\.(tsx|ts)$/.test(entry.name)) return [];
    const stem = entry.name.replace(/\.(tsx|ts)$/, "");
    if (stem === "index") return [prefix || "/"];
    return [`${prefix}/${stem}`];
  });
}

function catalogPaths(): Set<string> {
  return new Set(NAVIGATION_REFS.map((item) => item.href.split(/[?#]/)[0]));
}

function isChatbotProductRoute(route: string): boolean {
  return ["/account", "/admin", "/client", "/client-portal", "/team-portal", "/super-admin"].some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
}

describe("chatbot page coverage audit", () => {
  it("covers every static user-facing page and identifies dynamic record pages", () => {
    const routes = pageRoutes(PAGES_ROOT);
    const catalog = catalogPaths();
    const dynamicRoutes = routes.filter((route) => route.includes("["));
    const productRoutes = routes.filter(isChatbotProductRoute);
    const missing = productRoutes.filter((route) => !route.includes("[") && !catalog.has(route));
    const excludedPublicRoutes = routes.filter((route) => !isChatbotProductRoute(route) && !route.includes("[") && route !== "/");
    console.log(`[chatbot page coverage] source_pages=${routes.length} product_pages=${productRoutes.length} catalog_paths=${catalog.size} dynamic_record_pages=${dynamicRoutes.length} excluded_public_routes=${excludedPublicRoutes.length} uncovered_product_pages=${missing.length}`);
    if (missing.length) console.log(missing.join("\n"));
    if (dynamicRoutes.length) console.log(`[chatbot page coverage] dynamic routes require live record IDs: ${dynamicRoutes.join(", ")}`);
    expect(missing).toEqual([]);
  });

  it("covers explicit section tags, all chat roles, and global section indexing", () => {
    const catalogRefs = new Set(NAVIGATION_REFS.map((item) => item.ref));
    const pageFiles = (() => {
      const walk = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === "api" || entry.name.startsWith("_") || entry.name.startsWith(".")) return [];
        const absolute = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(absolute) : /\.(tsx|ts)$/.test(entry.name) ? [absolute] : [];
      });
      return walk(PAGES_ROOT);
    })();
    const taggedRefs = pageFiles.flatMap((file) => {
      const text = fs.readFileSync(file, "utf8");
      return [...text.matchAll(/data-chat-section="([^"]+)"/g)].map((match) => match[1]);
    });
    const duplicateTags = taggedRefs.filter((ref, index) => taggedRefs.indexOf(ref) !== index);
    const unknownTags = taggedRefs.filter((ref) => !catalogRefs.has(ref));
    const roleCounts = Object.fromEntries(CHAT_ACCESS_ROLES.map((role) => [role, NAVIGATION_REFS.filter((item) => !item.roles || item.roles.includes(role)).length]));
    const appSource = fs.readFileSync(path.join(PAGES_ROOT, "_app.tsx"), "utf8");

    console.log("[chatbot full coverage] explicit_tags=" + new Set(taggedRefs).size + " unknown_tags=" + unknownTags.length + " duplicate_tags=" + duplicateTags.length + " role_counts=" + JSON.stringify(roleCounts));
    expect(unknownTags).toEqual([]);
    expect(duplicateTags).toEqual([]);
    expect(CHAT_ACCESS_ROLES.every((role) => roleCounts[role] > 0)).toBe(true);
    expect(appSource).toContain("indexChatPageSections");
  });

  it("keeps owner-visible admin destinations in the safe navigation catalog", () => {
    const adminNav = fs.readFileSync(path.join(process.cwd(), "src", "components", "admin", "AdminNav.tsx"), "utf8");
    const sidebarPaths = [...adminNav.matchAll(/href:\s*"(\/admin\/(?!platform\/)[^"]+|\/account\/settings)"/g)]
      .map((match) => match[1].split(/[?#]/)[0]);
    const ownerPaths = new Set(NAVIGATION_REFS.filter((item) => !item.roles || item.roles.includes("owner")).map((item) => item.href.split(/[?#]/)[0]));
    const missing = [...new Set(sidebarPaths)].filter((href) => !ownerPaths.has(href));
    console.log(`[chatbot owner coverage] sidebar_paths=${new Set(sidebarPaths).size} missing_catalog_paths=${missing.length}`);
    if (missing.length) console.log(missing.join("\n"));
    expect(missing).toEqual([]);
  });

  it("keeps every platform sidebar destination linked, routable, and super-admin-only", () => {
    const platformNav = fs.readFileSync(path.join(process.cwd(), "src", "components", "admin", "PlatformNav.tsx"), "utf8");
    const sidebarPaths = [...platformNav.matchAll(/href:\s*"([^"]+)"/g)]
      .map((match) => match[1].split(/[?#]/)[0]);
    const catalogItems = NAVIGATION_REFS.filter((item) => item.href.startsWith("/admin/platform/") || item.href === "/admin/platform");
    const catalog = catalogPaths();
    const missingSidebarRefs = [...new Set(sidebarPaths)].filter((href) => !catalog.has(href));
    const incorrectlyScopedPlatformRefs = catalogItems
      .filter((item) => JSON.stringify(item.roles || []) !== JSON.stringify(["super_admin"]))
      .map((item) => `${item.ref}: ${item.roles?.join(", ") || "unrestricted"}`);
    const platformRoutes = pageRoutes(path.join(PAGES_ROOT, "admin", "platform"))
      .filter((route) => route !== "/" && !route.includes("["))
      .map((route) => `/admin/platform${route === "/" ? "" : route}`);
    const missingPlatformPages = platformRoutes.filter((route) => !catalog.has(route));
    const unprotectedPlatformPages = fs.readdirSync(path.join(PAGES_ROOT, "admin", "platform"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.tsx$/.test(entry.name) && entry.name !== "index.tsx")
      .map((entry) => entry.name)
      .filter((file) => {
        const source = fs.readFileSync(path.join(PAGES_ROOT, "admin", "platform", file), "utf8");
        return !source.includes("<ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>");
      });

    console.log(`[platform access audit] sidebar=${new Set(sidebarPaths).size} catalog_platform=${catalogItems.length} pages=${platformRoutes.length} missing_sidebar=${missingSidebarRefs.length} missing_pages=${missingPlatformPages.length} wrong_roles=${incorrectlyScopedPlatformRefs.length} unprotected=${unprotectedPlatformPages.length}`);
    if (missingSidebarRefs.length) console.log(`missing sidebar refs: ${missingSidebarRefs.join(", ")}`);
    if (missingPlatformPages.length) console.log(`missing platform pages: ${missingPlatformPages.join(", ")}`);
    if (incorrectlyScopedPlatformRefs.length) console.log(`wrong platform roles: ${incorrectlyScopedPlatformRefs.join(", ")}`);
    if (unprotectedPlatformPages.length) console.log(`unprotected platform pages: ${unprotectedPlatformPages.join(", ")}`);
    expect(missingSidebarRefs).toEqual([]);
    expect(missingPlatformPages).toEqual([]);
    expect(incorrectlyScopedPlatformRefs).toEqual([]);
    expect(unprotectedPlatformPages).toEqual([]);
  });

  it("keeps chat API failures structured and free of raw service errors", () => {
    const apiSource = fs.readFileSync(path.join(process.cwd(), "src", "pages", "api", "chat.ts"), "utf8");
    expect(apiSource).toContain("function chatError(");
    expect(apiSource).toContain("code, retryable");
    expect(apiSource).not.toContain("json({ error: error.message");
    for (const code of ["HISTORY_LOAD_FAILED", "SESSION_CREATE_FAILED", "USER_MESSAGE_SAVE_FAILED", "CHAT_REPLY_UNAVAILABLE"]) {
      expect(apiSource).toContain(code);
    }
  });
});
