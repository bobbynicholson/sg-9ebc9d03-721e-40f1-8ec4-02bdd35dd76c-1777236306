import { useState, useEffect } from "react";
import Head from "next/head";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
  Clock,
  Package,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/router";

interface CalendarEvent {
  id: string;
  date: Date;
  title: string;
  status: AppOrder["status"];
  clientName: string;
  venue: string;
  guestCount: number;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<AppOrder[]>([]);
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [selectedEvent, setSelectedEvent] = useState<AppOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarKey, setCalendarKey] = useState(0); // Add state for re-rendering

  useEffect(() => {
    if (user?.id) {
      loadEvents();
    } else if (!user) {
      // If no user, maybe redirect or show a login message.
      // For now, let's stop loading.
      setLoading(false);
    }
  }, [user]);

  const loadEvents = async () => {
    if (!user?.id) return;
    setLoading(true);
    const orders: AppOrder[] = await orderService.getAllOrders(user.id);
    const calendarEvents = orders.map((order: AppOrder) => ({
      id: order.id,
      date: new Date(order.eventDate),
      title: `Order #${(order as any).order_number || order.id.substring(0, 6)}`,
      status: order.status,
      clientName: order.clientName,
      venue: order.venue,
      guestCount: order.guestCount,
    }));
    setEvents(calendarEvents);
    setLoading(false);
    setCalendarKey(prev => prev + 1); // Force calendar to re-render with new events
  };

  const getStatusBadge = (status: AppOrder["status"]) => {
    const styles = {
      pending: "bg-yellow-100 text-yellow-800",
      confirmed: "bg-blue-100 text-blue-800",
      preparing: "bg-purple-100 text-purple-800",
      ready: "bg-indigo-100 text-indigo-800",
      in_transit: "bg-cyan-100 text-cyan-800",
      delivered: "bg-teal-100 text-teal-800",
      completed: "bg-green-100 text-green-800",
    };
    return (
      <Badge className={styles[status] || "bg-gray-100 text-gray-800"}>
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  const DayWithEvents = ({ date, ...props }: { date: Date; [key: string]: any }) => {
    const dayEvents = events.filter(
      (event) => format(event.date, "yyyy-MM-dd") === format(date, "yyyy-MM-dd")
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
                    : "bg-blue-500"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleDayClick = (day: Date) => {
    const dayEvents = events.filter(
      (event) => format(event.date, "yyyy-MM-dd") === format(day, "yyyy-MM-dd")
    );
    if (dayEvents.length === 1) {
      setSelectedEvent(dayEvents[0]);
    } else if (dayEvents.length > 1) {
      // For simplicity, we open the first one. A better UX might be a popover listing them.
      setSelectedEvent(dayEvents[0]);
    }
  };

  const handleViewOrder = () => {
    if (selectedEvent) {
      router.push(`/orders?orderId=${selectedEvent.id}`);
    }
  };

  return (
    <>
      <Head>
        <title>Events Calendar | CateringMS Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold">Events Calendar</h1>
            <p className="text-muted-foreground">
              A complete overview of all scheduled functions.
            </p>
          </div>

          <Card>
            <CardContent className="p-2 md:p-6">
              {loading ? (
                <div className="flex justify-center items-center h-96">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <Calendar
                  key={calendarKey} // Use key to force re-render
                  mode="single"
                  onDayClick={handleDayClick}
                  className="p-0"
                  components={{
                    Day: DayWithEvents,
                  }}
                  classNames={{
                    day: "h-16 w-16 md:h-20 md:w-20 lg:h-24 lg:w-24 relative text-lg",
                    day_selected: "bg-primary text-primary-foreground",
                  }}
                />
              )}
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>

      <Dialog
        open={!!selectedEvent}
        onOpenChange={() => setSelectedEvent(null)}
      >
        <DialogContent>
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>{selectedEvent.title}</span>
                  {getStatusBadge(selectedEvent.status)}
                </DialogTitle>
                <DialogDescription>
                  {format(selectedEvent.date, "EEEE, MMMM dd, yyyy")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Client</p>
                    <p className="font-medium">{selectedEvent.clientName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Venue</p>
                    <p className="font-medium">{selectedEvent.venue}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Guest Count
                    </p>
                    <p className="font-medium">
                      {selectedEvent.guestCount} guests
                    </p>
                  </div>
                </div>
              </div>
              <Button onClick={handleViewOrder} className="w-full">
                View Full Order Details
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
