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
} from "lucide-react";
import { useRouter } from "next/router";

export default function CalendarPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<AppOrder[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<AppOrder | null>(null);
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
    const orders: AppOrder[] = await orderService.getOrders({ userId: user.id });
    setEvents(orders);
    setLoading(false);
    setCalendarKey(prev => prev + 1); 
  };

  const getStatusBadge = (status: AppOrder["status"]) => {
    const styles = {
      pending_deposit: "bg-yellow-100 text-yellow-800",
      confirmed: "bg-blue-100 text-blue-800",
      preparing: "bg-purple-100 text-purple-800",
      ready: "bg-indigo-100 text-indigo-800",
      in_transit: "bg-cyan-100 text-cyan-800",
      delivered: "bg-teal-100 text-teal-800",
      completed: "bg-green-100 text-green-800",
    };
    return (
      <Badge className={styles[status || "pending_deposit"] || "bg-gray-100 text-gray-800"}>
        {status?.replace("_", " ").toUpperCase()}
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
      (event) => format(new Date(event.event_date), "yyyy-MM-dd") === format(day, "yyyy-MM-dd")
    );
    if (dayEvents.length > 0) {
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
                  key={calendarKey}
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
                  <span>Order #{selectedEvent.order_number || selectedEvent.id.substring(0, 6)}</span>
                  {getStatusBadge(selectedEvent.status)}
                </DialogTitle>
                <DialogDescription>
                  {format(new Date(selectedEvent.event_date), "EEEE, MMMM dd, yyyy")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Client</p>
                    <p className="font-medium">{selectedEvent.client_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Venue</p>
                    <p className="font-medium">{selectedEvent.venue_address}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Package className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Guest Count
                    </p>
                    <p className="font-medium">
                      {selectedEvent.guest_count} guests
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
