
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, User, Mail, Phone, Calendar } from "lucide-react";

export default function ClientSearchPage() {
  const router = useRouter();
  const { companySlug } = router.query;

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Client Search</h1>
            <p className="text-slate-600">Search and filter clients by multiple criteria</p>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Search Filters</CardTitle>
              <CardDescription>Find clients quickly using advanced filters</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Name or Email</label>
                  <Input placeholder="Search by name or email..." className="w-full" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Phone Number</label>
                  <Input placeholder="Search by phone..." className="w-full" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Event Date</label>
                  <Input type="date" className="w-full" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button className="gap-2">
                  <Search className="w-4 h-4" />
                  Search
                </Button>
                <Button variant="outline">Clear Filters</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Search Results</CardTitle>
                  <CardDescription>0 clients found</CardDescription>
                </div>
                <Button variant="outline" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Advanced Filters
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 mb-4">Start searching to find clients</p>
                <p className="text-sm text-slate-400">Use the filters above to search by name, email, phone, or event date</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
