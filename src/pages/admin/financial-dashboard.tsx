import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Users,
  Package,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Trophy
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { orderService } from "@/services/orderService";
import { paymentLedgerService } from "@/services/paymentLedgerService";
import { analyticsService } from "@/services/analyticsService";
import { aiFinancialService } from "@/services/aiFinancialService";
import * as currencyUtils from "@/lib/currencyUtils";
import type { Order, Profile } from "@/types";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { GetServerSideProps } from "next";
import { AdminNav } from "@/components/admin/AdminNav";

interface FinancialMetrics {
  currentCashFlow: number;
  projectedRevenue30Days: number;
  projectedRevenue90Days: number;
  pendingPayments: number;
  staffPaymentsOwed: number;
  inventoryCosts: number;
  profitMargin: number;
  healthScore: number;
}

interface CashFlowAlert {
  severity: "high" | "medium" | "low";
  message: string;
  suggestedAction: string;
  predictedDate?: string;
}

export default function ProtectedFinancialDashboard() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER]}>
      <FinancialDashboard />
    </ProtectedRoute>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  return {
    props: {},
  };
};
