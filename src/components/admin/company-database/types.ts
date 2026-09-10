/**
 * Shared types for /admin/platform/company-database and its dialogs.
 * Extracted in the P2-13 audit split.
 */

export interface Company {
  id: string;
  company_name: string;
  company_slug: string;
  owner_id: string;
  email: string;
  phone: string;
  address_line1: string;
  city: string;
  country: string;
  subscription_status: string;
  trial_ends_at: string;
  created_at: string;
  owner_name?: string;
  total_users?: number;
  total_orders?: number;
}

export interface CompanyFormData {
  company_name: string;
  company_slug: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  billing_currency: string;
  admin_name: string;
  admin_email: string;
  /** Generated server-side, returned once and shown to the operator. */
  admin_password: string;
}
