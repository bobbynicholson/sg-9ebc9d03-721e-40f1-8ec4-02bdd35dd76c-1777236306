import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  Users,
  CheckCircle2,
  TrendingUp,
  Calendar,
  Filter,
  Download,
  Search,
} from "lucide-react";
import { kitchenDutyService } from "@/services/kitchenDutyService";
import { profileService } from "@/services/profileService";
import { AdminNav } from "@/components/admin/AdminNav";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";

interface StaffMember {
  id: string;
  full_name: string;
  avatar_url?: string;
  email: string;
}

function KitchenDutyTracking() {
  return <div>Kitchen Duty Tracking Content</div>;
}

export default function KitchenDutyTrackingPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.OWNER]}>
      <KitchenDutyTracking />
    </ProtectedRoute>
  );
}
