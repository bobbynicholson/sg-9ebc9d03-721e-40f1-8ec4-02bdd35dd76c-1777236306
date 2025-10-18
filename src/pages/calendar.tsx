import { useState, useEffect } from "react";
import Head from "next/head";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppOrder } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { orderService } from "@/services/orderService";
import { format } from "date-fns";
import {
  MapPin,
  Users,
  Package,
  ArrowRight,
  Loader2,
  Clock,
} from "lucide-react";
import { useRouter } from "next/router";

interface CalendarPageProps {
  companySlug?: string;
  portal?: string;
  currentRoute?: string;
}

export default function CalendarPage({ companySlug: propCompanySlug }: CalendarPageProps = {}) {
  const { user } = useAuth();
  const router = useRouter();
  const companySlug = propCompanySlug || user?.company_slug;
  const [events, setEvents] = useState<AppOrder[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<AppOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarKey, setCalendarKey] = useState(0);

  useEffect(() => {
    if (user?.id) {
      loadEvents();
    } else if (!user) {
      setLoading(false);
    }
  }, [user]);

  const loadEvents = async () => {
    if (!user?.id) return;
    setLoading(true);
    // Use getAllOrders to fetch all relevant events for the admin's company
    const orders: AppOrder[] = await orderService.getAllOrders(user.id);
    setEvents(orders);
    setLoading(false);
    setCalendarKey(prev => prev + 1); 
  };

  const getStatusBadge = (status: AppOrder["status"]) => {
    const styles: { [key: string]: string } = {
      pending_deposit: "bg-yellow-100 text-yellow-800",
      confirmed: "bg-blue-100 text-blue-800",
      preparing: "bg-purple-100 text-purple-800",
      ready: "bg-indigo-100 text-indigo-800",
      in_transit: "bg-cyan-100 text-cyan-800",
      delivered: "bg-teal-100 text-teal-800",
      completed: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return (
      <Badge className={styles[status || "pending_deposit"] || "bg-gray-100 text-gray-800"}>
        {status?.replace(/_/g, " ").toUpperCase()}
      </Badge>
    );
  };

  const DayWithEvents = ({ date, ...props }: { date: Date; [key: string]: any }) => {
    const dayEvents = events.filter(
      (event) => format(new Date(event.event_date), "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
    );

    return (
      <div
        className="relative flex flex-col items-center justify-center h-full w-full"
        {...props}
      >
        <span>{format(date, "d")}</span>
        {dayEvents.length > 0 && (
          <div className="absolute bottom-1 flex items-center justify-center space-x-1">
            {dayEvents.slice(0, 3).map((event, index) => (
              <div
                key={index}
                className={`h-1.5 w-1.5 rounded-full ${
                  event.status === "completed"
                    ? "bg-green-500"
                    : event.status === "cancelled" ? "bg-red-500" : "bg-blue-500"
                }`}
              />
            ))}
            {dayEvents.length > 3 && <div className="text-xs font-bold">+</div>}
          </div>
        )}
      </div>
    );
  };

  const handleDayClick = (day: Date) => {
    const dayEvents = events
      .filter((event) => format(new Date(event.event_date), "yyyy-MM-dd") === format(day, "yyyy-MM-dd"))
      .sort((a,b) => (a.event_time || "00:00").localeCompare(b.event_time || "00:00"));
    
    if (dayEvents.length > 0) {
      setSelectedDate(day);
      setSelectedDayEvents(dayEvents);
    }
  };

  const handleViewOrder = (orderId: string) => {
    if (companySlug) {
      router.push(`/${companySlug}/admin/dashboard?orderId=${orderId}`);
    } else {
      router.push(`/orders?orderId=${orderId}`);
    }
    setSelectedDayEvents([]);
    setSelectedDate(null);
  };

  return (
    <>
      <Head>
        <title>Events Calendar | CateringMS Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Header />
        <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-8 gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">Events Calendar</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                A top-level view of all scheduled functions.
              </p>
            </div>
          </div>

          <Card className="overflow-hidden">
            <CardContent className="p-2 sm:p-4 md:p-6">
              {loading ? (
                <div className="flex justify-center items-center h-96">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <Calendar
                  key={calendarKey}
                  mode="single"
                  onDayClick={handleDayClick}
                  className="p-0"
                  components={{
                    Day: DayWithEvents,
                  }}
                  classNames={{
                    day: "h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20 lg:h-24 lg:w-24 relative text-sm sm:text-base md:text-lg rounded-md focus-within:relative focus-within:z-20",
                    day_selected: "bg-primary text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground",
                    day_outside: "text-muted-foreground opacity-50",
                    months: "space-y-4",
                    month: "space-y-4",
                    caption: "flex justify-center pt-1 relative items-center",
                    caption_label: "text-sm sm:text-base font-medium",
                    nav: "space-x-1 flex items-center",
                    nav_button: "h-7 w-7 sm:h-8 sm:w-8 bg-transparent p-0 opacity-50 hover:opacity-100",
                    table: "w-full border-collapse space-y-1",
                    head_row: "flex",
                    head_cell: "text-muted-foreground rounded-md w-12 sm:w-16 md:w-20 lg:w-24 font-normal text-xs sm:text-sm",
                    row: "flex w-full mt-2",
                    cell: "relative p-0 text-center text-xs sm:text-sm focus-within:relative focus-within:z-20",
                  }}
                />
              )}
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>

      <Dialog
        open={selectedDayEvents.length > 0}
        onOpenChange={(isOpen) => {
            if (!isOpen) {
                setSelectedDayEvents([]);
                setSelectedDate(null);
            }
        }}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedDate && (
            <>
              <DialogHeader className="px-4 sm:px-6">
                <DialogTitle className="text-lg sm:text-xl md:text-2xl pr-8">
                  Events for {format(selectedDate, "EEEE, MMMM dd, yyyy")}
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  {selectedDayEvents.length} function(s) scheduled for this day.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 sm:space-y-6 py-4 px-4 sm:px-6 max-h-[60vh] overflow-y-auto">
                {selectedDayEvents.map(event => (
                    <div key={event.id} className="p-3 sm:p-4 border rounded-lg hover:shadow-md transition-shadow">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-3 gap-2">
                            <h3 className="font-semibold text-base sm:text-lg">Order #{event.order_number || event.id.substring(0, 6)}</h3>
                            {getStatusBadge(event.status)}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                            <div className="flex items-center gap-2 sm:gap-3">
                                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground">Client</p>
                                    <p className="font-medium truncate">{event.client_name}</p>
                                </div>
                            </div>
                             <div className="flex items-center gap-2 sm:gap-3">
                                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Event Time</p>
                                    <p className="font-medium">{event.event_time ? format(new Date(`1970-01-01T${event.event_time}`), 'p') : 'Not set'}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-2 sm:gap-3 col-span-1 sm:col-span-2">
                                <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground">Venue</p>
                                    <p className="font-medium break-words">{event.venue_address}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3">
                                <Package className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Guest Count</p>
                                    <p className="font-medium">{event.guest_count} guests</p>
                                </div>
                            </div>
                        </div>
                        <Button onClick={() => handleViewOrder(event.id)} className="w-full mt-4 h-11 text-sm">
                            View Full Order & Planning Details
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
