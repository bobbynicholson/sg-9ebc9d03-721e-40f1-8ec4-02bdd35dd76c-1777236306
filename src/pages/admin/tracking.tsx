import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MapPin, Clock, Package, User, Phone, Navigation, TrendingUp, AlertCircle } from "lucide-react";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { useAuth } from "@/contexts/AuthContext";
import { orderService } from "@/services/orderService";
import driverService from "@/services/driverService";
import { Footer } from "@/components/Footer";
import { ChatBot } from "@/components/ChatBot";
import { useToast } from "@/hooks/use-toast";
import dynamic from "next/dynamic";
import { supabase } from "@/integrations/supabase/client";
import { AdminTrackingMap } from "@/components/tracking/AdminTrackingMap";

interface OrderWithTracking {
  id: string;
  client_name: string;
  venue_address: string;
  venue_lat?: number;
  venue_lng?: number;
  delivery_time: string;
  status: string;
  driver_id?: string;
  driver_name?: string;
  driver_phone?: string;
  driver_lat?: number;
  driver_lng?: number;
  last_updated?: string;
  estimated_arrival?: string;
}

export default function ProtectedTrackingPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.OWNER]}>
      <TrackingPage />
    </ProtectedRoute>
  );
}