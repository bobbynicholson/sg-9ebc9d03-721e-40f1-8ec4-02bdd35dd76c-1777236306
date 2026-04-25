import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Clock, 
  Calendar,
  TrendingUp,
  Award,
  FileText,
  DollarSign,
  UserPlus
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";

const hrFeatures = [
  {
    id: "time-tracking",
    title: "Time & Attendance",
    description: "Track staff clock-in/clock-out times automatically",
    icon: Clock,
    link: "/admin/staff-hours",
    status: "active"
  },
  {
    id: "scheduling",
    title: "Staff Scheduling",
    description: "Create and manage staff schedules for events",
    icon: Calendar,
    link: "/admin/calendar",
    status: "active"
  },
  {
    id: "user-management",
    title: "User Management",
    description: "Manage staff accounts and permissions",
    icon: Users,
    link: "/admin/users",
    status: "active"
  },
  {
    id: "performance",
    title: "Performance Tracking",
    description: "Monitor staff performance and productivity",
    icon: TrendingUp,
    link: "#",
    status: "coming-soon"
  },
  {
    id: "training",
    title: "Training & Onboarding",
    description: "Track staff training and certifications",
    icon: Award,
    link: "#",
    status: "coming-soon"
  },
  {
    id: "payroll",
    title: "Payroll Integration",
    description: "Connect with payroll systems for easy processing",
    icon: DollarSign,
    link: "#",
    status: "coming-soon"
  },
  {
    id: "documents",
    title: "Document Management",
    description: "Store and manage employee documents",
    icon: FileText,
    link: "#",
    status: "coming-soon"
  },
  {
    id: "recruitment",
    title: "Recruitment",
    description: "Manage job postings and applicant tracking",
    icon: UserPlus,
    link: "#",
    status: "coming-soon"
  }
];

export default function AdminHRSolutions() {
  const { user } = useAuth();

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>HR Solutions - CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-64">
        <div className="container mx-auto px-4 py-6 md:py-8 lg:py-12 max-w-7xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">HR Solutions</h1>
              <p className="text-slate-600">Comprehensive staff management tools</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {hrFeatures.map((feature) => {
              const Icon = feature.icon;
              const isActive = feature.status === "active";

              return (
                <Card key={feature.id} className={`border-0 shadow-lg hover:shadow-xl transition-shadow ${
                  !isActive ? "opacity-75" : ""
                }`}>
                  <CardHeader>
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-3 rounded-lg ${
                        isActive ? "bg-blue-100" : "bg-slate-100"
                      }`}>
                        <Icon className={`w-6 h-6 ${
                          isActive ? "text-blue-600" : "text-slate-400"
                        }`} />
                      </div>
                      <Badge className={
                        isActive 
                          ? "bg-green-100 text-green-800" 
                          : "bg-orange-100 text-orange-800"
                      }>
                        {isActive ? "Active" : "Coming Soon"}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isActive ? (
                      <Link href={feature.link}>
                        <Button className="w-full">
                          Access Feature
                        </Button>
                      </Link>
                    ) : (
                      <Button variant="outline" className="w-full" disabled>
                        Coming Soon
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="mt-8 border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 mb-2">Need more HR features?</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    We're constantly adding new HR management features. Contact us to suggest features you'd like to see.
                  </p>
                  <Button variant="outline">Request Feature</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}