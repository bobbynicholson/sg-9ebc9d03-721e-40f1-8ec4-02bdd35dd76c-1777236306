import { Eye, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { roleService } from "@/services/roleService";
import { useRouter } from "next/router";

/** Persistent identity and safe exit control while an administrator previews staff. */
export function StaffPreviewBanner() {
  const router = useRouter();
  const { staffPreview, clearStaffPreview, companySlug } = useAuth();

  if (!staffPreview) return null;

  const roleName = roleService.getRoleDisplayName(staffPreview.role);
  const returnToAdmin = () => {
    clearStaffPreview();
    const destination = companySlug ? `/${companySlug}/admin/dashboard` : "/admin/dashboard";
    void router.push(destination);
  };

  return (
    <div
      role="status"
      className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-950 shadow-sm dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
          <Eye className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            Previewing {staffPreview.fullName} · {roleName}
          </p>
          <p className="mt-0.5 text-xs text-indigo-800/80 dark:text-indigo-200/80">
            Showing this account’s data. Actions use your administrator access.
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={returnToAdmin}
        className="min-h-10 shrink-0 border-indigo-300 bg-white text-indigo-900 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-slate-950 dark:text-indigo-100 dark:hover:bg-indigo-950"
      >
        <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
        Return to admin
      </Button>
    </div>
  );
}
