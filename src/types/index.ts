// This file should only contain re-exports of core Supabase-generated types.
// All custom application-specific types should be in `app.ts`.

import type { Database as DB } from "@/integrations/supabase/database.types";

export type { Database, Json } from "@/integrations/supabase/database.types";
export type Tables<T extends keyof DB["public"]["Tables"]> = DB["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof DB["public"]["Enums"]> = DB["public"]["Enums"][T];
export type Functions<T extends keyof DB["public"]["Functions"]> = DB["public"]["Functions"][T];

// Core Entity Types
export type Profile = Tables<"profiles">;
export type Lead = Tables<"leads">;
export type Quote = Tables<"quotes">;
export type Order = Tables<"orders">;
export type Company = Tables<"companies">;
export type Subscription = Tables<"subscriptions">;
export type UserDepartment = Tables<"user_departments">;
export type StaffInvitation = Tables<"staff_invitations">;
export type Notification = Tables<"notifications">;
export type Equipment = Tables<"equipment">;
export type EquipmentBooking = Tables<"equipment_bookings">;
export type Complaint = Tables<"complaints">;

// Operational Standards Types
export type Vehicle = Tables<"vehicles">;
export type VehicleInsert = DB["public"]["Tables"]["vehicles"]["Insert"];
export type EquipmentKit = Tables<"equipment_kits">;
export type EquipmentKitInsert = DB["public"]["Tables"]["equipment_kits"]["Insert"];
export type EquipmentKitItem = Tables<"equipment_kit_items">;
export type EquipmentKitItemInsert = DB["public"]["Tables"]["equipment_kit_items"]["Insert"];
export type FinancialDepreciation = Tables<"financial_depreciation">;
export type FinancialDepreciationInsert = DB["public"]["Tables"]["financial_depreciation"]["Insert"];