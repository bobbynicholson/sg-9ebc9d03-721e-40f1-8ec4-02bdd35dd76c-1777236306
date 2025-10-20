
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Plus } from "lucide-react";
import Link from "next/link";

export default function QuotesPage() {
  const router = useRouter();
  const { companySlug } = router.query;

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Quotes</h1>
              <p className="text-slate-600">Create and manage quotes for potential clients</p>
            </div>
            <Link href="/quotes/new">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                New Quote
              </Button>
            </Link>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Quotes</CardTitle>
              <CardDescription>View and manage all quotes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 mb-4">No quotes yet</p>
                <Link href="/quotes/new">
                  <Button>Create Your First Quote</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
