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
      api_key_rate_limits: {
        Row: {
          count: number
          key_hash: string
          window_start: string
        }
        Insert: {
          count?: number
          key_hash: string
          window_start: string
        }
        Update: {
          count?: number
          key_hash?: string
          window_start?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          scopes: string[] | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          revoked_at?: string | null
          scopes?: string[] | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          scopes?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      blocked_contacts: {
        Row: {
          blocked_at: string
          blocked_by: string | null
          company_id: string
          email_lower: string | null
          id: string
          phone: string | null
          reason: string | null
        }
        Insert: {
          blocked_at?: string
          blocked_by?: string | null
          company_id: string
          email_lower?: string | null
          id?: string
          phone?: string | null
          reason?: string | null
        }
        Update: {
          blocked_at?: string
          blocked_by?: string | null
          company_id?: string
          email_lower?: string | null
          id?: string
          phone?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      booking_packages: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_at: string | null
          id: string
          name: string
          notes: string | null
          primary_client_id: string | null
          starts_at: string | null
          status: string
          updated_at: string
          venue_summary: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          name: string
          notes?: string | null
          primary_client_id?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          venue_summary?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          primary_client_id?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
          venue_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_packages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_packages_primary_client_id_fkey"
            columns: ["primary_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_requests: {
        Row: {
          applied_at: string | null
          cancellation_type: string | null
          company_id: string | null
          created_at: string | null
          feedback: string | null
          id: string
          order_id: string | null
          policy_snapshot: Json | null
          reason: string | null
          refund_amount_approved: number | null
          refund_amount_calculated: number | null
          request_type: string | null
          requested_by_user_id: string | null
          requested_postpone_date: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          status: string | null
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          applied_at?: string | null
          cancellation_type?: string | null
          company_id?: string | null
          created_at?: string | null
          feedback?: string | null
          id?: string
          order_id?: string | null
          policy_snapshot?: Json | null
          reason?: string | null
          refund_amount_approved?: number | null
          refund_amount_calculated?: number | null
          request_type?: string | null
          requested_by_user_id?: string | null
          requested_postpone_date?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          applied_at?: string | null
          cancellation_type?: string | null
          company_id?: string | null
          created_at?: string | null
          feedback?: string | null
          id?: string
          order_id?: string | null
          policy_snapshot?: Json | null
          reason?: string | null
          refund_amount_approved?: number | null
          refund_amount_calculated?: number | null
          request_type?: string | null
          requested_by_user_id?: string | null
          requested_postpone_date?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string | null
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_requests_requested_by_user_id_fkey"
            columns: ["requested_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_requests_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          company_id: string
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          company_id: string
          created_at: string
          ended_at: string | null
          id: string
          started_at: string
          updated_at: string
          user_id: string
          user_role: string
        }
        Insert: {
          company_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          updated_at?: string
          user_id: string
          user_role: string
        }
        Update: {
          company_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          updated_at?: string
          user_id?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_duty_logs: {
        Row: {
          clock_in_accuracy_m: number | null
          clock_in_lat: number | null
          clock_in_lng: number | null
          company_id: string | null
          created_at: string | null
          duty_ended_at: string | null
          duty_started_at: string | null
          equipment_verified: boolean
          equipment_verified_at: string | null
          id: string
          on_duty: boolean | null
          user_id: string | null
          verification_notes: string | null
        }
        Insert: {
          clock_in_accuracy_m?: number | null
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          company_id?: string | null
          created_at?: string | null
          duty_ended_at?: string | null
          duty_started_at?: string | null
          equipment_verified?: boolean
          equipment_verified_at?: string | null
          id?: string
          on_duty?: boolean | null
          user_id?: string | null
          verification_notes?: string | null
        }
        Update: {
          clock_in_accuracy_m?: number | null
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          company_id?: string | null
          created_at?: string | null
          duty_ended_at?: string | null
          duty_started_at?: string | null
          equipment_verified?: boolean
          equipment_verified_at?: string | null
          id?: string
          on_duty?: boolean | null
          user_id?: string | null
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
      cleaning_event_checklists: {
        Row: {
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          items: Json
          kind: string
          order_id: string
          ready_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          items?: Json
          kind?: string
          order_id: string
          ready_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          items?: Json
          kind?: string
          order_id?: string
          ready_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_event_checklists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_event_checklists_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_event_handovers: {
        Row: {
          cancelled_at: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          expected_at: string | null
          id: string
          in_progress_at: string | null
          inspected_by_user_id: string | null
          notes: string | null
          order_id: string
          status: string
          total_items_damaged: number
          total_items_expected: number
          total_items_missing: number
          total_items_returned: number
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          expected_at?: string | null
          id?: string
          in_progress_at?: string | null
          inspected_by_user_id?: string | null
          notes?: string | null
          order_id: string
          status?: string
          total_items_damaged?: number
          total_items_expected?: number
          total_items_missing?: number
          total_items_returned?: number
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          expected_at?: string | null
          id?: string
          in_progress_at?: string | null
          inspected_by_user_id?: string | null
          notes?: string | null
          order_id?: string
          status?: string
          total_items_damaged?: number
          total_items_expected?: number
          total_items_missing?: number
          total_items_returned?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_event_handovers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_event_handovers_inspected_by_user_id_fkey"
            columns: ["inspected_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_event_handovers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_jobs: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          company_id: string
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          equipment_id: string
          event_handover_id: string | null
          id: string
          machine_id: string | null
          method: string
          notes: string | null
          planned_end: string
          planned_start: string
          quantity: number
          shift_task_id: string | null
          status: string
          triggered_by_event_id: string | null
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          company_id: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          equipment_id: string
          event_handover_id?: string | null
          id?: string
          machine_id?: string | null
          method: string
          notes?: string | null
          planned_end: string
          planned_start: string
          quantity?: number
          shift_task_id?: string | null
          status?: string
          triggered_by_event_id?: string | null
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          company_id?: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          equipment_id?: string
          event_handover_id?: string | null
          id?: string
          machine_id?: string | null
          method?: string
          notes?: string | null
          planned_end?: string
          planned_start?: string
          quantity?: number
          shift_task_id?: string | null
          status?: string
          triggered_by_event_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_jobs_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_jobs_event_handover_id_fkey"
            columns: ["event_handover_id"]
            isOneToOne: false
            referencedRelation: "cleaning_event_handovers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_jobs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "cleaning_machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_jobs_shift_task_id_fkey"
            columns: ["shift_task_id"]
            isOneToOne: false
            referencedRelation: "staff_shift_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_machines: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          created_by_user_id: string | null
          cycle_minutes: number
          deleted_at: string | null
          id: string
          items_per_cycle: number
          machine_type: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          created_by_user_id?: string | null
          cycle_minutes?: number
          deleted_at?: string | null
          id?: string
          items_per_cycle?: number
          machine_type?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          created_by_user_id?: string | null
          cycle_minutes?: number
          deleted_at?: string | null
          id?: string
          items_per_cycle?: number
          machine_type?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_machines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      client_access_log: {
        Row: {
          action: string
          company_id: string
          id: string
          ip: string | null
          order_id: string | null
          token_id: string | null
          user_agent: string | null
          viewed_at: string | null
        }
        Insert: {
          action?: string
          company_id: string
          id?: string
          ip?: string | null
          order_id?: string | null
          token_id?: string | null
          user_agent?: string | null
          viewed_at?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          id?: string
          ip?: string | null
          order_id?: string | null
          token_id?: string | null
          user_agent?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_access_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_log_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "client_access_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      client_access_tokens: {
        Row: {
          client_email: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          expires_at: string
          id: string
          label: string | null
          order_id: string | null
          revoked_at: string | null
          scope: string
          token_hash: string
          token_prefix: string
        }
        Insert: {
          client_email?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          expires_at: string
          id?: string
          label?: string | null
          order_id?: string | null
          revoked_at?: string | null
          scope?: string
          token_hash: string
          token_prefix: string
        }
        Update: {
          client_email?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          label?: string | null
          order_id?: string | null
          revoked_at?: string | null
          scope?: string
          token_hash?: string
          token_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_access_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_tokens_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          comms_paused_until: string | null
          company_id: string
          created_at: string | null
          credit_limit: number | null
          deleted_at: string | null
          email: string
          historical_last_event_date: string | null
          historical_last_event_type: string | null
          historical_lifetime_spend: number | null
          historical_notes: string | null
          historical_total_events: number | null
          id: string
          import_job_id: string | null
          imported_at: string | null
          imported_filename: string | null
          is_active: boolean | null
          landline_number: string | null
          mobile_number: string | null
          notes: string | null
          outstanding_balance: number | null
          payment_terms: number | null
          phone: string
          region_id: string
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
          comms_paused_until?: string | null
          company_id: string
          created_at?: string | null
          credit_limit?: number | null
          deleted_at?: string | null
          email: string
          historical_last_event_date?: string | null
          historical_last_event_type?: string | null
          historical_lifetime_spend?: number | null
          historical_notes?: string | null
          historical_total_events?: number | null
          id?: string
          import_job_id?: string | null
          imported_at?: string | null
          imported_filename?: string | null
          is_active?: boolean | null
          landline_number?: string | null
          mobile_number?: string | null
          notes?: string | null
          outstanding_balance?: number | null
          payment_terms?: number | null
          phone: string
          region_id: string
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
          comms_paused_until?: string | null
          company_id?: string
          created_at?: string | null
          credit_limit?: number | null
          deleted_at?: string | null
          email?: string
          historical_last_event_date?: string | null
          historical_last_event_type?: string | null
          historical_lifetime_spend?: number | null
          historical_notes?: string | null
          historical_total_events?: number | null
          id?: string
          import_job_id?: string | null
          imported_at?: string | null
          imported_filename?: string | null
          is_active?: boolean | null
          landline_number?: string | null
          mobile_number?: string | null
          notes?: string | null
          outstanding_balance?: number | null
          payment_terms?: number | null
          phone?: string
          region_id?: string
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
          {
            foreignKeyName: "clients_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_pages: {
        Row: {
          company_id: string | null
          content: string | null
          created_at: string | null
          header_image_alt: string | null
          header_image_url: string | null
          id: string
          is_published: boolean | null
          last_updated: string | null
          meta_description: string | null
          meta_keywords: string | null
          slug: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          header_image_alt?: string | null
          header_image_url?: string | null
          id?: string
          is_published?: boolean | null
          last_updated?: string | null
          meta_description?: string | null
          meta_keywords?: string | null
          slug?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          content?: string | null
          created_at?: string | null
          header_image_alt?: string | null
          header_image_url?: string | null
          id?: string
          is_published?: boolean | null
          last_updated?: string | null
          meta_description?: string | null
          meta_keywords?: string | null
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
          accent_color: string | null
          address_line1: string | null
          address_line2: string | null
          aftersales_max_months: number
          aftersales_skip_template_ids: string[]
          amendment_cutoff_days: number
          auto_followups_enabled: boolean
          auto_reply_to_embed_submissions: boolean
          balance_due_days: number
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_account_type: string | null
          bank_branch_code: string | null
          bank_name: string | null
          billing_currency: string | null
          cancellation_fee_percent: number
          cancellation_policy: Json
          cash_on_hand_cents: number
          cash_on_hand_stale_after_hours: number | null
          cash_on_hand_updated_at: string | null
          cash_on_hand_updated_by: string | null
          city: string | null
          cleaning_checklist_template: Json | null
          company_name: string
          country: string | null
          created_at: string | null
          currency: string | null
          custom_domain: string | null
          default_base_callout_fee: number | null
          default_distance_rate_per_km: number | null
          default_driver_hourly_rate: number | null
          deleted_at: string | null
          deposit_percent: number
          dispatch_settings: Json
          eft_instructions: string | null
          email: string
          embed_pricing_tiers: Json
          embed_token: string
          google_place_id: string | null
          headquarters_lat: number | null
          headquarters_lng: number | null
          id: string
          inventory_settings: Json
          is_active: boolean | null
          kitchen_prep_lead_hours: number | null
          kitchen_settings: Json
          legal_name: string | null
          logo_url: string | null
          notification_email: string | null
          notification_settings: Json | null
          onboarding_completed_at: string | null
          onboarding_dismissed_at: string | null
          owner_id: string | null
          payfast_subscription_token: string | null
          peak_season_end_month: number | null
          peak_season_start_month: number | null
          phone: string | null
          postal_code: string | null
          pricing_includes_vat: boolean
          primary_color: string | null
          refund_process_days: number
          registration_number: string | null
          secondary_color: string | null
          slug: string
          state_province: string | null
          stripe_customer_id: string | null
          subscription_ends_at: string | null
          subscription_plan: string | null
          subscription_starts_at: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          subscription_tier: string | null
          suspended_reason: string | null
          tax_number: string | null
          terms_and_conditions: string | null
          timezone: string | null
          trial_ends_at: string | null
          updated_at: string | null
          vat_number: string | null
          vat_rate: number
          vat_registered: boolean
          website: string | null
        }
        Insert: {
          accent_color?: string | null
          address_line1?: string | null
          address_line2?: string | null
          aftersales_max_months?: number
          aftersales_skip_template_ids?: string[]
          amendment_cutoff_days?: number
          auto_followups_enabled?: boolean
          auto_reply_to_embed_submissions?: boolean
          balance_due_days?: number
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_account_type?: string | null
          bank_branch_code?: string | null
          bank_name?: string | null
          billing_currency?: string | null
          cancellation_fee_percent?: number
          cancellation_policy?: Json
          cash_on_hand_cents?: number
          cash_on_hand_stale_after_hours?: number | null
          cash_on_hand_updated_at?: string | null
          cash_on_hand_updated_by?: string | null
          city?: string | null
          cleaning_checklist_template?: Json | null
          company_name: string
          country?: string | null
          created_at?: string | null
          currency?: string | null
          custom_domain?: string | null
          default_base_callout_fee?: number | null
          default_distance_rate_per_km?: number | null
          default_driver_hourly_rate?: number | null
          deleted_at?: string | null
          deposit_percent?: number
          dispatch_settings?: Json
          eft_instructions?: string | null
          email: string
          embed_pricing_tiers?: Json
          embed_token?: string
          google_place_id?: string | null
          headquarters_lat?: number | null
          headquarters_lng?: number | null
          id?: string
          inventory_settings?: Json
          is_active?: boolean | null
          kitchen_prep_lead_hours?: number | null
          kitchen_settings?: Json
          legal_name?: string | null
          logo_url?: string | null
          notification_email?: string | null
          notification_settings?: Json | null
          onboarding_completed_at?: string | null
          onboarding_dismissed_at?: string | null
          owner_id?: string | null
          payfast_subscription_token?: string | null
          peak_season_end_month?: number | null
          peak_season_start_month?: number | null
          phone?: string | null
          postal_code?: string | null
          pricing_includes_vat?: boolean
          primary_color?: string | null
          refund_process_days?: number
          registration_number?: string | null
          secondary_color?: string | null
          slug: string
          state_province?: string | null
          stripe_customer_id?: string | null
          subscription_ends_at?: string | null
          subscription_plan?: string | null
          subscription_starts_at?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          subscription_tier?: string | null
          suspended_reason?: string | null
          tax_number?: string | null
          terms_and_conditions?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          vat_number?: string | null
          vat_rate?: number
          vat_registered?: boolean
          website?: string | null
        }
        Update: {
          accent_color?: string | null
          address_line1?: string | null
          address_line2?: string | null
          aftersales_max_months?: number
          aftersales_skip_template_ids?: string[]
          amendment_cutoff_days?: number
          auto_followups_enabled?: boolean
          auto_reply_to_embed_submissions?: boolean
          balance_due_days?: number
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_account_type?: string | null
          bank_branch_code?: string | null
          bank_name?: string | null
          billing_currency?: string | null
          cancellation_fee_percent?: number
          cancellation_policy?: Json
          cash_on_hand_cents?: number
          cash_on_hand_stale_after_hours?: number | null
          cash_on_hand_updated_at?: string | null
          cash_on_hand_updated_by?: string | null
          city?: string | null
          cleaning_checklist_template?: Json | null
          company_name?: string
          country?: string | null
          created_at?: string | null
          currency?: string | null
          custom_domain?: string | null
          default_base_callout_fee?: number | null
          default_distance_rate_per_km?: number | null
          default_driver_hourly_rate?: number | null
          deleted_at?: string | null
          deposit_percent?: number
          dispatch_settings?: Json
          eft_instructions?: string | null
          email?: string
          embed_pricing_tiers?: Json
          embed_token?: string
          google_place_id?: string | null
          headquarters_lat?: number | null
          headquarters_lng?: number | null
          id?: string
          inventory_settings?: Json
          is_active?: boolean | null
          kitchen_prep_lead_hours?: number | null
          kitchen_settings?: Json
          legal_name?: string | null
          logo_url?: string | null
          notification_email?: string | null
          notification_settings?: Json | null
          onboarding_completed_at?: string | null
          onboarding_dismissed_at?: string | null
          owner_id?: string | null
          payfast_subscription_token?: string | null
          peak_season_end_month?: number | null
          peak_season_start_month?: number | null
          phone?: string | null
          postal_code?: string | null
          pricing_includes_vat?: boolean
          primary_color?: string | null
          refund_process_days?: number
          registration_number?: string | null
          secondary_color?: string | null
          slug?: string
          state_province?: string | null
          stripe_customer_id?: string | null
          subscription_ends_at?: string | null
          subscription_plan?: string | null
          subscription_starts_at?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          subscription_tier?: string | null
          suspended_reason?: string | null
          tax_number?: string | null
          terms_and_conditions?: string | null
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          vat_number?: string | null
          vat_rate?: number
          vat_registered?: boolean
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_cash_on_hand_updated_by_fkey"
            columns: ["cash_on_hand_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_number_settings: {
        Row: {
          company_id: string
          document_type: string
          effective_from: string
          include_year: boolean
          last_reset_year: number | null
          next_number: number
          notes: string | null
          padding: number
          prefix: string
          resets_yearly: boolean
          updated_at: string
          updated_by_user_id: string | null
          year_separator: string
        }
        Insert: {
          company_id: string
          document_type: string
          effective_from?: string
          include_year?: boolean
          last_reset_year?: number | null
          next_number?: number
          notes?: string | null
          padding?: number
          prefix?: string
          resets_yearly?: boolean
          updated_at?: string
          updated_by_user_id?: string | null
          year_separator?: string
        }
        Update: {
          company_id?: string
          document_type?: string
          effective_from?: string
          include_year?: boolean
          last_reset_year?: number | null
          next_number?: number
          notes?: string | null
          padding?: number
          prefix?: string
          resets_yearly?: boolean
          updated_at?: string
          updated_by_user_id?: string | null
          year_separator?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_number_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_number_settings_audit: {
        Row: {
          after: Json | null
          before: Json | null
          changed_at: string
          changed_by_user_id: string | null
          company_id: string
          document_type: string
          id: string
          reason: string | null
        }
        Insert: {
          after?: Json | null
          before?: Json | null
          changed_at?: string
          changed_by_user_id?: string | null
          company_id: string
          document_type: string
          id?: string
          reason?: string | null
        }
        Update: {
          after?: Json | null
          before?: Json | null
          changed_at?: string
          changed_by_user_id?: string | null
          company_id?: string
          document_type?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
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
          actual_arrival_time: string | null
          added_by_admin: boolean | null
          amount_spent: number | null
          arrival_time: string | null
          completion_time: string | null
          created_at: string | null
          departure_time: string | null
          driver_id: string | null
          estimated_arrival_time: string | null
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          order_id: string | null
          reason: string | null
          receipt_url: string | null
          route_id: string | null
          sequence_number: number | null
          status: string | null
          stop_address: string | null
          stop_lat: number | null
          stop_lng: number | null
          stop_name: string | null
          stop_type: string | null
        }
        Insert: {
          actual_arrival_time?: string | null
          added_by_admin?: boolean | null
          amount_spent?: number | null
          arrival_time?: string | null
          completion_time?: string | null
          created_at?: string | null
          departure_time?: string | null
          driver_id?: string | null
          estimated_arrival_time?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          order_id?: string | null
          reason?: string | null
          receipt_url?: string | null
          route_id?: string | null
          sequence_number?: number | null
          status?: string | null
          stop_address?: string | null
          stop_lat?: number | null
          stop_lng?: number | null
          stop_name?: string | null
          stop_type?: string | null
        }
        Update: {
          actual_arrival_time?: string | null
          added_by_admin?: boolean | null
          amount_spent?: number | null
          arrival_time?: string | null
          completion_time?: string | null
          created_at?: string | null
          departure_time?: string | null
          driver_id?: string | null
          estimated_arrival_time?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          order_id?: string | null
          reason?: string | null
          receipt_url?: string | null
          route_id?: string | null
          sequence_number?: number | null
          status?: string | null
          stop_address?: string | null
          stop_lat?: number | null
          stop_lng?: number | null
          stop_name?: string | null
          stop_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "delivery_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_routes: {
        Row: {
          company_id: string | null
          created_at: string | null
          driver_id: string | null
          estimated_duration: number | null
          id: string
          route_date: string
          status: string | null
          total_distance: number | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          driver_id?: string | null
          estimated_duration?: number | null
          id?: string
          route_date: string
          status?: string | null
          total_distance?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          driver_id?: string | null
          estimated_duration?: number | null
          id?: string
          route_date?: string
          status?: string | null
          total_distance?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_routes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_routes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_messages: {
        Row: {
          body: string
          company_id: string
          created_at: string
          id: string
          order_id: string
          read_at: string | null
          region_id: string | null
          sender_id: string
          sender_role: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          id?: string
          order_id: string
          read_at?: string | null
          region_id?: string | null
          sender_id: string
          sender_role: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          order_id?: string
          read_at?: string | null
          region_id?: string | null
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_messages_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_assignments: {
        Row: {
          accepted_at: string | null
          arrived_at_venue_at: string | null
          assigned_at: string | null
          assignment_type: string
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
          parent_assignment_id: string | null
          picked_up_at: string | null
          rejection_reason: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["assignment_status"] | null
          total_earnings: number | null
          updated_at: string | null
          waiter_earnings: number | null
        }
        Insert: {
          accepted_at?: string | null
          arrived_at_venue_at?: string | null
          assigned_at?: string | null
          assignment_type?: string
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
          parent_assignment_id?: string | null
          picked_up_at?: string | null
          rejection_reason?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["assignment_status"] | null
          total_earnings?: number | null
          updated_at?: string | null
          waiter_earnings?: number | null
        }
        Update: {
          accepted_at?: string | null
          arrived_at_venue_at?: string | null
          assigned_at?: string | null
          assignment_type?: string
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
          parent_assignment_id?: string | null
          picked_up_at?: string | null
          rejection_reason?: string | null
          scheduled_for?: string | null
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
          {
            foreignKeyName: "driver_assignments_parent_assignment_id_fkey"
            columns: ["parent_assignment_id"]
            isOneToOne: false
            referencedRelation: "driver_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_confirmations: {
        Row: {
          confirmation_type: string
          confirmed_at: string
          created_at: string
          driver_id: string
          id: string
          location_lat: number | null
          location_lng: number | null
          notes: string | null
          order_id: string
        }
        Insert: {
          confirmation_type: string
          confirmed_at?: string
          created_at?: string
          driver_id: string
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          order_id: string
        }
        Update: {
          confirmation_type?: string
          confirmed_at?: string
          created_at?: string
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
      driver_locations: {
        Row: {
          accuracy: number | null
          company_id: string | null
          driver_id: string
          heading: number | null
          latitude: number | null
          longitude: number | null
          speed: number | null
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          company_id?: string | null
          driver_id: string
          heading?: number | null
          latitude?: number | null
          longitude?: number | null
          speed?: number | null
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          company_id?: string | null
          driver_id?: string
          heading?: number | null
          latitude?: number | null
          longitude?: number | null
          speed?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_payouts: {
        Row: {
          callout_pay: number
          company_id: string
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          distance_pay: number
          distance_total_km: number
          driver_id: string
          gross_total: number
          hourly_pay: number
          hours_total: number
          id: string
          paid_at: string | null
          paid_by_user_id: string | null
          paid_method: string | null
          paid_notes: string | null
          paid_reference: string | null
          period_from: string
          period_to: string
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          callout_pay?: number
          company_id: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          distance_pay?: number
          distance_total_km?: number
          driver_id: string
          gross_total?: number
          hourly_pay?: number
          hours_total?: number
          id?: string
          paid_at?: string | null
          paid_by_user_id?: string | null
          paid_method?: string | null
          paid_notes?: string | null
          paid_reference?: string | null
          period_from: string
          period_to: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          callout_pay?: number
          company_id?: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          distance_pay?: number
          distance_total_km?: number
          driver_id?: string
          gross_total?: number
          hourly_pay?: number
          hours_total?: number
          id?: string
          paid_at?: string | null
          paid_by_user_id?: string | null
          paid_method?: string | null
          paid_notes?: string | null
          paid_reference?: string | null
          period_from?: string
          period_to?: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_payouts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_payouts_driver_id_fkey"
            columns: ["driver_id"]
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
          updated_at: string | null
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
          updated_at?: string | null
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
          updated_at?: string | null
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
      email_notification_preferences: {
        Row: {
          company_id: string | null
          created_at: string | null
          daily_summary: boolean | null
          driver_assigned: boolean | null
          id: string
          invoice_sent: boolean | null
          low_stock_alert: boolean | null
          order_cancelled: boolean | null
          order_confirmed: boolean | null
          order_delivered: boolean | null
          order_ready_for_pickup: boolean | null
          order_status_changed: boolean | null
          out_of_stock_alert: boolean | null
          payment_due: boolean | null
          payment_received: boolean | null
          preferences: Json | null
          task_assigned: boolean | null
          updated_at: string | null
          user_id: string
          weekly_report: boolean | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          daily_summary?: boolean | null
          driver_assigned?: boolean | null
          id?: string
          invoice_sent?: boolean | null
          low_stock_alert?: boolean | null
          order_cancelled?: boolean | null
          order_confirmed?: boolean | null
          order_delivered?: boolean | null
          order_ready_for_pickup?: boolean | null
          order_status_changed?: boolean | null
          out_of_stock_alert?: boolean | null
          payment_due?: boolean | null
          payment_received?: boolean | null
          preferences?: Json | null
          task_assigned?: boolean | null
          updated_at?: string | null
          user_id: string
          weekly_report?: boolean | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          daily_summary?: boolean | null
          driver_assigned?: boolean | null
          id?: string
          invoice_sent?: boolean | null
          low_stock_alert?: boolean | null
          order_cancelled?: boolean | null
          order_confirmed?: boolean | null
          order_delivered?: boolean | null
          order_ready_for_pickup?: boolean | null
          order_status_changed?: boolean | null
          out_of_stock_alert?: boolean | null
          payment_due?: boolean | null
          payment_received?: boolean | null
          preferences?: Json | null
          task_assigned?: boolean | null
          updated_at?: string | null
          user_id?: string
          weekly_report?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "email_notification_preferences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_provider_settings: {
        Row: {
          auto_attach_on_order_confirmed: boolean | null
          auto_attach_on_order_status_change: boolean | null
          auto_attach_on_quote_sent: boolean | null
          company_id: string
          created_at: string | null
          daily_send_cap: number | null
          from_email: string | null
          from_name: string | null
          id: string
          is_verified: boolean | null
          last_test_error: string | null
          last_test_sent_at: string | null
          magic_link_repeat_customers: boolean | null
          magic_link_repeat_threshold: number | null
          mailchimp_api_key_encrypted: string | null
          mailchimp_audience_id: string | null
          oauth_account_email: string | null
          oauth_refresh_token_encrypted: string | null
          provider: string
          resend_dns_records: Json | null
          resend_domain_id: string | null
          resend_domain_status: string | null
          resend_domain_verified_at: string | null
          resend_last_checked_at: string | null
          resend_sending_domain: string | null
          revoke_old_links_on_new: boolean | null
          smtp_host: string | null
          smtp_pass_encrypted: string | null
          smtp_port: number | null
          smtp_secure: boolean | null
          smtp_user: string | null
          updated_at: string | null
        }
        Insert: {
          auto_attach_on_order_confirmed?: boolean | null
          auto_attach_on_order_status_change?: boolean | null
          auto_attach_on_quote_sent?: boolean | null
          company_id: string
          created_at?: string | null
          daily_send_cap?: number | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_verified?: boolean | null
          last_test_error?: string | null
          last_test_sent_at?: string | null
          magic_link_repeat_customers?: boolean | null
          magic_link_repeat_threshold?: number | null
          mailchimp_api_key_encrypted?: string | null
          mailchimp_audience_id?: string | null
          oauth_account_email?: string | null
          oauth_refresh_token_encrypted?: string | null
          provider: string
          resend_dns_records?: Json | null
          resend_domain_id?: string | null
          resend_domain_status?: string | null
          resend_domain_verified_at?: string | null
          resend_last_checked_at?: string | null
          resend_sending_domain?: string | null
          revoke_old_links_on_new?: boolean | null
          smtp_host?: string | null
          smtp_pass_encrypted?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_attach_on_order_confirmed?: boolean | null
          auto_attach_on_order_status_change?: boolean | null
          auto_attach_on_quote_sent?: boolean | null
          company_id?: string
          created_at?: string | null
          daily_send_cap?: number | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_verified?: boolean | null
          last_test_error?: string | null
          last_test_sent_at?: string | null
          magic_link_repeat_customers?: boolean | null
          magic_link_repeat_threshold?: number | null
          mailchimp_api_key_encrypted?: string | null
          mailchimp_audience_id?: string | null
          oauth_account_email?: string | null
          oauth_refresh_token_encrypted?: string | null
          provider?: string
          resend_dns_records?: Json | null
          resend_domain_id?: string | null
          resend_domain_status?: string | null
          resend_domain_verified_at?: string | null
          resend_last_checked_at?: string | null
          resend_sending_domain?: string | null
          revoke_old_links_on_new?: boolean | null
          smtp_host?: string | null
          smtp_pass_encrypted?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean | null
          smtp_user?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_provider_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      embed_form_configs: {
        Row: {
          auto_reply_enabled: boolean | null
          company_id: string
          created_at: string
          deleted_at: string | null
          fields: Json
          id: string
          is_active: boolean
          last_submission_at: string | null
          name: string
          notify_admin_email: boolean
          redirect_url: string | null
          region_id: string | null
          slug: string
          submissions_count: number
          success_message: string | null
          template_id: string
          theme: Json
          updated_at: string
          views_count: number
        }
        Insert: {
          auto_reply_enabled?: boolean | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          last_submission_at?: string | null
          name: string
          notify_admin_email?: boolean
          redirect_url?: string | null
          region_id?: string | null
          slug: string
          submissions_count?: number
          success_message?: string | null
          template_id: string
          theme?: Json
          updated_at?: string
          views_count?: number
        }
        Update: {
          auto_reply_enabled?: boolean | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          last_submission_at?: string | null
          name?: string
          notify_admin_email?: boolean
          redirect_url?: string | null
          region_id?: string | null
          slug?: string
          submissions_count?: number
          success_message?: string | null
          template_id?: string
          theme?: Json
          updated_at?: string
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "embed_form_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_form_configs_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      embed_form_submissions: {
        Row: {
          company_id: string
          created_at: string
          embed_form_id: string
          id: string
          ip_hash: string | null
          is_spam: boolean
          lead_id: string | null
          payload: Json
          referrer: string | null
          turnstile_score: number | null
          user_agent: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          embed_form_id: string
          id?: string
          ip_hash?: string | null
          is_spam?: boolean
          lead_id?: string | null
          payload: Json
          referrer?: string | null
          turnstile_score?: number | null
          user_agent?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          embed_form_id?: string
          id?: string
          ip_hash?: string | null
          is_spam?: boolean
          lead_id?: string | null
          payload?: Json
          referrer?: string | null
          turnstile_score?: number | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "embed_form_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_form_submissions_embed_form_id_fkey"
            columns: ["embed_form_id"]
            isOneToOne: false
            referencedRelation: "embed_form_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "embed_form_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      embed_rate_limits: {
        Row: {
          count: number
          embed_token: string
          id: string
          ip_hash: string
          window_start: string
        }
        Insert: {
          count?: number
          embed_token: string
          id?: string
          ip_hash: string
          window_start?: string
        }
        Update: {
          count?: number
          embed_token?: string
          id?: string
          ip_hash?: string
          window_start?: string
        }
        Relationships: []
      }
      equipment: {
        Row: {
          available_quantity: number | null
          category: string | null
          cleaning_time_dishwasher_minutes: number | null
          cleaning_time_hours: number | null
          cleaning_time_manual_minutes: number | null
          company_id: string | null
          condition: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          dishwasher_safe: boolean | null
          expected_lifespan_years: number | null
          hire_in_cost: number
          id: string
          image_url: string | null
          insurance_policy_ref: string | null
          is_available: boolean
          is_hire_in: boolean
          last_serviced_at: string | null
          name: string | null
          next_service_due: string | null
          preferred_hire_supplier_id: string | null
          purchase_cost: number | null
          purchase_date: string | null
          quantity: number | null
          rental_price: number
          replacement_cost: number | null
          requires_cleaning: boolean
          serial_number: string | null
          service_interval_days: number | null
          supplier_cleans: boolean
          supplier_of_record_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          available_quantity?: number | null
          category?: string | null
          cleaning_time_dishwasher_minutes?: number | null
          cleaning_time_hours?: number | null
          cleaning_time_manual_minutes?: number | null
          company_id?: string | null
          condition?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          dishwasher_safe?: boolean | null
          expected_lifespan_years?: number | null
          hire_in_cost?: number
          id?: string
          image_url?: string | null
          insurance_policy_ref?: string | null
          is_available?: boolean
          is_hire_in?: boolean
          last_serviced_at?: string | null
          name?: string | null
          next_service_due?: string | null
          preferred_hire_supplier_id?: string | null
          purchase_cost?: number | null
          purchase_date?: string | null
          quantity?: number | null
          rental_price?: number
          replacement_cost?: number | null
          requires_cleaning?: boolean
          serial_number?: string | null
          service_interval_days?: number | null
          supplier_cleans?: boolean
          supplier_of_record_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          available_quantity?: number | null
          category?: string | null
          cleaning_time_dishwasher_minutes?: number | null
          cleaning_time_hours?: number | null
          cleaning_time_manual_minutes?: number | null
          company_id?: string | null
          condition?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          dishwasher_safe?: boolean | null
          expected_lifespan_years?: number | null
          hire_in_cost?: number
          id?: string
          image_url?: string | null
          insurance_policy_ref?: string | null
          is_available?: boolean
          is_hire_in?: boolean
          last_serviced_at?: string | null
          name?: string | null
          next_service_due?: string | null
          preferred_hire_supplier_id?: string | null
          purchase_cost?: number | null
          purchase_date?: string | null
          quantity?: number | null
          rental_price?: number
          replacement_cost?: number | null
          requires_cleaning?: boolean
          serial_number?: string | null
          service_interval_days?: number | null
          supplier_cleans?: boolean
          supplier_of_record_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_preferred_hire_supplier_id_fkey"
            columns: ["preferred_hire_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_supplier_of_record_id_fkey"
            columns: ["supplier_of_record_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
        Relationships: [
          {
            foreignKeyName: "equipment_bookings_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_damages: {
        Row: {
          company_id: string | null
          created_at: string | null
          damage_type: string | null
          equipment_id: string | null
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
          equipment_id?: string | null
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
          equipment_id?: string | null
          handover_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          repair_cost?: number | null
          reported_by?: string | null
          resolved?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_damages_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_handovers: {
        Row: {
          created_at: string
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
      equipment_hire_orders: {
        Row: {
          actual_pickup_date: string | null
          actual_return_date: string | null
          category: string | null
          company_id: string
          created_at: string
          created_by: string | null
          equipment_id: string | null
          equipment_name: string | null
          expected_pickup_date: string | null
          expected_return_date: string | null
          hire_in_cost_per_unit: number
          id: string
          order_id: string | null
          payable_id: string | null
          quantity: number
          quote_id: string | null
          status: string
          supplier_contact: string | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_notes: string | null
          total_cost: number
          updated_at: string
        }
        Insert: {
          actual_pickup_date?: string | null
          actual_return_date?: string | null
          category?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          equipment_id?: string | null
          equipment_name?: string | null
          expected_pickup_date?: string | null
          expected_return_date?: string | null
          hire_in_cost_per_unit?: number
          id?: string
          order_id?: string | null
          payable_id?: string | null
          quantity?: number
          quote_id?: string | null
          status?: string
          supplier_contact?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_notes?: string | null
          total_cost?: number
          updated_at?: string
        }
        Update: {
          actual_pickup_date?: string | null
          actual_return_date?: string | null
          category?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          equipment_id?: string | null
          equipment_name?: string | null
          expected_pickup_date?: string | null
          expected_return_date?: string | null
          hire_in_cost_per_unit?: number
          id?: string
          order_id?: string | null
          payable_id?: string | null
          quantity?: number
          quote_id?: string | null
          status?: string
          supplier_contact?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_notes?: string | null
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_hire_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_hire_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_hire_orders_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_hire_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_hire_orders_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "supplier_payables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_hire_orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_hire_orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "won_then_cancelled_quotes"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "equipment_hire_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
      equipment_maintenance_log: {
        Row: {
          company_id: string
          cost: number | null
          created_at: string
          equipment_id: string
          id: string
          next_service_due: string | null
          notes: string | null
          service_type: string
          serviced_at: string
          serviced_by_user_id: string | null
        }
        Insert: {
          company_id: string
          cost?: number | null
          created_at?: string
          equipment_id: string
          id?: string
          next_service_due?: string | null
          notes?: string | null
          service_type?: string
          serviced_at?: string
          serviced_by_user_id?: string | null
        }
        Update: {
          company_id?: string
          cost?: number | null
          created_at?: string
          equipment_id?: string
          id?: string
          next_service_due?: string | null
          notes?: string | null
          service_type?: string
          serviced_at?: string
          serviced_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_maintenance_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_maintenance_log_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "equipment_shortage_flags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
        ]
      }
      exchange_rates: {
        Row: {
          aud_to_zar_rate: number | null
          created_at: string | null
          date: string | null
          eur_to_zar_rate: number | null
          gbp_to_zar_rate: number | null
          id: string
          usd_to_zar_rate: number | null
        }
        Insert: {
          aud_to_zar_rate?: number | null
          created_at?: string | null
          date?: string | null
          eur_to_zar_rate?: number | null
          gbp_to_zar_rate?: number | null
          id?: string
          usd_to_zar_rate?: number | null
        }
        Update: {
          aud_to_zar_rate?: number | null
          created_at?: string | null
          date?: string | null
          eur_to_zar_rate?: number | null
          gbp_to_zar_rate?: number | null
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
      fixed_costs: {
        Row: {
          active: boolean
          amount_cents: number
          cadence: string
          category: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          label: string
          last_amount_change_at: string | null
          next_due_date: string
          notes: string | null
          previous_amount_cents: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_cents: number
          cadence: string
          category?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          label: string
          last_amount_change_at?: string | null
          next_due_date: string
          notes?: string | null
          previous_amount_cents?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_cents?: number
          cadence?: string
          category?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          label?: string
          last_amount_change_at?: string | null
          next_due_date?: string
          notes?: string | null
          previous_amount_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_costs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_costs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      gps_tracking: {
        Row: {
          accuracy: number | null
          company_id: string | null
          created_at: string | null
          driver_id: string | null
          heading: number | null
          id: string
          latitude: number | null
          longitude: number | null
          order_id: string | null
          speed: number | null
          timestamp: string | null
        }
        Insert: {
          accuracy?: number | null
          company_id?: string | null
          created_at?: string | null
          driver_id?: string | null
          heading?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          order_id?: string | null
          speed?: number | null
          timestamp?: string | null
        }
        Update: {
          accuracy?: number | null
          company_id?: string | null
          created_at?: string | null
          driver_id?: string | null
          heading?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          order_id?: string | null
          speed?: number | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gps_tracking_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      import_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          job_id: string
          payload: Json | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          job_id: string
          payload?: Json | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          job_id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          ai_call_cap: number
          comms_enabled_at: string | null
          comms_enabled_by: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          failed_at: string | null
          failed_reason: string | null
          id: string
          kind: string
          mapping: Json | null
          review_notes: string | null
          source_file_path: string | null
          source_filename: string | null
          source_mime: string | null
          source_row_count: number | null
          source_size_bytes: number | null
          status: string
          summary: Json | null
          updated_at: string
        }
        Insert: {
          ai_call_cap?: number
          comms_enabled_at?: string | null
          comms_enabled_by?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_at?: string | null
          failed_reason?: string | null
          id?: string
          kind?: string
          mapping?: Json | null
          review_notes?: string | null
          source_file_path?: string | null
          source_filename?: string | null
          source_mime?: string | null
          source_row_count?: number | null
          source_size_bytes?: number | null
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          ai_call_cap?: number
          comms_enabled_at?: string | null
          comms_enabled_by?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          failed_at?: string | null
          failed_reason?: string | null
          id?: string
          kind?: string
          mapping?: Json | null
          review_notes?: string | null
          source_file_path?: string | null
          source_filename?: string | null
          source_mime?: string | null
          source_row_count?: number | null
          source_size_bytes?: number | null
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          created_at: string
          dedup_decision: string | null
          dedup_match_id: string | null
          dedup_match_table: string | null
          error_message: string | null
          id: string
          job_id: string
          mapped_data: Json | null
          preview_warnings: string[] | null
          sheet: string
          source_data: Json
          source_row_index: number | null
          status: string
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          created_at?: string
          dedup_decision?: string | null
          dedup_match_id?: string | null
          dedup_match_table?: string | null
          error_message?: string | null
          id?: string
          job_id: string
          mapped_data?: Json | null
          preview_warnings?: string[] | null
          sheet: string
          source_data: Json
          source_row_index?: number | null
          status?: string
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          created_at?: string
          dedup_decision?: string | null
          dedup_match_id?: string | null
          dedup_match_table?: string | null
          error_message?: string | null
          id?: string
          job_id?: string
          mapped_data?: Json | null
          preview_warnings?: string[] | null
          sheet?: string
          source_data?: Json
          source_row_index?: number | null
          status?: string
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
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
          batch_number: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          expiry_date: string | null
          id: string
          initial_quantity: number
          inventory_item_id: string
          notes: string | null
          quantity: number
          received_date: string
          reference_number: string | null
          status: string
          supplier_id: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          batch_number?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          expiry_date?: string | null
          id?: string
          initial_quantity?: number
          inventory_item_id: string
          notes?: string | null
          quantity: number
          received_date?: string
          reference_number?: string | null
          status?: string
          supplier_id?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          batch_number?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          expiry_date?: string | null
          id?: string
          initial_quantity?: number
          inventory_item_id?: string
          notes?: string | null
          quantity?: number
          received_date?: string
          reference_number?: string | null
          status?: string
          supplier_id?: string | null
          unit_cost?: number | null
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
            referencedRelation: "inventory_demand_outlook"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "inventory_batches_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item_suppliers: {
        Row: {
          company_id: string
          created_at: string
          id: string
          inventory_item_id: string
          is_preferred: boolean
          last_purchased_at: string | null
          lead_time_days: number | null
          notes: string | null
          pack_size: string | null
          supplier_id: string
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          inventory_item_id: string
          is_preferred?: boolean
          last_purchased_at?: string | null
          lead_time_days?: number | null
          notes?: string | null
          pack_size?: string | null
          supplier_id: string
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          inventory_item_id?: string
          is_preferred?: boolean
          last_purchased_at?: string | null
          lead_time_days?: number | null
          notes?: string | null
          pack_size?: string | null
          supplier_id?: string
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_suppliers_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_demand_outlook"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "inventory_item_suppliers_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          allergen_codes: string[] | null
          barcode: string | null
          category: string | null
          company_id: string
          cost_per_unit: number | null
          created_at: string | null
          current_stock: number | null
          deleted_at: string | null
          description: string | null
          id: string
          is_perishable: boolean | null
          is_shared: boolean
          item_name: string
          maximum_stock: number | null
          minimum_stock: number | null
          preferred_supplier_id: string | null
          region_id: string | null
          reorder_quantity: number | null
          shelf_life_days: number | null
          sku: string | null
          storage_instructions: string | null
          storage_location: string | null
          unit_of_measure: string
          updated_at: string | null
        }
        Insert: {
          allergen_codes?: string[] | null
          barcode?: string | null
          category?: string | null
          company_id: string
          cost_per_unit?: number | null
          created_at?: string | null
          current_stock?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_perishable?: boolean | null
          is_shared?: boolean
          item_name: string
          maximum_stock?: number | null
          minimum_stock?: number | null
          preferred_supplier_id?: string | null
          region_id?: string | null
          reorder_quantity?: number | null
          shelf_life_days?: number | null
          sku?: string | null
          storage_instructions?: string | null
          storage_location?: string | null
          unit_of_measure: string
          updated_at?: string | null
        }
        Update: {
          allergen_codes?: string[] | null
          barcode?: string | null
          category?: string | null
          company_id?: string
          cost_per_unit?: number | null
          created_at?: string | null
          current_stock?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_perishable?: boolean | null
          is_shared?: boolean
          item_name?: string
          maximum_stock?: number | null
          minimum_stock?: number | null
          preferred_supplier_id?: string | null
          region_id?: string | null
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
          {
            foreignKeyName: "inventory_items_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
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
            referencedRelation: "inventory_demand_outlook"
            referencedColumns: ["inventory_item_id"]
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
          invoice_data: Json | null
          invoice_date: string
          invoice_number: string
          last_synced_at: string | null
          notes: string | null
          order_id: string | null
          paid_at: string | null
          pdf_url: string | null
          public_token: string
          region_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number
          sync_error: string | null
          synced_to_accounting: boolean | null
          tax_amount: number | null
          total_amount: number
          updated_at: string | null
          xero_voided_at: string | null
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
          invoice_data?: Json | null
          invoice_date?: string
          invoice_number: string
          last_synced_at?: string | null
          notes?: string | null
          order_id?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          public_token?: string
          region_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number
          sync_error?: string | null
          synced_to_accounting?: boolean | null
          tax_amount?: number | null
          total_amount: number
          updated_at?: string | null
          xero_voided_at?: string | null
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
          invoice_data?: Json | null
          invoice_date?: string
          invoice_number?: string
          last_synced_at?: string | null
          notes?: string | null
          order_id?: string | null
          paid_at?: string | null
          pdf_url?: string | null
          public_token?: string
          region_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number
          sync_error?: string | null
          synced_to_accounting?: boolean | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string | null
          xero_voided_at?: string | null
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
          {
            foreignKeyName: "invoices_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_duty_shifts: {
        Row: {
          break_started_at: string | null
          company_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          order_id: string | null
          shift_end: string | null
          shift_start: string | null
          shift_type: string | null
          staff_id: string | null
          total_break_min: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          break_started_at?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          order_id?: string | null
          shift_end?: string | null
          shift_start?: string | null
          shift_type?: string | null
          staff_id?: string | null
          total_break_min?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          break_started_at?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          order_id?: string | null
          shift_end?: string | null
          shift_start?: string | null
          shift_type?: string | null
          staff_id?: string | null
          total_break_min?: number
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
      kitchen_handoffs: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          author_id: string
          body: string
          company_id: string
          created_at: string
          id: string
          shift_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          author_id: string
          body: string
          company_id: string
          created_at?: string
          id?: string
          shift_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          author_id?: string
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          shift_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_handoffs_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_handoffs_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_handoffs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_payslips: {
        Row: {
          base_pay: number
          breakdown: Json
          company_id: string
          created_at: string
          created_by_user_id: string | null
          currency: string
          deleted_at: string | null
          hourly_rate: number | null
          id: string
          issued_at: string | null
          multiplier_pay: number
          notes: string | null
          overtime_pay: number
          paid_at: string | null
          payment_reference: string | null
          period_end: string
          period_start: string
          staff_id: string
          status: string
          total_hours: number
          total_pay: number
          updated_at: string
        }
        Insert: {
          base_pay?: number
          breakdown?: Json
          company_id: string
          created_at?: string
          created_by_user_id?: string | null
          currency?: string
          deleted_at?: string | null
          hourly_rate?: number | null
          id?: string
          issued_at?: string | null
          multiplier_pay?: number
          notes?: string | null
          overtime_pay?: number
          paid_at?: string | null
          payment_reference?: string | null
          period_end: string
          period_start: string
          staff_id: string
          status?: string
          total_hours?: number
          total_pay?: number
          updated_at?: string
        }
        Update: {
          base_pay?: number
          breakdown?: Json
          company_id?: string
          created_at?: string
          created_by_user_id?: string | null
          currency?: string
          deleted_at?: string | null
          hourly_rate?: number | null
          id?: string
          issued_at?: string | null
          multiplier_pay?: number
          notes?: string | null
          overtime_pay?: number
          paid_at?: string | null
          payment_reference?: string | null
          period_end?: string
          period_start?: string
          staff_id?: string
          status?: string
          total_hours?: number
          total_pay?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_payslips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_payslips_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_prep_tasks: {
        Row: {
          actual_yield: number | null
          allergen_check_at: string | null
          allergen_check_by: string | null
          allergen_check_status: string | null
          assigned_chef_id: string | null
          company_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          deleted_at: string | null
          duration_min: number
          id: string
          menu_item_name: string
          notes: string | null
          order_id: string
          planned_yield: number | null
          region_id: string | null
          start_at: string
          started_at: string | null
          station_id: string | null
          status: string
          task_type: string
          updated_at: string
          yield_unit: string | null
        }
        Insert: {
          actual_yield?: number | null
          allergen_check_at?: string | null
          allergen_check_by?: string | null
          allergen_check_status?: string | null
          assigned_chef_id?: string | null
          company_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_min?: number
          id?: string
          menu_item_name: string
          notes?: string | null
          order_id: string
          planned_yield?: number | null
          region_id?: string | null
          start_at: string
          started_at?: string | null
          station_id?: string | null
          status?: string
          task_type?: string
          updated_at?: string
          yield_unit?: string | null
        }
        Update: {
          actual_yield?: number | null
          allergen_check_at?: string | null
          allergen_check_by?: string | null
          allergen_check_status?: string | null
          assigned_chef_id?: string | null
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_min?: number
          id?: string
          menu_item_name?: string
          notes?: string | null
          order_id?: string
          planned_yield?: number | null
          region_id?: string | null
          start_at?: string
          started_at?: string | null
          station_id?: string | null
          status?: string
          task_type?: string
          updated_at?: string
          yield_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_prep_tasks_assigned_chef_id_fkey"
            columns: ["assigned_chef_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_prep_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_prep_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_prep_tasks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_prep_tasks_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_prep_tasks_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "kitchen_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_shifts: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          company_id: string
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          duty_shift_id: string | null
          hours_worked: number | null
          id: string
          notes: string | null
          order_id: string | null
          planned_end: string | null
          planned_start: string | null
          rate_multiplier: number | null
          shift_date: string
          shift_type: string
          source: string
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          company_id: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          duty_shift_id?: string | null
          hours_worked?: number | null
          id?: string
          notes?: string | null
          order_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          rate_multiplier?: number | null
          shift_date: string
          shift_type?: string
          source?: string
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          company_id?: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          duty_shift_id?: string | null
          hours_worked?: number | null
          id?: string
          notes?: string | null
          order_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          rate_multiplier?: number | null
          shift_date?: string
          shift_type?: string
          source?: string
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_shifts_duty_shift_id_fkey"
            columns: ["duty_shift_id"]
            isOneToOne: false
            referencedRelation: "kitchen_duty_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_staff_members: {
        Row: {
          company_id: string
          created_at: string
          deleted_at: string | null
          departments: string[]
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          hourly_rate: number | null
          id: string
          id_number: string | null
          is_active: boolean
          linked_profile_id: string | null
          monthly_salary: number | null
          notes: string | null
          overtime_rate: number | null
          pay_type: string
          phone: string | null
          region_id: string | null
          role_title: string | null
          shift_rate: number | null
          standard_hours_per_day: number
          start_date: string | null
          sunday_holiday_rate: number | null
          updated_at: string
          weekly_ordinary_hours: number
        }
        Insert: {
          company_id: string
          created_at?: string
          deleted_at?: string | null
          departments?: string[]
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          hourly_rate?: number | null
          id?: string
          id_number?: string | null
          is_active?: boolean
          linked_profile_id?: string | null
          monthly_salary?: number | null
          notes?: string | null
          overtime_rate?: number | null
          pay_type?: string
          phone?: string | null
          region_id?: string | null
          role_title?: string | null
          shift_rate?: number | null
          standard_hours_per_day?: number
          start_date?: string | null
          sunday_holiday_rate?: number | null
          updated_at?: string
          weekly_ordinary_hours?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          departments?: string[]
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          hourly_rate?: number | null
          id?: string
          id_number?: string | null
          is_active?: boolean
          linked_profile_id?: string | null
          monthly_salary?: number | null
          notes?: string | null
          overtime_rate?: number | null
          pay_type?: string
          phone?: string | null
          region_id?: string | null
          role_title?: string | null
          shift_rate?: number | null
          standard_hours_per_day?: number
          start_date?: string | null
          sunday_holiday_rate?: number | null
          updated_at?: string
          weekly_ordinary_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_staff_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_staff_members_linked_profile_id_fkey"
            columns: ["linked_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_staff_members_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_staff_shifts: {
        Row: {
          break_started_at: string | null
          clocked_in_by: string | null
          clocked_out_by: string | null
          company_id: string
          created_at: string
          deleted_at: string | null
          department: string
          id: string
          manual_override: boolean
          notes: string | null
          override_reason: string | null
          overtime_min: number | null
          shift_end: string | null
          shift_start: string
          staff_member_id: string
          standard_min: number | null
          sunday_holiday_min: number
          total_break_min: number
          updated_at: string
        }
        Insert: {
          break_started_at?: string | null
          clocked_in_by?: string | null
          clocked_out_by?: string | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          department?: string
          id?: string
          manual_override?: boolean
          notes?: string | null
          override_reason?: string | null
          overtime_min?: number | null
          shift_end?: string | null
          shift_start: string
          staff_member_id: string
          standard_min?: number | null
          sunday_holiday_min?: number
          total_break_min?: number
          updated_at?: string
        }
        Update: {
          break_started_at?: string | null
          clocked_in_by?: string | null
          clocked_out_by?: string | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          department?: string
          id?: string
          manual_override?: boolean
          notes?: string | null
          override_reason?: string | null
          overtime_min?: number | null
          shift_end?: string | null
          shift_start?: string
          staff_member_id?: string
          standard_min?: number | null
          sunday_holiday_min?: number
          total_break_min?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_staff_shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_staff_shifts_staff_member_id_fkey"
            columns: ["staff_member_id"]
            isOneToOne: false
            referencedRelation: "kitchen_staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_stations: {
        Row: {
          capacity_minutes_per_shift: number | null
          company_id: string
          created_at: string
          deleted_at: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          notes: string | null
          region_id: string | null
          station_type: string
          updated_at: string
        }
        Insert: {
          capacity_minutes_per_shift?: number | null
          company_id: string
          created_at?: string
          deleted_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          region_id?: string | null
          station_type?: string
          updated_at?: string
        }
        Update: {
          capacity_minutes_per_shift?: number | null
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          region_id?: string | null
          station_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_stations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_stations_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
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
          client_email: string
          client_name: string | null
          client_phone: string | null
          comms_paused_until: string | null
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
          import_job_id: string | null
          imported_at: string | null
          imported_filename: string | null
          landline_number: string | null
          last_contacted_at: string | null
          lost_at: string | null
          lost_reason: Database["public"]["Enums"]["lost_reason"] | null
          mobile_number: string | null
          notes: string | null
          phone: string | null
          region_id: string
          requested_items: Json | null
          source: string | null
          source_order_id: string | null
          special_requests: string | null
          status: Database["public"]["Enums"]["lead_status"] | null
          tags: string[] | null
          updated_at: string | null
          user_id: string | null
          venue_address: string | null
          venue_lat: number | null
          venue_lng: number | null
        }
        Insert: {
          assigned_to?: string | null
          budget?: number | null
          budget_range?: string | null
          client_email: string
          client_name?: string | null
          client_phone?: string | null
          comms_paused_until?: string | null
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
          import_job_id?: string | null
          imported_at?: string | null
          imported_filename?: string | null
          landline_number?: string | null
          last_contacted_at?: string | null
          lost_at?: string | null
          lost_reason?: Database["public"]["Enums"]["lost_reason"] | null
          mobile_number?: string | null
          notes?: string | null
          phone?: string | null
          region_id: string
          requested_items?: Json | null
          source?: string | null
          source_order_id?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          venue_address?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
        }
        Update: {
          assigned_to?: string | null
          budget?: number | null
          budget_range?: string | null
          client_email?: string
          client_name?: string | null
          client_phone?: string | null
          comms_paused_until?: string | null
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
          import_job_id?: string | null
          imported_at?: string | null
          imported_filename?: string | null
          landline_number?: string | null
          last_contacted_at?: string | null
          lost_at?: string | null
          lost_reason?: Database["public"]["Enums"]["lost_reason"] | null
          mobile_number?: string | null
          notes?: string | null
          phone?: string | null
          region_id?: string
          requested_items?: Json | null
          source?: string | null
          source_order_id?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          venue_address?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
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
            foreignKeyName: "leads_converted_to_client_id_fkey"
            columns: ["converted_to_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
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
            foreignKeyName: "leads_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      menu_item_price_history: {
        Row: {
          changed_at: string
          changed_by_user_id: string | null
          id: string
          menu_item_id: string
          new_price: number
          old_price: number | null
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by_user_id?: string | null
          id?: string
          menu_item_id: string
          new_price: number
          old_price?: number | null
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by_user_id?: string | null
          id?: string
          menu_item_id?: string
          new_price?: number
          old_price?: number | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_price_history_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean | null
          allergen_codes: string[] | null
          allergen_info: string | null
          allergens_reviewed_at: string | null
          allergens_reviewed_by: string | null
          base_price: number
          base_servings: number | null
          category: string | null
          company_id: string
          cook_time_minutes: number | null
          cost_per_unit: number | null
          created_at: string | null
          default_outsource_provider_id: string | null
          deleted_at: string | null
          description: string | null
          dietary_tags: string[] | null
          fulfilment_type: string
          id: string
          image_url: string | null
          instructions: string | null
          is_available: boolean | null
          is_buy_and_sell: boolean
          item_name: string
          linked_inventory_item_id: string | null
          outsource_lead_hours: number | null
          outsource_unit_cost: number | null
          prep_time_minutes: number | null
          recipe_name: string | null
          requires_advance_notice_hours: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          allergen_codes?: string[] | null
          allergen_info?: string | null
          allergens_reviewed_at?: string | null
          allergens_reviewed_by?: string | null
          base_price: number
          base_servings?: number | null
          category?: string | null
          company_id: string
          cook_time_minutes?: number | null
          cost_per_unit?: number | null
          created_at?: string | null
          default_outsource_provider_id?: string | null
          deleted_at?: string | null
          description?: string | null
          dietary_tags?: string[] | null
          fulfilment_type?: string
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_available?: boolean | null
          is_buy_and_sell?: boolean
          item_name: string
          linked_inventory_item_id?: string | null
          outsource_lead_hours?: number | null
          outsource_unit_cost?: number | null
          prep_time_minutes?: number | null
          recipe_name?: string | null
          requires_advance_notice_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          allergen_codes?: string[] | null
          allergen_info?: string | null
          allergens_reviewed_at?: string | null
          allergens_reviewed_by?: string | null
          base_price?: number
          base_servings?: number | null
          category?: string | null
          company_id?: string
          cook_time_minutes?: number | null
          cost_per_unit?: number | null
          created_at?: string | null
          default_outsource_provider_id?: string | null
          deleted_at?: string | null
          description?: string | null
          dietary_tags?: string[] | null
          fulfilment_type?: string
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_available?: boolean | null
          is_buy_and_sell?: boolean
          item_name?: string
          linked_inventory_item_id?: string | null
          outsource_lead_hours?: number | null
          outsource_unit_cost?: number | null
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
          {
            foreignKeyName: "menu_items_default_outsource_provider_id_fkey"
            columns: ["default_outsource_provider_id"]
            isOneToOne: false
            referencedRelation: "outsource_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_linked_inventory_item_id_fkey"
            columns: ["linked_inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_demand_outlook"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "menu_items_linked_inventory_item_id_fkey"
            columns: ["linked_inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
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
      order_amendment_requests: {
        Row: {
          applied_at: string | null
          applied_snapshot: Json | null
          client_notes: string | null
          company_id: string
          id: string
          order_id: string
          proposed_changes: Json
          requested_at: string
          requested_by_user_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          status: string
        }
        Insert: {
          applied_at?: string | null
          applied_snapshot?: Json | null
          client_notes?: string | null
          company_id: string
          id?: string
          order_id: string
          proposed_changes: Json
          requested_at?: string
          requested_by_user_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string
        }
        Update: {
          applied_at?: string | null
          applied_snapshot?: Json | null
          client_notes?: string | null
          company_id?: string
          id?: string
          order_id?: string
          proposed_changes?: Json
          requested_at?: string
          requested_by_user_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_amendment_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_amendment_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_assignment_audit: {
        Row: {
          company_id: string
          created_at: string
          from_driver_id: string | null
          id: string
          order_id: string
          performed_by: string | null
          reason: string | null
          score: number | null
          to_driver_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          from_driver_id?: string | null
          id?: string
          order_id: string
          performed_by?: string | null
          reason?: string | null
          score?: number | null
          to_driver_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          from_driver_id?: string | null
          id?: string
          order_id?: string
          performed_by?: string | null
          reason?: string | null
          score?: number | null
          to_driver_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_assignment_audit_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_assignment_audit_from_driver_id_fkey"
            columns: ["from_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_assignment_audit_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_assignment_audit_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_assignment_audit_to_driver_id_fkey"
            columns: ["to_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_chat_messages: {
        Row: {
          body: string
          company_id: string
          created_at: string
          id: string
          order_id: string
          read_at: string | null
          sender_id: string
          sender_role: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          id?: string
          order_id: string
          read_at?: string | null
          sender_id: string
          sender_role: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          order_id?: string
          read_at?: string | null
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_chat_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_chat_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          unit_cost: number | null
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
          unit_cost?: number | null
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
          unit_cost?: number | null
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
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          id: string
          notes: string | null
          order_id: string | null
          status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
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
          arrived_at_venue_at: string | null
          assigned_at: string | null
          assigned_chef_id: string | null
          assigned_driver_id: string | null
          assigned_vehicle_id: string | null
          assignment_score: number | null
          balance_amount: number | null
          balance_due_date: string | null
          balance_paid: boolean | null
          balance_paid_at: string | null
          balance_transaction_id: string | null
          cancellation_reason: string | null
          cancellation_reason_category: string | null
          cancelled_at: string | null
          cancelled_by_user_id: string | null
          cascade_receipt: Json | null
          cascade_receipt_at: string | null
          client_email: string | null
          client_id: string
          client_name: string | null
          client_phone: string | null
          collection_time: string | null
          comms_paused_until: string | null
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
          departed_venue_at: string | null
          deposit_amount: number | null
          deposit_paid: boolean | null
          deposit_paid_at: string | null
          deposit_percentage: number | null
          deposit_transaction_id: string | null
          dietary_requirements: string | null
          discount_amount: number | null
          driver_acknowledged_at: string | null
          driver_acknowledged_via: string | null
          driver_id: string | null
          equipment_return_method: string | null
          event_date: string
          event_end_date: string | null
          event_name: string
          event_time: string | null
          final_order_change_date: string | null
          guest_count: number
          id: string
          import_job_id: string | null
          imported_at: string | null
          internal_notes: string | null
          inventory_deducted_at: string | null
          kitchen_instructions: string | null
          last_notified_stage_at: string | null
          last_notified_stage_key: string | null
          lead_source: string | null
          order_number: string
          package_id: string | null
          paused_at: string | null
          paused_by_user_id: string | null
          paused_expected_resume_date: string | null
          paused_from_status: Database["public"]["Enums"]["order_status"] | null
          paused_reason: string | null
          paused_reason_category: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          picked_up_at: string | null
          pickup_time: string | null
          pod_captured_at: string | null
          pod_photo_url: string | null
          pod_recipient_name: string | null
          pod_signature_url: string | null
          postponed_at: string | null
          postponed_from_date: string | null
          prep_started_at: string | null
          quote_id: string | null
          ready_at: string | null
          region_id: string
          requires_refrigeration: boolean
          requires_two_drivers: boolean
          requires_waiter: boolean | null
          secondary_driver_id: string | null
          secondary_vehicle_id: string | null
          service_started_at: string | null
          setup_started_at: string | null
          setup_time: string | null
          special_instructions: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number | null
          tax_amount: number | null
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
          arrived_at_venue_at?: string | null
          assigned_at?: string | null
          assigned_chef_id?: string | null
          assigned_driver_id?: string | null
          assigned_vehicle_id?: string | null
          assignment_score?: number | null
          balance_amount?: number | null
          balance_due_date?: string | null
          balance_paid?: boolean | null
          balance_paid_at?: string | null
          balance_transaction_id?: string | null
          cancellation_reason?: string | null
          cancellation_reason_category?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          cascade_receipt?: Json | null
          cascade_receipt_at?: string | null
          client_email?: string | null
          client_id: string
          client_name?: string | null
          client_phone?: string | null
          collection_time?: string | null
          comms_paused_until?: string | null
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
          departed_venue_at?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_percentage?: number | null
          deposit_transaction_id?: string | null
          dietary_requirements?: string | null
          discount_amount?: number | null
          driver_acknowledged_at?: string | null
          driver_acknowledged_via?: string | null
          driver_id?: string | null
          equipment_return_method?: string | null
          event_date: string
          event_end_date?: string | null
          event_name: string
          event_time?: string | null
          final_order_change_date?: string | null
          guest_count: number
          id?: string
          import_job_id?: string | null
          imported_at?: string | null
          internal_notes?: string | null
          inventory_deducted_at?: string | null
          kitchen_instructions?: string | null
          last_notified_stage_at?: string | null
          last_notified_stage_key?: string | null
          lead_source?: string | null
          order_number: string
          package_id?: string | null
          paused_at?: string | null
          paused_by_user_id?: string | null
          paused_expected_resume_date?: string | null
          paused_from_status?:
            | Database["public"]["Enums"]["order_status"]
            | null
          paused_reason?: string | null
          paused_reason_category?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          picked_up_at?: string | null
          pickup_time?: string | null
          pod_captured_at?: string | null
          pod_photo_url?: string | null
          pod_recipient_name?: string | null
          pod_signature_url?: string | null
          postponed_at?: string | null
          postponed_from_date?: string | null
          prep_started_at?: string | null
          quote_id?: string | null
          ready_at?: string | null
          region_id: string
          requires_refrigeration?: boolean
          requires_two_drivers?: boolean
          requires_waiter?: boolean | null
          secondary_driver_id?: string | null
          secondary_vehicle_id?: string | null
          service_started_at?: string | null
          setup_started_at?: string | null
          setup_time?: string | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax?: number | null
          tax_amount?: number | null
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
          arrived_at_venue_at?: string | null
          assigned_at?: string | null
          assigned_chef_id?: string | null
          assigned_driver_id?: string | null
          assigned_vehicle_id?: string | null
          assignment_score?: number | null
          balance_amount?: number | null
          balance_due_date?: string | null
          balance_paid?: boolean | null
          balance_paid_at?: string | null
          balance_transaction_id?: string | null
          cancellation_reason?: string | null
          cancellation_reason_category?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          cascade_receipt?: Json | null
          cascade_receipt_at?: string | null
          client_email?: string | null
          client_id?: string
          client_name?: string | null
          client_phone?: string | null
          collection_time?: string | null
          comms_paused_until?: string | null
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
          departed_venue_at?: string | null
          deposit_amount?: number | null
          deposit_paid?: boolean | null
          deposit_paid_at?: string | null
          deposit_percentage?: number | null
          deposit_transaction_id?: string | null
          dietary_requirements?: string | null
          discount_amount?: number | null
          driver_acknowledged_at?: string | null
          driver_acknowledged_via?: string | null
          driver_id?: string | null
          equipment_return_method?: string | null
          event_date?: string
          event_end_date?: string | null
          event_name?: string
          event_time?: string | null
          final_order_change_date?: string | null
          guest_count?: number
          id?: string
          import_job_id?: string | null
          imported_at?: string | null
          internal_notes?: string | null
          inventory_deducted_at?: string | null
          kitchen_instructions?: string | null
          last_notified_stage_at?: string | null
          last_notified_stage_key?: string | null
          lead_source?: string | null
          order_number?: string
          package_id?: string | null
          paused_at?: string | null
          paused_by_user_id?: string | null
          paused_expected_resume_date?: string | null
          paused_from_status?:
            | Database["public"]["Enums"]["order_status"]
            | null
          paused_reason?: string | null
          paused_reason_category?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          picked_up_at?: string | null
          pickup_time?: string | null
          pod_captured_at?: string | null
          pod_photo_url?: string | null
          pod_recipient_name?: string | null
          pod_signature_url?: string | null
          postponed_at?: string | null
          postponed_from_date?: string | null
          prep_started_at?: string | null
          quote_id?: string | null
          ready_at?: string | null
          region_id?: string
          requires_refrigeration?: boolean
          requires_two_drivers?: boolean
          requires_waiter?: boolean | null
          secondary_driver_id?: string | null
          secondary_vehicle_id?: string | null
          service_started_at?: string | null
          setup_started_at?: string | null
          setup_time?: string | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax?: number | null
          tax_amount?: number | null
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
            foreignKeyName: "orders_assigned_vehicle_id_fkey"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_cancelled_by_user_id_fkey"
            columns: ["cancelled_by_user_id"]
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
            foreignKeyName: "orders_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "booking_packages"
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
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "won_then_cancelled_quotes"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "orders_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_secondary_vehicle_id_fkey"
            columns: ["secondary_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
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
      outgoing_email_log: {
        Row: {
          company_id: string
          delivery_status: string | null
          error_message: string | null
          id: string
          sent_at: string | null
          sent_by: string | null
          sent_via: string
          subject: string | null
          to_email: string
        }
        Insert: {
          company_id: string
          delivery_status?: string | null
          error_message?: string | null
          id?: string
          sent_at?: string | null
          sent_by?: string | null
          sent_via: string
          subject?: string | null
          to_email: string
        }
        Update: {
          company_id?: string
          delivery_status?: string | null
          error_message?: string | null
          id?: string
          sent_at?: string | null
          sent_by?: string | null
          sent_via?: string
          subject?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "outgoing_email_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      outgoing_email_queue: {
        Row: {
          attempts: number
          body: string
          client_link: string | null
          company_id: string
          created_at: string | null
          error_message: string | null
          id: string
          magic_link: string | null
          paused_at: string | null
          scheduled_for: string | null
          sent_at: string | null
          status: string
          subject: string
          template_type: string | null
          to_email: string
          to_name: string | null
          trigger_event: string
          trigger_ref_id: string | null
          variables: Json | null
        }
        Insert: {
          attempts?: number
          body: string
          client_link?: string | null
          company_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          magic_link?: string | null
          paused_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          template_type?: string | null
          to_email: string
          to_name?: string | null
          trigger_event: string
          trigger_ref_id?: string | null
          variables?: Json | null
        }
        Update: {
          attempts?: number
          body?: string
          client_link?: string | null
          company_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          magic_link?: string | null
          paused_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_type?: string | null
          to_email?: string
          to_name?: string | null
          trigger_event?: string
          trigger_ref_id?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "outgoing_email_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      outsource_assignments: {
        Row: {
          accept_token: string | null
          accept_token_expires_at: string | null
          actual_cost: number | null
          cancelled_at: string | null
          company_id: string
          completed_at: string | null
          cost_currency: string
          created_at: string
          decline_reason: string | null
          deleted_at: string | null
          en_route_at: string | null
          id: string
          invoice_paid: boolean
          invoice_paid_at: string | null
          invoice_received: boolean
          invoice_received_at: string | null
          manually_marked_accepted: boolean
          manually_marked_by: string | null
          menu_item_id: string | null
          notes: string | null
          on_site_at: string | null
          order_id: string
          order_item_id: string | null
          provider_id: string
          quoted_cost: number
          rate_type: string
          requested_at: string
          requested_by: string | null
          required_on_site_at: string | null
          responded_at: string | null
          routing_group_id: string | null
          scope_notes: string | null
          service_description: string
          status: string
          updated_at: string
        }
        Insert: {
          accept_token?: string | null
          accept_token_expires_at?: string | null
          actual_cost?: number | null
          cancelled_at?: string | null
          company_id: string
          completed_at?: string | null
          cost_currency?: string
          created_at?: string
          decline_reason?: string | null
          deleted_at?: string | null
          en_route_at?: string | null
          id?: string
          invoice_paid?: boolean
          invoice_paid_at?: string | null
          invoice_received?: boolean
          invoice_received_at?: string | null
          manually_marked_accepted?: boolean
          manually_marked_by?: string | null
          menu_item_id?: string | null
          notes?: string | null
          on_site_at?: string | null
          order_id: string
          order_item_id?: string | null
          provider_id: string
          quoted_cost: number
          rate_type?: string
          requested_at?: string
          requested_by?: string | null
          required_on_site_at?: string | null
          responded_at?: string | null
          routing_group_id?: string | null
          scope_notes?: string | null
          service_description: string
          status?: string
          updated_at?: string
        }
        Update: {
          accept_token?: string | null
          accept_token_expires_at?: string | null
          actual_cost?: number | null
          cancelled_at?: string | null
          company_id?: string
          completed_at?: string | null
          cost_currency?: string
          created_at?: string
          decline_reason?: string | null
          deleted_at?: string | null
          en_route_at?: string | null
          id?: string
          invoice_paid?: boolean
          invoice_paid_at?: string | null
          invoice_received?: boolean
          invoice_received_at?: string | null
          manually_marked_accepted?: boolean
          manually_marked_by?: string | null
          menu_item_id?: string | null
          notes?: string | null
          on_site_at?: string | null
          order_id?: string
          order_item_id?: string | null
          provider_id?: string
          quoted_cost?: number
          rate_type?: string
          requested_at?: string
          requested_by?: string | null
          required_on_site_at?: string | null
          responded_at?: string | null
          routing_group_id?: string | null
          scope_notes?: string | null
          service_description?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outsource_assignments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_assignments_manually_marked_by_fkey"
            columns: ["manually_marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_assignments_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_assignments_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_assignments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "outsource_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_assignments_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outsource_providers: {
        Row: {
          company_id: string
          contact_person: string | null
          created_at: string
          default_currency: string
          default_rate: number | null
          default_rate_type: string
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean
          linked_supplier_id: string | null
          linked_user_id: string | null
          notes: string | null
          payment_terms_days: number | null
          phone: string | null
          preferred_contact_channel: string
          provider_name: string
          provider_roles: string[]
          rating: number | null
          service_radius_km: number | null
          specialty: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          company_id: string
          contact_person?: string | null
          created_at?: string
          default_currency?: string
          default_rate?: number | null
          default_rate_type?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          linked_supplier_id?: string | null
          linked_user_id?: string | null
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          preferred_contact_channel?: string
          provider_name: string
          provider_roles?: string[]
          rating?: number | null
          service_radius_km?: number | null
          specialty?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          company_id?: string
          contact_person?: string | null
          created_at?: string
          default_currency?: string
          default_rate?: number | null
          default_rate_type?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          linked_supplier_id?: string | null
          linked_user_id?: string | null
          notes?: string | null
          payment_terms_days?: number | null
          phone?: string | null
          preferred_contact_channel?: string
          provider_name?: string
          provider_roles?: string[]
          rating?: number | null
          service_radius_km?: number | null
          specialty?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outsource_providers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsource_providers_linked_supplier_id_fkey"
            columns: ["linked_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
      payment_gateway_credentials: {
        Row: {
          created_at: string
          credentials: Json
          gateway_id: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials?: Json
          gateway_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials?: Json
          gateway_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_credentials_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: true
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateways: {
        Row: {
          cancel_url: string | null
          company_id: string
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          is_test: boolean
          last_verified_at: string | null
          notify_url: string | null
          provider: string
          success_url: string | null
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          cancel_url?: string | null
          company_id: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_test?: boolean
          last_verified_at?: string | null
          notify_url?: string | null
          provider: string
          success_url?: string | null
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          cancel_url?: string | null
          company_id?: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_test?: boolean
          last_verified_at?: string | null
          notify_url?: string | null
          provider?: string
          success_url?: string | null
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateways_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_gateways_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_gateways_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      payments: {
        Row: {
          amount: number | null
          cancellation_request_id: string | null
          client_id: string | null
          company_id: string | null
          created_at: string | null
          created_by_user_id: string | null
          currency: string | null
          failed_at: string | null
          gateway: string | null
          gateway_provider: string | null
          gateway_response: Json | null
          gateway_transaction_id: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          order_id: string | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          payment_type: string | null
          processed_at: string | null
          reason: string | null
          refunded_at: string | null
          transaction_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          cancellation_request_id?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          currency?: string | null
          failed_at?: string | null
          gateway?: string | null
          gateway_provider?: string | null
          gateway_response?: Json | null
          gateway_transaction_id?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          order_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          payment_type?: string | null
          processed_at?: string | null
          reason?: string | null
          refunded_at?: string | null
          transaction_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          cancellation_request_id?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          currency?: string | null
          failed_at?: string | null
          gateway?: string | null
          gateway_provider?: string | null
          gateway_response?: Json | null
          gateway_transaction_id?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          order_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          payment_type?: string | null
          processed_at?: string | null
          reason?: string | null
          refunded_at?: string | null
          transaction_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_cancellation_request_id_fkey"
            columns: ["cancellation_request_id"]
            isOneToOne: false
            referencedRelation: "cancellation_requests"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "payments_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
      pending_reviews: {
        Row: {
          cancelled_at: string | null
          client_email: string | null
          client_id: string | null
          client_name: string | null
          client_user_id: string | null
          company_id: string
          created_at: string
          delivered_at: string
          due_at: string
          id: string
          order_id: string
          sent_at: string | null
        }
        Insert: {
          cancelled_at?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string | null
          client_user_id?: string | null
          company_id: string
          created_at?: string
          delivered_at: string
          due_at: string
          id?: string
          order_id: string
          sent_at?: string | null
        }
        Update: {
          cancelled_at?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string | null
          client_user_id?: string | null
          company_id?: string
          created_at?: string
          delivered_at?: string
          due_at?: string
          id?: string
          order_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_reviews_order_id_fkey"
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
      platform_pricing_plans: {
        Row: {
          active_clients_limit: number | null
          created_at: string
          eur_price: number
          features: Json
          gbp_price: number
          id: string
          is_active: boolean
          is_recommended: boolean
          name: string
          orders_per_quarter_limit: number | null
          slug: string
          sort_order: number
          updated_at: string
          updated_by: string | null
          usd_price: number
          zar_price: number
        }
        Insert: {
          active_clients_limit?: number | null
          created_at?: string
          eur_price: number
          features?: Json
          gbp_price: number
          id?: string
          is_active?: boolean
          is_recommended?: boolean
          name: string
          orders_per_quarter_limit?: number | null
          slug: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          usd_price: number
          zar_price: number
        }
        Update: {
          active_clients_limit?: number | null
          created_at?: string
          eur_price?: number
          features?: Json
          gbp_price?: number
          id?: string
          is_active?: boolean
          is_recommended?: boolean
          name?: string
          orders_per_quarter_limit?: number | null
          slug?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          usd_price?: number
          zar_price?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_role: string | null
          avatar_url: string | null
          base_callout_fee: number | null
          company_id: string | null
          company_name: string | null
          company_slug: string | null
          created_at: string | null
          currency: string | null
          date_hired: string | null
          date_of_birth: string | null
          deleted_at: string | null
          distance_rate_per_km: number | null
          drive_time_to_kitchen_minutes: number | null
          drivers_license_expiry: string | null
          drivers_license_number: string | null
          email: string
          email_verified: boolean | null
          employee_number: string | null
          full_name: string
          home_postcode: string | null
          hourly_rate: number | null
          id: string
          id_number: string | null
          is_active: boolean | null
          max_jobs_per_shift: number | null
          mobile_number: string | null
          notification_preferences: Json | null
          phone: string | null
          phone_number: string | null
          phone_verified: boolean | null
          region: string | null
          region_id: string | null
          regions_covered: string[] | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
          vehicle_id: string | null
          vehicle_registration: string | null
          whatsapp_opt_in: boolean | null
        }
        Insert: {
          active_role?: string | null
          avatar_url?: string | null
          base_callout_fee?: number | null
          company_id?: string | null
          company_name?: string | null
          company_slug?: string | null
          created_at?: string | null
          currency?: string | null
          date_hired?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          distance_rate_per_km?: number | null
          drive_time_to_kitchen_minutes?: number | null
          drivers_license_expiry?: string | null
          drivers_license_number?: string | null
          email: string
          email_verified?: boolean | null
          employee_number?: string | null
          full_name: string
          home_postcode?: string | null
          hourly_rate?: number | null
          id: string
          id_number?: string | null
          is_active?: boolean | null
          max_jobs_per_shift?: number | null
          mobile_number?: string | null
          notification_preferences?: Json | null
          phone?: string | null
          phone_number?: string | null
          phone_verified?: boolean | null
          region?: string | null
          region_id?: string | null
          regions_covered?: string[] | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          vehicle_id?: string | null
          vehicle_registration?: string | null
          whatsapp_opt_in?: boolean | null
        }
        Update: {
          active_role?: string | null
          avatar_url?: string | null
          base_callout_fee?: number | null
          company_id?: string | null
          company_name?: string | null
          company_slug?: string | null
          created_at?: string | null
          currency?: string | null
          date_hired?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          distance_rate_per_km?: number | null
          drive_time_to_kitchen_minutes?: number | null
          drivers_license_expiry?: string | null
          drivers_license_number?: string | null
          email?: string
          email_verified?: boolean | null
          employee_number?: string | null
          full_name?: string
          home_postcode?: string | null
          hourly_rate?: number | null
          id?: string
          id_number?: string | null
          is_active?: boolean | null
          max_jobs_per_shift?: number | null
          mobile_number?: string | null
          notification_preferences?: Json | null
          phone?: string | null
          phone_number?: string | null
          phone_verified?: boolean | null
          region?: string | null
          region_id?: string | null
          regions_covered?: string[] | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          vehicle_id?: string | null
          vehicle_registration?: string | null
          whatsapp_opt_in?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_holidays: {
        Row: {
          company_id: string | null
          created_at: string
          date: string
          id: string
          is_recurring: boolean
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          date: string
          id?: string
          is_recurring?: boolean
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          date?: string
          id?: string
          is_recurring?: boolean
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_holidays_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_history: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_line_memory: {
        Row: {
          company_id: string
          description_norm: string
          id: string
          inventory_item_id: string | null
          last_used_at: string
          suggested_rule_id: string | null
          unit_of_measure: string | null
          use_count: number
          vendor_norm: string
        }
        Insert: {
          company_id: string
          description_norm: string
          id?: string
          inventory_item_id?: string | null
          last_used_at?: string
          suggested_rule_id?: string | null
          unit_of_measure?: string | null
          use_count?: number
          vendor_norm: string
        }
        Update: {
          company_id?: string
          description_norm?: string
          id?: string
          inventory_item_id?: string | null
          last_used_at?: string
          suggested_rule_id?: string | null
          unit_of_measure?: string | null
          use_count?: number
          vendor_norm?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_line_memory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_line_memory_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_demand_outlook"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "purchase_line_memory_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_line_memory_suggested_rule_id_fkey"
            columns: ["suggested_rule_id"]
            isOneToOne: false
            referencedRelation: "sa_tax_deductibility_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipt_items: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          description: string
          id: string
          inventory_item_id: string | null
          inventory_received_at: string | null
          is_deductible: boolean
          is_draft: boolean
          notes: string | null
          quantity: number | null
          receipt_id: string
          suggested_rule_id: string | null
          unit_of_measure: string | null
          unit_price: number | null
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          description: string
          id?: string
          inventory_item_id?: string | null
          inventory_received_at?: string | null
          is_deductible?: boolean
          is_draft?: boolean
          notes?: string | null
          quantity?: number | null
          receipt_id: string
          suggested_rule_id?: string | null
          unit_of_measure?: string | null
          unit_price?: number | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          inventory_item_id?: string | null
          inventory_received_at?: string | null
          is_deductible?: boolean
          is_draft?: boolean
          notes?: string | null
          quantity?: number | null
          receipt_id?: string
          suggested_rule_id?: string | null
          unit_of_measure?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipt_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_demand_outlook"
            referencedColumns: ["inventory_item_id"]
          },
          {
            foreignKeyName: "purchase_receipt_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_items_suggested_rule_id_fkey"
            columns: ["suggested_rule_id"]
            isOneToOne: false
            referencedRelation: "sa_tax_deductibility_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipts: {
        Row: {
          company_id: string
          created_at: string
          currency: string
          deleted_at: string | null
          id: string
          image_path: string | null
          image_url: string | null
          notes: string | null
          receipt_date: string | null
          supplier_id: string | null
          total: number | null
          updated_at: string
          uploaded_by: string | null
          vendor: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          notes?: string | null
          receipt_date?: string | null
          supplier_id?: string | null
          total?: number | null
          updated_at?: string
          uploaded_by?: string | null
          vendor?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          id?: string
          image_path?: string | null
          image_url?: string | null
          notes?: string | null
          receipt_date?: string | null
          supplier_id?: string | null
          total?: number | null
          updated_at?: string
          uploaded_by?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_acceptances: {
        Row: {
          accepted_at: string
          acceptor_name: string
          company_id: string
          id: string
          ip_hash: string | null
          quote_id: string
          user_agent: string | null
        }
        Insert: {
          accepted_at?: string
          acceptor_name: string
          company_id: string
          id?: string
          ip_hash?: string | null
          quote_id: string
          user_agent?: string | null
        }
        Update: {
          accepted_at?: string
          acceptor_name?: string
          company_id?: string
          id?: string
          ip_hash?: string | null
          quote_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_acceptances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_acceptances_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_acceptances_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "won_then_cancelled_quotes"
            referencedColumns: ["quote_id"]
          },
        ]
      }
      quote_change_requests: {
        Row: {
          addressed_at: string | null
          addressed_by: string | null
          admin_notes: string | null
          company_id: string
          created_at: string
          id: string
          lead_id: string | null
          message: string
          quote_id: string
          requested_changes: Json | null
          status: string
          submitter_ip_hash: string | null
          submitter_name: string | null
          submitter_user_agent: string | null
          updated_at: string
        }
        Insert: {
          addressed_at?: string | null
          addressed_by?: string | null
          admin_notes?: string | null
          company_id: string
          created_at?: string
          id?: string
          lead_id?: string | null
          message: string
          quote_id: string
          requested_changes?: Json | null
          status?: string
          submitter_ip_hash?: string | null
          submitter_name?: string | null
          submitter_user_agent?: string | null
          updated_at?: string
        }
        Update: {
          addressed_at?: string | null
          addressed_by?: string | null
          admin_notes?: string | null
          company_id?: string
          created_at?: string
          id?: string
          lead_id?: string | null
          message?: string
          quote_id?: string
          requested_changes?: Json | null
          status?: string
          submitter_ip_hash?: string | null
          submitter_name?: string | null
          submitter_user_agent?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_change_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_change_requests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_change_requests_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_change_requests_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "won_then_cancelled_quotes"
            referencedColumns: ["quote_id"]
          },
        ]
      }
      quote_followup_log: {
        Row: {
          channel: string
          company_id: string
          created_at: string
          id: string
          notes: string | null
          quote_id: string
          sent_at: string
          sent_by_user_id: string | null
          sequence_position: number
          status: string
          template_key: string
        }
        Insert: {
          channel: string
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          quote_id: string
          sent_at?: string
          sent_by_user_id?: string | null
          sequence_position: number
          status?: string
          template_key: string
        }
        Update: {
          channel?: string
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          quote_id?: string
          sent_at?: string
          sent_by_user_id?: string | null
          sequence_position?: number
          status?: string
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_followup_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_followup_log_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_followup_log_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "won_then_cancelled_quotes"
            referencedColumns: ["quote_id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          client_email: string
          client_id: string | null
          client_name: string | null
          client_phone: string | null
          comms_paused_until: string | null
          company_id: string
          contact_name: string | null
          converted_to_order_id: string | null
          created_at: string | null
          deleted_at: string | null
          delivery_distance_km: number | null
          delivery_fee: number
          delivery_rate_per_km: number | null
          deposit_percentage: number | null
          discount_amount: number | null
          equipment_items: Json | null
          event_date: string | null
          event_time: string | null
          event_type: string | null
          external_source: string | null
          guest_count: number | null
          id: string
          import_job_id: string | null
          imported_at: string | null
          lead_id: string | null
          lost_reason: Database["public"]["Enums"]["lost_reason"] | null
          menu_items: Json | null
          notes: string | null
          parent_quote_id: string | null
          prepared_by: string | null
          public_token: string
          quote_name: string
          quote_number: string
          region_id: string
          rejected_at: string | null
          sent_at: string | null
          setup_time: string | null
          source: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tags: Json | null
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
          xero_quote_id: string | null
          xero_synced_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_email: string
          client_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          comms_paused_until?: string | null
          company_id: string
          contact_name?: string | null
          converted_to_order_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          delivery_distance_km?: number | null
          delivery_fee?: number
          delivery_rate_per_km?: number | null
          deposit_percentage?: number | null
          discount_amount?: number | null
          equipment_items?: Json | null
          event_date?: string | null
          event_time?: string | null
          event_type?: string | null
          external_source?: string | null
          guest_count?: number | null
          id?: string
          import_job_id?: string | null
          imported_at?: string | null
          lead_id?: string | null
          lost_reason?: Database["public"]["Enums"]["lost_reason"] | null
          menu_items?: Json | null
          notes?: string | null
          parent_quote_id?: string | null
          prepared_by?: string | null
          public_token?: string
          quote_name: string
          quote_number: string
          region_id: string
          rejected_at?: string | null
          sent_at?: string | null
          setup_time?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tags?: Json | null
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
          xero_quote_id?: string | null
          xero_synced_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_email?: string
          client_id?: string | null
          client_name?: string | null
          client_phone?: string | null
          comms_paused_until?: string | null
          company_id?: string
          contact_name?: string | null
          converted_to_order_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          delivery_distance_km?: number | null
          delivery_fee?: number
          delivery_rate_per_km?: number | null
          deposit_percentage?: number | null
          discount_amount?: number | null
          equipment_items?: Json | null
          event_date?: string | null
          event_time?: string | null
          event_type?: string | null
          external_source?: string | null
          guest_count?: number | null
          id?: string
          import_job_id?: string | null
          imported_at?: string | null
          lead_id?: string | null
          lost_reason?: Database["public"]["Enums"]["lost_reason"] | null
          menu_items?: Json | null
          notes?: string | null
          parent_quote_id?: string | null
          prepared_by?: string | null
          public_token?: string
          quote_name?: string
          quote_number?: string
          region_id?: string
          rejected_at?: string | null
          sent_at?: string | null
          setup_time?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tags?: Json | null
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
          xero_quote_id?: string | null
          xero_synced_at?: string | null
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
            foreignKeyName: "quotes_converted_to_order_id_fkey"
            columns: ["converted_to_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
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
            foreignKeyName: "quotes_parent_quote_id_fkey"
            columns: ["parent_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_parent_quote_id_fkey"
            columns: ["parent_quote_id"]
            isOneToOne: false
            referencedRelation: "won_then_cancelled_quotes"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "quotes_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "inventory_demand_outlook"
            referencedColumns: ["inventory_item_id"]
          },
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
            isOneToOne: true
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoice_runs: {
        Row: {
          error: string | null
          id: string
          invoice_id: string | null
          ran_at: string
          scheduled_for: string
          success: boolean
          template_id: string
        }
        Insert: {
          error?: string | null
          id?: string
          invoice_id?: string | null
          ran_at?: string
          scheduled_for: string
          success: boolean
          template_id: string
        }
        Update: {
          error?: string | null
          id?: string
          invoice_id?: string | null
          ran_at?: string
          scheduled_for?: string
          success?: boolean
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoice_runs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoice_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "recurring_invoice_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoice_templates: {
        Row: {
          active: boolean
          client_email: string | null
          client_id: string | null
          client_name: string
          client_phone: string | null
          company_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          frequency: string
          id: string
          line_items: Json
          next_run_at: string
          notes: string | null
          pause_until: string | null
          start_date: string
          subtotal: number
          tax_amount: number
          template_name: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          client_email?: string | null
          client_id?: string | null
          client_name: string
          client_phone?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          frequency: string
          id?: string
          line_items?: Json
          next_run_at: string
          notes?: string | null
          pause_until?: string | null
          start_date: string
          subtotal?: number
          tax_amount?: number
          template_name: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          client_phone?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          frequency?: string
          id?: string
          line_items?: Json
          next_run_at?: string
          notes?: string | null
          pause_until?: string | null
          start_date?: string
          subtotal?: number
          tax_amount?: number
          template_name?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoice_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_invoice_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          address: string | null
          auto_assign_orders: boolean | null
          cancellation_policy: Json | null
          city: string | null
          code: string
          company_id: string | null
          country: string
          created_at: string | null
          currency: string | null
          delivery_cost_per_km: number | null
          delivery_radius_km: number | null
          deposit_percent: number | null
          email: string | null
          id: string
          is_active: boolean | null
          lat: number | null
          lng: number | null
          manager_user_id: string | null
          min_delivery_fee: number | null
          name: string | null
          notes: string | null
          notify_manager_on_new_lead: boolean
          notify_manager_on_new_order: boolean
          notify_manager_on_prep_alert: boolean
          operating_hours_end: string | null
          operating_hours_start: string | null
          phone: string | null
          postal_code: string | null
          province_state: string | null
          timezone: string | null
          updated_at: string | null
          user_id: string | null
          vat_rate: number | null
          vat_registered: boolean | null
        }
        Insert: {
          address?: string | null
          auto_assign_orders?: boolean | null
          cancellation_policy?: Json | null
          city?: string | null
          code: string
          company_id?: string | null
          country?: string
          created_at?: string | null
          currency?: string | null
          delivery_cost_per_km?: number | null
          delivery_radius_km?: number | null
          deposit_percent?: number | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          lat?: number | null
          lng?: number | null
          manager_user_id?: string | null
          min_delivery_fee?: number | null
          name?: string | null
          notes?: string | null
          notify_manager_on_new_lead?: boolean
          notify_manager_on_new_order?: boolean
          notify_manager_on_prep_alert?: boolean
          operating_hours_end?: string | null
          operating_hours_start?: string | null
          phone?: string | null
          postal_code?: string | null
          province_state?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_rate?: number | null
          vat_registered?: boolean | null
        }
        Update: {
          address?: string | null
          auto_assign_orders?: boolean | null
          cancellation_policy?: Json | null
          city?: string | null
          code?: string
          company_id?: string | null
          country?: string
          created_at?: string | null
          currency?: string | null
          delivery_cost_per_km?: number | null
          delivery_radius_km?: number | null
          deposit_percent?: number | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          lat?: number | null
          lng?: number | null
          manager_user_id?: string | null
          min_delivery_fee?: number | null
          name?: string | null
          notes?: string | null
          notify_manager_on_new_lead?: boolean
          notify_manager_on_new_order?: boolean
          notify_manager_on_prep_alert?: boolean
          operating_hours_end?: string | null
          operating_hours_start?: string | null
          phone?: string | null
          postal_code?: string | null
          province_state?: string | null
          timezone?: string | null
          updated_at?: string | null
          user_id?: string | null
          vat_rate?: number | null
          vat_registered?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "regions_manager_user_id_fkey"
            columns: ["manager_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      sa_tax_deductibility_rules: {
        Row: {
          capital_threshold_rand: number | null
          category_code: string
          created_at: string
          deductibility: string
          display_name: string
          display_order: number
          example_items: string[]
          group_label: string
          id: string
          is_active: boolean
          legal_reference: string | null
          match_keywords: string[]
          notes: string | null
          treatment: string
          updated_at: string
          vat_input_claimable: string
        }
        Insert: {
          capital_threshold_rand?: number | null
          category_code: string
          created_at?: string
          deductibility: string
          display_name: string
          display_order?: number
          example_items?: string[]
          group_label: string
          id?: string
          is_active?: boolean
          legal_reference?: string | null
          match_keywords?: string[]
          notes?: string | null
          treatment: string
          updated_at?: string
          vat_input_claimable: string
        }
        Update: {
          capital_threshold_rand?: number | null
          category_code?: string
          created_at?: string
          deductibility?: string
          display_name?: string
          display_order?: number
          example_items?: string[]
          group_label?: string
          id?: string
          is_active?: boolean
          legal_reference?: string | null
          match_keywords?: string[]
          notes?: string | null
          treatment?: string
          updated_at?: string
          vat_input_claimable?: string
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
          assigned_shopper_id: string | null
          category: string | null
          created_at: string | null
          estimated_cost: number | null
          id: string
          item_id: string | null
          name: string | null
          notes: string | null
          purchased: boolean | null
          quantity: number | null
          removed_at: string | null
          removed_reason: string | null
          shopping_list_id: string | null
          source_order_id: string | null
          unit: string | null
          user_id: string | null
        }
        Insert: {
          actual_cost?: number | null
          assigned_shopper_id?: string | null
          category?: string | null
          created_at?: string | null
          estimated_cost?: number | null
          id?: string
          item_id?: string | null
          name?: string | null
          notes?: string | null
          purchased?: boolean | null
          quantity?: number | null
          removed_at?: string | null
          removed_reason?: string | null
          shopping_list_id?: string | null
          source_order_id?: string | null
          unit?: string | null
          user_id?: string | null
        }
        Update: {
          actual_cost?: number | null
          assigned_shopper_id?: string | null
          category?: string | null
          created_at?: string | null
          estimated_cost?: number | null
          id?: string
          item_id?: string | null
          name?: string | null
          notes?: string | null
          purchased?: boolean | null
          quantity?: number | null
          removed_at?: string | null
          removed_reason?: string | null
          shopping_list_id?: string | null
          source_order_id?: string | null
          unit?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_assigned_shopper_id_fkey"
            columns: ["assigned_shopper_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
          source: string | null
          source_period_end: string | null
          source_period_start: string | null
          status: string | null
          title: string | null
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
          source?: string | null
          source_period_end?: string | null
          source_period_start?: string | null
          status?: string | null
          title?: string | null
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
          source?: string | null
          source_period_end?: string | null
          source_period_start?: string | null
          status?: string | null
          title?: string | null
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
          company_id: string
          created_at: string | null
          expires_at: string | null
          id: string
          invitation_token: string | null
          invited_by: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invitation_token?: string | null
          invited_by?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          invitation_token?: string | null
          invited_by?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
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
      staff_shift_tasks: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          billable: boolean
          company_id: string
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          id: string
          notes: string | null
          planned_end: string | null
          planned_minutes: number | null
          planned_start: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          shift_id: string
          task_type: string
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          billable?: boolean
          company_id: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          planned_end?: string | null
          planned_minutes?: number | null
          planned_start?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          shift_id: string
          task_type: string
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          billable?: boolean
          company_id?: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          planned_end?: string | null
          planned_minutes?: number | null
          planned_start?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          shift_id?: string
          task_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_shift_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shift_tasks_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "driver_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shift_tasks_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "kitchen_shifts"
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
          entered_by_user_id: string | null
          entered_manually: boolean
          entry_reason: string | null
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
          entered_by_user_id?: string | null
          entered_manually?: boolean
          entry_reason?: string | null
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
          entered_by_user_id?: string | null
          entered_manually?: boolean
          entry_reason?: string | null
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
      subscription_webhook_events: {
        Row: {
          company_id: string | null
          created_at: string
          event_id: string
          event_type: string
          id: string
          processed_at: string
          provider: string
          raw: Json
          rejection_reason: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          event_id: string
          event_type: string
          id?: string
          processed_at?: string
          provider: string
          raw: Json
          rejection_reason?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          event_id?: string
          event_type?: string
          id?: string
          processed_at?: string
          provider?: string
          raw?: Json
          rejection_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_webhook_events_company_id_fkey"
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
      supplier_payables: {
        Row: {
          amount_cents: number
          company_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string
          id: string
          invoice_ref: string | null
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          status: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          company_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date: string
          id?: string
          invoice_ref?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string
          id?: string
          invoice_ref?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payables_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payables_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payables_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
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
          payment_method: string | null
          payment_terms: number | null
          phone: string | null
          postal_code: string | null
          preferred_contact_method: string | null
          rating: number | null
          supplier_categories: string[] | null
          supplier_name: string
          updated_at: string | null
          website: string | null
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
          payment_method?: string | null
          payment_terms?: number | null
          phone?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          rating?: number | null
          supplier_categories?: string[] | null
          supplier_name: string
          updated_at?: string | null
          website?: string | null
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
          payment_method?: string | null
          payment_terms?: number | null
          phone?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          rating?: number | null
          supplier_categories?: string[] | null
          supplier_name?: string
          updated_at?: string | null
          website?: string | null
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
      user_saved_views: {
        Row: {
          company_id: string | null
          config: Json
          created_at: string
          id: string
          name: string
          surface: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          config?: Json
          created_at?: string
          id?: string
          name: string
          surface: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          config?: Json
          created_at?: string
          id?: string
          name?: string
          surface?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_saved_views_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_bookings: {
        Row: {
          booked_from: string
          booked_until: string
          company_id: string
          created_at: string
          driver_id: string | null
          id: string
          notes: string | null
          order_id: string | null
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          booked_from: string
          booked_until: string
          company_id: string
          created_at?: string
          driver_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          booked_from?: string
          booked_until?: string
          company_id?: string
          created_at?: string
          driver_id?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_bookings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_bookings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_maintenance_log: {
        Row: {
          company_id: string
          cost: number | null
          created_at: string
          id: string
          next_service_due: string | null
          notes: string | null
          odometer_km: number | null
          service_type: string
          serviced_at: string
          serviced_by_user_id: string | null
          vehicle_id: string
        }
        Insert: {
          company_id: string
          cost?: number | null
          created_at?: string
          id?: string
          next_service_due?: string | null
          notes?: string | null
          odometer_km?: number | null
          service_type?: string
          serviced_at?: string
          serviced_by_user_id?: string | null
          vehicle_id: string
        }
        Update: {
          company_id?: string
          cost?: number | null
          created_at?: string
          id?: string
          next_service_due?: string | null
          notes?: string | null
          odometer_km?: number | null
          service_type?: string
          serviced_at?: string
          serviced_by_user_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_log_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          capacity_kg: number | null
          cargo_volume_litres: number | null
          company_id: string | null
          created_at: string | null
          current_odometer_km: number | null
          deleted_at: string | null
          driver_owner_id: string | null
          has_warmer: boolean
          id: string
          is_active: boolean
          last_serviced_at: string | null
          make: string | null
          max_pax_served: number | null
          model: string | null
          next_service_due: string | null
          nickname: string | null
          notes: string | null
          owner_kind: Database["public"]["Enums"]["vehicle_owner_kind"]
          plate: string | null
          primary_driver_id: string | null
          refrigerated: boolean
          region_id: string | null
          requires_two_people: boolean
          service_interval_days: number | null
          updated_at: string
          vehicle_type: string | null
          year: number | null
        }
        Insert: {
          capacity_kg?: number | null
          cargo_volume_litres?: number | null
          company_id?: string | null
          created_at?: string | null
          current_odometer_km?: number | null
          deleted_at?: string | null
          driver_owner_id?: string | null
          has_warmer?: boolean
          id?: string
          is_active?: boolean
          last_serviced_at?: string | null
          make?: string | null
          max_pax_served?: number | null
          model?: string | null
          next_service_due?: string | null
          nickname?: string | null
          notes?: string | null
          owner_kind?: Database["public"]["Enums"]["vehicle_owner_kind"]
          plate?: string | null
          primary_driver_id?: string | null
          refrigerated?: boolean
          region_id?: string | null
          requires_two_people?: boolean
          service_interval_days?: number | null
          updated_at?: string
          vehicle_type?: string | null
          year?: number | null
        }
        Update: {
          capacity_kg?: number | null
          cargo_volume_litres?: number | null
          company_id?: string | null
          created_at?: string | null
          current_odometer_km?: number | null
          deleted_at?: string | null
          driver_owner_id?: string | null
          has_warmer?: boolean
          id?: string
          is_active?: boolean
          last_serviced_at?: string | null
          make?: string | null
          max_pax_served?: number | null
          model?: string | null
          next_service_due?: string | null
          nickname?: string | null
          notes?: string | null
          owner_kind?: Database["public"]["Enums"]["vehicle_owner_kind"]
          plate?: string | null
          primary_driver_id?: string | null
          refrigerated?: boolean
          region_id?: string | null
          requires_two_people?: boolean
          service_interval_days?: number | null
          updated_at?: string
          vehicle_type?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
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
      webhook_deliveries: {
        Row: {
          company_id: string
          error_message: string | null
          event_type: string
          fired_at: string | null
          id: string
          payload: Json
          response_body: string | null
          status_code: number | null
          subscription_id: string | null
        }
        Insert: {
          company_id: string
          error_message?: string | null
          event_type: string
          fired_at?: string | null
          id?: string
          payload: Json
          response_body?: string | null
          status_code?: number | null
          subscription_id?: string | null
        }
        Update: {
          company_id?: string
          error_message?: string | null
          event_type?: string
          fired_at?: string | null
          id?: string
          payload?: Json
          response_body?: string | null
          status_code?: number | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "webhook_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_subscriptions: {
        Row: {
          company_id: string
          created_at: string | null
          event_type: string
          failure_count: number | null
          id: string
          is_active: boolean | null
          label: string | null
          last_fired_at: string | null
          last_status: number | null
          signing_secret: string
          target_url: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          event_type: string
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          last_fired_at?: string | null
          last_status?: number | null
          signing_secret: string
          target_url: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          event_type?: string
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          last_fired_at?: string | null
          last_status?: number | null
          signing_secret?: string
          target_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_subscriptions_company_id_fkey"
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
      xero_integration_settings: {
        Row: {
          access_token_encrypted: string | null
          company_id: string
          created_at: string | null
          default_account_code: string | null
          default_tax_type: string | null
          id: string
          is_connected: boolean | null
          last_sync_error: string | null
          last_synced_at: string | null
          pull_invoice_payments: boolean | null
          pull_quotes_from_xero: boolean | null
          push_invoices_to_xero: boolean | null
          push_quotes_to_xero: boolean | null
          refresh_token_encrypted: string | null
          scopes: string[] | null
          token_expires_at: string | null
          updated_at: string | null
          xero_tenant_id: string | null
          xero_tenant_name: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          company_id: string
          created_at?: string | null
          default_account_code?: string | null
          default_tax_type?: string | null
          id?: string
          is_connected?: boolean | null
          last_sync_error?: string | null
          last_synced_at?: string | null
          pull_invoice_payments?: boolean | null
          pull_quotes_from_xero?: boolean | null
          push_invoices_to_xero?: boolean | null
          push_quotes_to_xero?: boolean | null
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string | null
          xero_tenant_id?: string | null
          xero_tenant_name?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          company_id?: string
          created_at?: string | null
          default_account_code?: string | null
          default_tax_type?: string | null
          id?: string
          is_connected?: boolean | null
          last_sync_error?: string | null
          last_synced_at?: string | null
          pull_invoice_payments?: boolean | null
          pull_quotes_from_xero?: boolean | null
          push_invoices_to_xero?: boolean | null
          push_quotes_to_xero?: boolean | null
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string | null
          xero_tenant_id?: string | null
          xero_tenant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xero_integration_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      driver_shifts: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          company_id: string | null
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          driver_id: string | null
          hours_worked: number | null
          id: string | null
          notes: string | null
          order_id: string | null
          planned_end: string | null
          planned_start: string | null
          rate_multiplier: number | null
          shift_date: string | null
          source: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          driver_id?: string | null
          hours_worked?: number | null
          id?: string | null
          notes?: string | null
          order_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          rate_multiplier?: number | null
          shift_date?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          driver_id?: string | null
          hours_worked?: number | null
          id?: string | null
          notes?: string | null
          order_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          rate_multiplier?: number | null
          shift_date?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_shifts_staff_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      inventory_demand_outlook: {
        Row: {
          category: string | null
          company_id: string | null
          current_stock: number | null
          demand_next_14_days: number | null
          demand_next_30_days: number | null
          demand_next_7_days: number | null
          inventory_item_id: string | null
          item_name: string | null
          minimum_stock: number | null
          projected_stock_after_7_days: number | null
          reorder_quantity: number | null
          shortfall_next_7_days: number | null
          status: string | null
          unit_of_measure: string | null
          upcoming_order_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_ingredient_demand: {
        Row: {
          company_id: string | null
          event_date: string | null
          event_name: string | null
          guest_count: number | null
          ingredient_name: string | null
          inventory_item_id: string | null
          menu_item_id: string | null
          menu_item_name: string | null
          order_id: string | null
          order_item_id: string | null
          order_number: string | null
          order_status: Database["public"]["Enums"]["order_status"] | null
          portions_ordered: number | null
          quantity_per_base: number | null
          quantity_required: number | null
          recipe_base_servings: number | null
          recipe_id: string | null
          unit: string | null
        }
        Relationships: []
      }
      orders_per_email_rollup: {
        Row: {
          company_id: string | null
          email_key: string | null
          last_event_date: string | null
          last_order_created_at: string | null
          next_event_date: string | null
          order_count: number | null
          order_ids: string[] | null
          sample_client_name: string | null
          sample_client_phone: string | null
          total_spent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      won_then_cancelled_quotes: {
        Row: {
          cancellation_reason_category: string | null
          cancelled_at: string | null
          client_name: string | null
          company_id: string | null
          lost_at: string | null
          lost_reason: Database["public"]["Enums"]["lost_reason"] | null
          order_id: string | null
          quote_id: string | null
          quote_number: string | null
          quoted_amount: number | null
          quoted_at: string | null
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
            foreignKeyName: "quotes_converted_to_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
      api_create_lead: {
        Args: { p_key_hash: string; p_payload: Json }
        Returns: Json
      }
      api_create_quote: {
        Args: { p_key_hash: string; p_payload: Json }
        Returns: Json
      }
      api_mark_invoice_paid: {
        Args: { p_key_hash: string; p_payload: Json }
        Returns: Json
      }
      archive_old_gps_logs: { Args: never; Returns: number }
      auth_user_is_company_staff: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      bump_number_settings_on_insert: {
        Args: { p_company_id: string; p_doc_type: string; p_number: string }
        Returns: undefined
      }
      check_trial_expiry_notifications: { Args: never; Returns: undefined }
      claim_email_batch: {
        Args: {
          p_allow_list: string[]
          p_batch_size?: number
          p_max_attempts?: number
        }
        Returns: {
          attempts: number
          body: string
          company_id: string
          id: string
          subject: string
          template_type: string
          to_email: string
          to_name: string
          trigger_event: string
          trigger_ref_id: string
          variables: Json
        }[]
      }
      claim_order: { Args: { p_order_id: string }; Returns: Json }
      client_order_history_count: {
        Args: { p_company_id: string; p_email: string }
        Returns: number
      }
      client_view_account: {
        Args: { p_ip?: string; p_token_hash: string; p_user_agent?: string }
        Returns: Json
      }
      client_view_order: {
        Args: {
          p_ip?: string
          p_order_id: string
          p_token_hash: string
          p_user_agent?: string
        }
        Returns: Json
      }
      cms_parse_doc_seq: { Args: { p_number: string }; Returns: number }
      consume_api_key_rate_limit: {
        Args: { p_key_hash: string; p_max_per_minute?: number }
        Returns: {
          allowed: boolean
          remaining: number
          reset_in_ms: number
        }[]
      }
      consume_api_key_rate_limit_windowed: {
        Args: {
          p_key_hash: string
          p_max_per_window: number
          p_window_seconds?: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          reset_in_ms: number
        }[]
      }
      consume_next_document_number: {
        Args: { p_company_id: string; p_document_type: string }
        Returns: string
      }
      convert_quote_to_order: {
        Args: {
          p_actor_user_id: string
          p_company_id: string
          p_order_payload: Json
          p_quote_id: string
        }
        Returns: {
          amount_paid: number | null
          arrived_at_venue_at: string | null
          assigned_at: string | null
          assigned_chef_id: string | null
          assigned_driver_id: string | null
          assigned_vehicle_id: string | null
          assignment_score: number | null
          balance_amount: number | null
          balance_due_date: string | null
          balance_paid: boolean | null
          balance_paid_at: string | null
          balance_transaction_id: string | null
          cancellation_reason: string | null
          cancellation_reason_category: string | null
          cancelled_at: string | null
          cancelled_by_user_id: string | null
          cascade_receipt: Json | null
          cascade_receipt_at: string | null
          client_email: string | null
          client_id: string
          client_name: string | null
          client_phone: string | null
          collection_time: string | null
          comms_paused_until: string | null
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
          departed_venue_at: string | null
          deposit_amount: number | null
          deposit_paid: boolean | null
          deposit_paid_at: string | null
          deposit_percentage: number | null
          deposit_transaction_id: string | null
          dietary_requirements: string | null
          discount_amount: number | null
          driver_acknowledged_at: string | null
          driver_acknowledged_via: string | null
          driver_id: string | null
          equipment_return_method: string | null
          event_date: string
          event_end_date: string | null
          event_name: string
          event_time: string | null
          final_order_change_date: string | null
          guest_count: number
          id: string
          import_job_id: string | null
          imported_at: string | null
          internal_notes: string | null
          inventory_deducted_at: string | null
          kitchen_instructions: string | null
          last_notified_stage_at: string | null
          last_notified_stage_key: string | null
          lead_source: string | null
          order_number: string
          package_id: string | null
          paused_at: string | null
          paused_by_user_id: string | null
          paused_expected_resume_date: string | null
          paused_from_status: Database["public"]["Enums"]["order_status"] | null
          paused_reason: string | null
          paused_reason_category: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          picked_up_at: string | null
          pickup_time: string | null
          pod_captured_at: string | null
          pod_photo_url: string | null
          pod_recipient_name: string | null
          pod_signature_url: string | null
          postponed_at: string | null
          postponed_from_date: string | null
          prep_started_at: string | null
          quote_id: string | null
          ready_at: string | null
          region_id: string
          requires_refrigeration: boolean
          requires_two_drivers: boolean
          requires_waiter: boolean | null
          secondary_driver_id: string | null
          secondary_vehicle_id: string | null
          service_started_at: string | null
          setup_started_at: string | null
          setup_time: string | null
          special_instructions: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number | null
          tax_amount: number | null
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
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_company_id: { Args: never; Returns: string }
      decrement_equipment_quantity: { Args: never; Returns: undefined }
      disablelongtransactions: { Args: never; Returns: string }
      dispatch_webhook: {
        Args: { p_company_id: string; p_event_type: string; p_payload: Json }
        Returns: undefined
      }
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
      enable_comms_for_import_job: { Args: { p_job_id: string }; Returns: Json }
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
      get_company_branding: {
        Args: { p_slug: string }
        Returns: {
          company_name: string
          id: string
          logo_url: string
          primary_color: string
          secondary_color: string
          slug: string
        }[]
      }
      get_refund_for_order: { Args: { p_order_id: string }; Returns: Json }
      get_user_company_id: { Args: { user_id: string }; Returns: string }
      get_user_region_ids: { Args: { p_user_id?: string }; Returns: string[] }
      gettransactionid: { Args: never; Returns: unknown }
      increment_embed_form_views: {
        Args: { p_form_id: string }
        Returns: undefined
      }
      increment_embed_rate_limit: {
        Args: {
          p_ip_hash: string
          p_limit: number
          p_token: string
          p_window_start: string
        }
        Returns: Json
      }
      is_comms_paused_for_email: {
        Args: { p_company_id: string; p_email: string }
        Returns: boolean
      }
      is_company_admin: { Args: { user_id: string }; Returns: boolean }
      is_company_slug_available: {
        Args: { p_slug: string }
        Returns: {
          available: boolean
          reason: string
        }[]
      }
      is_order_amendable: { Args: { p_order_id: string }; Returns: boolean }
      is_owner_or_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      longtransactionsenabled: { Args: never; Returns: boolean }
      mint_client_account_token: {
        Args: { p_company_id: string; p_email: string; p_label?: string }
        Returns: Json
      }
      mint_client_order_token: {
        Args: { p_company_id: string; p_label?: string; p_order_id: string }
        Returns: Json
      }
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
      prune_api_key_rate_limits: { Args: never; Returns: number }
      prune_embed_rate_limits: { Args: never; Returns: number }
      public_origin: { Args: never; Returns: string }
      recalc_invoice_totals: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      record_invoice_payment: {
        Args: {
          p_amount: number
          p_client_id?: string
          p_company_id?: string
          p_currency?: string
          p_gateway_provider?: string
          p_invoice_id: string
          p_payment_method: string
          p_transaction_id?: string
        }
        Returns: Json
      }
      record_order_payment: {
        Args: {
          p_amount: number
          p_client_id?: string
          p_company_id?: string
          p_currency?: string
          p_gateway_provider?: string
          p_order_id: string
          p_payment_method: string
          p_payment_type?: string
          p_transaction_id?: string
          p_user_id?: string
        }
        Returns: string
      }
      redeem_client_credit: {
        Args: {
          p_client_id: string
          p_company_id: string
          p_created_by_user_id?: string
          p_invoice_id: string
          p_order_id: string
          p_requested_amount: number
        }
        Returns: Json
      }
      rotate_company_embed_token: {
        Args: { p_company_id: string }
        Returns: string
      }
      soft_delete_contact_cascade: {
        Args: {
          p_block_email: string
          p_block_phone: string
          p_block_reason: string
          p_client_id: string
          p_company_id: string
          p_invoice_ids: string[]
          p_lead_ids: string[]
          p_order_ids: string[]
          p_quote_ids: string[]
        }
        Returns: Json
      }
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
      sweep_stale_hire_drafts: { Args: never; Returns: number }
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
      user_can_access_region: {
        Args: { p_region_id: string; p_user_id?: string }
        Returns: boolean
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
        | "cancelled"
        | "rejected"
      cancellation_category:
        | "client_cancelled"
        | "no_payment"
        | "kitchen_capacity"
        | "weather"
        | "force_majeure"
        | "venue_changed"
        | "duplicate"
        | "package_cancelled"
        | "other"
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
        | "voided"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "quoted"
        | "negotiating"
        | "won"
        | "lost"
        | "manual_add"
      lost_reason:
        | "price"
        | "timing"
        | "capacity"
        | "weather"
        | "force_majeure"
        | "no_response"
        | "won_by_competitor"
        | "client_changed_plans"
        | "order_cancelled"
        | "other"
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
        | "payment_claimed"
        | "amendment_requested"
        | "cancellation_requested"
        | "postponement_requested"
        | "amendment_approved"
        | "amendment_partial_approved"
        | "amendment_rejected"
        | "cancellation_approved"
        | "cancellation_rejected"
        | "postponement_approved"
        | "postponement_rejected"
        | "domain_verified"
        | "new_job_available"
        | "quote_rejected"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "ready"
        | "in_transit"
        | "delivered"
        | "completed"
        | "cancelled"
        | "paused"
      payment_method: "cash" | "eft" | "card" | "credit_account" | "other"
      payment_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "refunded"
        | "partially_refunded"
        | "disputed"
        | "partial"
        | "paid"
      quote_status: "draft" | "sent" | "accepted" | "rejected" | "expired"
      subscription_status:
        | "trial"
        | "active"
        | "past_due"
        | "cancelled"
        | "suspended"
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
        | "admin"
        | "kitchen_staff"
        | "driver"
        | "shopping_staff"
        | "cleaning_staff"
        | "client"
        | "region_admin"
        | "sales_admin"
        | "outsource"
        | "owner"
      vehicle_owner_kind: "company" | "driver"
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
        "cancelled",
        "rejected",
      ],
      cancellation_category: [
        "client_cancelled",
        "no_payment",
        "kitchen_capacity",
        "weather",
        "force_majeure",
        "venue_changed",
        "duplicate",
        "package_cancelled",
        "other",
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
        "voided",
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
      lost_reason: [
        "price",
        "timing",
        "capacity",
        "weather",
        "force_majeure",
        "no_response",
        "won_by_competitor",
        "client_changed_plans",
        "order_cancelled",
        "other",
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
        "payment_claimed",
        "amendment_requested",
        "cancellation_requested",
        "postponement_requested",
        "amendment_approved",
        "amendment_partial_approved",
        "amendment_rejected",
        "cancellation_approved",
        "cancellation_rejected",
        "postponement_approved",
        "postponement_rejected",
        "domain_verified",
        "new_job_available",
        "quote_rejected",
      ],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "in_transit",
        "delivered",
        "completed",
        "cancelled",
        "paused",
      ],
      payment_method: ["cash", "eft", "card", "credit_account", "other"],
      payment_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "refunded",
        "partially_refunded",
        "disputed",
        "partial",
        "paid",
      ],
      quote_status: ["draft", "sent", "accepted", "rejected", "expired"],
      subscription_status: [
        "trial",
        "active",
        "past_due",
        "cancelled",
        "suspended",
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
        "admin",
        "kitchen_staff",
        "driver",
        "shopping_staff",
        "cleaning_staff",
        "client",
        "region_admin",
        "sales_admin",
        "outsource",
        "owner",
      ],
      vehicle_owner_kind: ["company", "driver"],
    },
  },
} as const
