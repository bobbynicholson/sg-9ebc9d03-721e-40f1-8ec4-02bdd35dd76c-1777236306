/**
 * ActiveTenantPicker -- super_admin's "which catering company am I
 * looking at?" dropdown. Lives in PlatformNav header (or anywhere a
 * super_admin should be able to switch tenants).
 *
 * Renders nothing for tenant admins (they're pinned to their own
 * company). For super_admin, renders a select that drives
 * ActiveTenantContext, which every tenant-scoped page reads via
 * useScopedCompanyId().
 */
import { Building2 } from "lucide-react";
import { useActiveTenant } from "@/contexts/ActiveTenantContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ActiveTenantPicker({ collapsed = false }: { collapsed?: boolean } = {}) {
  const { isSuperAdmin, companies, activeId, setActiveId, loading } = useActiveTenant();
  if (!isSuperAdmin) return null;

  if (collapsed) {
    // Icon-rail mode: tiny indicator only. The picker isn't usable
    // collapsed because there's no room for a select; user must
    // expand the sidebar.
    return (
      <div className="flex justify-center py-2" title={activeId ? "Tenant: switch in expanded view" : "No tenant picked"}>
        <Building2 className={activeId ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-slate-400"} />
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
        <Building2 className="h-3 w-3" />
        Viewing tenant
      </div>
      <Select
        value={activeId || ""}
        onValueChange={(v) => setActiveId(v || null)}
        disabled={loading || companies.length === 0}
      >
        <SelectTrigger className="h-9 text-sm bg-white">
          <SelectValue placeholder={loading ? "Loading..." : companies.length ? "Pick a catering company..." : "No companies"} />
        </SelectTrigger>
        <SelectContent>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!activeId && companies.length > 0 && (
        <p className="text-[10px] text-slate-500 mt-1.5 leading-tight">
          Tenant-scoped pages stay empty until you pick.
        </p>
      )}
    </div>
  );
}
