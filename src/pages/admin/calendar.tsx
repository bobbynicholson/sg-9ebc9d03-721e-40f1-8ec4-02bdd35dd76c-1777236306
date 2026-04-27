import { useState, useEffect } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Users,
  Filter,
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { orderService } from "@/services/orderService";
import type { AppOrder } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute"; // Adjust import based on actual path
 // Adjust import based on actual path
import {  UserRole  } from "@/types/app"; // Adjust import based on actual path

export default function ProtectedCalendarPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.COMPANY_ADMIN]}>
      <AdminCalendar />
    </ProtectedRoute>
  );
}

function AdminCalendar() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<AppOrder[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"month" | "week" | "day">("month");

  useEffect(() => {
    if (user) {
      loadOrders();
    }
  }, [user]);

  const loadOrders = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    try {
      const allOrders = await orderService.getAllOrders(user.company_id);
      setOrders(allOrders as unknown as AppOrder[]);
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const getOrdersForDate = (date: Date) => {
    const dateString = date.toISOString().split("T")[0];
    return orders.filter((order) => order.event_date.split("T")[0] === dateString);
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Generate calendar days
  const calendarDays = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const upcomingEvents = orders
    .filter((order) => new Date(order.event_date) >= new Date())
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    .slice(0, 5);

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Event Calendar - CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-8 max-w-screen-2xl">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
                  <CalendarIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                    Event Calendar
                  </h1>
                  <p className="text-slate-600 mt-1">Schedule and manage events</p>
                </div>
              </div>
              <Link href="/admin/order-assignments">
                <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 gap-2">
                  <Plus className="w-4 h-4" />
                  New Event
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar */}
            <div className="lg:col-span-2">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Button variant="outline" size="sm" onClick={previousMonth}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <h2 className="text-xl font-bold">
                        {monthNames[month]} {year}
                      </h2>
                      <Button variant="outline" size="sm" onClick={nextMonth}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant={view === "month" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setView("month")}
                      >
                        Month
                      </Button>
                      <Button
                        variant={view === "week" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setView("week")}
                      >
                        Week
                      </Button>
                      <Button
                        variant={view === "day" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setView("day")}
                      >
                        Day
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-7 gap-2">
                    {/* Day headers */}
                    {dayNames.map((day) => (
                      <div
                        key={day}
                        className="text-center text-sm font-semibold text-slate-600 py-2"
                      >
                        {day}
                      </div>
                    ))}

                    {/* Calendar days */}
                    {calendarDays.map((day, index) => {
                      if (day === null) {
                        return <div key={`empty-${index}`} className="aspect-square" />;
                      }

                      const date = new Date(year, month, day);
                      const eventsOnDay = getOrdersForDate(date);
                      const isToday =
                        date.toDateString() === new Date().toDateString();

                      return (
                        <button
                          key={day}
                          onClick={() => setSelectedDate(date)}
                          className={`aspect-square p-2 rounded-lg border-2 transition-all hover:shadow-md ${
                            isToday
                              ? "bg-purple-50 border-purple-500"
                              : eventsOnDay.length > 0
                              ? "bg-blue-50 border-blue-200"
                              : "bg-white border-slate-200"
                          } ${
                            selectedDate?.toDateString() === date.toDateString()
                              ? "ring-2 ring-purple-500"
                              : ""
                          }`}
                        >
                          <div className="text-sm font-medium text-slate-900">{day}</div>
                          {eventsOnDay.length > 0 && (
                            <div className="mt-1">
                              <Badge className="text-xs bg-blue-500 text-white">
                                {eventsOnDay.length}
                              </Badge>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Upcoming Events Sidebar */}
            <div className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-purple-600" />
                    Upcoming Events
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {upcomingEvents.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">No upcoming events</p>
                  ) : (
                    <div className="space-y-4">
                      {upcomingEvents.map((event) => (
                        <div
                          key={event.id}
                          className="p-3 rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-semibold text-slate-900 text-sm">
                              {event.client_name}
                            </h4>
                            <Badge className="bg-purple-100 text-purple-800 text-xs">
                              {event.status}
                            </Badge>
                          </div>
                          <div className="space-y-1 text-xs text-slate-600">
                            <div className="flex items-center gap-2">
                              <CalendarIcon className="w-3 h-3" />
                              <span>
                                {new Date(event.event_date).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="w-3 h-3" />
                              <span>{event.guest_count} guests</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3 h-3" />
                              <span className="truncate">{event.venue_address}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Stats */}
              <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Total Events</span>
                      <span className="text-2xl font-bold text-slate-900">
                        {orders.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">This Month</span>
                      <span className="text-2xl font-bold text-blue-900">
                        {
                          orders.filter((o) => {
                            const orderDate = new Date(o.event_date);
                            return (
                              orderDate.getMonth() === month &&
                              orderDate.getFullYear() === year
                            );
                          }).length
                        }
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Upcoming</span>
                      <span className="text-2xl font-bold text-green-900">
                        {
                          orders.filter((o) => new Date(o.event_date) >= new Date())
                            .length
                        }
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Selected Date Events */}
          {selectedDate && (
            <Card className="border-0 shadow-lg mt-6">
              <CardHeader>
                <CardTitle>
                  Events on {selectedDate.toLocaleDateString()}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {getOrdersForDate(selectedDate).length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No events on this date</p>
                ) : (
                  <div className="space-y-4">
                    {getOrdersForDate(selectedDate).map((event) => (
                      <div
                        key={event.id}
                        className="p-4 rounded-lg bg-white border-2 border-slate-200 hover:border-purple-300 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-semibold text-lg text-slate-900">
                                {event.client_name}
                              </h4>
                              <Badge>{event.status}</Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-slate-600">
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                <span>{event.guest_count} guests</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4" />
                                <span className="truncate">{event.venue_address}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                <span>{event.event_time || "TBD"}</span>
                              </div>
                              <div>
                                <span className="font-semibold">
                                  R{Number((event as any).total_amount || 0).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}