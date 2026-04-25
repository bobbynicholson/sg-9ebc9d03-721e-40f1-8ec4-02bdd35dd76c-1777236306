 
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          created_at: string | null
          data_export_requested: boolean | null
          id: string
          reason: string | null
          scheduled_deletion_date: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          data_export_requested?: boolean | null
          id?: string
          reason?: string | null
          scheduled_deletion_date?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          data_export_requested?: boolean | null
          id?: string
          reason?: string | null
          scheduled_deletion_date?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      accounting_integrations: {
        Row: {
          access_token: string
          company_id: string
          created_at: string | null
          expires_at: string
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          provider: string
          refresh_token: string
          sync_errors: Json | null
          tenant_id: string | null
          tenant_name: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          company_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          provider: string
          refresh_token: string
          sync_errors?: Json | null
          tenant_id?: string | null
          tenant_name?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          company_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          provider?: string
          refresh_token?: string
          sync_errors?: Json | null
          tenant_id?: string | null
          tenant_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          message: string | null
          priority: string | null
          read: boolean | null
          title: string | null
          type: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          priority?: string | null
          read?: boolean | null
          title?: string | null
          type?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          priority?: string | null
          read?: boolean | null
          title?: string | null
          type?: string | null
        }
        Relationships: []
      }
      allergens: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          name: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      backup_generators: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      billing_history: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          invoice_pdf_url: string | null
          invoice_url: string | null
          payment_method: string | null
          status: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          invoice_pdf_url?: string | null
          invoice_url?: string | null
          payment_method?: string | null
          status: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_pdf_url?: string | null
          invoice_url?: string | null
          payment_method?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author: string | null
          author_id: string | null
          category: string | null
          company_id: string | null
          content: string | null
          created_at: string | null
          excerpt: string | null
          featured_image: string | null
          id: string
          is_published: boolean | null
          last_updated: string | null
          meta_description: string | null
          meta_title: string | null
          published_date: string | null
          read_time_minutes: number | null
          slug: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          author?: string | null
          author_id?: string | null
          category?: string | null
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          is_published?: boolean | null
          last_updated?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_date?: string | null
          read_time_minutes?: number | null
          slug?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          author?: string | null
          author_id?: string | null
          category?: string | null
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          excerpt?: string | null
          featured_image?: string | null
          id?: string
          is_published?: boolean | null
          last_updated?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_date?: string | null
          read_time_minutes?: number | null
          slug?: string | null
          tags?: string[] | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_requests: {
        Row: {
          cancellation_type: string | null
          company_id: string | null
          created_at: string | null
          feedback: string | null
          id: string
          reason: string | null
          status: string | null
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          cancellation_type?: string | null
          company_id?: string | null
          created_at?: string | null
          feedback?: string | null
          id?: string
          reason?: string | null
          status?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          cancellation_type?: string | null
          company_id?: string | null
          created_at?: string | null
          feedback?: string | null
          id?: string
          reason?: string | null
          status?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cleaning_duty_logs: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          on_duty: boolean | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          on_duty?: boolean | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          on_duty?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_duty_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_schedules: {
        Row: {
          area_name: string
          assigned_to: string | null
          company_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          description: string | null
          frequency: string
          id: string
          notes: string | null
          scheduled_date: string
          scheduled_time: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["cleaning_status"] | null
          updated_at: string | null
          verification_photos: string[] | null
        }
        Insert: {
          area_name: string
          assigned_to?: string | null
          company_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description?: string | null
          frequency: string
          id?: string
          notes?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["cleaning_status"] | null
          updated_at?: string | null
          verification_photos?: string[] | null
        }
        Update: {
          area_name?: string
          assigned_to?: string | null
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description?: string | null
          frequency?: string
          id?: string
          notes?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["cleaning_status"] | null
          updated_at?: string | null
          verification_photos?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_schedules_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_schedules_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_supplies: {
        Row: {
          company_id: string | null
          created_at: string | null
          current_quantity: number | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          current_quantity?: number | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          current_quantity?: number | null
          id?: string
        }
        Relationships: []
      }
      client_subscriptions: {
        Row: {
          auto_generate_orders: boolean | null
          cancellation_reason: string | null
          cancelled_at: string | null
          client_id: string
          company_id: string
          created_at: string | null
          default_delivery_time: string | null
          default_guest_count: number | null
          default_venue_address: string | null
          default_venue_lat: number | null
          default_venue_lng: number | null
          deleted_at: string | null
          description: string | null
          end_date: string | null
          frequency: string
          generate_days_in_advance: number | null
          id: string
          is_active: boolean | null
          paused_at: string | null
          recurring_amount: number
          start_date: string
          subscription_name: string
          updated_at: string | null
        }
        Insert: {
          auto_generate_orders?: boolean | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_id: string
          company_id: string
          created_at?: string | null
          default_delivery_time?: string | null
          default_guest_count?: number | null
          default_venue_address?: string | null
          default_venue_lat?: number | null
          default_venue_lng?: number | null
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          frequency: string
          generate_days_in_advance?: number | null
          id?: string
          is_active?: boolean | null
          paused_at?: string | null
          recurring_amount: number
          start_date: string
          subscription_name: string
          updated_at?: string | null
        }
        Update: {
          auto_generate_orders?: boolean | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_id?: string
          company_id?: string
          created_at?: string | null
          default_delivery_time?: string | null
          default_guest_count?: number | null
          default_venue_address?: string | null
          default_venue_lat?: number | null
          default_venue_lng?: number | null
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          frequency?: string
          generate_days_in_advance?: number | null
          id?: string
          is_active?: boolean | null
          paused_at?: string | null
          recurring_amount?: number
          start_date?: string
          subscription_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_manager: string | null
          billing_address_line1: string | null
          billing_address_line2: string | null
          billing_city: string | null
          billing_postal_code: string | null
          client_name: string
          client_type: string | null
          company_id: string
          created_at: string | null
          credit_limit: number | null
          deleted_at: string | null
          email: string
          id: string
          is_active: boolean | null
          notes: string | null
          outstanding_balance: number | null
          payment_terms: number | null
          phone: string
          tags: string[] | null
          tax_number: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account_manager?: string | null
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_city?: string | null
          billing_postal_code?: string | null
          client_name: string
          client_type?: string | null
          company_id: string
          created_at?: string | null
          credit_limit?: number | null
          deleted_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          outstanding_balance?: number | null
          payment_terms?: number | null
          phone: string
          tags?: string[] | null
          tax_number?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_manager?: string | null
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_city?: string | null
          billing_postal_code?: string | null
          client_name?: string
          client_type?: string | null
          company_id?: string
          created_at?: string | null
          credit_limit?: number | null
          deleted_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          outstanding_balance?: number | null
          payment_terms?: number | null
          phone?: string
          tags?: string[] | null
          tax_number?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_account_manager_fkey"
            columns: ["account_manager"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_pages: {
        Row: {
          company_id: string | null
          content: string | null
          created_at: string | null
          id: string
          is_published: boolean | null
          last_updated: string | null
          slug: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          last_updated?: string | null
          slug?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          last_updated?: string | null
          slug?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cms_pages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          billing_currency: string | null
          city: string | null
          company_name: string
          company_slug: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          custom_domain: string | null
          deleted_at: string | null
          email: string
          headquarters_lat: number | null
          headquarters_lng: number | null
          id: string
          is_active: boolean | null
          legal_name: string | null
          logo_url: string | null
          owner_id: string | null
          phone: string | null
          postal_code: string | null
          primary_color: string | null
          registration_number: string | null
          secondary_color: string | null
          slug: string | null
          state_province: string | null
          subscription_ends_at: string | null
          subscription_plan: string | null
          subscription_starts_at: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          subscription_tier: string | null
          suspended_reason: string | null
          tax_number: string | null
          timezone: string | null
          trial_ends_at: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          billing_currency?: string | null
          city?: string | null
          company_name: string
          company_slug?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          custom_domain?: string | null
          deleted_at?: string | null
          email: string
          headquarters_lat?: number | null
          headquarters_lng?: number | null
          id?: string
          is_active?: boolean | null
          legal_name?: string | null
          logo_url?: string | null
          owner_id?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_color?: string | null
          registration_number?: string | null
          secondary_color?: string | null
          slug?: string | null
          state_province?: string | null
          subscription_ends_at?: string | null
          subscription_plan?: string | null
          subscription_starts_at?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          subscription_tier?: string | null
          suspended_reason?: string | null
          tax_number?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          billing_currency?: string | null
          city?: string | null
          company_name?: string
          company_slug?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          custom_domain?: string | null
          deleted_at?: string | null
          email?: string
          headquarters_lat?: number | null
          headquarters_lng?: number | null
          id?: string
          is_active?: boolean | null
          legal_name?: string | null
          logo_url?: string | null
          owner_id?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_color?: string | null
          registration_number?: string | null
          secondary_color?: string | null
          slug?: string | null
          state_province?: string | null
          subscription_ends_at?: string | null
          subscription_plan?: string | null
          subscription_starts_at?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          subscription_tier?: string | null
          suspended_reason?: string | null
          tax_number?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          client_id: string | null
          company_id: string
          compensation_amount: number | null
          compensation_offered: string | null
          complainant_email: string | null
          complainant_name: string
          complainant_phone: string | null
          created_at: string | null
          description: string
          id: string
          order_id: string | null
          priority: number | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          status: string | null
          subject: string
          ticket_number: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          client_id?: string | null
          company_id: string
          compensation_amount?: number | null
          compensation_offered?: string | null
          complainant_email?: string | null
          complainant_name: string
          complainant_phone?: string | null
          created_at?: string | null
          description: string
          id?: string
          order_id?: string | null
          priority?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
          subject: string
          ticket_number: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          client_id?: string | null
          company_id?: string
          compensation_amount?: number | null
          compensation_offered?: string | null
          complainant_email?: string | null
          complainant_name?: string
          complainant_phone?: string | null
          created_at?: string | null
          description?: string
          id?: string
          order_id?: string | null
          priority?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
          subject?: string
          ticket_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_tickets_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          order_id: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          order_id?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          order_id?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      currency_fluctuation_alerts: {
        Row: {
          alert_sent: boolean | null
          base_currency: string | null
          check_date: string | null
          company_id: string | null
          created_at: string | null
          currency_pair: string | null
          days_period: number | null
          end_rate: number | null
          id: string
          percentage_change: number | null
          resolved: boolean | null
          start_rate: number | null
          target_currency: string | null
        }
        Insert: {
          alert_sent?: boolean | null
          base_currency?: string | null
          check_date?: string | null
          company_id?: string | null
          created_at?: string | null
          currency_pair?: string | null
          days_period?: number | null
          end_rate?: number | null
          id?: string
          percentage_change?: number | null
          resolved?: boolean | null
          start_rate?: number | null
          target_currency?: string | null
        }
        Update: {
          alert_sent?: boolean | null
          base_currency?: string | null
          check_date?: string | null
          company_id?: string | null
          created_at?: string | null
          currency_pair?: string | null
          days_period?: number | null
          end_rate?: number | null
          id?: string
          percentage_change?: number | null
          resolved?: boolean | null
          start_rate?: number | null
          target_currency?: string | null
        }
        Relationships: []
      }
      daily_prep_lists: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          prep_date: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          prep_date?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          prep_date?: string | null
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          actual_delivery_time: string | null
          company_id: string | null
          created_at: string | null
          driver_id: string | null
          driver_notes: string | null
          id: string
          order_id: string | null
          status: string | null
        }
        Insert: {
          actual_delivery_time?: string | null
          company_id?: string | null
          created_at?: string | null
          driver_id?: string | null
          driver_notes?: string | null
          id?: string
          order_id?: string | null
          status?: string | null
        }
        Update: {
          actual_delivery_time?: string | null
          company_id?: string | null
          created_at?: string | null
          driver_id?: string | null
          driver_notes?: string | null
          id?: string
          order_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_crates: {
        Row: {
          barcode: string | null
          company_id: string | null
          created_at: string | null
          id: string
          status: string | null
        }
        Insert: {
          barcode?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
        }
        Update: {
          barcode?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
        }
        Relationships: []
      }
      delivery_feedback: {
        Row: {
          client_id: string
          comments: string | null
          company_id: string
          created_at: string | null
          delivery_timeliness_rating: number | null
          driver_professionalism_rating: number | null
          followed_up_at: string | null
          followed_up_by: string | null
          food_quality_rating: number | null
          id: string
          is_public: boolean | null
          order_id: string
          overall_rating: number | null
          requires_follow_up: boolean | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          comments?: string | null
          company_id: string
          created_at?: string | null
          delivery_timeliness_rating?: number | null
          driver_professionalism_rating?: number | null
          followed_up_at?: string | null
          followed_up_by?: string | null
          food_quality_rating?: number | null
          id?: string
          is_public?: boolean | null
          order_id: string
          overall_rating?: number | null
          requires_follow_up?: boolean | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          comments?: string | null
          company_id?: string
          created_at?: string | null
          delivery_timeliness_rating?: number | null
          driver_professionalism_rating?: number | null
          followed_up_at?: string | null
          followed_up_by?: string | null
          food_quality_rating?: number | null
          id?: string
          is_public?: boolean | null
          order_id?: string
          overall_rating?: number | null
          requires_follow_up?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_feedback_followed_up_by_fkey"
            columns: ["followed_up_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_route_stops: {
        Row: {
          added_by_admin: boolean | null
          amount_spent: number | null
          arrival_time: string | null
          created_at: string | null
          departure_time: string | null
          driver_id: string | null
          id: string
          order_id: string | null
          reason: string | null
          receipt_url: string | null
          stop_address: string | null
          stop_lat: number | null
          stop_lng: number | null
          stop_name: string | null
          stop_type: string | null
        }
        Insert: {
          added_by_admin?: boolean | null
          amount_spent?: number | null
          arrival_time?: string | null
          created_at?: string | null
          departure_time?: string | null
          driver_id?: string | null
          id?: string
          order_id?: string | null
          reason?: string | null
          receipt_url?: string | null
          stop_address?: string | null
          stop_lat?: number | null
          stop_lng?: number | null
          stop_name?: string | null
          stop_type?: string | null
        }
        Update: {
          added_by_admin?: boolean | null
          amount_spent?: number | null
          arrival_time?: string | null
          created_at?: string | null
          departure_time?: string | null
          driver_id?: string | null
          id?: string
          order_id?: string | null
          reason?: string | null
          receipt_url?: string | null
          stop_address?: string | null
          stop_lat?: number | null
          stop_lng?: number | null
          stop_name?: string | null
          stop_type?: string | null
        }
        Relationships: []
      }
      delivery_stops: {
        Row: {
          actual_arrival_time: string | null
          created_at: string | null
          departure_time: string | null
          distance_to_next_km: number | null
          estimated_arrival_time: string | null
          id: string
          notes: string | null
          order_id: string
          priority: number | null
          route_id: string
          sequence_number: number
          status: string | null
          updated_at: string | null
          venue_address: string
          venue_lat: number | null
          venue_lng: number | null
        }
        Insert: {
          actual_arrival_time?: string | null
          created_at?: string | null
          departure_time?: string | null
          distance_to_next_km?: number | null
          estimated_arrival_time?: string | null
          id?: string
          notes?: string | null
          order_id: string
          priority?: number | null
          route_id: string
          sequence_number: number
          status?: string | null
          updated_at?: string | null
          venue_address: string
          venue_lat?: number | null
          venue_lng?: number | null
        }
        Update: {
          actual_arrival_time?: string | null
          created_at?: string | null
          departure_time?: string | null
          distance_to_next_km?: number | null
          estimated_arrival_time?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          priority?: number | null
          route_id?: string
          sequence_number?: number
          status?: string | null
          updated_at?: string | null
          venue_address?: string
          venue_lat?: number | null
          venue_lng?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_stops_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "optimized_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      dishwasher_cycles: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      driver_assignments: {
        Row: {
          accepted_at: string | null
          arrived_at_venue_at: string | null
          assigned_at: string | null
          base_fee: number | null
          calculated_distance: number | null
          checklist_crockery_confirmed: boolean | null
          checklist_cutlery_confirmed: boolean | null
          checklist_food_verified: boolean | null
          company_id: string
          completed_at: string | null
          created_at: string | null
          delivered_at: string | null
          departure_confirmed: boolean | null
          distance_fee: number | null
          driver_id: string
          en_route_at: string | null
          estimated_drive_time_minutes: number | null
          id: string
          notes: string | null
          order_id: string
          picked_up_at: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["assignment_status"] | null
          total_earnings: number | null
          updated_at: string | null
          waiter_earnings: number | null
        }
        Insert: {
          accepted_at?: string | null
          arrived_at_venue_at?: string | null
          assigned_at?: string | null
          base_fee?: number | null
          calculated_distance?: number | null
          checklist_crockery_confirmed?: boolean | null
          checklist_cutlery_confirmed?: boolean | null
          checklist_food_verified?: boolean | null
          company_id: string
          completed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          departure_confirmed?: boolean | null
          distance_fee?: number | null
          driver_id: string
          en_route_at?: string | null
          estimated_drive_time_minutes?: number | null
          id?: string
          notes?: string | null
          order_id: string
          picked_up_at?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["assignment_status"] | null
          total_earnings?: number | null
          updated_at?: string | null
          waiter_earnings?: number | null
        }
        Update: {
          accepted_at?: string | null
          arrived_at_venue_at?: string | null
          assigned_at?: string | null
          base_fee?: number | null
          calculated_distance?: number | null
          checklist_crockery_confirmed?: boolean | null
          checklist_cutlery_confirmed?: boolean | null
          checklist_food_verified?: boolean | null
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          departure_confirmed?: boolean | null
          distance_fee?: number | null
          driver_id?: string
          en_route_at?: string | null
          estimated_drive_time_minutes?: number | null
          id?: string
          notes?: string | null
          order_id?: string
          picked_up_at?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["assignment_status"] | null
          total_earnings?: number | null
          updated_at?: string | null
          waiter_earnings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_confirmations: {
        Row: {
          confirmation_type: string | null
          confirmed_at: string | null
          created_at: string | null
          driver_id: string | null
          id: string
          location_lat: number | null
          location_lng: number | null
          order_id: string | null
        }
        Insert: {
          confirmation_type?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          driver_id?: string | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          order_id?: string | null
        }
        Update: {
          confirmation_type?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          driver_id?: string | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          order_id?: string | null
        }
        Relationships: []
      }
      driver_replacement_requests: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          notes: string | null
          order_id: string
          original_driver_id: string
          reason: string
          replacement_driver_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          updated_at: string | null
          urgency: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          original_driver_id: string
          reason: string
          replacement_driver_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          updated_at?: string | null
          urgency?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          original_driver_id?: string
          reason?: string
          replacement_driver_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          updated_at?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_replacement_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_replacement_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_replacement_requests_original_driver_id_fkey"
            columns: ["original_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_replacement_requests_replacement_driver_id_fkey"
            columns: ["replacement_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_replacement_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_replacements: {
        Row: {
          accepted_by_driver_id: string | null
          company_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          order_id: string | null
          original_driver_id: string | null
          reason: string | null
          replacement_driver_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          updated_at: string | null
          urgency: string | null
        }
        Insert: {
          accepted_by_driver_id?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          original_driver_id?: string | null
          reason?: string | null
          replacement_driver_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          updated_at?: string | null
          urgency?: string | null
        }
        Update: {
          accepted_by_driver_id?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          original_driver_id?: string | null
          reason?: string | null
          replacement_driver_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          updated_at?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_replacements_accepted_by_driver_id_fkey"
            columns: ["accepted_by_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_rest_logs: {
        Row: {
          company_id: string | null
          compliant: boolean | null
          created_at: string | null
          driver_id: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          compliant?: boolean | null
          created_at?: string | null
          driver_id?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          compliant?: boolean | null
          created_at?: string | null
          driver_id?: string | null
          id?: string
        }
        Relationships: []
      }
      email_automation_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          order_id: string | null
          recipient_email: string
          recipient_name: string | null
          sent_at: string | null
          status: string
          subject: string
          template_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string | null
          status: string
          subject: string
          template_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          order_id?: string | null
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_automation_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_automation_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          company_id: string | null
          created_at: string | null
          enabled: boolean | null
          from_email: string | null
          from_name: string | null
          id: string
          provider: string | null
          smtp_port: number | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          provider?: string | null
          smtp_port?: number | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          enabled?: boolean | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          provider?: string | null
          smtp_port?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body: string
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean | null
          subject: string
          template_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          subject: string
          template_type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body?: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          subject?: string
          template_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          available_quantity: number | null
          category: string | null
          cleaning_time_hours: number | null
          company_id: string | null
          condition: string | null
          created_at: string | null
          id: string
          name: string | null
          quantity: number | null
          replacement_cost: number | null
          user_id: string | null
        }
        Insert: {
          available_quantity?: number | null
          category?: string | null
          cleaning_time_hours?: number | null
          company_id?: string | null
          condition?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          quantity?: number | null
          replacement_cost?: number | null
          user_id?: string | null
        }
        Update: {
          available_quantity?: number | null
          category?: string | null
          cleaning_time_hours?: number | null
          company_id?: string | null
          condition?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          quantity?: number | null
          replacement_cost?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      equipment_assignments: {
        Row: {
          actual_return_date: string | null
          assigned_date: string
          company_id: string
          condition_at_dispatch:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          condition_at_return:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          created_at: string | null
          damage_notes: string | null
          equipment_id: string
          expected_return_date: string | null
          id: string
          order_id: string
          quantity_assigned: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          actual_return_date?: string | null
          assigned_date: string
          company_id: string
          condition_at_dispatch?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          condition_at_return?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          created_at?: string | null
          damage_notes?: string | null
          equipment_id: string
          expected_return_date?: string | null
          id?: string
          order_id: string
          quantity_assigned: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_return_date?: string | null
          assigned_date?: string
          company_id?: string
          condition_at_dispatch?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          condition_at_return?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          created_at?: string | null
          damage_notes?: string | null
          equipment_id?: string
          expected_return_date?: string | null
          id?: string
          order_id?: string
          quantity_assigned?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_assignments_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_bookings: {
        Row: {
          admin_notified: boolean | null
          available_from: string | null
          booked_from: string | null
          booked_until: string | null
          company_id: string | null
          created_at: string | null
          equipment_id: string | null
          id: string
          order_id: string | null
          quantity: number | null
          returned_quantity: number | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          admin_notified?: boolean | null
          available_from?: string | null
          booked_from?: string | null
          booked_until?: string | null
          company_id?: string | null
          created_at?: string | null
          equipment_id?: string | null
          id?: string
          order_id?: string | null
          quantity?: number | null
          returned_quantity?: number | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notified?: boolean | null
          available_from?: string | null
          booked_from?: string | null
          booked_until?: string | null
          company_id?: string | null
          created_at?: string | null
          equipment_id?: string | null
          id?: string
          order_id?: string | null
          quantity?: number | null
          returned_quantity?: number | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      equipment_cleaning_status: {
        Row: {
          admin_notified: boolean | null
          cleaned_quantity: number | null
          company_id: string | null
          created_at: string | null
          id: string
          order_id: string | null
          returned_quantity: number | null
          status: string | null
        }
        Insert: {
          admin_notified?: boolean | null
          cleaned_quantity?: number | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          order_id?: string | null
          returned_quantity?: number | null
          status?: string | null
        }
        Update: {
          admin_notified?: boolean | null
          cleaned_quantity?: number | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          order_id?: string | null
          returned_quantity?: number | null
          status?: string | null
        }
        Relationships: []
      }
      equipment_damages: {
        Row: {
          company_id: string | null
          created_at: string | null
          damage_type: string | null
          handover_id: string | null
          id: string
          notes: string | null
          order_id: string | null
          repair_cost: number | null
          reported_by: string | null
          resolved: boolean | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          damage_type?: string | null
          handover_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          repair_cost?: number | null
          reported_by?: string | null
          resolved?: boolean | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          damage_type?: string | null
          handover_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          repair_cost?: number | null
          reported_by?: string | null
          resolved?: boolean | null
        }
        Relationships: []
      }
      equipment_handovers: {
        Row: {
          created_at: string
          equipment_id: string
          from_stage: string
          handed_over_by: string | null
          handover_time: string
          id: string
          notes: string | null
          order_id: string
          quantity_sent: number | null
          received_by: string | null
          received_by_user_id: string | null
          to_stage: string
        }
        Insert: {
          created_at?: string
          equipment_id: string
          from_stage: string
          handed_over_by?: string | null
          handover_time?: string
          id?: string
          notes?: string | null
          order_id: string
          quantity_sent?: number | null
          received_by?: string | null
          received_by_user_id?: string | null
          to_stage: string
        }
        Update: {
          created_at?: string
          equipment_id?: string
          from_stage?: string
          handed_over_by?: string | null
          handover_time?: string
          id?: string
          notes?: string | null
          order_id?: string
          quantity_sent?: number | null
          received_by?: string | null
          received_by_user_id?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_handovers_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_handovers_handed_over_by_fkey"
            columns: ["handed_over_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_handovers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_handovers_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_handovers_received_by_user_id_fkey"
            columns: ["received_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_inventory: {
        Row: {
          available_quantity: number
          broken_quantity: number | null
          company_id: string
          created_at: string | null
          deleted_at: string | null
          description: string | null
          equipment_name: string
          equipment_type: string | null
          id: string
          image_url: string | null
          in_use_quantity: number | null
          last_maintenance_date: string | null
          next_maintenance_due: string | null
          overall_condition:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          rental_price_per_unit: number | null
          replacement_cost: number | null
          storage_location: string | null
          total_quantity: number
          updated_at: string | null
        }
        Insert: {
          available_quantity: number
          broken_quantity?: number | null
          company_id: string
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          equipment_name: string
          equipment_type?: string | null
          id?: string
          image_url?: string | null
          in_use_quantity?: number | null
          last_maintenance_date?: string | null
          next_maintenance_due?: string | null
          overall_condition?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          rental_price_per_unit?: number | null
          replacement_cost?: number | null
          storage_location?: string | null
          total_quantity: number
          updated_at?: string | null
        }
        Update: {
          available_quantity?: number
          broken_quantity?: number | null
          company_id?: string
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          equipment_name?: string
          equipment_type?: string | null
          id?: string
          image_url?: string | null
          in_use_quantity?: number | null
          last_maintenance_date?: string | null
          next_maintenance_due?: string | null
          overall_condition?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          rental_price_per_unit?: number | null
          replacement_cost?: number | null
          storage_location?: string | null
          total_quantity?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_inventory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_kit_items: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          kit_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          kit_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          kit_id?: string | null
        }
        Relationships: []
      }
      equipment_kits: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      equipment_maintenance: {
        Row: {
          company_id: string | null
          created_at: string | null
          equipment_id: string | null
          id: string
          status: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          equipment_id?: string | null
          id?: string
          status?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          equipment_id?: string | null
          id?: string
          status?: string | null
        }
        Relationships: []
      }
      equipment_shortage_flags: {
        Row: {
          admin_notes: string | null
          client_email: string | null
          client_name: string | null
          company_id: string | null
          created_at: string | null
          equipment_booking_id: string | null
          equipment_id: string | null
          equipment_name: string | null
          expected_quantity: number | null
          financial_impact: number | null
          id: string
          order_id: string | null
          priority: string | null
          recipient_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          returned_quantity: number | null
          shortage_quantity: number | null
          shortage_reason: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          client_email?: string | null
          client_name?: string | null
          company_id?: string | null
          created_at?: string | null
          equipment_booking_id?: string | null
          equipment_id?: string | null
          equipment_name?: string | null
          expected_quantity?: number | null
          financial_impact?: number | null
          id?: string
          order_id?: string | null
          priority?: string | null
          recipient_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          returned_quantity?: number | null
          shortage_quantity?: number | null
          shortage_reason?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          client_email?: string | null
          client_name?: string | null
          company_id?: string | null
          created_at?: string | null
          equipment_booking_id?: string | null
          equipment_id?: string | null
          equipment_name?: string | null
          expected_quantity?: number | null
          financial_impact?: number | null
          id?: string
          order_id?: string | null
          priority?: string | null
          recipient_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          returned_quantity?: number | null
          shortage_quantity?: number | null
          shortage_reason?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_shortage_flags_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_shortage_reports: {
        Row: {
          available_quantity: number
          company_id: string
          created_at: string | null
          equipment_id: string
          id: string
          impact_description: string | null
          order_id: string | null
          reported_by: string | null
          required_quantity: number
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          shortage_quantity: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          available_quantity: number
          company_id: string
          created_at?: string | null
          equipment_id: string
          id?: string
          impact_description?: string | null
          order_id?: string | null
          reported_by?: string | null
          required_quantity: number
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          shortage_quantity: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          available_quantity?: number
          company_id?: string
          created_at?: string | null
          equipment_id?: string
          id?: string
          impact_description?: string | null
          order_id?: string | null
          reported_by?: string | null
          required_quantity?: number
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          shortage_quantity?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_shortage_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_shortage_reports_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_shortage_reports_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_shortage_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_shortage_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_shortages: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          order_id: string | null
          priority: string | null
          replacement_cost: number | null
          status: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          order_id?: string | null
          priority?: string | null
          replacement_cost?: number | null
          status?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          order_id?: string | null
          priority?: string | null
          replacement_cost?: number | null
          status?: string | null
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          created_at: string | null
          date: string | null
          id: string
          usd_to_zar_rate: number | null
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          id?: string
          usd_to_zar_rate?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string | null
          id?: string
          usd_to_zar_rate?: number | null
        }
        Relationships: []
      }
      financial_depreciation: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      financial_predictions: {
        Row: {
          company_id: string
          confidence_score: number
          created_at: string
          id: string
          predicted_cashflow: number
          predicted_expenses: number
          predicted_revenue: number
          prediction_date: string
          recommendations: Json | null
          risk_level: string
        }
        Insert: {
          company_id: string
          confidence_score: number
          created_at?: string
          id?: string
          predicted_cashflow: number
          predicted_expenses: number
          predicted_revenue: number
          prediction_date: string
          recommendations?: Json | null
          risk_level: string
        }
        Update: {
          company_id?: string
          confidence_score?: number
          created_at?: string
          id?: string
          predicted_cashflow?: number
          predicted_expenses?: number
          predicted_revenue?: number
          prediction_date?: string
          recommendations?: Json | null
          risk_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_predictions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_safety_inspections: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      fuel_stockpile: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      gamification_achievements: {
        Row: {
          achievement_description: string | null
          achievement_key: string | null
          achievement_name: string | null
          company_id: string | null
          created_at: string | null
          icon: string | null
          id: string
          unlocked_at: string | null
          user_id: string | null
        }
        Insert: {
          achievement_description?: string | null
          achievement_key?: string | null
          achievement_name?: string | null
          company_id?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          unlocked_at?: string | null
          user_id?: string | null
        }
        Update: {
          achievement_description?: string | null
          achievement_key?: string | null
          achievement_name?: string | null
          company_id?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          unlocked_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      gamification_points: {
        Row: {
          action_description: string | null
          action_type: string | null
          awarded_at: string | null
          company_id: string | null
          created_at: string | null
          id: string
          order_id: string | null
          points: number | null
          user_id: string | null
        }
        Insert: {
          action_description?: string | null
          action_type?: string | null
          awarded_at?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          order_id?: string | null
          points?: number | null
          user_id?: string | null
        }
        Update: {
          action_description?: string | null
          action_type?: string | null
          awarded_at?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          order_id?: string | null
          points?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      glassware_catalog: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          quantity_available: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          quantity_available?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          quantity_available?: number | null
        }
        Relationships: []
      }
      gps_tracking: {
        Row: {
          created_at: string | null
          driver_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          order_id: string | null
          timestamp: string | null
        }
        Insert: {
          created_at?: string | null
          driver_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          order_id?: string | null
          timestamp?: string | null
        }
        Update: {
          created_at?: string | null
          driver_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          order_id?: string | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gps_tracking_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_tracking_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_tracking_logs: {
        Row: {
          accuracy_meters: number | null
          altitude_meters: number | null
          assignment_id: string | null
          driver_id: string
          heading_degrees: number | null
          id: string
          latitude: number
          longitude: number
          recorded_at: string | null
          route_id: string | null
          speed_kmh: number | null
        }
        Insert: {
          accuracy_meters?: number | null
          altitude_meters?: number | null
          assignment_id?: string | null
          driver_id: string
          heading_degrees?: number | null
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string | null
          route_id?: string | null
          speed_kmh?: number | null
        }
        Update: {
          accuracy_meters?: number | null
          altitude_meters?: number | null
          assignment_id?: string | null
          driver_id?: string
          heading_degrees?: number | null
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string | null
          route_id?: string | null
          speed_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gps_tracking_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "driver_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_tracking_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_tracking_logs_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "optimized_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      health_certificates: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          staff_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          staff_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          staff_id?: string | null
        }
        Relationships: []
      }
      ice_tracking: {
        Row: {
          company_id: string | null
          created_at: string | null
          event_id: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
        }
        Relationships: []
      }
      ingredient_substitutions: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      insurance_policies: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          access_token: string | null
          company_id: string | null
          connected_at: string | null
          created_at: string | null
          credentials: Json | null
          id: string
          integration_type: string | null
          is_active: boolean | null
          refresh_token: string | null
          settings: Json | null
          status: string | null
          user_id: string | null
          xero_invoice_id: string | null
        }
        Insert: {
          access_token?: string | null
          company_id?: string | null
          connected_at?: string | null
          created_at?: string | null
          credentials?: Json | null
          id?: string
          integration_type?: string | null
          is_active?: boolean | null
          refresh_token?: string | null
          settings?: Json | null
          status?: string | null
          user_id?: string | null
          xero_invoice_id?: string | null
        }
        Update: {
          access_token?: string | null
          company_id?: string | null
          connected_at?: string | null
          created_at?: string | null
          credentials?: Json | null
          id?: string
          integration_type?: string | null
          is_active?: boolean | null
          refresh_token?: string | null
          settings?: Json | null
          status?: string | null
          user_id?: string | null
          xero_invoice_id?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          active: boolean | null
          allergen_info: Json | null
          base_price: number | null
          category: string | null
          company_id: string | null
          cost_per_unit: number | null
          created_at: string | null
          dietary_tags: string[] | null
          id: string
          image_url: string | null
          is_available: boolean | null
          item_id: string | null
          item_name: string | null
          minimum_stock: number | null
          quantity: number | null
          region_id: string | null
          requires_advance_notice_hours: number | null
          status: string | null
          unit: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          allergen_info?: Json | null
          base_price?: number | null
          category?: string | null
          company_id?: string | null
          cost_per_unit?: number | null
          created_at?: string | null
          dietary_tags?: string[] | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          item_id?: string | null
          item_name?: string | null
          minimum_stock?: number | null
          quantity?: number | null
          region_id?: string | null
          requires_advance_notice_hours?: number | null
          status?: string | null
          unit?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          allergen_info?: Json | null
          base_price?: number | null
          category?: string | null
          company_id?: string | null
          cost_per_unit?: number | null
          created_at?: string | null
          dietary_tags?: string[] | null
          id?: string
          image_url?: string | null
          is_available?: boolean | null
          item_id?: string | null
          item_name?: string | null
          minimum_stock?: number | null
          quantity?: number | null
          region_id?: string | null
          requires_advance_notice_hours?: number | null
          status?: string | null
          unit?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      inventory_batches: {
        Row: {
          batch_number: string
          company_id: string
          created_at: string
          expiry_date: string | null
          id: string
          inventory_item_id: string
          quantity: number
          received_date: string
          status: string
          updated_at: string
        }
        Insert: {
          batch_number: string
          company_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          inventory_item_id: string
          quantity: number
          received_date?: string
          status?: string
          updated_at?: string
        }
        Update: {
          batch_number?: string
          company_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          inventory_item_id?: string
          quantity?: number
          received_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string | null
          company_id: string
          cost_per_unit: number | null
          created_at: string | null
          current_stock: number | null
          deleted_at: string | null
          description: string | null
          id: string
          is_perishable: boolean | null
          item_name: string
          maximum_stock: number | null
          minimum_stock: number | null
          preferred_supplier_id: string | null
          reorder_quantity: number | null
          shelf_life_days: number | null
          sku: string | null
          storage_instructions: string | null
          storage_location: string | null
          unit_of_measure: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          company_id: string
          cost_per_unit?: number | null
          created_at?: string | null
          current_stock?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_perishable?: boolean | null
          item_name: string
          maximum_stock?: number | null
          minimum_stock?: number | null
          preferred_supplier_id?: string | null
          reorder_quantity?: number | null
          shelf_life_days?: number | null
          sku?: string | null
          storage_instructions?: string | null
          storage_location?: string | null
          unit_of_measure: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          company_id?: string
          cost_per_unit?: number | null
          created_at?: string | null
          current_stock?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_perishable?: boolean | null
          item_name?: string
          maximum_stock?: number | null
          minimum_stock?: number | null
          preferred_supplier_id?: string | null
          reorder_quantity?: number | null
          shelf_life_days?: number | null
          sku?: string | null
          storage_instructions?: string | null
          storage_location?: string | null
          unit_of_measure?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_inventory_preferred_supplier"
            columns: ["preferred_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          inventory_item_id: string
          notes: string | null
          order_id: string | null
          performed_by: string | null
          quantity: number
          reference_number: string | null
          supplier_id: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          unit_cost: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          inventory_item_id: string
          notes?: string | null
          order_id?: string | null
          performed_by?: string | null
          quantity: number
          reference_number?: string | null
          supplier_id?: string | null
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          unit_cost?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          inventory_item_id?: string
          notes?: string | null
          order_id?: string | null
          performed_by?: string | null
          quantity?: number
          reference_number?: string | null
          supplier_id?: string | null
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number | null
          balance_due: number
          client_id: string
          company_id: string
          created_at: string | null
          deleted_at: string | null
          due_date: string
          external_id: string | null
          external_invoice_number: string | null
          id: string
          invoice_date: string
          invoice_number: string
          last_synced_at: string | null
          notes: string | null
          order_id: string | null
          paid_at: string | null
          pdf_url: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number
          sync_error: string | null
          synced_to_accounting: boolean | null
          tax_amount: number | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          amount_paid?: number | null
          balance_due: number
          client_id: string
          company_id: string
          created_at?: string | null
          deleted_at?: string | null
          due_date: string
          external_id?: string | null
          external_invoice_number?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          last_synced_at?: string | null
          notes?: string | null
          order_id?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number
          sync_error?: string | null
          synced_to_accounting?: boolean | null
          tax_amount?: number | null
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          amount_paid?: number | null
          balance_due?: number
          client_id?: string
          company_id?: string
          created_at?: string | null
          deleted_at?: string | null
          due_date?: string
          external_id?: string | null
          external_invoice_number?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          last_synced_at?: string | null
          notes?: string | null
          order_id?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number
          sync_error?: string | null
          synced_to_accounting?: boolean | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_duties: {
        Row: {
          clock_in_time: string | null
          clock_out_time: string | null
          company_id: string
          created_at: string | null
          duty_date: string
          id: string
          is_on_duty: boolean | null
          notes: string | null
          shift: Database["public"]["Enums"]["duty_shift"]
          staff_id: string
          updated_at: string | null
        }
        Insert: {
          clock_in_time?: string | null
          clock_out_time?: string | null
          company_id: string
          created_at?: string | null
          duty_date: string
          id?: string
          is_on_duty?: boolean | null
          notes?: string | null
          shift: Database["public"]["Enums"]["duty_shift"]
          staff_id: string
          updated_at?: string | null
        }
        Update: {
          clock_in_time?: string | null
          clock_out_time?: string | null
          company_id?: string
          created_at?: string | null
          duty_date?: string
          id?: string
          is_on_duty?: boolean | null
          notes?: string | null
          shift?: Database["public"]["Enums"]["duty_shift"]
          staff_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_duties_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_duties_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_duty_shifts: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          order_id: string | null
          shift_end: string | null
          shift_start: string | null
          shift_type: string | null
          staff_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          order_id?: string | null
          shift_end?: string | null
          shift_start?: string | null
          shift_type?: string | null
          staff_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          order_id?: string | null
          shift_end?: string | null
          shift_start?: string | null
          shift_type?: string | null
          staff_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_duty_shifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_task_completions: {
        Row: {
          completed_at: string
          completed_by: string
          created_at: string
          id: string
          notes: string | null
          order_id: string
          staff_id: string | null
          task_type: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string
          completed_by: string
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          staff_id?: string | null
          task_type: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string
          completed_by?: string
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          staff_id?: string | null
          task_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_task_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_task_completions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_task_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          budget: number | null
          budget_range: string | null
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          company_id: string
          company_name: string | null
          contact_name: string
          converted_at: string | null
          converted_to_client_id: string | null
          created_at: string | null
          deleted_at: string | null
          email: string
          event_date: string | null
          event_type: string | null
          guest_count: number | null
          id: string
          notes: string | null
          phone: string | null
          source: string | null
          special_requests: string | null
          status: Database["public"]["Enums"]["lead_status"] | null
          tags: string[] | null
          updated_at: string | null
          user_id: string | null
          venue_address: string | null
        }
        Insert: {
          assigned_to?: string | null
          budget?: number | null
          budget_range?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          company_id: string
          company_name?: string | null
          contact_name: string
          converted_at?: string | null
          converted_to_client_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email: string
          event_date?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          venue_address?: string | null
        }
        Update: {
          assigned_to?: string | null
          budget?: number | null
          budget_range?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          company_id?: string
          company_name?: string | null
          contact_name?: string
          converted_at?: string | null
          converted_to_client_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string
          event_date?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          venue_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lighting_tests: {
        Row: {
          company_id: string | null
          compliant: boolean | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          compliant?: boolean | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          compliant?: boolean | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      linen_inventory: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      load_plans: {
        Row: {
          company_id: string | null
          created_at: string | null
          event_id: string | null
          id: string
          verified_by: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          verified_by?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          verified_by?: string | null
        }
        Relationships: []
      }
      loadoff_verifications: {
        Row: {
          company_id: string | null
          created_at: string | null
          event_id: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          active: boolean | null
          allergen_info: string | null
          base_price: number
          base_servings: number | null
          category: string | null
          company_id: string
          cook_time_minutes: number | null
          cost_per_unit: number | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          dietary_tags: string[] | null
          id: string
          image_url: string | null
          instructions: string | null
          is_available: boolean | null
          item_name: string
          prep_time_minutes: number | null
          recipe_name: string | null
          requires_advance_notice_hours: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          allergen_info?: string | null
          base_price: number
          base_servings?: number | null
          category?: string | null
          company_id: string
          cook_time_minutes?: number | null
          cost_per_unit?: number | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          dietary_tags?: string[] | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_available?: boolean | null
          item_name: string
          prep_time_minutes?: number | null
          recipe_name?: string | null
          requires_advance_notice_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          allergen_info?: string | null
          base_price?: number
          base_servings?: number | null
          category?: string | null
          company_id?: string
          cook_time_minutes?: number | null
          cost_per_unit?: number | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          dietary_tags?: string[] | null
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_available?: boolean | null
          item_name?: string
          prep_time_minutes?: number | null
          recipe_name?: string | null
          requires_advance_notice_hours?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          channels: Database["public"]["Enums"]["notification_channel"][] | null
          company_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          notification_type: string | null
          priority: string | null
          read_at: string | null
          recipient_id: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          target_role: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"] | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          channels?:
            | Database["public"]["Enums"]["notification_channel"][]
            | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          notification_type?: string | null
          priority?: string | null
          read_at?: string | null
          recipient_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          target_role?: string | null
          title: string
          type?: Database["public"]["Enums"]["notification_type"] | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          channels?:
            | Database["public"]["Enums"]["notification_channel"][]
            | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          notification_type?: string | null
          priority?: string | null
          read_at?: string | null
          recipient_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          target_role?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_state: {
        Row: {
          checklist: Json
          company_id: string | null
          completed: boolean
          created_at: string
          id: string
          progress: number
          updated_at: string
          user_id: string
        }
        Insert: {
          checklist?: Json
          company_id?: string | null
          completed?: boolean
          created_at?: string
          id?: string
          progress?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          checklist?: Json
          company_id?: string | null
          completed?: boolean
          created_at?: string
          id?: string
          progress?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_state_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      optimized_routes: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string | null
          driver_id: string
          estimated_duration_minutes: number | null
          id: string
          is_active: boolean | null
          optimization_algorithm: string | null
          optimized_at: string | null
          route_date: string
          route_name: string
          started_at: string | null
          total_distance_km: number | null
          total_stops: number | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string | null
          driver_id: string
          estimated_duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          optimization_algorithm?: string | null
          optimized_at?: string | null
          route_date: string
          route_name: string
          started_at?: string | null
          total_distance_km?: number | null
          total_stops?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          driver_id?: string
          estimated_duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          optimization_algorithm?: string | null
          optimized_at?: string | null
          route_date?: string
          route_name?: string
          started_at?: string | null
          total_distance_km?: number | null
          total_stops?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "optimized_routes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optimized_routes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          item_name: string
          line_total: number
          menu_item_id: string | null
          order_id: string
          quantity: number
          special_instructions: string | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          item_name: string
          line_total: number
          menu_item_id?: string | null
          order_id: string
          quantity: number
          special_instructions?: string | null
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          item_name?: string
          line_total?: number
          menu_item_id?: string | null
          order_id?: string
          quantity?: number
          special_instructions?: string | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_reviews: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          order_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          order_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          order_id?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_paid: number | null
          assigned_chef_id: string | null
          assigned_driver_id: string | null
          balance_amount: number | null
          balance_due_date: string | null
          balance_paid: boolean | null
          balance_paid_at: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          client_email: string | null
          client_id: string
          client_name: string | null
          client_phone: string | null
          collection_time: string | null
          company_id: string
          completed_at: string | null
          confirmed_at: string | null
          created_at: string | null
          currency: string | null
          deleted_at: string | null
          delivered_at: string | null
          delivery_distance_km: number | null
          delivery_duration_minutes: number | null
          delivery_fee: number | null
          delivery_rate_per_km: number | null
          delivery_route_optimized: boolean | null
          delivery_status: string | null
          delivery_time: string | null
          delivery_total_fee: number | null
          deposit_amount: number | null
          deposit_paid: boolean | null
          deposit_paid_at: string | null
          deposit_percentage: number | null
          dietary_requirements: string | null
          discount_amount: number | null
          driver_id: string | null
          equipment_return_method: string | null
          event_date: string
          event_name: string
          event_time: string | null
          final_order_change_date: string | null
          guest_count: number
          id: string
          internal_notes: string | null
          kitchen_instructions: string | null
          order_number: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          picked_up_at: string | null
          pickup_time: string | null
          prep_started_at: string | null
          quote_id: string | null
          ready_at: string | null
          requires_waiter: boolean | null
          special_instructions: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          subscription_id: string | null
          subtotal: number
          tax: number | null
          tax_amount: number | null
          total: number | null
          total_amount: number
          updated_at: string | null
          user_id: string | null
          venue_address: string
          venue_contact_person: string | null
          venue_contact_phone: string | null
          venue_lat: number | null
          venue_lng: number | null
          venue_name: string | null
          waiter_duration_hours: number | null
          waiter_hourly_rate: number | null
          waiter_service_required: boolean | null
          waiter_total_fee: number | null
          whatsapp_notifications_sent: string[] | null
          xero_invoice_id: string | null
          xero_synced_at: string | null
        }
        Insert: {
          amount_paid?: number | null
          assigned_chef_id?: string | null
          assigned_driver_id?: string | null
          balance_amount?: number | null
          balance_due_date?: string | null
          balance_paid?: boolean | null
          balance_paid_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_email?: string | null
          client_id: string
          client_name?: string | null
          client_phone?: string | null
          collection_time?: string | null
          company_id: string
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          currency?: string | null
          deleted_at?: string | null
          delivered_at?: string | null
          delivery_distance_km?: number | null
          delivery_duration_minutes?: number | null
          delivery_fee?: number | null
          delivery_rate_per_km?: number | null
          delivery_route_optimized?: boolean | null
          delivery_status?: string | null
          delivery_time?: string | null
          delivery_total_fee?: number | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_percentage?: number | null
          dietary_requirements?: string | null
          discount_amount?: number | null
          driver_id?: string | null
          equipment_return_method?: string | null
          event_date: string
          event_name: string
          event_time?: string | null
          final_order_change_date?: string | null
          guest_count: number
          id?: string
          internal_notes?: string | null
          kitchen_instructions?: string | null
          order_number: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          picked_up_at?: string | null
          pickup_time?: string | null
          prep_started_at?: string | null
          quote_id?: string | null
          ready_at?: string | null
          requires_waiter?: boolean | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subscription_id?: string | null
          subtotal: number
          tax?: number | null
          tax_amount?: number | null
          total?: number | null
          total_amount: number
          updated_at?: string | null
          user_id?: string | null
          venue_address: string
          venue_contact_person?: string | null
          venue_contact_phone?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
          waiter_duration_hours?: number | null
          waiter_hourly_rate?: number | null
          waiter_service_required?: boolean | null
          waiter_total_fee?: number | null
          whatsapp_notifications_sent?: string[] | null
          xero_invoice_id?: string | null
          xero_synced_at?: string | null
        }
        Update: {
          amount_paid?: number | null
          assigned_chef_id?: string | null
          assigned_driver_id?: string | null
          balance_amount?: number | null
          balance_due_date?: string | null
          balance_paid?: boolean | null
          balance_paid_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_email?: string | null
          client_id?: string
          client_name?: string | null
          client_phone?: string | null
          collection_time?: string | null
          company_id?: string
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          currency?: string | null
          deleted_at?: string | null
          delivered_at?: string | null
          delivery_distance_km?: number | null
          delivery_duration_minutes?: number | null
          delivery_fee?: number | null
          delivery_rate_per_km?: number | null
          delivery_route_optimized?: boolean | null
          delivery_status?: string | null
          delivery_time?: string | null
          delivery_total_fee?: number | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_percentage?: number | null
          dietary_requirements?: string | null
          discount_amount?: number | null
          driver_id?: string | null
          equipment_return_method?: string | null
          event_date?: string
          event_name?: string
          event_time?: string | null
          final_order_change_date?: string | null
          guest_count?: number
          id?: string
          internal_notes?: string | null
          kitchen_instructions?: string | null
          order_number?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          picked_up_at?: string | null
          pickup_time?: string | null
          prep_started_at?: string | null
          quote_id?: string | null
          ready_at?: string | null
          requires_waiter?: boolean | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subscription_id?: string | null
          subtotal?: number
          tax?: number | null
          tax_amount?: number | null
          total?: number | null
          total_amount?: number
          updated_at?: string | null
          user_id?: string | null
          venue_address?: string
          venue_contact_person?: string | null
          venue_contact_phone?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
          waiter_duration_hours?: number | null
          waiter_hourly_rate?: number | null
          waiter_service_required?: boolean | null
          waiter_total_fee?: number | null
          whatsapp_notifications_sent?: string[] | null
          xero_invoice_id?: string | null
          xero_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_chef_id_fkey"
            columns: ["assigned_chef_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pat_testing: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      payment_gateways: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_reminders: {
        Row: {
          created_at: string | null
          days_before_due: number | null
          id: string
          is_urgent: boolean | null
          order_id: string | null
          reminder_date: string | null
          reminder_type: string | null
          sent: boolean | null
          sent_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          days_before_due?: number | null
          id?: string
          is_urgent?: boolean | null
          order_id?: string | null
          reminder_date?: string | null
          reminder_type?: string | null
          sent?: boolean | null
          sent_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          days_before_due?: number | null
          id?: string
          is_urgent?: boolean | null
          order_id?: string | null
          reminder_date?: string | null
          reminder_type?: string | null
          sent?: boolean | null
          sent_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_schedules: {
        Row: {
          balance_amount: number | null
          balance_due_date: string | null
          balance_paid: boolean | null
          balance_paid_at: string | null
          balance_transaction_id: string | null
          created_at: string | null
          currency: string | null
          deposit_amount: number | null
          deposit_paid: boolean | null
          deposit_paid_at: string | null
          deposit_percentage: number | null
          deposit_transaction_id: string | null
          event_date: string | null
          final_order_change_date: string | null
          id: string
          order_id: string | null
          total_amount: number | null
          user_id: string | null
        }
        Insert: {
          balance_amount?: number | null
          balance_due_date?: string | null
          balance_paid?: boolean | null
          balance_paid_at?: string | null
          balance_transaction_id?: string | null
          created_at?: string | null
          currency?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_percentage?: number | null
          deposit_transaction_id?: string | null
          event_date?: string | null
          final_order_change_date?: string | null
          id?: string
          order_id?: string | null
          total_amount?: number | null
          user_id?: string | null
        }
        Update: {
          balance_amount?: number | null
          balance_due_date?: string | null
          balance_paid?: boolean | null
          balance_paid_at?: string | null
          balance_transaction_id?: string | null
          created_at?: string | null
          currency?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_percentage?: number | null
          deposit_transaction_id?: string | null
          event_date?: string | null
          final_order_change_date?: string | null
          id?: string
          order_id?: string | null
          total_amount?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number | null
          client_id: string | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          failed_at: string | null
          gateway: string | null
          gateway_provider: string | null
          gateway_response: Json | null
          gateway_transaction_id: string | null
          id: string
          notes: string | null
          order_id: string | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          payment_type: string | null
          processed_at: string | null
          refunded_at: string | null
          status: string | null
          transaction_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          failed_at?: string | null
          gateway?: string | null
          gateway_provider?: string | null
          gateway_response?: Json | null
          gateway_transaction_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          payment_type?: string | null
          processed_at?: string | null
          refunded_at?: string | null
          status?: string | null
          transaction_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          failed_at?: string | null
          gateway?: string | null
          gateway_provider?: string | null
          gateway_response?: Json | null
          gateway_transaction_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          payment_type?: string | null
          processed_at?: string | null
          refunded_at?: string | null
          status?: string | null
          transaction_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pest_control_logs: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      prep_list_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          id: string
          is_completed: boolean | null
          menu_item_id: string | null
          notes: string | null
          prep_list_id: string
          quantity: number
          task_description: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          menu_item_id?: string | null
          notes?: string | null
          prep_list_id: string
          quantity: number
          task_description: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          menu_item_id?: string | null
          notes?: string | null
          prep_list_id?: string
          quantity?: number
          task_description?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prep_list_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_list_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_list_items_prep_list_id_fkey"
            columns: ["prep_list_id"]
            isOneToOne: false
            referencedRelation: "prep_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      prep_lists: {
        Row: {
          assigned_to: string | null
          company_id: string
          completed_at: string | null
          created_at: string | null
          id: string
          notes: string | null
          order_id: string
          prep_date: string
          started_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          prep_date: string
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          prep_date?: string
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prep_lists_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_lists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prep_lists_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_role: string | null
          avatar_url: string | null
          company_id: string | null
          company_name: string | null
          company_slug: string | null
          created_at: string | null
          currency: string | null
          date_hired: string | null
          date_of_birth: string | null
          deleted_at: string | null
          drive_time_to_kitchen_minutes: number | null
          drivers_license_expiry: string | null
          drivers_license_number: string | null
          email: string
          email_verified: boolean | null
          employee_number: string | null
          full_name: string
          hourly_rate: number | null
          id: string
          id_number: string | null
          is_active: boolean | null
          notification_preferences: Json | null
          phone: string | null
          phone_number: string | null
          phone_verified: boolean | null
          region: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
          vehicle_registration: string | null
        }
        Insert: {
          active_role?: string | null
          avatar_url?: string | null
          company_id?: string | null
          company_name?: string | null
          company_slug?: string | null
          created_at?: string | null
          currency?: string | null
          date_hired?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          drive_time_to_kitchen_minutes?: number | null
          drivers_license_expiry?: string | null
          drivers_license_number?: string | null
          email: string
          email_verified?: boolean | null
          employee_number?: string | null
          full_name: string
          hourly_rate?: number | null
          id: string
          id_number?: string | null
          is_active?: boolean | null
          notification_preferences?: Json | null
          phone?: string | null
          phone_number?: string | null
          phone_verified?: boolean | null
          region?: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          vehicle_registration?: string | null
        }
        Update: {
          active_role?: string | null
          avatar_url?: string | null
          company_id?: string | null
          company_name?: string | null
          company_slug?: string | null
          created_at?: string | null
          currency?: string | null
          date_hired?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          drive_time_to_kitchen_minutes?: number | null
          drivers_license_expiry?: string | null
          drivers_license_number?: string | null
          email?: string
          email_verified?: boolean | null
          employee_number?: string | null
          full_name?: string
          hourly_rate?: number | null
          id?: string
          id_number?: string | null
          is_active?: boolean | null
          notification_preferences?: Json | null
          phone?: string | null
          phone_number?: string | null
          phone_verified?: boolean | null
          region?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          vehicle_registration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_history: {
        Row: {
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          item_name: string
          line_total: number
          menu_item_id: string | null
          quantity: number
          quote_id: string
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          item_name: string
          line_total: number
          menu_item_id?: string | null
          quantity: number
          quote_id: string
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          item_name?: string
          line_total?: number
          menu_item_id?: string | null
          quantity?: number
          quote_id?: string
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          client_email: string | null
          client_id: string | null
          client_name: string | null
          company_id: string
          converted_to_order_id: string | null
          created_at: string | null
          deleted_at: string | null
          discount_amount: number | null
          equipment_items: Json | null
          event_date: string | null
          guest_count: number | null
          id: string
          lead_id: string | null
          menu_items: Json | null
          notes: string | null
          prepared_by: string | null
          quote_name: string
          quote_number: string
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"] | null
          subtotal: number
          tax: number | null
          tax_amount: number | null
          terms_and_conditions: string | null
          total: number | null
          total_amount: number
          updated_at: string | null
          user_id: string | null
          valid_until: string | null
          venue_address: string | null
          venue_lat: number | null
          venue_lng: number | null
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string | null
          company_id: string
          converted_to_order_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          equipment_items?: Json | null
          event_date?: string | null
          guest_count?: number | null
          id?: string
          lead_id?: string | null
          menu_items?: Json | null
          notes?: string | null
          prepared_by?: string | null
          quote_name: string
          quote_number: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"] | null
          subtotal: number
          tax?: number | null
          tax_amount?: number | null
          terms_and_conditions?: string | null
          total?: number | null
          total_amount: number
          updated_at?: string | null
          user_id?: string | null
          valid_until?: string | null
          venue_address?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string | null
          company_id?: string
          converted_to_order_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          discount_amount?: number | null
          equipment_items?: Json | null
          event_date?: string | null
          guest_count?: number | null
          id?: string
          lead_id?: string | null
          menu_items?: Json | null
          notes?: string | null
          prepared_by?: string | null
          quote_name?: string
          quote_number?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"] | null
          subtotal?: number
          tax?: number | null
          tax_amount?: number | null
          terms_and_conditions?: string | null
          total?: number | null
          total_amount?: number
          updated_at?: string | null
          user_id?: string | null
          valid_until?: string | null
          venue_address?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_allergens: {
        Row: {
          allergen_id: string | null
          created_at: string | null
          id: string
          recipe_id: string | null
        }
        Insert: {
          allergen_id?: string | null
          created_at?: string | null
          id?: string
          recipe_id?: string | null
        }
        Update: {
          allergen_id?: string | null
          created_at?: string | null
          id?: string
          recipe_id?: string | null
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          created_at: string | null
          id: string
          ingredient_name: string
          inventory_item_id: string | null
          notes: string | null
          quantity: number
          recipe_id: string
          unit: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ingredient_name: string
          inventory_item_id?: string | null
          notes?: string | null
          quantity: number
          recipe_id: string
          unit: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ingredient_name?: string
          inventory_item_id?: string | null
          notes?: string | null
          quantity?: number
          recipe_id?: string
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_scaling_history: {
        Row: {
          adjusted_by_user_id: string | null
          created_at: string
          id: string
          ingredient_adjustments: Json | null
          new_guest_count: number
          order_id: string
          original_guest_count: number
          scaling_factor: number
        }
        Insert: {
          adjusted_by_user_id?: string | null
          created_at?: string
          id?: string
          ingredient_adjustments?: Json | null
          new_guest_count: number
          order_id: string
          original_guest_count: number
          scaling_factor: number
        }
        Update: {
          adjusted_by_user_id?: string | null
          created_at?: string
          id?: string
          ingredient_adjustments?: Json | null
          new_guest_count?: number
          order_id?: string
          original_guest_count?: number
          scaling_factor?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_scaling_history_adjusted_by_user_id_fkey"
            columns: ["adjusted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_scaling_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          base_servings: number
          company_id: string
          cook_time_minutes: number | null
          created_at: string | null
          id: string
          instructions: string | null
          menu_item_id: string
          prep_time_minutes: number | null
          recipe_name: string
          updated_at: string | null
        }
        Insert: {
          base_servings: number
          company_id: string
          cook_time_minutes?: number | null
          created_at?: string | null
          id?: string
          instructions?: string | null
          menu_item_id: string
          prep_time_minutes?: number | null
          recipe_name: string
          updated_at?: string | null
        }
        Update: {
          base_servings?: number
          company_id?: string
          cook_time_minutes?: number | null
          created_at?: string | null
          id?: string
          instructions?: string | null
          menu_item_id?: string
          prep_time_minutes?: number | null
          recipe_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          name: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      return_load_tracking: {
        Row: {
          company_id: string | null
          created_at: string | null
          event_id: string | null
          id: string
          scan_verification_complete: boolean | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          scan_verification_complete?: boolean | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          scan_verification_complete?: boolean | null
        }
        Relationships: []
      }
      safety_checks: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          status: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
        }
        Relationships: []
      }
      safety_equipment: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      shopping_list_items: {
        Row: {
          actual_cost: number | null
          category: string | null
          created_at: string | null
          estimated_cost: number | null
          id: string
          item_id: string | null
          name: string | null
          notes: string | null
          purchased: boolean | null
          quantity: number | null
          shopping_list_id: string | null
          unit: string | null
          user_id: string | null
        }
        Insert: {
          actual_cost?: number | null
          category?: string | null
          created_at?: string | null
          estimated_cost?: number | null
          id?: string
          item_id?: string | null
          name?: string | null
          notes?: string | null
          purchased?: boolean | null
          quantity?: number | null
          shopping_list_id?: string | null
          unit?: string | null
          user_id?: string | null
        }
        Update: {
          actual_cost?: number | null
          category?: string | null
          created_at?: string | null
          estimated_cost?: number | null
          id?: string
          item_id?: string | null
          name?: string | null
          notes?: string | null
          purchased?: boolean | null
          quantity?: number | null
          shopping_list_id?: string | null
          unit?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      shopping_lists: {
        Row: {
          actual_total: number | null
          company_id: string | null
          created_at: string | null
          estimated_total: number | null
          id: string
          list_date: string | null
          notes: string | null
          receipt_url: string | null
          shopper_id: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          actual_total?: number | null
          company_id?: string | null
          created_at?: string | null
          estimated_total?: number | null
          id?: string
          list_date?: string | null
          notes?: string | null
          receipt_url?: string | null
          shopper_id?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          actual_total?: number | null
          company_id?: string | null
          created_at?: string | null
          estimated_total?: number | null
          id?: string
          list_date?: string | null
          notes?: string | null
          receipt_url?: string | null
          shopper_id?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_shopper_id_fkey"
            columns: ["shopper_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      staff_invitations: {
        Row: {
          company_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          invitation_token: string | null
          invited_by: string | null
          role: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invitation_token?: string | null
          invited_by?: string | null
          role?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invitation_token?: string | null
          invited_by?: string | null
          role?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      staff_payment_ledger: {
        Row: {
          clock_in: string | null
          clock_in_time: string | null
          clock_out: string | null
          company_id: string | null
          created_at: string | null
          hourly_rate: number | null
          id: string
          payment_status: string | null
          session_date: string | null
          staff_id: string | null
          total_earnings: number | null
          total_hours: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          clock_in?: string | null
          clock_in_time?: string | null
          clock_out?: string | null
          company_id?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string
          payment_status?: string | null
          session_date?: string | null
          staff_id?: string | null
          total_earnings?: number | null
          total_hours?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          clock_in?: string | null
          clock_in_time?: string | null
          clock_out?: string | null
          company_id?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string
          payment_status?: string | null
          session_date?: string | null
          staff_id?: string | null
          total_earnings?: number | null
          total_hours?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_payment_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_work_sessions: {
        Row: {
          clock_in: string
          clock_out: string | null
          company_id: string
          created_at: string
          id: string
          payment_status: string | null
          session_date: string
          staff_id: string
          total_earnings: number | null
          total_hours: number | null
          updated_at: string
        }
        Insert: {
          clock_in: string
          clock_out?: string | null
          company_id: string
          created_at?: string
          id?: string
          payment_status?: string | null
          session_date: string
          staff_id: string
          total_earnings?: number | null
          total_hours?: number | null
          updated_at?: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          company_id?: string
          created_at?: string
          id?: string
          payment_status?: string | null
          session_date?: string
          staff_id?: string
          total_earnings?: number | null
          total_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_work_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_work_sessions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_locations: {
        Row: {
          active: boolean | null
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          active?: boolean | null
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          active?: boolean | null
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      storage_racks: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          active_clients_count: number | null
          amount: number
          billing_cycle: string
          cancel_at_period_end: boolean | null
          cancellation_feedback: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          company_id: string
          created_at: string
          currency: string
          current_period_end: string
          current_period_start: string
          dashboard_seen: boolean | null
          id: string
          new_amount: number | null
          next_billing_date: string | null
          orders_this_quarter: number | null
          pending_price_change: boolean | null
          plan_id: string | null
          plan_name: string
          price_change_effective_date: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_clients_count?: number | null
          amount: number
          billing_cycle?: string
          cancel_at_period_end?: boolean | null
          cancellation_feedback?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          company_id: string
          created_at?: string
          currency?: string
          current_period_end: string
          current_period_start?: string
          dashboard_seen?: boolean | null
          id?: string
          new_amount?: number | null
          next_billing_date?: string | null
          orders_this_quarter?: number | null
          pending_price_change?: boolean | null
          plan_id?: string | null
          plan_name: string
          price_change_effective_date?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_clients_count?: number | null
          amount?: number
          billing_cycle?: string
          cancel_at_period_end?: boolean | null
          cancellation_feedback?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          current_period_end?: string
          current_period_start?: string
          dashboard_seen?: boolean | null
          id?: string
          new_amount?: number | null
          next_billing_date?: string | null
          orders_this_quarter?: number | null
          pending_price_change?: boolean | null
          plan_id?: string | null
          plan_name?: string
          price_change_effective_date?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_prices: {
        Row: {
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          account_number: string | null
          active: boolean | null
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_id: string
          contact_person: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          emergency_contact: string | null
          id: string
          is_active: boolean | null
          notes: string | null
          payment_terms: number | null
          phone: string | null
          postal_code: string | null
          rating: number | null
          supplier_name: string
          updated_at: string | null
        }
        Insert: {
          account_number?: string | null
          active?: boolean | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_id: string
          contact_person?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          emergency_contact?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          payment_terms?: number | null
          phone?: string | null
          postal_code?: string | null
          rating?: number | null
          supplier_name: string
          updated_at?: string | null
        }
        Update: {
          account_number?: string | null
          active?: boolean | null
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_id?: string
          contact_person?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          emergency_contact?: string | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          payment_terms?: number | null
          phone?: string | null
          postal_code?: string | null
          rating?: number | null
          supplier_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          created_at: string | null
          id: string
          is_from_staff: boolean | null
          is_internal: boolean | null
          message: string | null
          ticket_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_from_staff?: boolean | null
          is_internal?: boolean | null
          message?: string | null
          ticket_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_from_staff?: boolean | null
          is_internal?: boolean | null
          message?: string | null
          ticket_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          company_id: string | null
          created_at: string
          description: string
          id: string
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          ticket_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          description: string
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          ticket_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          description?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          ticket_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      temperature_logs: {
        Row: {
          alert_triggered: boolean | null
          company_id: string | null
          created_at: string | null
          id: string
          storage_location_id: string | null
        }
        Insert: {
          alert_triggered?: boolean | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          storage_location_id?: string | null
        }
        Update: {
          alert_triggered?: boolean | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          storage_location_id?: string | null
        }
        Relationships: []
      }
      time_clock_entries: {
        Row: {
          clock_in: string | null
          clock_in_time: string | null
          clock_out: string | null
          company_id: string | null
          created_at: string | null
          hourly_rate: number | null
          id: string
          session_date: string | null
          staff_id: string | null
          total_earnings: number | null
          total_hours: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          clock_in?: string | null
          clock_in_time?: string | null
          clock_out?: string | null
          company_id?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string
          session_date?: string | null
          staff_id?: string | null
          total_earnings?: number | null
          total_hours?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          clock_in?: string | null
          clock_in_time?: string | null
          clock_out?: string | null
          company_id?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string
          session_date?: string | null
          staff_id?: string | null
          total_earnings?: number | null
          total_hours?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      training_materials: {
        Row: {
          active: boolean | null
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          active?: boolean | null
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          active?: boolean | null
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      trial_expiry_notifications: {
        Row: {
          company_id: string
          created_at: string
          id: string
          notification_type: string
          sent_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          notification_type: string
          sent_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          notification_type?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_expiry_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_departments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          created_at: string | null
          department: string | null
          id: string
          is_primary: boolean | null
          user_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          department?: string | null
          id?: string
          is_primary?: boolean | null
          user_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          department?: string | null
          id?: string
          is_primary?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      utensil_tracking: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          qr_code: string | null
          status: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          qr_code?: string | null
          status?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          qr_code?: string | null
          status?: string | null
        }
        Relationships: []
      }
      vehicle_logs: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          vehicle_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          vehicle_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          vehicle_id?: string | null
        }
        Relationships: []
      }
      vehicle_maintenance: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          vehicle_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          vehicle_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          vehicle_id?: string | null
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      waste_logs: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          company_id: string
          created_at: string | null
          delivered_at: string | null
          failed_at: string | null
          failure_reason: string | null
          gateway_message_id: string | null
          gateway_response: Json | null
          id: string
          message_content: string
          read_at: string | null
          recipient_name: string | null
          recipient_phone: string
          related_entity_id: string | null
          related_entity_type: string | null
          sent_at: string | null
          status: string | null
          template_name: string | null
          template_params: Json | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          delivered_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          gateway_message_id?: string | null
          gateway_response?: Json | null
          id?: string
          message_content: string
          read_at?: string | null
          recipient_name?: string | null
          recipient_phone: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          sent_at?: string | null
          status?: string | null
          template_name?: string | null
          template_params?: Json | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          delivered_at?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          gateway_message_id?: string | null
          gateway_response?: Json | null
          id?: string
          message_content?: string
          read_at?: string | null
          recipient_name?: string | null
          recipient_phone?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          sent_at?: string | null
          status?: string | null
          template_name?: string | null
          template_params?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          company_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_enabled: boolean | null
          template_content: string | null
          template_key: string | null
          template_name: string | null
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          template_content?: string | null
          template_key?: string | null
          template_name?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          template_content?: string | null
          template_key?: string | null
          template_name?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_price_change: { Args: never; Returns: undefined }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      archive_old_gps_logs: { Args: never; Returns: number }
      check_trial_expiry_notifications: { Args: never; Returns: undefined }
      decrement_equipment_quantity: { Args: never; Returns: undefined }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_all_subscriptions_admin: { Args: never; Returns: Json }
      get_user_company_id: { Args: { user_id: string }; Returns: string }
      gettransactionid: { Args: never; Returns: unknown }
      is_company_admin: { Args: { user_id: string }; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      update_overdue_invoices: { Args: never; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      user_has_role: {
        Args: {
          required_role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      assignment_status:
        | "assigned"
        | "accepted"
        | "en_route"
        | "picked_up"
        | "at_venue"
        | "delivered"
        | "completed"
      cleaning_status: "scheduled" | "in_progress" | "completed" | "skipped"
      duty_shift: "morning" | "afternoon" | "evening" | "overnight"
      equipment_condition:
        | "excellent"
        | "good"
        | "fair"
        | "poor"
        | "broken"
        | "under_repair"
      invoice_status:
        | "draft"
        | "sent"
        | "paid"
        | "partially_paid"
        | "overdue"
        | "written_off"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "quoted"
        | "negotiating"
        | "won"
        | "lost"
        | "manual_add"
      notification_channel: "email" | "sms" | "whatsapp" | "push" | "in_app"
      notification_type:
        | "order_confirmed"
        | "order_ready"
        | "driver_assigned"
        | "out_for_delivery"
        | "delivered"
        | "payment_received"
        | "payment_reminder"
        | "driver_replacement_needed"
        | "equipment_shortage"
        | "stock_low"
        | "quote_expiring"
        | "trial_expiring"
        | "subscription_renewed"
      order_status:
        | "pending"
        | "confirmed"
        | "prep"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "completed"
        | "cancelled"
        | "preparing"
        | "in_transit"
      payment_method: "cash" | "eft" | "card" | "credit_account"
      payment_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "refunded"
        | "disputed"
        | "partial"
        | "paid"
      quote_status:
        | "draft"
        | "sent"
        | "viewed"
        | "accepted"
        | "rejected"
        | "expired"
        | "revised"
        | "pending"
      subscription_status:
        | "trial"
        | "active"
        | "past_due"
        | "cancelled"
        | "suspended"
        | "trialing"
      transaction_type:
        | "purchase"
        | "usage"
        | "waste"
        | "adjustment"
        | "transfer"
        | "return"
      user_role:
        | "super_admin"
        | "company_admin"
        | "kitchen_staff"
        | "driver"
        | "shopping_staff"
        | "cleaning_staff"
        | "client"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      assignment_status: [
        "assigned",
        "accepted",
        "en_route",
        "picked_up",
        "at_venue",
        "delivered",
        "completed",
      ],
      cleaning_status: ["scheduled", "in_progress", "completed", "skipped"],
      duty_shift: ["morning", "afternoon", "evening", "overnight"],
      equipment_condition: [
        "excellent",
        "good",
        "fair",
        "poor",
        "broken",
        "under_repair",
      ],
      invoice_status: [
        "draft",
        "sent",
        "paid",
        "partially_paid",
        "overdue",
        "written_off",
      ],
      lead_status: [
        "new",
        "contacted",
        "qualified",
        "quoted",
        "negotiating",
        "won",
        "lost",
        "manual_add",
      ],
      notification_channel: ["email", "sms", "whatsapp", "push", "in_app"],
      notification_type: [
        "order_confirmed",
        "order_ready",
        "driver_assigned",
        "out_for_delivery",
        "delivered",
        "payment_received",
        "payment_reminder",
        "driver_replacement_needed",
        "equipment_shortage",
        "stock_low",
        "quote_expiring",
        "trial_expiring",
        "subscription_renewed",
      ],
      order_status: [
        "pending",
        "confirmed",
        "prep",
        "ready",
        "out_for_delivery",
        "delivered",
        "completed",
        "cancelled",
        "preparing",
        "in_transit",
      ],
      payment_method: ["cash", "eft", "card", "credit_account"],
      payment_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "refunded",
        "disputed",
        "partial",
        "paid",
      ],
      quote_status: [
        "draft",
        "sent",
        "viewed",
        "accepted",
        "rejected",
        "expired",
        "revised",
        "pending",
      ],
      subscription_status: [
        "trial",
        "active",
        "past_due",
        "cancelled",
        "suspended",
        "trialing",
      ],
      transaction_type: [
        "purchase",
        "usage",
        "waste",
        "adjustment",
        "transfer",
        "return",
      ],
      user_role: [
        "super_admin",
        "company_admin",
        "kitchen_staff",
        "driver",
        "shopping_staff",
        "cleaning_staff",
        "client",
      ],
    },
  },
} as const
