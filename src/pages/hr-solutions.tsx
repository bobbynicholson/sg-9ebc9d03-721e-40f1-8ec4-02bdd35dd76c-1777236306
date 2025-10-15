
import { ExternalLink, Building2, Globe, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const hrSolutions = {
  southAfrica: [
    {
      name: "Sage HR",
      description: "Comprehensive cloud-based HR software for South African businesses with payroll, leave management, and performance tracking.",
      url: "https://www.sage.com/en-za/sage-business-cloud/people/",
      features: ["Payroll Integration", "Leave Management", "Performance Reviews", "Compliance"],
    },
    {
      name: "SimplePay",
      description: "User-friendly online payroll software specifically designed for South African businesses.",
      url: "https://www.simplepay.co.za/",
      features: ["Payroll Processing", "Tax Compliance", "Employee Self-Service", "Mobile App"],
    },
    {
      name: "Employment Hero",
      description: "All-in-one HR, payroll, and benefits platform with strong South African presence.",
      url: "https://employmenthero.com/za/",
      features: ["HR Management", "Payroll", "Benefits", "Onboarding"],
    },
  ],
  uk: [
    {
      name: "BreatheHR",
      description: "Award-winning UK HR software designed for SMEs, offering simple and effective people management.",
      url: "https://www.breathehr.com/",
      features: ["Leave Management", "Performance", "Documents", "Reports"],
    },
    {
      name: "Personio",
      description: "All-in-one HR software for SMEs in Europe, with strong UK presence and comprehensive features.",
      url: "https://www.personio.com/",
      features: ["Recruiting", "Payroll", "Attendance", "HR Analytics"],
    },
    {
      name: "Moorepay",
      description: "UK-based HR and payroll services with over 50 years of experience.",
      url: "https://www.moorepay.co.uk/",
      features: ["Payroll", "HR Software", "Pensions", "Compliance"],
    },
  ],
  usa: [
    {
      name: "BambooHR",
      description: "Industry-leading HR software for growing businesses, offering intuitive tools for the entire employee lifecycle.",
      url: "https://www.bamboohr.com/",
      features: ["Applicant Tracking", "Onboarding", "Time Off", "Performance"],
    },
    {
      name: "Gusto",
      description: "Modern, online people platform that helps small businesses with payroll, benefits, and HR.",
      url: "https://gusto.com/",
      features: ["Payroll", "Benefits", "HR Tools", "Compliance"],
    },
    {
      name: "Rippling",
      description: "All-in-one platform for HR, IT, and Finance that automates manual work and streamlines operations.",
      url: "https://www.rippling.com/",
      features: ["HRIS", "Payroll", "IT Management", "Global Team"],
    },
  ],
};

export default function HRSolutionsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <Badge className="mb-4">External Resources</Badge>
            <h1 className="text-4xl font-bold mb-4">HR Management Solutions</h1>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
              <p className="text-lg text-blue-900 dark:text-blue-100 font-medium mb-2">
                🔔 Important Notice
              </p>
              <p className="text-blue-700 dark:text-blue-300">
                <strong>CateringMS is not an HR solution.</strong> While we provide essential time tracking and payment management for your catering operations, we recommend these specialized HR platforms for comprehensive human resources management including contracts, benefits, recruitment, and compliance.
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                <strong>No Affiliation:</strong> We have no commercial relationship with any of these providers. These recommendations are provided as a helpful resource only.
              </p>
            </div>
          </div>

          <div className="space-y-12">
            <section>
              <div className="flex items-center gap-3 mb-6">
                <MapPin className="h-6 w-6" />
                <h2 className="text-2xl font-bold">South Africa</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {hrSolutions.southAfrica.map((solution) => (
                  <Card key={solution.name} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{solution.name}</span>
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </CardTitle>
                      <CardDescription className="line-clamp-3">
                        {solution.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          {solution.features.map((feature) => (
                            <Badge key={feature} variant="secondary" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                        <Button asChild className="w-full">
                          <a href={solution.url} target="_blank" rel="noopener noreferrer">
                            Visit Website
                            <ExternalLink className="ml-2 h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-6">
                <Globe className="h-6 w-6" />
                <h2 className="text-2xl font-bold">United Kingdom</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {hrSolutions.uk.map((solution) => (
                  <Card key={solution.name} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{solution.name}</span>
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </CardTitle>
                      <CardDescription className="line-clamp-3">
                        {solution.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          {solution.features.map((feature) => (
                            <Badge key={feature} variant="secondary" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                        <Button asChild className="w-full">
                          <a href={solution.url} target="_blank" rel="noopener noreferrer">
                            Visit Website
                            <ExternalLink className="ml-2 h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center gap-3 mb-6">
                <Globe className="h-6 w-6" />
                <h2 className="text-2xl font-bold">United States</h2>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {hrSolutions.usa.map((solution) => (
                  <Card key={solution.name} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span>{solution.name}</span>
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </CardTitle>
                      <CardDescription className="line-clamp-3">
                        {solution.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          {solution.features.map((feature) => (
                            <Badge key={feature} variant="secondary" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                        <Button asChild className="w-full">
                          <a href={solution.url} target="_blank" rel="noopener noreferrer">
                            Visit Website
                            <ExternalLink className="ml-2 h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </div>

          <Card className="mt-12 border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>Why These Recommendations?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                We've selected these HR platforms based on their reputation, feature sets, and regional compliance capabilities. Each offers comprehensive HR management beyond what CateringMS provides, including:
              </p>
              <ul className="grid md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Employee contracts & documentation
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Benefits administration
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Recruitment & onboarding
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Performance reviews
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Compliance & reporting
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Payroll processing
                </li>
              </ul>
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-2">What CateringMS Does Provide:</p>
                <p className="text-sm text-muted-foreground">
                  Time tracking, payment ledger, and basic hour management specifically designed for catering operations. Perfect for operational needs, but not a replacement for comprehensive HR management.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
