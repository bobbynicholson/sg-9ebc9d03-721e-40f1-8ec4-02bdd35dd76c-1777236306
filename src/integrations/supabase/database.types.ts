/* eslint-disable @typescript-eslint/no-empty-object-type */
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
      driver_assignments: {
        Row: {
          accepted_at: string | null
          assignment_type: string
          calculated_distance: number | null
          calculated_hours: number | null
          completed_at: string | null
          created_at: string | null
          driver_id: string
          hourly_rate: number | null
          id: string
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
        }
        Insert: {
          accepted_at?: string | null
          assignment_type: string
          calculated_distance?: number | null
          calculated_hours?: number | null
          completed_at?: string | null
          created_at?: string | null
          driver_id: string
          hourly_rate?: number | null
          id?: string
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
        }
        Update: {
          accepted_at?: string | null
          assignment_type?: string
          calculated_distance?: number | null
          calculated_hours?: number | null
          completed_at?: string | null
          created_at?: string | null
          driver_id?: string
          hourly_rate?: number | null
          id?: string
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
        }
        Relationships: [
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
      equipment: {
        Row: {
          available_quantity: number | null
          category: string
          cleaning_time_hours: number | null
          condition: string | null
          created_at: string | null
          id: string
          last_inspection: string | null
          name: string
          notes: string | null
          quantity: number | null
          region_id: string | null
          replacement_cost: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          available_quantity?: number | null
          category: string
          cleaning_time_hours?: number | null
          condition?: string | null
          created_at?: string | null
          id?: string
          last_inspection?: string | null
          name: string
          notes?: string | null
          quantity?: number | null
          region_id?: string | null
          replacement_cost?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          available_quantity?: number | null
          category?: string
          cleaning_time_hours?: number | null
          condition?: string | null
          created_at?: string | null
          id?: string
          last_inspection?: string | null
          name?: string
          notes?: string | null
          quantity?: number | null
          region_id?: string | null
          replacement_cost?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
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
      inventory: {
        Row: {
          category: string
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
      leads: {
        Row: {
          assigned_to: string | null
          budget: number | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          created_at: string | null
          event_date: string | null
          event_type: string | null
          guest_count: number | null
          id: string
          notes: string | null
          region_id: string | null
          source: string | null
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
          created_at?: string | null
          event_date?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          notes?: string | null
          region_id?: string | null
          source?: string | null
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
          created_at?: string | null
          event_date?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          notes?: string | null
          region_id?: string | null
          source?: string | null
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
      notifications: {
        Row: {
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
          title: string
          user_id: string
        }
        Insert: {
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
          title: string
          user_id: string
        }
        Update: {
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
          title?: string
          user_id?: string
        }
        Relationships: [
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
      orders: {
        Row: {
          amount_paid: number | null
          assigned_chef_id: string | null
          assigned_driver_id: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          collection_time: string | null
          created_at: string | null
          currency: string | null
          delivery_status: string | null
          delivery_time: string | null
          equipment_items: Json | null
          event_date: string
          event_time: string | null
          guest_count: number
          id: string
          internal_notes: string | null
          menu_items: Json | null
          order_number: string
          payment_status: string | null
          pickup_time: string | null
          quote_id: string | null
          region_id: string | null
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
        }
        Insert: {
          amount_paid?: number | null
          assigned_chef_id?: string | null
          assigned_driver_id?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          collection_time?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_status?: string | null
          delivery_time?: string | null
          equipment_items?: Json | null
          event_date: string
          event_time?: string | null
          guest_count: number
          id?: string
          internal_notes?: string | null
          menu_items?: Json | null
          order_number: string
          payment_status?: string | null
          pickup_time?: string | null
          quote_id?: string | null
          region_id?: string | null
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
        }
        Update: {
          amount_paid?: number | null
          assigned_chef_id?: string | null
          assigned_driver_id?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          collection_time?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_status?: string | null
          delivery_time?: string | null
          equipment_items?: Json | null
          event_date?: string
          event_time?: string | null
          guest_count?: number
          id?: string
          internal_notes?: string | null
          menu_items?: Json | null
          order_number?: string
          payment_status?: string | null
          pickup_time?: string | null
          quote_id?: string | null
          region_id?: string | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string | null
          currency: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          role: string | null
          subscription_plan: string | null
          subscription_status: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          phone?: string | null
          role?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string | null
          currency?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          role?: string | null
          subscription_plan?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
      subscriptions: {
        Row: {
          amount: number
          billing_cycle: string
          cancel_at_period_end: boolean | null
          cancelled_at: string | null
          created_at: string | null
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          payfast_subscription_id: string | null
          payfast_token: string | null
          plan_name: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          billing_cycle: string
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payfast_subscription_id?: string | null
          payfast_token?: string | null
          plan_name: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          billing_cycle?: string
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          created_at?: string | null
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          payfast_subscription_id?: string | null
          payfast_token?: string | null
          plan_name?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrement_equipment_quantity: {
        Args: { p_equipment_id: string; p_quantity_to_decrement: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
