
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Calendar, Filter, TrendingUp, BarChart } from "lucide-react";

export default function ReportsPage() {
  const router = useRouter();
  const { companySlug } = router.query;

  const availableReports = [
    {
      id: "sales",
      name: "Sales Report",
      description: "Overview of sales performance and revenue",
      category: "Financial",
      frequency: "Monthly"
    },
    {
      id: "orders",
      name: "Orders Report",
      description: "Detailed breakdown of all orders",
      category: "Operations",
      frequency: "Weekly"
    },
    {
      id: "inventory",
      name: "Inventory Report",
      description: "Stock levels and inventory movements",
      category: "Operations",
      frequency: "Monthly"
    },
    {
      id: "staff",
      name: "Staff Performance Report",
      description: "Team productivity and hours worked",
      category: "HR",
      frequency: "Monthly"
    },
    {
      id: "drivers",
      name: "Driver Performance Report",
      description: "Delivery metrics and driver earnings",
      category: "Logistics",
      frequency: "Monthly"
    },
    {
      id: "clients",
      name: "Client Analytics Report",
      description: "Customer insights and retention metrics",
      category: "Marketing",
      frequency: "Monthly"
    }
  ];

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Reports & Analytics</h1>
              <p className="text-slate-600">Access comprehensive business reports and insights</p>
            </div>
            <Button variant="outline" className="gap-2">
              <Calendar className="w-4 h-4" />
              Select Period
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Available Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{availableReports.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Generated This Month</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">0</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Scheduled Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">0</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600">Last Generated</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-semibold text-slate-900">Never</div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Available Reports</CardTitle>
                  <CardDescription>Generate reports for different business areas</CardDescription>
                </div>
                <Button variant="outline" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Filter
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:border-purple-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                        <BarChart className="w-6 h-6 text-purple-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-900">{report.name}</h3>
                          <Badge variant="outline" className="text-xs">{report.frequency}</Badge>
                        </div>
                        <p className="text-sm text-slate-500">{report.description}</p>
                        <p className="text-xs text-slate-400 mt-1">{report.category}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Download className="w-4 h-4" />
                      Generate
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Reports</CardTitle>
              <CardDescription>Previously generated reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 mb-4">No reports generated yet</p>
                <p className="text-sm text-slate-400">Generate your first report from the available reports above</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
