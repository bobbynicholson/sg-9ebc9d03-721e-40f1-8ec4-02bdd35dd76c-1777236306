/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";
import { DriverNav } from "@/components/navigation/DriverNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Footer } from "@/components/Footer";

export default function DriverNotificationsPage() {
  return (
    <>
      <NoIndexMeta />
      <Head><title>Notifications - Driver Portal</title></Head>
      <DriverNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Notifications</h1>
              <p className="text-slate-600 mt-1">Dispatch alerts and route changes</p>
            </div>
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>You're all caught up</CardTitle>
              <CardDescription>
                We'll buzz this page whenever dispatch assigns you a route or a customer messages you.
                In the meantime, the bell icon at the top of the screen flashes red when something
                new arrives.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-slate-400">
                <Bell className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                No notifications yet today.
              </div>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    </>
  );
}
