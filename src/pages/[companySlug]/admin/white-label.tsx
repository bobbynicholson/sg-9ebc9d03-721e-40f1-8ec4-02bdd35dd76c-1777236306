
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Save, Upload, Palette } from "lucide-react";

export default function WhiteLabelPage() {
  const router = useRouter();
  const { companySlug } = router.query;

  return (
    <>
      <AdminNav companySlug={companySlug as string} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-2">White Label Branding</h1>
              <p className="text-slate-600">Customize your portal with your company branding</p>
            </div>
            <Button className="gap-2">
              <Save className="w-4 h-4" />
              Save Changes
            </Button>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>Basic company details and branding</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="company-name">Company Name</Label>
                <Input id="company-name" placeholder="Your Company Name" className="mt-2" />
              </div>
              <div>
                <Label htmlFor="company-tagline">Tagline</Label>
                <Input id="company-tagline" placeholder="Your company tagline" className="mt-2" />
              </div>
              <div>
                <Label htmlFor="company-url">Company URL</Label>
                <Input id="company-url" placeholder="https://yourcompany.com" className="mt-2" />
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Logo & Assets</CardTitle>
              <CardDescription>Upload your company logo and brand assets</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label>Company Logo</Label>
                <div className="mt-2 border-2 border-dashed rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 mb-2">Click to upload or drag and drop</p>
                  <p className="text-sm text-slate-400">PNG, JPG or SVG (max. 2MB)</p>
                  <Button variant="outline" className="mt-4">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Logo
                  </Button>
                </div>
              </div>
              <div>
                <Label>Favicon</Label>
                <div className="mt-2 border-2 border-dashed rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 mb-2">Upload favicon (32x32px)</p>
                  <Button variant="outline" className="mt-4">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Favicon
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Brand Colors
              </CardTitle>
              <CardDescription>Customize your portal's color scheme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="primary-color">Primary Color</Label>
                  <div className="flex gap-2 mt-2">
                    <Input type="color" id="primary-color" defaultValue="#8b5cf6" className="w-20 h-10" />
                    <Input type="text" defaultValue="#8b5cf6" className="flex-1" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="secondary-color">Secondary Color</Label>
                  <div className="flex gap-2 mt-2">
                    <Input type="color" id="secondary-color" defaultValue="#ec4899" className="w-20 h-10" />
                    <Input type="text" defaultValue="#ec4899" className="flex-1" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
