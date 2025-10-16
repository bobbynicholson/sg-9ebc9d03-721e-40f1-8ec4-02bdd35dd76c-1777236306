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
import { useAuth } from "@/contexts/AuthContext";
import { orderService } from "@/services/orderService";
import { AppOrder } from "@/types";
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

export default function CalendarPage() {
  const { user } = useAuth();
  const router = useRouter();
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
    if (user?.company_slug) {
        router.push(`/${user.company_slug}/admin/dashboard?orderId=${orderId}`);
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
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Events Calendar</h1>
            <p className="text-muted-foreground">
              A top-level view of all scheduled functions.
            </p>
          </div>

          <Card className="overflow-hidden">
            <CardContent className="p-2 md:p-6">
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
                    day: "h-16 w-16 md:h-20 md:w-20 lg:h-24 lg:w-24 relative text-lg rounded-md focus-within:relative focus-within:z-20",
                    day_selected: "bg-primary text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground",
                    day_outside: "text-muted-foreground opacity-50",
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
        <DialogContent className="max-w-2xl">
          {selectedDate && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">
                  Events for {format(selectedDate, "EEEE, MMMM dd, yyyy")}
                </DialogTitle>
                <DialogDescription>
                  {selectedDayEvents.length} function(s) scheduled for this day.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4 max-h-[60vh] overflow-y-auto pr-4">
                {selectedDayEvents.map(event => (
                    <div key={event.id} className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-3">
                            <h3 className="font-semibold text-lg">Order #{event.order_number || event.id.substring(0, 6)}</h3>
                            {getStatusBadge(event.status)}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-3">
                                <Users className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Client</p>
                                    <p className="font-medium">{event.client_name}</p>
                                </div>
                            </div>
                             <div className="flex items-center gap-3">
                                <Clock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Event Time</p>
                                    <p className="font-medium">{event.event_time ? format(new Date(`1970-01-01T${event.event_time}`), 'p') : 'Not set'}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 col-span-1 md:col-span-2">
                                <MapPin className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Venue</p>
                                    <p className="font-medium">{event.venue_address}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <Package className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Guest Count</p>
                                    <p className="font-medium">{event.guest_count} guests</p>
                                </div>
                            </div>
                        </div>
                        <Button onClick={() => handleViewOrder(event.id)} className="w-full mt-4">
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
