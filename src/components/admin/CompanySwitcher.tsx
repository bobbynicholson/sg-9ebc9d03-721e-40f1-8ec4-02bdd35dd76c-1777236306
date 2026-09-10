import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Company {
  id: string;
  company_name: string;
  slug: string;
  is_active: boolean;
}

export function CompanySwitcher() {
  const router = useRouter();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<string>("super-admin");

  useEffect(() => {
    loadCompanies();

    if (!router.isReady) return;

    const asPath = router.asPath || router.pathname || "";
    if (asPath.startsWith("/admin/platform") || asPath.startsWith("/super-admin")) {
      setSelectedCompany("super-admin");
      return;
    }

    const querySlug = typeof router.query.company_slug === "string"
      ? router.query.company_slug
      : "";
    if (querySlug) {
      setSelectedCompany(querySlug);
      return;
    }

    const pathMatch = asPath.match(/^\/([^/?#]+)\/admin(?:\/|$)/);
    if (pathMatch?.[1]) {
      setSelectedCompany(pathMatch[1]);
    }
  }, [router.isReady, router.asPath, router.pathname, router.query.company_slug]);

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, company_name, slug, is_active")
        .eq("is_active", true)
        .order("company_name");

      if (error) throw error;

      setCompanies(data || []);
    } catch (error) {
      console.error("Error loading companies:", error);
      toast({
        title: "Error",
        description: "Failed to load companies",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCompanyChange = (value: string) => {
    setSelectedCompany(value);

    if (value === "super-admin") {
      router.push("/admin/platform/dashboard");
      toast({
        title: "Switched to Platform Admin",
        description: "Viewing platform-wide dashboard",
      });
    } else {
      const company = companies.find(c => c.slug === value);
      if (company) {
        router.push(`/${value}/admin/dashboard`);
        toast({
          title: `Switched to ${company.company_name}`,
          description: "Viewing company admin dashboard",
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-slate-500" />
      <Select value={selectedCompany} onValueChange={handleCompanyChange}>
        <SelectTrigger className="w-[240px] bg-white">
          <SelectValue placeholder="Select company" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="super-admin">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Platform Admin</span>
            </div>
          </SelectItem>
          
          {companies.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-slate-500 border-t mt-1">
                COMPANIES
              </div>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.slug}>
                  <div className="flex items-center gap-2">
                    <span>{company.company_name}</span>
                    <span className="text-xs text-slate-500">/{company.slug}</span>
                  </div>
                </SelectItem>
              ))}
            </>
          )}

          {companies.length === 0 && (
            <div className="px-2 py-4 text-center text-sm text-slate-500">
              No companies found. Create one first.
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
