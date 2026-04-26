import { useState, useEffect } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle2, 
  Circle,
  Settings,
  Users,
  Package,
  CreditCard,
  Mail,
  Rocket,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowLeft
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";

const onboardingSteps = [
  {
    id: "company-setup",
    title: "Company Setup",
    description: "Configure your company details and branding",
    icon: Settings,
    link: "/admin/settings",
    completed: true
  },
  {
    id: "add-staff",
    title: "Add Staff Members",
    description: "Invite your team and assign roles",
    icon: Users,
    link: "/admin/users",
    completed: true
  },
  {
    id: "inventory",
    title: "Setup Inventory",
    description: "Add your equipment and menu items",
    icon: Package,
    link: "/admin/inventory",
    completed: false
  },
  {
    id: "payments",
    title: "Configure Payments",
    description: "Set up payment gateways",
    icon: CreditCard,
    link: "/admin/payment-gateways",
    completed: false
  },
  {
    id: "email",
    title: "Email Templates",
    description: "Customize your automated emails",
    icon: Mail,
    link: "/admin/email-templates",
    completed: false
  },
  {
    id: "launch",
    title: "Ready to Launch",
    description: "Start accepting orders",
    icon: Rocket,
    link: "/admin/dashboard",
    completed: false
  }
];

export default function ProtectedOnboardingPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.OWNER]}>
      <OnboardingPage />
    </ProtectedRoute>
  );
}