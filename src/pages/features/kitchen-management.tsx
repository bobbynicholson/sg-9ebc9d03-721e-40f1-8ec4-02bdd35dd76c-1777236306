import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ChefHat, 
  ArrowRight, 
  CheckCircle, 
  Clock,
  ListChecks,
  Users
} from "lucide-react";
import { Footer } from "@/components/Footer";
import Head from "next/head";

export default function KitchenManagementPage() {
  return (
    <>
      <Head>
        <title>Kitchen Production Management - CaterOS</title>
        <meta name="description" content="Smart prep lists, order coordination, and production workflows for your kitchen team. Reduce prep time by 30% with automated kitchen management." />
        <meta name="keywords" content="kitchen management, food production, prep lists, catering kitchen, workflow optimization, team coordination" />
        <link rel="canonical" href="https://cateros.co.za/features/kitchen-management" />
      </Head>

      <div className="min-h-screen bg-white">
        <div className="relative overflow-hidden bg-gradient-to-br from-pink-50 via-white to-rose-50">
          <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))] bg-[size:40px_40px]" />
          
          <div className="relative container mx-auto px-4 py-16 md:py-24 max-w-6xl">
            <div className="text-center max-w-4xl mx-auto mb-12">
              <Badge className="mb-6 px-4 py-2 bg-pink-100 text-pink-700 border-pink-200">
                <ChefHat className="w-4 h-4 mr-2 inline" />
                Kitchen Management
              </Badge>
              <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
                Turn Kitchen Chaos Into Smooth Operations
              </h1>
              <p className="text-xl md:text-2xl text-slate-700 mb-8">
                Smart prep schedules, automated shopping lists, and team coordination that keeps your kitchen running efficiently
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/auth/register">
                  <Button size="lg" className="bg-gradient-to-r from-pink-600 to-rose-600 text-white px-8 py-6 text-lg">
                    Start Free Trial
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="px-8 py-6 text-lg border-2">
                    Book Demo
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16 max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 mb-16">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-6">
                Everyone Knows Exactly What to Do and When
              </h2>
              <p className="text-lg text-slate-600 mb-6">
                Your kitchen team sees exactly what needs to be prepared, when it needs to be ready, and what ingredients are available. No more confusion or last-minute scrambles.
              </p>
              <ul className="space-y-4">
                {[
                  "Automated prep schedules for each order",
                  "Ingredient requirements pulled from inventory",
                  "Production timeline optimization",
                  "Team task assignments",
                  "Shopping lists auto-generated",
                  "Quality control checklists"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-pink-600 shrink-0 mt-1" />
                    <span className="text-slate-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-pink-100 to-rose-100 rounded-2xl p-8 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl font-bold text-pink-600 mb-4">30-35%</div>
                <p className="text-xl text-slate-700">Faster Prep Times</p>
                <p className="text-sm text-slate-600 mt-2">Optimized workflows reduce kitchen prep by a third</p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {[
              {
                icon: Clock,
                title: "Smart Scheduling",
                description: "Prep schedules based on event time working backwards to start times"
              },
              {
                icon: ListChecks,
                title: "Task Checklists",
                description: "Teams check off completed tasks as they go for accountability"
              },
              {
                icon: Users,
                title: "Team Coordination",
                description: "Everyone sees what others are doing for seamless coordination"
              }
            ].map((benefit, i) => (
              <Card key={i} className="border-2 hover:border-pink-300 hover:shadow-xl transition-all">
                <CardContent className="pt-6">
                  <div className="p-3 bg-gradient-to-br from-pink-500 to-rose-500 rounded-xl w-fit mb-4">
                    <benefit.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{benefit.title}</h3>
                  <p className="text-slate-600">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="bg-gradient-to-br from-pink-600 to-rose-600 rounded-3xl p-12 text-center text-white mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              No More Last-Minute Kitchen Panic
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto opacity-95">
              Stop the chaos. Give your team clear timelines, tasks, and coordination tools that keep production flowing smoothly.
            </p>
            <Link href="/auth/register">
              <Button size="lg" className="bg-white text-pink-600 hover:bg-pink-50 px-10 py-6 text-lg">
              Organize Your Kitchen Today
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>

          <div className="text-center">
            <p className="text-slate-600 mb-4">
              Discover <Link href="/blog/kitchen-workflow-optimization" className="text-pink-600 underline">kitchen workflow optimization tips</Link>
            </p>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}