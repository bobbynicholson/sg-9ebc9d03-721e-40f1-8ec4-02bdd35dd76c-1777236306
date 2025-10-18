 
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
          data_export_url: string | null
          deleted_at: string | null
          id: string
          reason: string | null
          scheduled_deletion_date: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data_export_requested?: boolean | null
          data_export_url?: string | null
          deleted_at?: string | null
          id?: string
          reason?: string | null
          scheduled_deletion_date?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data_export_requested?: boolean | null
          data_export_url?: string | null
          deleted_at?: string | null
          id?: string
          reason?: string | null
          scheduled_deletion_date?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string | null
          description: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string | null
          description: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string | null
          description?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string
          priority: string | null
          read: boolean | null
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          priority?: string | null
          read?: boolean | null
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          priority?: string | null
          read?: boolean | null
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      after_sales_emails: {
        Row: {
          body: string
          created_at: string | null
          email_number: number
          error_message: string | null
          id: string
          order_id: string
          scheduled_for: string
          sent_at: string | null
          status: string | null
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          email_number: number
          error_message?: string | null
          id?: string
          order_id: string
          scheduled_for: string
          sent_at?: string | null
          status?: string | null
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          email_number?: number
          error_message?: string | null
          id?: string
          order_id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string | null
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "after_sales_emails_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      allergens: {
        Row: {
          created_at: string | null
          icon_name: string | null
          id: string
          name: string
          severity: string | null
        }
        Insert: {
          created_at?: string | null
          icon_name?: string | null
          id?: string
          name: string
          severity?: string | null
        }
        Update: {
          created_at?: string | null
          icon_name?: string | null
          id?: string
          name?: string
          severity?: string | null
        }
        Relationships: []
      }
      automation_rules: {
        Row: {
          body: string
          created_at: string | null
          delay_days: number
          enabled: boolean
          id: string
          name: string
          rule_id: string
          subject: string
          trigger: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          delay_days?: number
          enabled?: boolean
          id?: string
          name: string
          rule_id: string
          subject: string
          trigger: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          delay_days?: number
          enabled?: boolean
          id?: string
          name?: string
          rule_id?: string
          subject?: string
          trigger?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      backup_generators: {
        Row: {
          auto_start_enabled: boolean | null
          capacity_kw: number | null
          company_id: string
          created_at: string | null
          fuel_type: string | null
          id: string
          last_service_date: string | null
          location: string | null
          model: string | null
          name: string
          next_service_date: string | null
          status: string | null
        }
        Insert: {
          auto_start_enabled?: boolean | null
          capacity_kw?: number | null
          company_id: string
          created_at?: string | null
          fuel_type?: string | null
          id?: string
          last_service_date?: string | null
          location?: string | null
          model?: string | null
          name: string
          next_service_date?: string | null
          status?: string | null
        }
        Update: {
          auto_start_enabled?: boolean | null
          capacity_kw?: number | null
          company_id?: string
          created_at?: string | null
          fuel_type?: string | null
          id?: string
          last_service_date?: string | null
          location?: string | null
          model?: string | null
          name?: string
          next_service_date?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_generators_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_cooking_logs: {
        Row: {
          batch_number: string
          batch_size: number
          company_id: string
          cook_end_time: string | null
          cook_start_time: string | null
          cooling_end_time: string | null
          cooling_start_time: string | null
          created_at: string | null
          final_storage_location: string | null
          holding_temp_celsius: number | null
          id: string
          notes: string | null
          prepared_by: string | null
          recipe_id: string | null
          status: string | null
          use_by_time: string | null
        }
        Insert: {
          batch_number: string
          batch_size: number
          company_id: string
          cook_end_time?: string | null
          cook_start_time?: string | null
          cooling_end_time?: string | null
          cooling_start_time?: string | null
          created_at?: string | null
          final_storage_location?: string | null
          holding_temp_celsius?: number | null
          id?: string
          notes?: string | null
          prepared_by?: string | null
          recipe_id?: string | null
          status?: string | null
          use_by_time?: string | null
        }
        Update: {
          batch_number?: string
          batch_size?: number
          company_id?: string
          cook_end_time?: string | null
          cook_start_time?: string | null
          cooling_end_time?: string | null
          cooling_start_time?: string | null
          created_at?: string | null
          final_storage_location?: string | null
          holding_temp_celsius?: number | null
          id?: string
          notes?: string | null
          prepared_by?: string | null
          recipe_id?: string | null
          status?: string | null
          use_by_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_cooking_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_cooking_logs_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_cooking_logs_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_history: {
        Row: {
          amount: number
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string | null
          currency: string
          failed_reason: string | null
          id: string
          invoice_number: string | null
          invoice_pdf_url: string | null
          paid_at: string | null
          payfast_payment_id: string | null
          payment_method: string | null
          status: string
          subscription_id: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          currency?: string
          failed_reason?: string | null
          id?: string
          invoice_number?: string | null
          invoice_pdf_url?: string | null
          paid_at?: string | null
          payfast_payment_id?: string | null
          payment_method?: string | null
          status: string
          subscription_id: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string | null
          currency?: string
          failed_reason?: string | null
          id?: string
          invoice_number?: string | null
          invoice_pdf_url?: string | null
          paid_at?: string | null
          payfast_payment_id?: string | null
          payment_method?: string | null
          status?: string
          subscription_id?: string
          transaction_id?: string | null
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
        ]
      }
      blog_posts: {
        Row: {
          author: string
          category: string
          content: string
          created_at: string | null
          excerpt: string
          featured_image: string | null
          id: string
          is_published: boolean | null
          last_updated: string | null
          meta_description: string | null
          meta_title: string | null
          published_date: string | null
          read_time_minutes: number | null
          slug: string
          tags: string[] | null
          title: string
        }
        Insert: {
          author: string
          category: string
          content: string
          created_at?: string | null
          excerpt: string
          featured_image?: string | null
          id?: string
          is_published?: boolean | null
          last_updated?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_date?: string | null
          read_time_minutes?: number | null
          slug: string
          tags?: string[] | null
          title: string
        }
        Update: {
          author?: string
          category?: string
          content?: string
          created_at?: string | null
          excerpt?: string
          featured_image?: string | null
          id?: string
          is_published?: boolean | null
          last_updated?: string | null
          meta_description?: string | null
          meta_title?: string | null
          published_date?: string | null
          read_time_minutes?: number | null
          slug?: string
          tags?: string[] | null
          title?: string
        }
        Relationships: []
      }
      cancellation_requests: {
        Row: {
          cancellation_type: string
          created_at: string | null
          feedback: string | null
          id: string
          processed_at: string | null
          reason: string | null
          retention_offer_accepted: boolean | null
          retention_offer_made: boolean | null
          status: string
          subscription_id: string
          user_id: string
        }
        Insert: {
          cancellation_type: string
          created_at?: string | null
          feedback?: string | null
          id?: string
          processed_at?: string | null
          reason?: string | null
          retention_offer_accepted?: boolean | null
          retention_offer_made?: boolean | null
          status?: string
          subscription_id: string
          user_id: string
        }
        Update: {
          cancellation_type?: string
          created_at?: string | null
          feedback?: string | null
          id?: string
          processed_at?: string | null
          reason?: string | null
          retention_offer_accepted?: boolean | null
          retention_offer_made?: boolean | null
          status?: string
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_requests_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_duty_logs: {
        Row: {
          company_id: string
          created_at: string | null
          duty_ended_at: string | null
          duty_started_at: string | null
          equipment_verified: boolean | null
          equipment_verified_at: string | null
          id: string
          on_duty: boolean
          user_id: string
          verification_notes: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          duty_ended_at?: string | null
          duty_started_at?: string | null
          equipment_verified?: boolean | null
          equipment_verified_at?: string | null
          id?: string
          on_duty?: boolean
          user_id: string
          verification_notes?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          duty_ended_at?: string | null
          duty_started_at?: string | null
          equipment_verified?: boolean | null
          equipment_verified_at?: string | null
          id?: string
          on_duty?: boolean
          user_id?: string
          verification_notes?: string | null
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
      cleaning_supplies: {
        Row: {
          auto_reorder_enabled: boolean | null
          category: string | null
          company_id: string
          cost_per_unit: number | null
          created_at: string | null
          current_quantity: number
          id: string
          last_reorder_date: string | null
          minimum_stock_level: number
          notes: string | null
          reorder_trigger_level: number
          supplier_id: string | null
          supply_name: string
          unit: string
        }
        Insert: {
          auto_reorder_enabled?: boolean | null
          category?: string | null
          company_id: string
          cost_per_unit?: number | null
          created_at?: string | null
          current_quantity: number
          id?: string
          last_reorder_date?: string | null
          minimum_stock_level: number
          notes?: string | null
          reorder_trigger_level: number
          supplier_id?: string | null
          supply_name: string
          unit?: string
        }
        Update: {
          auto_reorder_enabled?: boolean | null
          category?: string | null
          company_id?: string
          cost_per_unit?: number | null
          created_at?: string | null
          current_quantity?: number
          id?: string
          last_reorder_date?: string | null
          minimum_stock_level?: number
          notes?: string | null
          reorder_trigger_level?: number
          supplier_id?: string | null
          supply_name?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_supplies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_supplies_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_pages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_published: boolean | null
          last_updated: string | null
          meta_description: string | null
          meta_title: string | null
          slug: string
          title: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          last_updated?: string | null
          meta_description?: string | null
          meta_title?: string | null
          slug: string
          title: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          last_updated?: string | null
          meta_description?: string | null
          meta_title?: string | null
          slug?: string
          title?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          brand_color: string | null
          city: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          email: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          onboarding_completed: boolean | null
          owner_id: string | null
          phone: string | null
          province: string | null
          slug: string
          subscription_plan: string | null
          subscription_status: string | null
          timezone: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          brand_color?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          onboarding_completed?: boolean | null
          owner_id?: string | null
          phone?: string | null
          province?: string | null
          slug: string
          subscription_plan?: string | null
          subscription_status?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          brand_color?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          onboarding_completed?: boolean | null
          owner_id?: string | null
          phone?: string | null
          province?: string | null
          slug?: string
          subscription_plan?: string | null
          subscription_status?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      complaints: {
        Row: {
          assigned_to: string | null
          client_email: string | null
          client_name: string
          complaint_type: string
          created_at: string | null
          description: string
          id: string
          order_id: string
          priority: string | null
          resolution_notes: string | null
          resolved_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          client_email?: string | null
          client_name: string
          complaint_type: string
          created_at?: string | null
          description: string
          id?: string
          order_id: string
          priority?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          client_email?: string | null
          client_name?: string
          complaint_type?: string
          created_at?: string | null
          description?: string
          id?: string
          order_id?: string
          priority?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_fluctuation_alerts: {
        Row: {
          alert_sent: boolean | null
          check_date: string
          created_at: string | null
          days_period: number
          end_rate: number
          id: string
          percentage_change: number
          resolved: boolean | null
          resolved_at: string | null
          start_rate: number
        }
        Insert: {
          alert_sent?: boolean | null
          check_date: string
          created_at?: string | null
          days_period: number
          end_rate: number
          id?: string
          percentage_change: number
          resolved?: boolean | null
          resolved_at?: string | null
          start_rate: number
        }
        Update: {
          alert_sent?: boolean | null
          check_date?: string
          created_at?: string | null
          days_period?: number
          end_rate?: number
          id?: string
          percentage_change?: number
          resolved?: boolean | null
          resolved_at?: string | null
          start_rate?: number
        }
        Relationships: []
      }
      daily_prep_lists: {
        Row: {
          assigned_to: string | null
          company_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          estimated_time_minutes: number | null
          event_id: string | null
          id: string
          item_name: string
          notes: string | null
          prep_date: string
          priority: string | null
          quantity_needed: number
          recipe_id: string | null
          started_at: string | null
          status: string | null
          unit: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          estimated_time_minutes?: number | null
          event_id?: string | null
          id?: string
          item_name: string
          notes?: string | null
          prep_date: string
          priority?: string | null
          quantity_needed: number
          recipe_id?: string | null
          started_at?: string | null
          status?: string | null
          unit: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          estimated_time_minutes?: number | null
          event_id?: string | null
          id?: string
          item_name?: string
          notes?: string | null
          prep_date?: string
          priority?: string | null
          quantity_needed?: number
          recipe_id?: string | null
          started_at?: string | null
          status?: string | null
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_prep_lists_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_prep_lists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_prep_lists_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_prep_lists_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_prep_lists_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          actual_delivery_time: string | null
          client_signature: string | null
          created_at: string | null
          delivery_photo_url: string | null
          delivery_time: string
          driver_id: string | null
          driver_notes: string | null
          id: string
          location: string
          order_id: string
          pickup_time: string
          status: string
          updated_at: string | null
        }
        Insert: {
          actual_delivery_time?: string | null
          client_signature?: string | null
          created_at?: string | null
          delivery_photo_url?: string | null
          delivery_time: string
          driver_id?: string | null
          driver_notes?: string | null
          id?: string
          location: string
          order_id: string
          pickup_time: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          actual_delivery_time?: string | null
          client_signature?: string | null
          created_at?: string | null
          delivery_photo_url?: string | null
          delivery_time?: string
          driver_id?: string | null
          driver_notes?: string | null
          id?: string
          location?: string
          order_id?: string
          pickup_time?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          assigned_to_driver: string | null
          assigned_to_event: string | null
          barcode: string
          capacity_liters: number | null
          company_id: string
          crate_type: string | null
          created_at: string | null
          id: string
          last_cleaned_date: string | null
          location: string | null
          notes: string | null
          status: string | null
        }
        Insert: {
          assigned_to_driver?: string | null
          assigned_to_event?: string | null
          barcode: string
          capacity_liters?: number | null
          company_id: string
          crate_type?: string | null
          created_at?: string | null
          id?: string
          last_cleaned_date?: string | null
          location?: string | null
          notes?: string | null
          status?: string | null
        }
        Update: {
          assigned_to_driver?: string | null
          assigned_to_event?: string | null
          barcode?: string
          capacity_liters?: number | null
          company_id?: string
          crate_type?: string | null
          created_at?: string | null
          id?: string
          last_cleaned_date?: string | null
          location?: string | null
          notes?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_crates_assigned_to_driver_fkey"
            columns: ["assigned_to_driver"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_crates_assigned_to_event_fkey"
            columns: ["assigned_to_event"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_crates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          driver_id: string
          duration_minutes: number | null
          id: string
          order_id: string
          reason: string | null
          receipt_url: string | null
          stop_address: string
          stop_lat: number | null
          stop_lng: number | null
          stop_name: string
          stop_type: string
          updated_at: string | null
        }
        Insert: {
          added_by_admin?: boolean | null
          amount_spent?: number | null
          arrival_time?: string | null
          created_at?: string | null
          departure_time?: string | null
          driver_id: string
          duration_minutes?: number | null
          id?: string
          order_id: string
          reason?: string | null
          receipt_url?: string | null
          stop_address: string
          stop_lat?: number | null
          stop_lng?: number | null
          stop_name: string
          stop_type: string
          updated_at?: string | null
        }
        Update: {
          added_by_admin?: boolean | null
          amount_spent?: number | null
          arrival_time?: string | null
          created_at?: string | null
          departure_time?: string | null
          driver_id?: string
          duration_minutes?: number | null
          id?: string
          order_id?: string
          reason?: string | null
          receipt_url?: string | null
          stop_address?: string
          stop_lat?: number | null
          stop_lng?: number | null
          stop_name?: string
          stop_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_route_stops_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_route_stops_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      dishwasher_cycles: {
        Row: {
          company_id: string
          completed: boolean | null
          created_at: string | null
          cycle_duration_minutes: number | null
          cycle_end_time: string | null
          cycle_start_time: string
          id: string
          load_type: string | null
          machine_name: string
          notes: string | null
          operator_id: string | null
          temperature_celsius: number | null
        }
        Insert: {
          company_id: string
          completed?: boolean | null
          created_at?: string | null
          cycle_duration_minutes?: number | null
          cycle_end_time?: string | null
          cycle_start_time: string
          id?: string
          load_type?: string | null
          machine_name: string
          notes?: string | null
          operator_id?: string | null
          temperature_celsius?: number | null
        }
        Update: {
          company_id?: string
          completed?: boolean | null
          created_at?: string | null
          cycle_duration_minutes?: number | null
          cycle_end_time?: string | null
          cycle_start_time?: string
          id?: string
          load_type?: string | null
          machine_name?: string
          notes?: string | null
          operator_id?: string | null
          temperature_celsius?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dishwasher_cycles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dishwasher_cycles_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_assignments: {
        Row: {
          accepted_at: string | null
          actual_crockery_count: number | null
          actual_cutlery_count: number | null
          assignment_type: string
          calculated_distance: number | null
          calculated_hours: number | null
          checklist_completed_at: string | null
          checklist_crockery_confirmed: boolean | null
          checklist_cutlery_confirmed: boolean | null
          checklist_food_verified: boolean | null
          collection_crockery_count: number | null
          collection_cutlery_count: number | null
          collection_notes: string | null
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          delivery_earnings: number | null
          departure_confirmed: boolean | null
          departure_confirmed_at: string | null
          driver_id: string
          estimated_drive_time_minutes: number | null
          event_completed_at: string | null
          hourly_rate: number | null
          id: string
          is_waiter_job: boolean | null
          notes: string | null
          order_id: string
          paid_at: string | null
          payment_status: string | null
          rate_per_km: number | null
          region_id: string | null
          started_at: string | null
          status: string | null
          total_earnings: number | null
          updated_at: string | null
          user_id: string
          waiter_duration_hours: number | null
          waiter_earnings: number | null
          waiter_hourly_rate: number | null
        }
        Insert: {
          accepted_at?: string | null
          actual_crockery_count?: number | null
          actual_cutlery_count?: number | null
          assignment_type: string
          calculated_distance?: number | null
          calculated_hours?: number | null
          checklist_completed_at?: string | null
          checklist_crockery_confirmed?: boolean | null
          checklist_cutlery_confirmed?: boolean | null
          checklist_food_verified?: boolean | null
          collection_crockery_count?: number | null
          collection_cutlery_count?: number | null
          collection_notes?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          delivery_earnings?: number | null
          departure_confirmed?: boolean | null
          departure_confirmed_at?: string | null
          driver_id: string
          estimated_drive_time_minutes?: number | null
          event_completed_at?: string | null
          hourly_rate?: number | null
          id?: string
          is_waiter_job?: boolean | null
          notes?: string | null
          order_id: string
          paid_at?: string | null
          payment_status?: string | null
          rate_per_km?: number | null
          region_id?: string | null
          started_at?: string | null
          status?: string | null
          total_earnings?: number | null
          updated_at?: string | null
          user_id: string
          waiter_duration_hours?: number | null
          waiter_earnings?: number | null
          waiter_hourly_rate?: number | null
        }
        Update: {
          accepted_at?: string | null
          actual_crockery_count?: number | null
          actual_cutlery_count?: number | null
          assignment_type?: string
          calculated_distance?: number | null
          calculated_hours?: number | null
          checklist_completed_at?: string | null
          checklist_crockery_confirmed?: boolean | null
          checklist_cutlery_confirmed?: boolean | null
          checklist_food_verified?: boolean | null
          collection_crockery_count?: number | null
          collection_cutlery_count?: number | null
          collection_notes?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          delivery_earnings?: number | null
          departure_confirmed?: boolean | null
          departure_confirmed_at?: string | null
          driver_id?: string
          estimated_drive_time_minutes?: number | null
          event_completed_at?: string | null
          hourly_rate?: number | null
          id?: string
          is_waiter_job?: boolean | null
          notes?: string | null
          order_id?: string
          paid_at?: string | null
          payment_status?: string | null
          rate_per_km?: number | null
          region_id?: string | null
          started_at?: string | null
          status?: string | null
          total_earnings?: number | null
          updated_at?: string | null
          user_id?: string
          waiter_duration_hours?: number | null
          waiter_earnings?: number | null
          waiter_hourly_rate?: number | null
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
          {
            foreignKeyName: "driver_assignments_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_confirmations: {
        Row: {
          confirmation_type: string
          confirmed_at: string | null
          created_at: string | null
          driver_id: string
          id: string
          location_lat: number | null
          location_lng: number | null
          notes: string | null
          order_id: string
        }
        Insert: {
          confirmation_type: string
          confirmed_at?: string | null
          created_at?: string | null
          driver_id: string
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          order_id: string
        }
        Update: {
          confirmation_type?: string
          confirmed_at?: string | null
          created_at?: string | null
          driver_id?: string
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_confirmations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_confirmations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_replacement_requests: {
        Row: {
          accepted_at: string | null
          accepted_by_driver_id: string | null
          created_at: string | null
          id: string
          order_id: string
          original_driver_id: string
          reason: string
          status: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_driver_id?: string | null
          created_at?: string | null
          id?: string
          order_id: string
          original_driver_id: string
          reason: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by_driver_id?: string | null
          created_at?: string | null
          id?: string
          order_id?: string
          original_driver_id?: string
          reason?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_replacement_requests_accepted_by_driver_id_fkey"
            columns: ["accepted_by_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
        ]
      }
      driver_rest_logs: {
        Row: {
          company_id: string
          compliant: boolean | null
          created_at: string | null
          driver_id: string
          id: string
          notes: string | null
          rest_breaks_taken: number | null
          rest_duration_minutes: number | null
          shift_date: string
          shift_end_time: string | null
          shift_start_time: string
          total_driving_hours: number | null
          violations: string | null
        }
        Insert: {
          company_id: string
          compliant?: boolean | null
          created_at?: string | null
          driver_id: string
          id?: string
          notes?: string | null
          rest_breaks_taken?: number | null
          rest_duration_minutes?: number | null
          shift_date: string
          shift_end_time?: string | null
          shift_start_time: string
          total_driving_hours?: number | null
          violations?: string | null
        }
        Update: {
          company_id?: string
          compliant?: boolean | null
          created_at?: string | null
          driver_id?: string
          id?: string
          notes?: string | null
          rest_breaks_taken?: number | null
          rest_duration_minutes?: number | null
          shift_date?: string
          shift_end_time?: string | null
          shift_start_time?: string
          total_driving_hours?: number | null
          violations?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_rest_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_rest_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_automation_log: {
        Row: {
          clicked_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          opened_at: string | null
          order_id: string | null
          quote_id: string | null
          recipient_email: string
          recipient_name: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string | null
          subject: string
          template_type: string
          user_id: string
        }
        Insert: {
          clicked_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          order_id?: string | null
          quote_id?: string | null
          recipient_email: string
          recipient_name?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
          template_type: string
          user_id: string
        }
        Update: {
          clicked_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          order_id?: string | null
          quote_id?: string | null
          recipient_email?: string
          recipient_name?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          template_type?: string
          user_id?: string
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
            foreignKeyName: "email_automation_log_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
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
      email_logs: {
        Row: {
          body: string | null
          created_at: string | null
          email_type: string | null
          id: number
          recipient: string
          sent_at: string | null
          status: string | null
          subject: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          email_type?: string | null
          id?: number
          recipient: string
          sent_at?: string | null
          status?: string | null
          subject: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          email_type?: string | null
          id?: number
          recipient?: string
          sent_at?: string | null
          status?: string | null
          subject?: string
        }
        Relationships: []
      }
      email_settings: {
        Row: {
          created_at: string | null
          enabled: boolean
          from_email: string | null
          from_name: string | null
          id: string
          provider: string
          smtp_host: string | null
          smtp_password: string | null
          smtp_port: string | null
          smtp_user: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean
          from_email?: string | null
          from_name?: string | null
          id?: string
          provider?: string
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: string | null
          smtp_user?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          enabled?: boolean
          from_email?: string | null
          from_name?: string | null
          id?: string
          provider?: string
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: string | null
          smtp_user?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body: string
          created_at: string | null
          id: string
          is_active: boolean | null
          subject: string
          template_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          subject: string
          template_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          subject?: string
          template_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          address: string | null
          contact_name: string
          created_at: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          medical_notes: string | null
          phone_primary: string
          phone_secondary: string | null
          relationship: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          contact_name: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          medical_notes?: string | null
          phone_primary: string
          phone_secondary?: string | null
          relationship: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          contact_name?: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          medical_notes?: string | null
          phone_primary?: string
          phone_secondary?: string | null
          relationship?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_contacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_meals: {
        Row: {
          company_id: string
          cost_per_meal: number | null
          created_at: string | null
          id: string
          meal_date: string
          meal_type: string
          notes: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          cost_per_meal?: number | null
          created_at?: string | null
          id?: string
          meal_date?: string
          meal_type: string
          notes?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          cost_per_meal?: number | null
          created_at?: string | null
          id?: string
          meal_date?: string
          meal_type?: string
          notes?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_meals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_meals_user_id_fkey"
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
          average_cost: number | null
          category: string
          cleaning_time_hours: number | null
          company_id: string | null
          condition: string | null
          created_at: string | null
          id: string
          last_inspection: string | null
          last_maintenance_date: string | null
          last_restocked: string | null
          minimum_stock: number
          name: string
          notes: string | null
          purchase_date: string | null
          quantity: number | null
          quantity_total: number
          region_id: string | null
          replacement_cost: number | null
          shelf_life_days: number | null
          unit: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          available_quantity?: number | null
          average_cost?: number | null
          category: string
          cleaning_time_hours?: number | null
          company_id?: string | null
          condition?: string | null
          created_at?: string | null
          id?: string
          last_inspection?: string | null
          last_maintenance_date?: string | null
          last_restocked?: string | null
          minimum_stock?: number
          name: string
          notes?: string | null
          purchase_date?: string | null
          quantity?: number | null
          quantity_total?: number
          region_id?: string | null
          replacement_cost?: number | null
          shelf_life_days?: number | null
          unit?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          available_quantity?: number | null
          average_cost?: number | null
          category?: string
          cleaning_time_hours?: number | null
          company_id?: string | null
          condition?: string | null
          created_at?: string | null
          id?: string
          last_inspection?: string | null
          last_maintenance_date?: string | null
          last_restocked?: string | null
          minimum_stock?: number
          name?: string
          notes?: string | null
          purchase_date?: string | null
          quantity?: number | null
          quantity_total?: number
          region_id?: string | null
          replacement_cost?: number | null
          shelf_life_days?: number | null
          unit?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_bookings: {
        Row: {
          available_from: string | null
          booked_from: string
          booked_until: string
          created_at: string | null
          equipment_id: string
          id: string
          notes: string | null
          order_id: string
          quantity: number
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          available_from?: string | null
          booked_from: string
          booked_until: string
          created_at?: string | null
          equipment_id: string
          id?: string
          notes?: string | null
          order_id: string
          quantity: number
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          available_from?: string | null
          booked_from?: string
          booked_until?: string
          created_at?: string | null
          equipment_id?: string
          id?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_bookings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_bookings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_cleaning_status: {
        Row: {
          admin_notified: boolean | null
          admin_notified_at: string | null
          cleaned_by_user_id: string | null
          cleaning_completed_at: string | null
          cleaning_started_at: string | null
          created_at: string | null
          current_status: string
          drying_completed_at: string | null
          drying_started_at: string | null
          equipment_id: string
          id: string
          order_id: string
          ready_for_use_at: string | null
          returned_quantity: number
          updated_at: string | null
          verified_by_user_id: string | null
        }
        Insert: {
          admin_notified?: boolean | null
          admin_notified_at?: string | null
          cleaned_by_user_id?: string | null
          cleaning_completed_at?: string | null
          cleaning_started_at?: string | null
          created_at?: string | null
          current_status?: string
          drying_completed_at?: string | null
          drying_started_at?: string | null
          equipment_id: string
          id?: string
          order_id: string
          ready_for_use_at?: string | null
          returned_quantity: number
          updated_at?: string | null
          verified_by_user_id?: string | null
        }
        Update: {
          admin_notified?: boolean | null
          admin_notified_at?: string | null
          cleaned_by_user_id?: string | null
          cleaning_completed_at?: string | null
          cleaning_started_at?: string | null
          created_at?: string | null
          current_status?: string
          drying_completed_at?: string | null
          drying_started_at?: string | null
          equipment_id?: string
          id?: string
          order_id?: string
          ready_for_use_at?: string | null
          returned_quantity?: number
          updated_at?: string | null
          verified_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_cleaning_status_cleaned_by_user_id_fkey"
            columns: ["cleaned_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_cleaning_status_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_cleaning_status_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_cleaning_status_verified_by_user_id_fkey"
            columns: ["verified_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_damages: {
        Row: {
          created_at: string | null
          damage_stage: string
          damage_type: string
          description: string | null
          equipment_id: string
          handover_id: string | null
          id: string
          notes: string | null
          order_id: string
          photo_url: string | null
          quantity_damaged: number
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          responsible_name: string | null
          responsible_user_id: string | null
          total_cost: number
          unit_cost: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          damage_stage: string
          damage_type: string
          description?: string | null
          equipment_id: string
          handover_id?: string | null
          id?: string
          notes?: string | null
          order_id: string
          photo_url?: string | null
          quantity_damaged: number
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          responsible_name?: string | null
          responsible_user_id?: string | null
          total_cost: number
          unit_cost: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          damage_stage?: string
          damage_type?: string
          description?: string | null
          equipment_id?: string
          handover_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          photo_url?: string | null
          quantity_damaged?: number
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          responsible_name?: string | null
          responsible_user_id?: string | null
          total_cost?: number
          unit_cost?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_damages_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_damages_handover_id_fkey"
            columns: ["handover_id"]
            isOneToOne: false
            referencedRelation: "equipment_handovers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_damages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_damages_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_damages_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_handovers: {
        Row: {
          created_at: string | null
          discrepancy_noted: boolean | null
          discrepancy_reason: string | null
          equipment_id: string
          from_stage: string
          handed_at: string | null
          handed_by_name: string | null
          handed_by_user_id: string | null
          id: string
          order_id: string
          quantity: number
          quantity_received: number | null
          quantity_sent: number
          received_at: string | null
          received_by_name: string | null
          received_by_user_id: string | null
          to_stage: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          discrepancy_noted?: boolean | null
          discrepancy_reason?: string | null
          equipment_id: string
          from_stage: string
          handed_at?: string | null
          handed_by_name?: string | null
          handed_by_user_id?: string | null
          id?: string
          order_id: string
          quantity: number
          quantity_received?: number | null
          quantity_sent: number
          received_at?: string | null
          received_by_name?: string | null
          received_by_user_id?: string | null
          to_stage: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          discrepancy_noted?: boolean | null
          discrepancy_reason?: string | null
          equipment_id?: string
          from_stage?: string
          handed_at?: string | null
          handed_by_name?: string | null
          handed_by_user_id?: string | null
          id?: string
          order_id?: string
          quantity?: number
          quantity_received?: number | null
          quantity_sent?: number
          received_at?: string | null
          received_by_name?: string | null
          received_by_user_id?: string | null
          to_stage?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_handovers_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_handovers_handed_by_user_id_fkey"
            columns: ["handed_by_user_id"]
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
            foreignKeyName: "equipment_handovers_received_by_user_id_fkey"
            columns: ["received_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_kit_items: {
        Row: {
          equipment_id: string
          id: string
          kit_id: string
          notes: string | null
          quantity: number
        }
        Insert: {
          equipment_id: string
          id?: string
          kit_id: string
          notes?: string | null
          quantity: number
        }
        Update: {
          equipment_id?: string
          id?: string
          kit_id?: string
          notes?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "equipment_kit_items_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_kit_items_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "equipment_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_kits: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          kit_size: string | null
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          kit_size?: string | null
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          kit_size?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_kits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_maintenance: {
        Row: {
          company_id: string
          created_at: string | null
          equipment_name: string
          equipment_type: string | null
          id: string
          is_backup: boolean | null
          last_service_date: string | null
          location: string | null
          maintenance_frequency_days: number | null
          next_service_date: string | null
          notes: string | null
          serial_number: string | null
          service_cost: number | null
          service_provider: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          equipment_name: string
          equipment_type?: string | null
          id?: string
          is_backup?: boolean | null
          last_service_date?: string | null
          location?: string | null
          maintenance_frequency_days?: number | null
          next_service_date?: string | null
          notes?: string | null
          serial_number?: string | null
          service_cost?: number | null
          service_provider?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          equipment_name?: string
          equipment_type?: string | null
          id?: string
          is_backup?: boolean | null
          last_service_date?: string | null
          location?: string | null
          maintenance_frequency_days?: number | null
          next_service_date?: string | null
          notes?: string | null
          serial_number?: string | null
          service_cost?: number | null
          service_provider?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_maintenance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_service_history: {
        Row: {
          actions_taken: string | null
          cost: number | null
          created_at: string | null
          created_by: string | null
          equipment_id: string
          id: string
          issues_found: string | null
          next_service_due: string | null
          service_date: string
          service_type: string | null
          technician_name: string | null
        }
        Insert: {
          actions_taken?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          equipment_id: string
          id?: string
          issues_found?: string | null
          next_service_due?: string | null
          service_date: string
          service_type?: string | null
          technician_name?: string | null
        }
        Update: {
          actions_taken?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          equipment_id?: string
          id?: string
          issues_found?: string | null
          next_service_due?: string | null
          service_date?: string
          service_type?: string | null
          technician_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_service_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_service_history_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment_maintenance"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_shortage_flags: {
        Row: {
          admin_notes: string | null
          client_email: string | null
          client_name: string
          created_at: string | null
          equipment_booking_id: string
          equipment_id: string
          equipment_name: string
          expected_quantity: number
          financial_impact: number | null
          id: string
          order_id: string
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          returned_quantity: number
          shortage_quantity: number
          shortage_reason: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          client_email?: string | null
          client_name: string
          created_at?: string | null
          equipment_booking_id: string
          equipment_id: string
          equipment_name: string
          expected_quantity: number
          financial_impact?: number | null
          id?: string
          order_id: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          returned_quantity: number
          shortage_quantity: number
          shortage_reason?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          client_email?: string | null
          client_name?: string
          created_at?: string | null
          equipment_booking_id?: string
          equipment_id?: string
          equipment_name?: string
          expected_quantity?: number
          financial_impact?: number | null
          id?: string
          order_id?: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          returned_quantity?: number
          shortage_quantity?: number
          shortage_reason?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_shortage_flags_equipment_booking_id_fkey"
            columns: ["equipment_booking_id"]
            isOneToOne: false
            referencedRelation: "equipment_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_shortage_flags_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_shortage_flags_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_shortage_flags_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_shortage_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_shortages: {
        Row: {
          client_id: string | null
          created_at: string
          equipment_type: string
          id: string
          notes: string | null
          order_id: string
          quantity_missing: number
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          equipment_type: string
          id?: string
          notes?: string | null
          order_id: string
          quantity_missing: number
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          equipment_type?: string
          id?: string
          notes?: string | null
          order_id?: string
          quantity_missing?: number
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_shortages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_shortages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_shortages_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_shortages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_briefings: {
        Row: {
          allergen_alerts: string[] | null
          attendees: string[] | null
          briefed_by: string | null
          briefing_date: string
          company_id: string
          created_at: string | null
          duration_minutes: number | null
          event_id: string | null
          id: string
          menu_items: string[] | null
          quick_card_url: string | null
          service_flow: string | null
          special_instructions: string | null
          status: string | null
        }
        Insert: {
          allergen_alerts?: string[] | null
          attendees?: string[] | null
          briefed_by?: string | null
          briefing_date: string
          company_id: string
          created_at?: string | null
          duration_minutes?: number | null
          event_id?: string | null
          id?: string
          menu_items?: string[] | null
          quick_card_url?: string | null
          service_flow?: string | null
          special_instructions?: string | null
          status?: string | null
        }
        Update: {
          allergen_alerts?: string[] | null
          attendees?: string[] | null
          briefed_by?: string | null
          briefing_date?: string
          company_id?: string
          created_at?: string | null
          duration_minutes?: number | null
          event_id?: string | null
          id?: string
          menu_items?: string[] | null
          quick_card_url?: string | null
          service_flow?: string | null
          special_instructions?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_briefings_briefed_by_fkey"
            columns: ["briefed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_briefings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_briefings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string | null
          date: string
          id: string
          updated_at: string | null
          usd_to_zar_rate: number
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          updated_at?: string | null
          usd_to_zar_rate: number
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          updated_at?: string | null
          usd_to_zar_rate?: number
        }
        Relationships: []
      }
      financial_depreciation: {
        Row: {
          company_id: string
          created_at: string | null
          depreciation_method: string | null
          equipment_id: string
          id: string
          purchase_date: string
          purchase_price: number
          salvage_value: number | null
          useful_life_years: number
        }
        Insert: {
          company_id: string
          created_at?: string | null
          depreciation_method?: string | null
          equipment_id: string
          id?: string
          purchase_date: string
          purchase_price: number
          salvage_value?: number | null
          useful_life_years: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          depreciation_method?: string | null
          equipment_id?: string
          id?: string
          purchase_date?: string
          purchase_price?: number
          salvage_value?: number | null
          useful_life_years?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_depreciation_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_depreciation_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_predictions: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          id: string
          predicted_cashflow: number | null
          predicted_expenses: number | null
          predicted_revenue: number | null
          prediction_date: string
          recommendations: Json | null
          risk_level: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          predicted_cashflow?: number | null
          predicted_expenses?: number | null
          predicted_revenue?: number | null
          prediction_date: string
          recommendations?: Json | null
          risk_level?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          predicted_cashflow?: number | null
          predicted_expenses?: number | null
          predicted_revenue?: number | null
          prediction_date?: string
          recommendations?: Json | null
          risk_level?: string | null
        }
        Relationships: []
      }
      floor_safety_inspections: {
        Row: {
          area: string
          company_id: string
          corrective_actions: string | null
          created_at: string | null
          drainage_working: boolean | null
          id: string
          inspection_date: string
          inspector_id: string | null
          issues_found: string | null
          mat_condition: string | null
          next_inspection_date: string | null
          photo_urls: string[] | null
          slip_risk_level: string | null
        }
        Insert: {
          area: string
          company_id: string
          corrective_actions?: string | null
          created_at?: string | null
          drainage_working?: boolean | null
          id?: string
          inspection_date: string
          inspector_id?: string | null
          issues_found?: string | null
          mat_condition?: string | null
          next_inspection_date?: string | null
          photo_urls?: string[] | null
          slip_risk_level?: string | null
        }
        Update: {
          area?: string
          company_id?: string
          corrective_actions?: string | null
          created_at?: string | null
          drainage_working?: boolean | null
          id?: string
          inspection_date?: string
          inspector_id?: string | null
          issues_found?: string | null
          mat_condition?: string | null
          next_inspection_date?: string | null
          photo_urls?: string[] | null
          slip_risk_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "floor_safety_inspections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floor_safety_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_stockpile: {
        Row: {
          company_id: string
          fuel_type: string
          id: string
          last_restock_date: string | null
          location: string | null
          minimum_stock_level: number | null
          notes: string | null
          quantity: number
          supplier_id: string | null
          unit: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          fuel_type: string
          id?: string
          last_restock_date?: string | null
          location?: string | null
          minimum_stock_level?: number | null
          notes?: string | null
          quantity?: number
          supplier_id?: string | null
          unit?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          fuel_type?: string
          id?: string
          last_restock_date?: string | null
          location?: string | null
          minimum_stock_level?: number | null
          notes?: string | null
          quantity?: number
          supplier_id?: string | null
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_stockpile_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_stockpile_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_achievements: {
        Row: {
          achievement_description: string | null
          achievement_key: string
          achievement_name: string
          icon: string | null
          id: string
          unlocked_at: string | null
          user_id: string
        }
        Insert: {
          achievement_description?: string | null
          achievement_key: string
          achievement_name: string
          icon?: string | null
          id?: string
          unlocked_at?: string | null
          user_id: string
        }
        Update: {
          achievement_description?: string | null
          achievement_key?: string
          achievement_name?: string
          icon?: string | null
          id?: string
          unlocked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamification_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_points: {
        Row: {
          action_description: string | null
          action_type: string
          awarded_at: string | null
          id: string
          order_id: string | null
          points: number
          user_id: string
        }
        Insert: {
          action_description?: string | null
          action_type: string
          awarded_at?: string | null
          id?: string
          order_id?: string | null
          points?: number
          user_id: string
        }
        Update: {
          action_description?: string | null
          action_type?: string
          awarded_at?: string | null
          id?: string
          order_id?: string | null
          points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamification_points_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamification_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      glassware_catalog: {
        Row: {
          capacity_ml: number | null
          company_id: string
          created_at: string | null
          glass_type: string
          id: string
          minimum_stock_level: number | null
          notes: string | null
          photo_url: string | null
          quantity_available: number | null
          quantity_owned: number | null
          style_name: string | null
          suitable_for: string[] | null
        }
        Insert: {
          capacity_ml?: number | null
          company_id: string
          created_at?: string | null
          glass_type: string
          id?: string
          minimum_stock_level?: number | null
          notes?: string | null
          photo_url?: string | null
          quantity_available?: number | null
          quantity_owned?: number | null
          style_name?: string | null
          suitable_for?: string[] | null
        }
        Update: {
          capacity_ml?: number | null
          company_id?: string
          created_at?: string | null
          glass_type?: string
          id?: string
          minimum_stock_level?: number | null
          notes?: string | null
          photo_url?: string | null
          quantity_available?: number | null
          quantity_owned?: number | null
          style_name?: string | null
          suitable_for?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "glassware_catalog_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_tracking: {
        Row: {
          accuracy: number | null
          assignment_id: string | null
          created_at: string | null
          driver_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          order_id: string
          speed: number | null
          timestamp: string | null
        }
        Insert: {
          accuracy?: number | null
          assignment_id?: string | null
          created_at?: string | null
          driver_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          order_id: string
          speed?: number | null
          timestamp?: string | null
        }
        Update: {
          accuracy?: number | null
          assignment_id?: string | null
          created_at?: string | null
          driver_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          order_id?: string
          speed?: number | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gps_tracking_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "driver_assignments"
            referencedColumns: ["id"]
          },
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
      health_certificates: {
        Row: {
          certificate_number: string | null
          certificate_type: string
          created_at: string | null
          document_url: string | null
          expiry_date: string
          id: string
          issue_date: string
          issuing_authority: string | null
          reminder_sent: boolean | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          certificate_number?: string | null
          certificate_type: string
          created_at?: string | null
          document_url?: string | null
          expiry_date: string
          id?: string
          issue_date: string
          issuing_authority?: string | null
          reminder_sent?: boolean | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          certificate_number?: string | null
          certificate_type?: string
          created_at?: string | null
          document_url?: string | null
          expiry_date?: string
          id?: string
          issue_date?: string
          issuing_authority?: string | null
          reminder_sent?: boolean | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_certificates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ice_tracking: {
        Row: {
          arrival_condition: string | null
          company_id: string
          cooler_type: string | null
          created_at: string | null
          departure_condition: string | null
          event_id: string | null
          ice_type: string | null
          id: string
          quantity_kg: number
          temperature_on_arrival_celsius: number | null
          transport_duration_minutes: number | null
        }
        Insert: {
          arrival_condition?: string | null
          company_id: string
          cooler_type?: string | null
          created_at?: string | null
          departure_condition?: string | null
          event_id?: string | null
          ice_type?: string | null
          id?: string
          quantity_kg: number
          temperature_on_arrival_celsius?: number | null
          transport_duration_minutes?: number | null
        }
        Update: {
          arrival_condition?: string | null
          company_id?: string
          cooler_type?: string | null
          created_at?: string | null
          departure_condition?: string | null
          event_id?: string | null
          ice_type?: string | null
          id?: string
          quantity_kg?: number
          temperature_on_arrival_celsius?: number | null
          transport_duration_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ice_tracking_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ice_tracking_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_substitutions: {
        Row: {
          allergen_impact: string | null
          approved: boolean | null
          company_id: string
          cost_impact: number | null
          created_at: string | null
          id: string
          notes: string | null
          original_ingredient: string
          ratio: string | null
          substitute_ingredient: string
          taste_impact: string | null
          tested: boolean | null
        }
        Insert: {
          allergen_impact?: string | null
          approved?: boolean | null
          company_id: string
          cost_impact?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          original_ingredient: string
          ratio?: string | null
          substitute_ingredient: string
          taste_impact?: string | null
          tested?: boolean | null
        }
        Update: {
          allergen_impact?: string | null
          approved?: boolean | null
          company_id?: string
          cost_impact?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          original_ingredient?: string
          ratio?: string | null
          substitute_ingredient?: string
          taste_impact?: string | null
          tested?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_substitutions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_policies: {
        Row: {
          company_id: string
          coverage_amount: number | null
          created_at: string | null
          currency: string | null
          documents_url: string | null
          expiry_date: string
          id: string
          notes: string | null
          policy_number: string
          policy_type: string
          premium_amount: number | null
          premium_frequency: string | null
          provider_name: string
          start_date: string
        }
        Insert: {
          company_id: string
          coverage_amount?: number | null
          created_at?: string | null
          currency?: string | null
          documents_url?: string | null
          expiry_date: string
          id?: string
          notes?: string | null
          policy_number: string
          policy_type: string
          premium_amount?: number | null
          premium_frequency?: string | null
          provider_name: string
          start_date: string
        }
        Update: {
          company_id?: string
          coverage_amount?: number | null
          created_at?: string | null
          currency?: string | null
          documents_url?: string | null
          expiry_date?: string
          id?: string
          notes?: string | null
          policy_number?: string
          policy_type?: string
          premium_amount?: number | null
          premium_frequency?: string | null
          provider_name?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_logs: {
        Row: {
          action_type: string
          created_at: string | null
          error_message: string | null
          id: string
          integration_id: string
          request_data: Json | null
          response_data: Json | null
          status: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          integration_id: string
          request_data?: Json | null
          response_data?: Json | null
          status: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          integration_id?: string
          request_data?: Json | null
          response_data?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          connected_at: string | null
          created_at: string | null
          credentials: Json
          disconnected_at: string | null
          id: string
          integration_type: string
          is_active: boolean
          last_sync_at: string | null
          metadata: Json | null
          sync_status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string | null
          credentials?: Json
          disconnected_at?: string | null
          id?: string
          integration_type: string
          is_active?: boolean
          last_sync_at?: string | null
          metadata?: Json | null
          sync_status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string | null
          credentials?: Json
          disconnected_at?: string | null
          id?: string
          integration_type?: string
          is_active?: boolean
          last_sync_at?: string | null
          metadata?: Json | null
          sync_status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          category: string
          company_id: string | null
          created_at: string | null
          expiry_date: string | null
          id: string
          is_perishable: boolean | null
          last_restocked: string | null
          minimum_quantity: number | null
          name: string
          notes: string | null
          purchase_date: string | null
          quantity: number | null
          region_id: string | null
          shelf_life_days: number | null
          status: string | null
          supplier: string | null
          unit: string
          unit_cost: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          company_id?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          is_perishable?: boolean | null
          last_restocked?: string | null
          minimum_quantity?: number | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          quantity?: number | null
          region_id?: string | null
          shelf_life_days?: number | null
          status?: string | null
          supplier?: string | null
          unit: string
          unit_cost?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          company_id?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          is_perishable?: boolean | null
          last_restocked?: string | null
          minimum_quantity?: number | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          quantity?: number | null
          region_id?: string | null
          shelf_life_days?: number | null
          status?: string | null
          supplier?: string | null
          unit?: string
          unit_cost?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_code: string
          company_id: string
          cost_per_unit: number | null
          created_at: string | null
          expiry_date: string
          id: string
          ingredient_name: string
          notes: string | null
          preparer_initials: string | null
          quantity: number
          received_date: string
          status: string | null
          storage_location: string | null
          storage_temp_celsius: number | null
          supplier_name: string | null
          unit: string
          updated_at: string | null
          use_by_date: string | null
        }
        Insert: {
          batch_code: string
          company_id: string
          cost_per_unit?: number | null
          created_at?: string | null
          expiry_date: string
          id?: string
          ingredient_name: string
          notes?: string | null
          preparer_initials?: string | null
          quantity: number
          received_date: string
          status?: string | null
          storage_location?: string | null
          storage_temp_celsius?: number | null
          supplier_name?: string | null
          unit: string
          updated_at?: string | null
          use_by_date?: string | null
        }
        Update: {
          batch_code?: string
          company_id?: string
          cost_per_unit?: number | null
          created_at?: string | null
          expiry_date?: string
          id?: string
          ingredient_name?: string
          notes?: string | null
          preparer_initials?: string | null
          quantity?: number
          received_date?: string
          status?: string | null
          storage_location?: string | null
          storage_temp_celsius?: number | null
          supplier_name?: string | null
          unit?: string
          updated_at?: string | null
          use_by_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_duty_shifts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          order_id: string | null
          shift_end: string | null
          shift_start: string
          staff_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          order_id?: string | null
          shift_end?: string | null
          shift_start?: string
          staff_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          order_id?: string | null
          shift_end?: string | null
          shift_start?: string
          staff_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_duty_shifts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_duty_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          created_at: string
          duty_shift_id: string | null
          id: string
          location_lat: number | null
          location_lng: number | null
          notes: string | null
          order_id: string
          photo_url: string | null
          staff_id: string
          task_description: string | null
          task_type: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          duty_shift_id?: string | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          order_id: string
          photo_url?: string | null
          staff_id: string
          task_description?: string | null
          task_type: string
          user_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          duty_shift_id?: string | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          order_id?: string
          photo_url?: string | null
          staff_id?: string
          task_description?: string | null
          task_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_task_completions_duty_shift_id_fkey"
            columns: ["duty_shift_id"]
            isOneToOne: false
            referencedRelation: "kitchen_duty_shifts"
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
            foreignKeyName: "kitchen_task_completions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      labour_cost_tracking: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          labour_cost_percentage: number | null
          notes: string | null
          overtime_hours: number | null
          period_end: string
          period_start: string
          regular_hours: number
          target_percentage: number | null
          total_hours_worked: number
          total_labour_cost: number
          total_revenue: number | null
          variance: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          labour_cost_percentage?: number | null
          notes?: string | null
          overtime_hours?: number | null
          period_end: string
          period_start: string
          regular_hours: number
          target_percentage?: number | null
          total_hours_worked: number
          total_labour_cost: number
          total_revenue?: number | null
          variance?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          labour_cost_percentage?: number | null
          notes?: string | null
          overtime_hours?: number | null
          period_end?: string
          period_start?: string
          regular_hours?: number
          target_percentage?: number | null
          total_hours_worked?: number
          total_labour_cost?: number
          total_revenue?: number | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "labour_cost_tracking_company_id_fkey"
            columns: ["company_id"]
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
          client_email: string | null
          client_name: string
          client_phone: string | null
          company_id: string | null
          created_at: string | null
          event_date: string | null
          event_type: string | null
          guest_count: number | null
          id: string
          notes: string | null
          region_id: string | null
          source: string | null
          special_requests: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          budget?: number | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          company_id?: string | null
          created_at?: string | null
          event_date?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          notes?: string | null
          region_id?: string | null
          source?: string | null
          special_requests?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          budget?: number | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          company_id?: string | null
          created_at?: string | null
          event_date?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          notes?: string | null
          region_id?: string | null
          source?: string | null
          special_requests?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
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
            foreignKeyName: "leads_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
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
          action_taken: string | null
          area_tested: string
          company_id: string
          compliant: boolean | null
          created_at: string | null
          id: string
          lux_measurement: number
          minimum_required_lux: number | null
          next_test_date: string | null
          remedial_action_required: boolean | null
          test_date: string
          tester_name: string | null
        }
        Insert: {
          action_taken?: string | null
          area_tested: string
          company_id: string
          compliant?: boolean | null
          created_at?: string | null
          id?: string
          lux_measurement: number
          minimum_required_lux?: number | null
          next_test_date?: string | null
          remedial_action_required?: boolean | null
          test_date: string
          tester_name?: string | null
        }
        Update: {
          action_taken?: string | null
          area_tested?: string
          company_id?: string
          compliant?: boolean | null
          created_at?: string | null
          id?: string
          lux_measurement?: number
          minimum_required_lux?: number | null
          next_test_date?: string | null
          remedial_action_required?: boolean | null
          test_date?: string
          tester_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lighting_tests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      linen_inventory: {
        Row: {
          color: string | null
          company_id: string
          created_at: string | null
          id: string
          item_type: string
          last_laundry_date: string | null
          laundry_cycle_days: number | null
          next_laundry_date: string | null
          notes: string | null
          quantity_clean: number | null
          quantity_dirty: number | null
          quantity_in_laundry: number | null
          quantity_total: number
          size: string | null
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          item_type: string
          last_laundry_date?: string | null
          laundry_cycle_days?: number | null
          next_laundry_date?: string | null
          notes?: string | null
          quantity_clean?: number | null
          quantity_dirty?: number | null
          quantity_in_laundry?: number | null
          quantity_total: number
          size?: string | null
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          item_type?: string
          last_laundry_date?: string | null
          laundry_cycle_days?: number | null
          next_laundry_date?: string | null
          notes?: string | null
          quantity_clean?: number | null
          quantity_dirty?: number | null
          quantity_in_laundry?: number | null
          quantity_total?: number
          size?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linen_inventory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      load_plans: {
        Row: {
          cold_zone_items: string[] | null
          company_id: string
          created_at: string | null
          created_by: string | null
          event_id: string
          hot_zone_items: string[] | null
          id: string
          loading_sequence: number[] | null
          special_instructions: string | null
          temperature_requirements: string | null
          vehicle_id: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          cold_zone_items?: string[] | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          event_id: string
          hot_zone_items?: string[] | null
          id?: string
          loading_sequence?: number[] | null
          special_instructions?: string | null
          temperature_requirements?: string | null
          vehicle_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          cold_zone_items?: string[] | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          event_id?: string
          hot_zone_items?: string[] | null
          id?: string
          loading_sequence?: number[] | null
          special_instructions?: string | null
          temperature_requirements?: string | null
          vehicle_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "load_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_plans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_plans_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loadoff_verifications: {
        Row: {
          company_id: string
          created_at: string | null
          driver_id: string | null
          event_id: string
          id: string
          items_damaged: string[] | null
          items_missing: string[] | null
          manifest_verified: boolean | null
          notes: string | null
          signature_collected: boolean | null
          signature_image_url: string | null
          unloading_sequence_followed: boolean | null
          venue_arrival_time: string
          venue_contact_name: string | null
          venue_contact_phone: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          driver_id?: string | null
          event_id: string
          id?: string
          items_damaged?: string[] | null
          items_missing?: string[] | null
          manifest_verified?: boolean | null
          notes?: string | null
          signature_collected?: boolean | null
          signature_image_url?: string | null
          unloading_sequence_followed?: boolean | null
          venue_arrival_time: string
          venue_contact_name?: string | null
          venue_contact_phone?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          driver_id?: string | null
          event_id?: string
          id?: string
          items_damaged?: string[] | null
          items_missing?: string[] | null
          manifest_verified?: boolean | null
          notes?: string | null
          signature_collected?: boolean | null
          signature_image_url?: string | null
          unloading_sequence_followed?: boolean | null
          venue_arrival_time?: string
          venue_contact_name?: string | null
          venue_contact_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loadoff_verifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loadoff_verifications_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loadoff_verifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean | null
          base_cost: number | null
          category: string | null
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          prep_time_minutes: number | null
          profit_margin: number | null
          selling_price: number | null
          serves: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          base_cost?: number | null
          category?: string | null
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          prep_time_minutes?: number | null
          profit_margin?: number | null
          selling_price?: number | null
          serves?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          base_cost?: number | null
          category?: string | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          prep_time_minutes?: number | null
          profit_margin?: number | null
          selling_price?: number | null
          serves?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          metadata: Json | null
          notification_type: string
          priority: string | null
          read_at: string | null
          recipient_id: string
          target_role: Database["public"]["Enums"]["user_role"] | null
          title: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          metadata?: Json | null
          notification_type: string
          priority?: string | null
          read_at?: string | null
          recipient_id: string
          target_role?: Database["public"]["Enums"]["user_role"] | null
          title: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          priority?: string | null
          read_at?: string | null
          recipient_id?: string
          target_role?: Database["public"]["Enums"]["user_role"] | null
          title?: string
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
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          checklist: Json | null
          created_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          checklist?: Json | null
          created_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          checklist?: Json | null
          created_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      order_reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          order_id: string
          rating: number
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          order_id: string
          rating: number
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          order_id?: string
          rating?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
          client_email: string | null
          client_id: string | null
          client_name: string
          client_phone: string | null
          collection_time: string | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          delivery_distance_km: number | null
          delivery_duration_minutes: number | null
          delivery_rate_per_km: number | null
          delivery_route_optimized: boolean | null
          delivery_status: string | null
          delivery_time: string | null
          delivery_total_fee: number | null
          deposit_amount: number | null
          deposit_paid: boolean | null
          deposit_paid_at: string | null
          equipment_items: Json | null
          equipment_return_method: string | null
          event_date: string
          event_time: string | null
          final_guest_count: number | null
          final_order_confirmed_at: string | null
          guest_count: number
          id: string
          internal_notes: string | null
          last_change_allowed_date: string | null
          menu_items: Json | null
          order_number: string
          payment_gateway: string | null
          payment_reference: string | null
          payment_status: string | null
          pickup_time: string | null
          quote_id: string | null
          region_id: string | null
          requires_waiter: boolean | null
          special_instructions: string | null
          status: string | null
          subtotal: number | null
          tax: number | null
          total: number
          updated_at: string | null
          user_id: string
          venue_address: string | null
          venue_lat: number | null
          venue_lng: number | null
          waiter_duration_hours: number | null
          waiter_hourly_rate: number | null
          waiter_service_required: boolean | null
          waiter_total_fee: number | null
          whatsapp_notifications_sent: Json | null
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
          client_email?: string | null
          client_id?: string | null
          client_name: string
          client_phone?: string | null
          collection_time?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_distance_km?: number | null
          delivery_duration_minutes?: number | null
          delivery_rate_per_km?: number | null
          delivery_route_optimized?: boolean | null
          delivery_status?: string | null
          delivery_time?: string | null
          delivery_total_fee?: number | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          equipment_items?: Json | null
          equipment_return_method?: string | null
          event_date: string
          event_time?: string | null
          final_guest_count?: number | null
          final_order_confirmed_at?: string | null
          guest_count: number
          id?: string
          internal_notes?: string | null
          last_change_allowed_date?: string | null
          menu_items?: Json | null
          order_number: string
          payment_gateway?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          pickup_time?: string | null
          quote_id?: string | null
          region_id?: string | null
          requires_waiter?: boolean | null
          special_instructions?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          total: number
          updated_at?: string | null
          user_id: string
          venue_address?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          waiter_duration_hours?: number | null
          waiter_hourly_rate?: number | null
          waiter_service_required?: boolean | null
          waiter_total_fee?: number | null
          whatsapp_notifications_sent?: Json | null
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
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          client_phone?: string | null
          collection_time?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_distance_km?: number | null
          delivery_duration_minutes?: number | null
          delivery_rate_per_km?: number | null
          delivery_route_optimized?: boolean | null
          delivery_status?: string | null
          delivery_time?: string | null
          delivery_total_fee?: number | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          equipment_items?: Json | null
          equipment_return_method?: string | null
          event_date?: string
          event_time?: string | null
          final_guest_count?: number | null
          final_order_confirmed_at?: string | null
          guest_count?: number
          id?: string
          internal_notes?: string | null
          last_change_allowed_date?: string | null
          menu_items?: Json | null
          order_number?: string
          payment_gateway?: string | null
          payment_reference?: string | null
          payment_status?: string | null
          pickup_time?: string | null
          quote_id?: string | null
          region_id?: string | null
          requires_waiter?: boolean | null
          special_instructions?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number
          updated_at?: string | null
          user_id?: string
          venue_address?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          waiter_duration_hours?: number | null
          waiter_hourly_rate?: number | null
          waiter_service_required?: boolean | null
          waiter_total_fee?: number | null
          whatsapp_notifications_sent?: Json | null
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
            referencedRelation: "profiles"
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
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
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
      overtime_logs: {
        Row: {
          approved: boolean | null
          approved_by: string | null
          company_id: string
          cost: number | null
          created_at: string | null
          date: string
          id: string
          overtime_hours: number
          reason: string | null
          regular_hours: number | null
          user_id: string
        }
        Insert: {
          approved?: boolean | null
          approved_by?: string | null
          company_id: string
          cost?: number | null
          created_at?: string | null
          date: string
          id?: string
          overtime_hours: number
          reason?: string | null
          regular_hours?: number | null
          user_id: string
        }
        Update: {
          approved?: boolean | null
          approved_by?: string | null
          company_id?: string
          cost?: number | null
          created_at?: string | null
          date?: string
          id?: string
          overtime_hours?: number
          reason?: string | null
          regular_hours?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_logs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pat_testing: {
        Row: {
          certificate_number: string | null
          company_id: string
          created_at: string | null
          equipment_id: string | null
          equipment_name: string
          id: string
          next_test_date: string
          notes: string | null
          test_date: string
          test_result: string | null
          tester_name: string | null
        }
        Insert: {
          certificate_number?: string | null
          company_id: string
          created_at?: string | null
          equipment_id?: string | null
          equipment_name: string
          id?: string
          next_test_date: string
          notes?: string | null
          test_date: string
          test_result?: string | null
          tester_name?: string | null
        }
        Update: {
          certificate_number?: string | null
          company_id?: string
          created_at?: string | null
          equipment_id?: string | null
          equipment_name?: string
          id?: string
          next_test_date?: string
          notes?: string | null
          test_date?: string
          test_result?: string | null
          tester_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pat_testing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pat_testing_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateways: {
        Row: {
          config: Json | null
          created_at: string | null
          credentials: Json | null
          gateway_name: string
          gateway_type: string
          id: string
          is_active: boolean | null
          is_test_mode: boolean | null
          supported_currencies: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          credentials?: Json | null
          gateway_name: string
          gateway_type: string
          id?: string
          is_active?: boolean | null
          is_test_mode?: boolean | null
          supported_currencies?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          credentials?: Json | null
          gateway_name?: string
          gateway_type?: string
          id?: string
          is_active?: boolean | null
          is_test_mode?: boolean | null
          supported_currencies?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_reminders: {
        Row: {
          created_at: string | null
          days_before_due: number | null
          id: string
          is_urgent: boolean | null
          order_id: string
          reminder_date: string
          reminder_type: string
          sent: boolean | null
          sent_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          days_before_due?: number | null
          id?: string
          is_urgent?: boolean | null
          order_id: string
          reminder_date: string
          reminder_type: string
          sent?: boolean | null
          sent_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          days_before_due?: number | null
          id?: string
          is_urgent?: boolean | null
          order_id?: string
          reminder_date?: string
          reminder_type?: string
          sent?: boolean | null
          sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_schedules: {
        Row: {
          balance_amount: number
          balance_due_date: string
          balance_paid: boolean | null
          balance_paid_at: string | null
          balance_transaction_id: string | null
          created_at: string | null
          currency: string
          deposit_amount: number
          deposit_paid: boolean | null
          deposit_paid_at: string | null
          deposit_percentage: number
          deposit_transaction_id: string | null
          event_date: string
          final_order_change_date: string
          id: string
          order_id: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          balance_amount: number
          balance_due_date: string
          balance_paid?: boolean | null
          balance_paid_at?: string | null
          balance_transaction_id?: string | null
          created_at?: string | null
          currency: string
          deposit_amount: number
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_percentage: number
          deposit_transaction_id?: string | null
          event_date: string
          final_order_change_date: string
          id?: string
          order_id: string
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          balance_amount?: number
          balance_due_date?: string
          balance_paid?: boolean | null
          balance_paid_at?: string | null
          balance_transaction_id?: string | null
          created_at?: string | null
          currency?: string
          deposit_amount?: number
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_percentage?: number
          deposit_transaction_id?: string | null
          event_date?: string
          final_order_change_date?: string
          id?: string
          order_id?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_schedules_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          gateway: string | null
          gateway_reference: string | null
          id: string
          metadata: Json | null
          order_id: string | null
          payment_method: string | null
          payment_type: string
          processed_at: string | null
          status: string | null
          subscription_id: string | null
          transaction_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          gateway?: string | null
          gateway_reference?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          payment_method?: string | null
          payment_type: string
          processed_at?: string | null
          status?: string | null
          subscription_id?: string | null
          transaction_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          gateway?: string | null
          gateway_reference?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          payment_method?: string | null
          payment_type?: string
          processed_at?: string | null
          status?: string | null
          subscription_id?: string | null
          transaction_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          accuracy_score: number | null
          areas_for_improvement: string | null
          attendance_score: number | null
          bonus_amount: number | null
          bonus_eligible: boolean | null
          created_at: string | null
          goals_for_next_period: string | null
          id: string
          next_review_date: string | null
          overall_score: number | null
          review_date: string
          review_period_end: string
          review_period_start: string
          reviewer_id: string | null
          speed_score: number | null
          status: string | null
          strengths: string | null
          teamwork_score: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accuracy_score?: number | null
          areas_for_improvement?: string | null
          attendance_score?: number | null
          bonus_amount?: number | null
          bonus_eligible?: boolean | null
          created_at?: string | null
          goals_for_next_period?: string | null
          id?: string
          next_review_date?: string | null
          overall_score?: number | null
          review_date: string
          review_period_end: string
          review_period_start: string
          reviewer_id?: string | null
          speed_score?: number | null
          status?: string | null
          strengths?: string | null
          teamwork_score?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accuracy_score?: number | null
          areas_for_improvement?: string | null
          attendance_score?: number | null
          bonus_amount?: number | null
          bonus_eligible?: boolean | null
          created_at?: string | null
          goals_for_next_period?: string | null
          id?: string
          next_review_date?: string | null
          overall_score?: number | null
          review_date?: string
          review_period_end?: string
          review_period_start?: string
          reviewer_id?: string | null
          speed_score?: number | null
          status?: string | null
          strengths?: string | null
          teamwork_score?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pest_control_logs: {
        Row: {
          activity_detected: boolean | null
          areas_inspected: string[] | null
          certificate_number: string | null
          company_id: string
          company_name: string | null
          created_at: string | null
          findings: string | null
          follow_up_required: boolean | null
          id: string
          inspection_date: string
          inspector_name: string | null
          next_inspection_date: string
          report_url: string | null
          treatment_applied: boolean | null
          treatment_details: string | null
        }
        Insert: {
          activity_detected?: boolean | null
          areas_inspected?: string[] | null
          certificate_number?: string | null
          company_id: string
          company_name?: string | null
          created_at?: string | null
          findings?: string | null
          follow_up_required?: boolean | null
          id?: string
          inspection_date: string
          inspector_name?: string | null
          next_inspection_date: string
          report_url?: string | null
          treatment_applied?: boolean | null
          treatment_details?: string | null
        }
        Update: {
          activity_detected?: boolean | null
          areas_inspected?: string[] | null
          certificate_number?: string | null
          company_id?: string
          company_name?: string | null
          created_at?: string | null
          findings?: string | null
          follow_up_required?: boolean | null
          id?: string
          inspection_date?: string
          inspector_name?: string | null
          next_inspection_date?: string
          report_url?: string | null
          treatment_applied?: boolean | null
          treatment_details?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pest_control_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      portion_controls: {
        Row: {
          active: boolean | null
          company_id: string
          cost_per_portion: number | null
          created_at: string | null
          id: string
          item_name: string
          recipe_id: string | null
          serving_tool: string | null
          standard_portion_grams: number
          tolerance_grams: number | null
          updated_at: string | null
          visual_guide_url: string | null
        }
        Insert: {
          active?: boolean | null
          company_id: string
          cost_per_portion?: number | null
          created_at?: string | null
          id?: string
          item_name: string
          recipe_id?: string | null
          serving_tool?: string | null
          standard_portion_grams: number
          tolerance_grams?: number | null
          updated_at?: string | null
          visual_guide_url?: string | null
        }
        Update: {
          active?: boolean | null
          company_id?: string
          cost_per_portion?: number | null
          created_at?: string | null
          id?: string
          item_name?: string
          recipe_id?: string | null
          serving_tool?: string | null
          standard_portion_grams?: number
          tolerance_grams?: number | null
          updated_at?: string | null
          visual_guide_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portion_controls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portion_controls_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      price_changes: {
        Row: {
          affected_subscriptions_count: number | null
          announced_date: string | null
          change_reason: string
          created_at: string | null
          currency: string
          effective_date: string
          exchange_rate_info: string | null
          id: string
          new_amount: number
          notifications_sent: boolean | null
          old_amount: number
          plan_id: string
        }
        Insert: {
          affected_subscriptions_count?: number | null
          announced_date?: string | null
          change_reason: string
          created_at?: string | null
          currency?: string
          effective_date: string
          exchange_rate_info?: string | null
          id?: string
          new_amount: number
          notifications_sent?: boolean | null
          old_amount: number
          plan_id: string
        }
        Update: {
          affected_subscriptions_count?: number | null
          announced_date?: string | null
          change_reason?: string
          created_at?: string | null
          currency?: string
          effective_date?: string
          exchange_rate_info?: string | null
          id?: string
          new_amount?: number
          notifications_sent?: boolean | null
          old_amount?: number
          plan_id?: string
        }
        Relationships: []
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
          drive_time_to_kitchen_minutes: number | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          phone_number: string | null
          region: string | null
          role: string | null
          subscription_plan: string | null
          subscription_status: string | null
          trial_ends_at: string | null
          updated_at: string | null
          vehicle_details: string | null
        }
        Insert: {
          active_role?: string | null
          avatar_url?: string | null
          company_id?: string | null
          company_name?: string | null
          company_slug?: string | null
          created_at?: string | null
          currency?: string | null
          drive_time_to_kitchen_minutes?: number | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          phone?: string | null
          phone_number?: string | null
          region?: string | null
          role?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          vehicle_details?: string | null
        }
        Update: {
          active_role?: string | null
          avatar_url?: string | null
          company_id?: string | null
          company_name?: string | null
          company_slug?: string | null
          created_at?: string | null
          currency?: string | null
          drive_time_to_kitchen_minutes?: number | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          phone_number?: string | null
          region?: string | null
          role?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          vehicle_details?: string | null
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
          currency: string | null
          id: string
          items: Json | null
          notes: string | null
          payment_method: string | null
          purchase_date: string
          receipt_data: Json | null
          receipt_image_url: string | null
          region_id: string | null
          shopping_list_id: string | null
          supplier: string
          total_amount: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          payment_method?: string | null
          purchase_date: string
          receipt_data?: Json | null
          receipt_image_url?: string | null
          region_id?: string | null
          shopping_list_id?: string | null
          supplier: string
          total_amount: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          payment_method?: string | null
          purchase_date?: string
          receipt_data?: Json | null
          receipt_image_url?: string | null
          region_id?: string | null
          shopping_list_id?: string | null
          supplier?: string
          total_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_history_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_history_shopping_list_id_fkey"
            columns: ["shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          equipment_items: Json | null
          event_date: string
          event_time: string | null
          guest_count: number
          id: string
          lead_id: string | null
          menu_items: Json | null
          notes: string | null
          quote_number: string
          region_id: string | null
          sent_at: string | null
          status: string | null
          subtotal: number | null
          tax: number | null
          terms: string | null
          total: number
          updated_at: string | null
          user_id: string
          valid_until: string | null
          venue_address: string | null
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          equipment_items?: Json | null
          event_date: string
          event_time?: string | null
          guest_count: number
          id?: string
          lead_id?: string | null
          menu_items?: Json | null
          notes?: string | null
          quote_number: string
          region_id?: string | null
          sent_at?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          terms?: string | null
          total: number
          updated_at?: string | null
          user_id: string
          valid_until?: string | null
          venue_address?: string | null
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          equipment_items?: Json | null
          event_date?: string
          event_time?: string | null
          guest_count?: number
          id?: string
          lead_id?: string | null
          menu_items?: Json | null
          notes?: string | null
          quote_number?: string
          region_id?: string | null
          sent_at?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          terms?: string | null
          total?: number
          updated_at?: string | null
          user_id?: string
          valid_until?: string | null
          venue_address?: string | null
          viewed_at?: string | null
        }
        Relationships: [
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
            foreignKeyName: "quotes_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
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
          allergen_id: string
          created_at: string | null
          id: string
          notes: string | null
          recipe_id: string
        }
        Insert: {
          allergen_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          recipe_id: string
        }
        Update: {
          allergen_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_allergens_allergen_id_fkey"
            columns: ["allergen_id"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_allergens_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          cost_per_unit: number | null
          created_at: string | null
          id: string
          ingredient_name: string
          notes: string | null
          quantity: number
          recipe_id: string
          unit: string
        }
        Insert: {
          cost_per_unit?: number | null
          created_at?: string | null
          id?: string
          ingredient_name: string
          notes?: string | null
          quantity: number
          recipe_id: string
          unit: string
        }
        Update: {
          cost_per_unit?: number | null
          created_at?: string | null
          id?: string
          ingredient_name?: string
          notes?: string | null
          quantity?: number
          recipe_id?: string
          unit?: string
        }
        Relationships: [
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
          created_at: string | null
          id: string
          ingredient_adjustments: Json
          new_guest_count: number
          order_id: string
          original_guest_count: number
          scaling_factor: number
        }
        Insert: {
          adjusted_by_user_id?: string | null
          created_at?: string | null
          id?: string
          ingredient_adjustments: Json
          new_guest_count: number
          order_id: string
          original_guest_count: number
          scaling_factor: number
        }
        Update: {
          adjusted_by_user_id?: string | null
          created_at?: string | null
          id?: string
          ingredient_adjustments?: Json
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
          active: boolean | null
          batch_size: number | null
          company_id: string
          cook_time_minutes: number | null
          cooking_steps: Json | null
          created_at: string | null
          created_by: string | null
          holding_temp_celsius: number | null
          id: string
          locked: boolean | null
          menu_item_id: string | null
          name: string
          plating_notes: string | null
          prep_steps: Json | null
          shelf_life_hours: number | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          active?: boolean | null
          batch_size?: number | null
          company_id: string
          cook_time_minutes?: number | null
          cooking_steps?: Json | null
          created_at?: string | null
          created_by?: string | null
          holding_temp_celsius?: number | null
          id?: string
          locked?: boolean | null
          menu_item_id?: string | null
          name: string
          plating_notes?: string | null
          prep_steps?: Json | null
          shelf_life_hours?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          active?: boolean | null
          batch_size?: number | null
          company_id?: string
          cook_time_minutes?: number | null
          cooking_steps?: Json | null
          created_at?: string | null
          created_by?: string | null
          holding_temp_celsius?: number | null
          id?: string
          locked?: boolean | null
          menu_item_id?: string | null
          name?: string
          plating_notes?: string | null
          prep_steps?: Json | null
          shelf_life_hours?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          name: string
          phone: string | null
          province: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          name: string
          phone?: string | null
          province?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          name?: string
          phone?: string | null
          province?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_incentives: {
        Row: {
          amount: number | null
          company_id: string
          created_at: string | null
          criteria_details: string | null
          criteria_met: boolean | null
          id: string
          incentive_type: string
          notes: string | null
          paid_date: string | null
          period_end: string
          period_start: string
          status: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          company_id: string
          created_at?: string | null
          criteria_details?: string | null
          criteria_met?: boolean | null
          id?: string
          incentive_type: string
          notes?: string | null
          paid_date?: string | null
          period_end: string
          period_start: string
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          company_id?: string
          created_at?: string | null
          criteria_details?: string | null
          criteria_met?: boolean | null
          id?: string
          incentive_type?: string
          notes?: string | null
          paid_date?: string | null
          period_end?: string
          period_start?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_incentives_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_incentives_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      return_load_tracking: {
        Row: {
          arrival_time: string | null
          company_id: string
          created_at: string | null
          departure_time: string
          driver_id: string | null
          event_id: string
          id: string
          items_damaged: string[] | null
          items_expected: string[] | null
          items_missing: string[] | null
          items_returned: string[] | null
          notes: string | null
          scan_verification_complete: boolean | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          arrival_time?: string | null
          company_id: string
          created_at?: string | null
          departure_time: string
          driver_id?: string | null
          event_id: string
          id?: string
          items_damaged?: string[] | null
          items_expected?: string[] | null
          items_missing?: string[] | null
          items_returned?: string[] | null
          notes?: string | null
          scan_verification_complete?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          arrival_time?: string | null
          company_id?: string
          created_at?: string | null
          departure_time?: string
          driver_id?: string | null
          event_id?: string
          id?: string
          items_damaged?: string[] | null
          items_expected?: string[] | null
          items_missing?: string[] | null
          items_returned?: string[] | null
          notes?: string | null
          scan_verification_complete?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_load_tracking_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_load_tracking_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_load_tracking_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_load_tracking_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_checks: {
        Row: {
          actions_required: string | null
          certification_number: string | null
          check_date: string
          check_type: string
          company_id: string
          created_at: string | null
          created_by: string | null
          expiry_date: string | null
          id: string
          inspector_name: string | null
          issues_found: string | null
          next_check_due: string | null
          passed: boolean
        }
        Insert: {
          actions_required?: string | null
          certification_number?: string | null
          check_date: string
          check_type: string
          company_id: string
          created_at?: string | null
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          inspector_name?: string | null
          issues_found?: string | null
          next_check_due?: string | null
          passed: boolean
        }
        Update: {
          actions_required?: string | null
          certification_number?: string | null
          check_date?: string
          check_type?: string
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          inspector_name?: string | null
          issues_found?: string | null
          next_check_due?: string | null
          passed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "safety_checks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_checks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_equipment: {
        Row: {
          company_id: string
          created_at: string | null
          equipment_type: string
          expiry_date: string | null
          id: string
          installation_date: string | null
          last_inspection_date: string | null
          location: string
          next_inspection_date: string
          notes: string | null
          serial_number: string | null
          status: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          equipment_type: string
          expiry_date?: string | null
          id?: string
          installation_date?: string | null
          last_inspection_date?: string | null
          location: string
          next_inspection_date: string
          notes?: string | null
          serial_number?: string | null
          status?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          equipment_type?: string
          expiry_date?: string | null
          id?: string
          installation_date?: string | null
          last_inspection_date?: string | null
          location?: string
          next_inspection_date?: string
          notes?: string | null
          serial_number?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_equipment_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_list_items: {
        Row: {
          actual_cost: number | null
          created_at: string | null
          estimated_cost: number | null
          id: string
          inventory_id: string | null
          item_name: string
          notes: string | null
          purchased: boolean | null
          purchased_at: string | null
          quantity: number
          shopping_list_id: string
          supplier: string | null
          unit: string
          updated_at: string | null
        }
        Insert: {
          actual_cost?: number | null
          created_at?: string | null
          estimated_cost?: number | null
          id?: string
          inventory_id?: string | null
          item_name: string
          notes?: string | null
          purchased?: boolean | null
          purchased_at?: string | null
          quantity: number
          shopping_list_id: string
          supplier?: string | null
          unit: string
          updated_at?: string | null
        }
        Update: {
          actual_cost?: number | null
          created_at?: string | null
          estimated_cost?: number | null
          id?: string
          inventory_id?: string | null
          item_name?: string
          notes?: string | null
          purchased?: boolean | null
          purchased_at?: string | null
          quantity?: number
          shopping_list_id?: string
          supplier?: string | null
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_shopping_list_id_fkey"
            columns: ["shopping_list_id"]
            isOneToOne: false
            referencedRelation: "shopping_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_lists: {
        Row: {
          assigned_to: string | null
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          list_date: string
          notes: string | null
          order_id: string | null
          region_id: string | null
          status: string | null
          total_actual_cost: number | null
          total_estimated_cost: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          list_date: string
          notes?: string | null
          order_id?: string | null
          region_id?: string | null
          status?: string | null
          total_actual_cost?: number | null
          total_estimated_cost?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          list_date?: string
          notes?: string | null
          order_id?: string | null
          region_id?: string | null
          status?: string | null
          total_actual_cost?: number | null
          total_estimated_cost?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_lists_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_lists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_lists_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_lists_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_lists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invitation_token: string
          invited_by: string | null
          role: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invitation_token: string
          invited_by?: string | null
          role: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invitation_token?: string
          invited_by?: string | null
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_payment_ledger: {
        Row: {
          created_at: string | null
          currency: string
          hourly_rate: number
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          payment_period_end: string
          payment_period_start: string
          payment_reference: string | null
          staff_id: string
          total_amount: number
          total_hours: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          currency?: string
          hourly_rate: number
          id?: string
          notes?: string | null
          payment_date: string
          payment_method: string
          payment_period_end: string
          payment_period_start: string
          payment_reference?: string | null
          staff_id: string
          total_amount: number
          total_hours: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          currency?: string
          hourly_rate?: number
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          payment_period_end?: string
          payment_period_start?: string
          payment_reference?: string | null
          staff_id?: string
          total_amount?: number
          total_hours?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_payment_ledger_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_payment_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_skills_matrix: {
        Row: {
          assessed_by: string | null
          certified: boolean | null
          created_at: string | null
          department: string
          id: string
          last_assessed_date: string | null
          notes: string | null
          proficiency_level: string
          skill_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assessed_by?: string | null
          certified?: boolean | null
          created_at?: string | null
          department: string
          id?: string
          last_assessed_date?: string | null
          notes?: string | null
          proficiency_level: string
          skill_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assessed_by?: string | null
          certified?: boolean | null
          created_at?: string | null
          department?: string
          id?: string
          last_assessed_date?: string | null
          notes?: string | null
          proficiency_level?: string
          skill_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_skills_matrix_assessed_by_fkey"
            columns: ["assessed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_skills_matrix_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_training_records: {
        Row: {
          certificate_issued: boolean | null
          completed_at: string | null
          created_at: string | null
          expiry_date: string | null
          id: string
          notes: string | null
          passed: boolean | null
          score: number | null
          started_at: string | null
          training_material_id: string
          user_id: string
        }
        Insert: {
          certificate_issued?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          passed?: boolean | null
          score?: number | null
          started_at?: string | null
          training_material_id: string
          user_id: string
        }
        Update: {
          certificate_issued?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          passed?: boolean | null
          score?: number | null
          started_at?: string | null
          training_material_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_training_records_training_material_id_fkey"
            columns: ["training_material_id"]
            isOneToOne: false
            referencedRelation: "training_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_training_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_transport: {
        Row: {
          company_id: string
          cost: number | null
          created_at: string | null
          driver_notes: string | null
          dropoff_time: string | null
          event_date: string
          event_location: string | null
          id: string
          pickup_location: string | null
          pickup_time: string
          status: string | null
          transport_type: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          cost?: number | null
          created_at?: string | null
          driver_notes?: string | null
          dropoff_time?: string | null
          event_date: string
          event_location?: string | null
          id?: string
          pickup_location?: string | null
          pickup_time: string
          status?: string | null
          transport_type?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          cost?: number | null
          created_at?: string | null
          driver_notes?: string | null
          dropoff_time?: string | null
          event_date?: string
          event_location?: string | null
          id?: string
          pickup_location?: string | null
          pickup_time?: string
          status?: string | null
          transport_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_transport_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_transport_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_work_sessions: {
        Row: {
          clock_in_time: string
          clock_out_time: string | null
          created_at: string | null
          hourly_rate: number | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_status: string
          staff_id: string
          total_earnings: number | null
          total_hours: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          clock_in_time: string
          clock_out_time?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_status?: string
          staff_id: string
          total_earnings?: number | null
          total_hours?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          clock_in_time?: string
          clock_out_time?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_status?: string
          staff_id?: string
          total_earnings?: number | null
          total_hours?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_work_sessions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_work_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_locations: {
        Row: {
          active: boolean | null
          capacity_liters: number | null
          company_id: string
          created_at: string | null
          current_usage_liters: number | null
          id: string
          location_notes: string | null
          max_temp_celsius: number | null
          min_temp_celsius: number | null
          name: string
          type: string
        }
        Insert: {
          active?: boolean | null
          capacity_liters?: number | null
          company_id: string
          created_at?: string | null
          current_usage_liters?: number | null
          id?: string
          location_notes?: string | null
          max_temp_celsius?: number | null
          min_temp_celsius?: number | null
          name: string
          type: string
        }
        Update: {
          active?: boolean | null
          capacity_liters?: number | null
          company_id?: string
          created_at?: string | null
          current_usage_liters?: number | null
          id?: string
          location_notes?: string | null
          max_temp_celsius?: number | null
          min_temp_celsius?: number | null
          name?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_racks: {
        Row: {
          company_id: string
          created_at: string | null
          current_contents: string | null
          id: string
          map_position_x: number | null
          map_position_y: number | null
          notes: string | null
          rack_number: string
          shelf_count: number | null
          temperature_controlled: boolean | null
          zone: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          current_contents?: string | null
          id?: string
          map_position_x?: number | null
          map_position_y?: number | null
          notes?: string | null
          rack_number: string
          shelf_count?: number | null
          temperature_controlled?: boolean | null
          zone: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          current_contents?: string | null
          id?: string
          map_position_x?: number | null
          map_position_y?: number | null
          notes?: string | null
          rack_number?: string
          shelf_count?: number | null
          temperature_controlled?: boolean | null
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_racks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
          created_at: string | null
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          new_amount: number | null
          next_billing_date: string | null
          orders_this_quarter: number | null
          payfast_subscription_id: string | null
          payfast_token: string | null
          payment_method_last4: string | null
          pending_price_change: boolean | null
          plan_id: string | null
          plan_name: string
          price_change_effective_date: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active_clients_count?: number | null
          amount: number
          billing_cycle: string
          cancel_at_period_end?: boolean | null
          cancellation_feedback?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          new_amount?: number | null
          next_billing_date?: string | null
          orders_this_quarter?: number | null
          payfast_subscription_id?: string | null
          payfast_token?: string | null
          payment_method_last4?: string | null
          pending_price_change?: boolean | null
          plan_id?: string | null
          plan_name: string
          price_change_effective_date?: string | null
          status?: string | null
          updated_at?: string | null
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
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          new_amount?: number | null
          next_billing_date?: string | null
          orders_this_quarter?: number | null
          payfast_subscription_id?: string | null
          payfast_token?: string | null
          payment_method_last4?: string | null
          pending_price_change?: boolean | null
          plan_id?: string | null
          plan_name?: string
          price_change_effective_date?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
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
          average_price: number | null
          created_at: string | null
          currency: string | null
          delivery_rating: number | null
          highest_price: number | null
          id: string
          inventory_id: string | null
          item_name: string
          last_purchased: string | null
          lowest_price: number | null
          notes: string | null
          purchase_count: number | null
          quality_rating: number | null
          supplier: string
          unit: string
          unit_price: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          average_price?: number | null
          created_at?: string | null
          currency?: string | null
          delivery_rating?: number | null
          highest_price?: number | null
          id?: string
          inventory_id?: string | null
          item_name: string
          last_purchased?: string | null
          lowest_price?: number | null
          notes?: string | null
          purchase_count?: number | null
          quality_rating?: number | null
          supplier: string
          unit: string
          unit_price: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          average_price?: number | null
          created_at?: string | null
          currency?: string | null
          delivery_rating?: number | null
          highest_price?: number | null
          id?: string
          inventory_id?: string | null
          item_name?: string
          last_purchased?: string | null
          lowest_price?: number | null
          notes?: string | null
          purchase_count?: number | null
          quality_rating?: number | null
          supplier?: string
          unit?: string
          unit_price?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_prices_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_prices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          active: boolean | null
          category: string | null
          created_at: string | null
          id: string
          last_price_update: string | null
          minimum_order_quantity: number | null
          price_per_unit: number
          product_name: string
          supplier_id: string
          traceability_cert: string | null
          unit: string
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          created_at?: string | null
          id?: string
          last_price_update?: string | null
          minimum_order_quantity?: number | null
          price_per_unit: number
          product_name: string
          supplier_id: string
          traceability_cert?: string | null
          unit: string
        }
        Update: {
          active?: boolean | null
          category?: string | null
          created_at?: string | null
          id?: string
          last_price_update?: string | null
          minimum_order_quantity?: number | null
          price_per_unit?: number
          product_name?: string
          supplier_id?: string
          traceability_cert?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean | null
          address: string | null
          category: string | null
          company_id: string
          contact_person: string | null
          created_at: string | null
          delivery_days: string | null
          email: string | null
          emergency_contact: boolean | null
          id: string
          lead_time_hours: number | null
          minimum_order: number | null
          name: string
          notes: string | null
          phone: string | null
          priority: number | null
          quality_score: number | null
          rating: number | null
          reliability_score: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          category?: string | null
          company_id: string
          contact_person?: string | null
          created_at?: string | null
          delivery_days?: string | null
          email?: string | null
          emergency_contact?: boolean | null
          id?: string
          lead_time_hours?: number | null
          minimum_order?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          priority?: number | null
          quality_score?: number | null
          rating?: number | null
          reliability_score?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          category?: string | null
          company_id?: string
          contact_person?: string | null
          created_at?: string | null
          delivery_days?: string | null
          email?: string | null
          emergency_contact?: boolean | null
          id?: string
          lead_time_hours?: number | null
          minimum_order?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          priority?: number | null
          quality_score?: number | null
          rating?: number | null
          reliability_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          message_id: string | null
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          message_id?: string | null
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          message_id?: string | null
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_ticket_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          attachments: Json | null
          created_at: string | null
          id: string
          is_from_staff: boolean | null
          is_internal: boolean | null
          message: string
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          attachments?: Json | null
          created_at?: string | null
          id?: string
          is_from_staff?: boolean | null
          is_internal?: boolean | null
          message: string
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          attachments?: Json | null
          created_at?: string | null
          id?: string
          is_from_staff?: boolean | null
          is_internal?: boolean | null
          message?: string
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          company_name: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          description: string
          id: string
          priority: string
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          subject: string
          ticket_number: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          company_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          description: string
          id?: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          ticket_number?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          company_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          description?: string
          id?: string
          priority?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          ticket_number?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
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
          company_id: string
          id: string
          notes: string | null
          recorded_at: string | null
          recorded_by: string | null
          recorded_temp_celsius: number
          storage_location_id: string | null
        }
        Insert: {
          alert_triggered?: boolean | null
          company_id: string
          id?: string
          notes?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          recorded_temp_celsius: number
          storage_location_id?: string | null
        }
        Update: {
          alert_triggered?: boolean | null
          company_id?: string
          id?: string
          notes?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          recorded_temp_celsius?: number
          storage_location_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "temperature_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temperature_logs_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temperature_logs_storage_location_id_fkey"
            columns: ["storage_location_id"]
            isOneToOne: false
            referencedRelation: "storage_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_clock_entries: {
        Row: {
          created_at: string | null
          entry_type: string
          id: string
          location_lat: number | null
          location_lng: number | null
          notes: string | null
          staff_id: string
          timestamp: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entry_type: string
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          staff_id: string
          timestamp?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          entry_type?: string
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          staff_id?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          category: string
          company_id: string
          content: string | null
          created_at: string | null
          created_by: string | null
          document_url: string | null
          estimated_duration_minutes: number | null
          id: string
          required_for_roles: string[] | null
          title: string
          updated_at: string | null
          version: number | null
          video_url: string | null
        }
        Insert: {
          active?: boolean | null
          category: string
          company_id: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          document_url?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          required_for_roles?: string[] | null
          title: string
          updated_at?: string | null
          version?: number | null
          video_url?: string | null
        }
        Update: {
          active?: boolean | null
          category?: string
          company_id?: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          document_url?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          required_for_roles?: string[] | null
          title?: string
          updated_at?: string | null
          version?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_expiry_notifications: {
        Row: {
          company_id: string
          created_at: string | null
          dashboard_seen: boolean | null
          dashboard_seen_at: string | null
          days_remaining: number
          email_sent: boolean | null
          email_sent_at: string | null
          id: string
          notification_method: string | null
          notification_type: string
          sent_at: string | null
          trial_ends_at: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          dashboard_seen?: boolean | null
          dashboard_seen_at?: string | null
          days_remaining: number
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          notification_method?: string | null
          notification_type: string
          sent_at?: string | null
          trial_ends_at: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          dashboard_seen?: boolean | null
          dashboard_seen_at?: string | null
          days_remaining?: number
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          notification_method?: string | null
          notification_type?: string
          sent_at?: string | null
          trial_ends_at?: string
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
      uniform_inventory: {
        Row: {
          company_id: string
          condition: string | null
          created_at: string | null
          id: string
          issue_date: string | null
          item_type: string
          last_cleaned: string | null
          laundry_schedule: string | null
          notes: string | null
          quantity: number
          replacement_due: boolean | null
          return_date: string | null
          size: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          condition?: string | null
          created_at?: string | null
          id?: string
          issue_date?: string | null
          item_type: string
          last_cleaned?: string | null
          laundry_schedule?: string | null
          notes?: string | null
          quantity?: number
          replacement_due?: boolean | null
          return_date?: string | null
          size: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          condition?: string | null
          created_at?: string | null
          id?: string
          issue_date?: string | null
          item_type?: string
          last_cleaned?: string | null
          laundry_schedule?: string | null
          notes?: string | null
          quantity?: number
          replacement_due?: boolean | null
          return_date?: string | null
          size?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uniform_inventory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uniform_inventory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_departments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          created_at: string | null
          department: string
          id: string
          is_primary: boolean | null
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          department: string
          id?: string
          is_primary?: boolean | null
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          department?: string
          id?: string
          is_primary?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_departments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_departments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      utensil_tracking: {
        Row: {
          checked_in_at: string | null
          checked_out_at: string | null
          checked_out_by: string | null
          company_id: string
          created_at: string | null
          event_id: string | null
          id: string
          location: string | null
          notes: string | null
          qr_code: string
          quantity: number | null
          status: string | null
          utensil_type: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          company_id: string
          created_at?: string | null
          event_id?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          qr_code: string
          quantity?: number | null
          status?: string | null
          utensil_type: string
        }
        Update: {
          checked_in_at?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          company_id?: string
          created_at?: string | null
          event_id?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          qr_code?: string
          quantity?: number | null
          status?: string | null
          utensil_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "utensil_tracking_checked_out_by_fkey"
            columns: ["checked_out_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utensil_tracking_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utensil_tracking_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_logs: {
        Row: {
          created_at: string | null
          id: string
          log_date: string
          log_type: string
          logged_by: string | null
          value_numeric: number | null
          value_text: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          log_date: string
          log_type: string
          logged_by?: string | null
          value_numeric?: number | null
          value_text?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          log_date?: string
          log_type?: string
          logged_by?: string | null
          value_numeric?: number | null
          value_text?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_maintenance: {
        Row: {
          cost: number | null
          created_at: string | null
          description: string | null
          id: string
          mileage_at_service: number | null
          next_service_due_date: string | null
          next_service_due_mileage: number | null
          provider: string | null
          service_date: string
          service_type: string
          vehicle_id: string
        }
        Insert: {
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          mileage_at_service?: number | null
          next_service_due_date?: string | null
          next_service_due_mileage?: number | null
          provider?: string | null
          service_date: string
          service_type: string
          vehicle_id: string
        }
        Update: {
          cost?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          mileage_at_service?: number | null
          next_service_due_date?: string | null
          next_service_due_mileage?: number | null
          provider?: string | null
          service_date?: string
          service_type?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          insurance_expiry_date: string | null
          insurance_policy_number: string | null
          insurance_provider: string | null
          license_plate: string | null
          make: string | null
          mileage: number | null
          model: string | null
          name: string
          purchase_date: string | null
          purchase_price: number | null
          status: string | null
          updated_at: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          insurance_expiry_date?: string | null
          insurance_policy_number?: string | null
          insurance_provider?: string | null
          license_plate?: string | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          name: string
          purchase_date?: string | null
          purchase_price?: number | null
          status?: string | null
          updated_at?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          insurance_expiry_date?: string | null
          insurance_policy_number?: string | null
          insurance_provider?: string | null
          license_plate?: string | null
          make?: string | null
          mileage?: number | null
          model?: string | null
          name?: string
          purchase_date?: string | null
          purchase_price?: number | null
          status?: string | null
          updated_at?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      waste_logs: {
        Row: {
          company_id: string
          cost_value: number | null
          created_at: string | null
          date: string
          id: string
          ingredient_name: string
          logged_by: string | null
          notes: string | null
          quantity: number
          reason: string
          unit: string
        }
        Insert: {
          company_id: string
          cost_value?: number | null
          created_at?: string | null
          date?: string
          id?: string
          ingredient_name: string
          logged_by?: string | null
          notes?: string | null
          quantity: number
          reason: string
          unit: string
        }
        Update: {
          company_id?: string
          cost_value?: number | null
          created_at?: string | null
          date?: string
          id?: string
          ingredient_name?: string
          logged_by?: string | null
          notes?: string | null
          quantity?: number
          reason?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "waste_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waste_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_enabled: boolean | null
          template_content: string
          template_key: string
          template_name: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          template_content: string
          template_key: string
          template_name: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          template_content?: string
          template_key?: string
          template_name?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_price_change: {
        Args: { p_subscription_id: string }
        Returns: undefined
      }
      check_trial_expiry_notifications: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      decrement_equipment_quantity: {
        Args: { p_equipment_id: string; p_quantity_to_decrement: number }
        Returns: undefined
      }
      generate_ticket_number: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_all_subscription_analytics: {
        Args: Record<PropertyKey, never>
        Returns: {
          active_subscriptions: number
          annual_revenue: number
          cancelled_subscriptions: number
          monthly_revenue: number
          total_revenue: number
          total_subscriptions: number
          trial_subscriptions: number
        }[]
      }
      get_all_subscriptions_admin: {
        Args: Record<PropertyKey, never>
        Returns: {
          amount: number
          billing_cycle: string
          cancelled_at: string
          created_at: string
          currency: string
          id: string
          plan_name: string
          status: string
          user_id: string
        }[]
      }
      get_company_trial_status: {
        Args: { p_company_id: string }
        Returns: {
          days_remaining: number
          is_in_trial: boolean
          last_notification_type: string
          notifications_sent: number
          subscription_status: string
          trial_ends_at: string
        }[]
      }
      get_order_total: {
        Args: { order_id: string }
        Returns: number
      }
      get_quarterly_usage: {
        Args: { p_user_id: string }
        Returns: {
          clients_count: number
          orders_count: number
        }[]
      }
    }
    Enums: {
      user_role:
        | "admin"
        | "kitchen"
        | "driver"
        | "client"
        | "cleaning"
        | "shopping"
        | "owner"
        | "super_admin"
        | "shopping_staff"
        | "cleaning_staff"
        | "kitchen_staff"
    }
    CompositeTypes: {
      [_ in never]: never
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
      user_role: [
        "admin",
        "kitchen",
        "driver",
        "client",
        "cleaning",
        "shopping",
        "owner",
        "super_admin",
        "shopping_staff",
        "cleaning_staff",
        "kitchen_staff",
      ],
    },
  },
} as const
