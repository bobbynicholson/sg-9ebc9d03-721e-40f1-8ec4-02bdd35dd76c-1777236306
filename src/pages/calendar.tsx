import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar as CalendarIcon,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Users,
  DollarSign,
  Clock
} from "lucide-react";
import { Quote } from "@/types";
import { Footer } from "@/components/Footer";

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    const storedQuotes = JSON.parse(localStorage.getItem("quotes") || "[]");
    setQuotes(storedQuotes.filter((q: Quote) => q.status === "accepted" || q.status === "sent"));
  }, []);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentDate);

  const getQuotesForDate = (day: number) => {
    const dateStr = new Date(year, month, day).toISOString().split("T")[0];
    return quotes.filter(q => q.eventDate === dateStr);
  };

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const handleDateClick = (day: number) => {
    const dateStr = new Date(year, month, day).toISOString().split("T")[0];
    setSelectedDate(dateStr);
  };

  const selectedDateQuotes = selectedDate 
    ? quotes.filter(q => q.eventDate === selectedDate)
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Link href="/">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg">
              <CalendarIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Event Calendar
              </h1>
              <p className="text-slate-600 mt-1">View and manage event bookings</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl">
                    {monthNames[month]} {year}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={goToPreviousMonth}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={goToNextMonth}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2 mb-4">
                  {dayNames.map((day) => (
                    <div key={day} className="text-center font-semibold text-slate-600 text-sm py-2">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {Array.from({ length: startingDayOfWeek }).map((_, index) => (
                    <div key={`empty-${index}`} className="aspect-square" />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, index) => {
                    const day = index + 1;
                    const dayQuotes = getQuotesForDate(day);
                    const isToday = 
                      new Date().getDate() === day &&
                      new Date().getMonth() === month &&
                      new Date().getFullYear() === year;
                    const dateStr = new Date(year, month, day).toISOString().split("T")[0];
                    const isSelected = selectedDate === dateStr;

                    return (
                      <button
                        key={day}
                        onClick={() => handleDateClick(day)}
                        className={`aspect-square p-2 rounded-lg border transition-all hover:shadow-md ${
                          isToday 
                            ? "border-purple-500 bg-purple-50" 
                            : isSelected
                            ? "border-purple-600 bg-purple-100"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex flex-col h-full">
                          <span className={`text-sm font-medium ${
                            isToday ? "text-purple-600" : "text-slate-900"
                          }`}>
                            {day}
                          </span>
                          {dayQuotes.length > 0 && (
                            <div className="mt-1 space-y-1">
                              {dayQuotes.slice(0, 2).map((quote, idx) => (
                                <div
                                  key={idx}
                                  className={`text-xs px-1 py-0.5 rounded truncate ${
                                    quote.status === "accepted"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {quote.clientName}
                                </div>
                              ))}
                              {dayQuotes.length > 2 && (
                                <div className="text-xs text-slate-500">
                                  +{dayQuotes.length - 2} more
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">
                  {selectedDate 
                    ? `Events on ${new Date(selectedDate).toLocaleDateString("en-US", { 
                        month: "long", 
                        day: "numeric", 
                        year: "numeric" 
                      })}`
                    : "Select a date"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedDate ? (
                  selectedDateQuotes.length > 0 ? (
                    <div className="space-y-4">
                      {selectedDateQuotes.map((quote) => (
                        <div key={quote.id} className="p-4 border rounded-lg bg-slate-50">
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-semibold text-slate-900">{quote.clientName}</h4>
                            <Badge className={
                              quote.status === "accepted"
                                ? "bg-green-100 text-green-700 border-green-200"
                                : "bg-blue-100 text-blue-700 border-blue-200"
                            }>
                              {quote.status}
                            </Badge>
                          </div>
                          <div className="space-y-2 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{quote.guestCount} guests</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4" />
                              <span className="font-medium text-green-600">
                                ${quote.total.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>{quote.eventType}</span>
                            </div>
                          </div>
                          <Link href={`/quotes/${quote.id}`}>
                            <Button variant="outline" size="sm" className="w-full mt-3">
                              View Details
                            </Button>
                          </Link>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>No events scheduled</p>
                    </div>
                  )
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
                    <p>Click a date to view events</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
              <CardHeader>
                <CardTitle className="text-lg">Legend</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-100 border border-green-200" />
                  <span className="text-sm text-slate-700">Confirmed Booking</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-100 border border-blue-200" />
                  <span className="text-sm text-slate-700">Pending Quote</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border-2 border-purple-500" />
                  <span className="text-sm text-slate-700">Today</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}
