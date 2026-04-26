import { supabase } from "@/integrations/supabase/client";

/**
 * Supplier Operations Module
 * Handles supplier management and relationships
 */

export interface Supplier {
  id: string;
  supplierName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  category: string;
  paymentTerms: string;
  isActive: boolean;
}

export async function getSuppliersByCompany(companyId: string) {
  try {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .eq("company_id", companyId)
      .order("supplier_name");

    if (error) throw error;

    return { success: true, suppliers: data || [] };
  } catch (error: any) {
    console.error("Error fetching suppliers:", error);
    return { success: false, error: error.message, suppliers: [] };
  }
}

export async function createSupplier(
  companyId: string,
  supplierData: Omit<Supplier, "id">
) {
  try {
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        company_id: companyId,
        supplier_name: supplierData.supplierName,
        contact_person: supplierData.contactPerson,
        email: supplierData.email,
        phone: supplierData.phone,
        address_line1: supplierData.address,
        category: supplierData.category,
        payment_terms: parseInt(supplierData.paymentTerms as any) || 30,
        is_active: supplierData.isActive,
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, supplier: data };
  } catch (error: any) {
    console.error("Error creating supplier:", error);
    return { success: false, error: error.message };
  }
}

export async function updateSupplier(
  supplierId: string,
  updates: Partial<Omit<Supplier, "id">>
) {
  try {
    const dbUpdates: any = { updated_at: new Date().toISOString() };
    if (updates.supplierName !== undefined) dbUpdates.supplier_name = updates.supplierName;
    if (updates.contactPerson !== undefined) dbUpdates.contact_person = updates.contactPerson;
    if (updates.email !== undefined) dbUpdates.email = updates.email;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
    if (updates.address !== undefined) dbUpdates.address_line1 = updates.address;
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.paymentTerms !== undefined) dbUpdates.payment_terms = parseInt(updates.paymentTerms as any) || 30;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

    const { data, error } = await supabase
      .from("suppliers")
      .update(dbUpdates)
      .eq("id", supplierId)
      .select()
      .single();

    if (error) throw error;

    return { success: true, supplier: data };
  } catch (error: any) {
    console.error("Error updating supplier:", error);
    return { success: false, error: error.message };
  }
}

export async function deleteSupplier(supplierId: string) {
  try {
    const { error } = await supabase
      .from("suppliers")
      .delete()
      .eq("id", supplierId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting supplier:", error);
    return { success: false, error: error.message };
  }
}