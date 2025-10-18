import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Users, 
  ArrowLeft,
  Save,
  Calendar,
  Mail,
  Phone,
  DollarSign,
  UserPlus,
  Loader2
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { leadService } from "@/services/leadService";

export default function NewLeadPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    clientName: "",
    email: "",
    phone: "",
    eventDate: "",
    eventType: "",
    guestCount: "",
    budget: "",
    specialRequests: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError("You must be signed in to create leads");
      return;
    }
    
    try {
      setLoading(true);
      setError("");

      await leadService.createLead({
        client_name: formData.clientName,
        client_email: formData.email,
        client_phone: formData.phone || null,
        event_date: formData.eventDate,
        event_type: formData.eventType,
        guest_count: parseInt(formData.guestCount),
        budget: formData.budget ? parseFloat(formData.budget) : null,
        special_requests: formData.specialRequests || null,
        status: "new",
        user_id: user.id
      });

      router.push("/leads");
    } catch (err) {
      console.error("Error creating lead:", err);
      setError("Failed to create lead. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const eventTypes = [
    "Wedding Reception",
    "Corporate Event",
    "Birthday Party",
    "Anniversary",
    "Holiday Party",
    "Conference",
    "Other"
  ];

  if (!user) {
    return (
      <>
        <NoIndexMeta />
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="p-8 text-center">
              <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Authentication Required</h3>
              <p className="text-slate-600 mb-6">Please sign in to create leads.</p>
              <Link href="/auth/login">
                <Button>Sign In</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl">
          <Link href="/leads">
            <Button variant="ghost" className="mb-3 sm:mb-4 text-sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Leads
            </Button>
          </Link>

          <div className="mb-4 sm:mb-8">
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              <div className="p-2 sm:p-3 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl sm:rounded-2xl shadow-lg flex-shrink-0">
                <UserPlus className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Add New Lead
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5 sm:mt-1">Capture a new catering inquiry</p>
              </div>
            </div>
          </div>

          {error && (
            <Alert className="mb-4 sm:mb-6 border-red-200 bg-red-50">
              <AlertDescription className="text-sm text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Card className="border-0 shadow-lg mb-4 sm:mb-6">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
                  Client Information
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Basic contact details for the potential client</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="clientName" className="text-xs sm:text-sm">Client Name *</Label>
                    <Input
                      id="clientName"
                      name="clientName"
                      value={formData.clientName}
                      onChange={handleChange}
                      placeholder="John Smith"
                      required
                      disabled={loading}
                      className="h-10 sm:h-11 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="phone" className="text-xs sm:text-sm">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <Input
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="082 123 4567"
                        className="pl-9 sm:pl-10 h-10 sm:h-11 text-sm"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2 md:col-span-2">
                    <Label htmlFor="email" className="text-xs sm:text-sm">Email Address *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="john@example.com"
                        className="pl-9 sm:pl-10 h-10 sm:h-11 text-sm"
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg mb-4 sm:mb-6">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 flex-shrink-0" />
                  Event Details
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">Information about the catering event</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="eventDate" className="text-xs sm:text-sm">Event Date *</Label>
                    <Input
                      id="eventDate"
                      name="eventDate"
                      type="date"
                      value={formData.eventDate}
                      onChange={handleChange}
                      required
                      disabled={loading}
                      className="h-10 sm:h-11 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="eventType" className="text-xs sm:text-sm">Event Type *</Label>
                    <select
                      id="eventType"
                      name="eventType"
                      value={formData.eventType}
                      onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
                      className="w-full h-10 sm:h-11 px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                      disabled={loading}
                    >
                      <option value="">Select event type</option>
                      {eventTypes.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="guestCount" className="text-xs sm:text-sm">Number of Guests *</Label>
                    <Input
                      id="guestCount"
                      name="guestCount"
                      type="number"
                      min="1"
                      value={formData.guestCount}
                      onChange={handleChange}
                      placeholder="100"
                      required
                      disabled={loading}
                      className="h-10 sm:h-11 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="budget" className="text-xs sm:text-sm">Estimated Budget (R)</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <Input
                        id="budget"
                        name="budget"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.budget}
                        onChange={handleChange}
                        placeholder="5000.00"
                        className="pl-9 sm:pl-10 h-10 sm:h-11 text-sm"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2 md:col-span-2">
                    <Label htmlFor="specialRequests" className="text-xs sm:text-sm">Special Requests or Notes</Label>
                    <Textarea
                      id="specialRequests"
                      name="specialRequests"
                      value={formData.specialRequests}
                      onChange={handleChange}
                      placeholder="Any dietary restrictions, setup requirements, or special requests..."
                      rows={4}
                      disabled={loading}
                      className="text-sm"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-end">
              <Link href="/leads" className="w-full sm:w-auto">
                <Button type="button" variant="outline" className="w-full h-11 text-sm" disabled={loading}>
                  Cancel
                </Button>
              </Link>
              <Button 
                type="submit"
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 w-full sm:w-auto h-11 text-sm"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Save Lead
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
        
        <Footer />
      </div>
    </>
  );
}
