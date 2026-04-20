 
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
      automation_workflows: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          steps: Json
          trigger_event: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          steps?: Json
          trigger_event: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          steps?: Json
          trigger_event?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_schedules: {
        Row: {
          assigned_to: string
          company_id: string
          completed_at: string | null
          completion_notes: string | null
          created_at: string | null
          equipment_items: string[] | null
          id: string
          order_id: string | null
          photos_urls: string[] | null
          scheduled_date: string
          scheduled_time: string | null
          started_at: string | null
          status: string | null
          task_description: string
          updated_at: string | null
        }
        Insert: {
          assigned_to: string
          company_id: string
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string | null
          equipment_items?: string[] | null
          id?: string
          order_id?: string | null
          photos_urls?: string[] | null
          scheduled_date: string
          scheduled_time?: string | null
          started_at?: string | null
          status?: string | null
          task_description: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string
          company_id?: string
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string | null
          equipment_items?: string[] | null
          id?: string
          order_id?: string | null
          photos_urls?: string[] | null
          scheduled_date?: string
          scheduled_time?: string | null
          started_at?: string | null
          status?: string | null
          task_description?: string
          updated_at?: string | null
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
            foreignKeyName: "cleaning_schedules_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          alternate_phone: string | null
          city: string | null
          company_id: string
          company_name: string | null
          contact_person: string
          created_at: string | null
          deleted_at: string | null
          dietary_restrictions: Json | null
          email: string
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          preferred_contact_method: string | null
          province: string | null
          slug: string
          source: Database["public"]["Enums"]["lead_source"] | null
          special_requests: string | null
          total_events: number | null
          total_revenue: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          alternate_phone?: string | null
          city?: string | null
          company_id: string
          company_name?: string | null
          contact_person: string
          created_at?: string | null
          deleted_at?: string | null
          dietary_restrictions?: Json | null
          email: string
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          province?: string | null
          slug: string
          source?: Database["public"]["Enums"]["lead_source"] | null
          special_requests?: string | null
          total_events?: number | null
          total_revenue?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          alternate_phone?: string | null
          city?: string | null
          company_id?: string
          company_name?: string | null
          contact_person?: string
          created_at?: string | null
          deleted_at?: string | null
          dietary_restrictions?: Json | null
          email?: string
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          preferred_contact_method?: string | null
          province?: string | null
          slug?: string
          source?: Database["public"]["Enums"]["lead_source"] | null
          special_requests?: string | null
          total_events?: number | null
          total_revenue?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          deleted_at: string | null
          email: string
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          phone: string | null
          postal_code: string | null
          primary_color: string | null
          province: string | null
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          phone?: string | null
          postal_code?: string | null
          primary_color?: string | null
          province?: string | null
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          primary_color?: string | null
          province?: string | null
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          manager_id: string | null
          name: string
          type: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          manager_id?: string | null
          name: string
          type: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          manager_id?: string | null
          name?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_assignments: {
        Row: {
          actual_arrival: string | null
          actual_departure: string | null
          actual_duration_minutes: number | null
          assigned_at: string | null
          assigned_by: string | null
          company_id: string
          created_at: string | null
          delivery_notes: string | null
          distance_km: number | null
          driver_id: string
          driver_notes: string | null
          estimated_arrival: string | null
          estimated_departure: string | null
          estimated_duration_minutes: number | null
          id: string
          order_id: string
          route_id: string | null
          sequence_number: number | null
          status: Database["public"]["Enums"]["assignment_status"] | null
          updated_at: string | null
        }
        Insert: {
          actual_arrival?: string | null
          actual_departure?: string | null
          actual_duration_minutes?: number | null
          assigned_at?: string | null
          assigned_by?: string | null
          company_id: string
          created_at?: string | null
          delivery_notes?: string | null
          distance_km?: number | null
          driver_id: string
          driver_notes?: string | null
          estimated_arrival?: string | null
          estimated_departure?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          order_id: string
          route_id?: string | null
          sequence_number?: number | null
          status?: Database["public"]["Enums"]["assignment_status"] | null
          updated_at?: string | null
        }
        Update: {
          actual_arrival?: string | null
          actual_departure?: string | null
          actual_duration_minutes?: number | null
          assigned_at?: string | null
          assigned_by?: string | null
          company_id?: string
          created_at?: string | null
          delivery_notes?: string | null
          distance_km?: number | null
          driver_id?: string
          driver_notes?: string | null
          estimated_arrival?: string | null
          estimated_departure?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          order_id?: string
          route_id?: string | null
          sequence_number?: number | null
          status?: Database["public"]["Enums"]["assignment_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      driver_earnings: {
        Row: {
          assignment_id: string | null
          base_amount: number | null
          company_id: string
          created_at: string | null
          distance_bonus: number | null
          driver_id: string
          earning_date: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_status: string | null
          tip_amount: number | null
          total_amount: number
        }
        Insert: {
          assignment_id?: string | null
          base_amount?: number | null
          company_id: string
          created_at?: string | null
          distance_bonus?: number | null
          driver_id: string
          earning_date: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_status?: string | null
          tip_amount?: number | null
          total_amount: number
        }
        Update: {
          assignment_id?: string | null
          base_amount?: number | null
          company_id?: string
          created_at?: string | null
          distance_bonus?: number | null
          driver_id?: string
          earning_date?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_status?: string | null
          tip_amount?: number | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_earnings_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "driver_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_earnings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_earnings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          company_id: string
          created_at: string | null
          created_by: string
          id: string
          is_active: boolean | null
          name: string
          preview_text: string | null
          subject: string
          template_type: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string | null
          created_by: string
          id?: string
          is_active?: boolean | null
          name: string
          preview_text?: string | null
          subject: string
          template_type: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string | null
          created_by?: string
          id?: string
          is_active?: boolean | null
          name?: string
          preview_text?: string | null
          subject?: string
          template_type?: string
          updated_at?: string | null
          variables?: Json | null
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
            foreignKeyName: "email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_assignments: {
        Row: {
          assigned_at: string | null
          company_id: string
          condition_on_return:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          created_at: string | null
          equipment_item_id: string
          id: string
          order_id: string
          quantity_assigned: number
          return_notes: string | null
          returned_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          company_id: string
          condition_on_return?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          created_at?: string | null
          equipment_item_id: string
          id?: string
          order_id: string
          quantity_assigned: number
          return_notes?: string | null
          returned_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          company_id?: string
          condition_on_return?:
            | Database["public"]["Enums"]["equipment_condition"]
            | null
          created_at?: string | null
          equipment_item_id?: string
          id?: string
          order_id?: string
          quantity_assigned?: number
          return_notes?: string | null
          returned_at?: string | null
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
            foreignKeyName: "equipment_assignments_equipment_item_id_fkey"
            columns: ["equipment_item_id"]
            isOneToOne: false
            referencedRelation: "equipment_items"
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
      equipment_items: {
        Row: {
          category: string
          company_id: string
          condition: Database["public"]["Enums"]["equipment_condition"] | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_inspection_date: string | null
          location: string | null
          name: string
          next_inspection_date: string | null
          purchase_date: string | null
          quantity_available: number | null
          quantity_owned: number | null
          supplier_name: string | null
          unit_cost: number | null
          updated_at: string | null
          warranty_expiry: string | null
        }
        Insert: {
          category: string
          company_id: string
          condition?: Database["public"]["Enums"]["equipment_condition"] | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_inspection_date?: string | null
          location?: string | null
          name: string
          next_inspection_date?: string | null
          purchase_date?: string | null
          quantity_available?: number | null
          quantity_owned?: number | null
          supplier_name?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          warranty_expiry?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          condition?: Database["public"]["Enums"]["equipment_condition"] | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_inspection_date?: string | null
          location?: string | null
          name?: string
          next_inspection_date?: string | null
          purchase_date?: string | null
          quantity_available?: number | null
          quantity_owned?: number | null
          supplier_name?: string | null
          unit_cost?: number | null
          updated_at?: string | null
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_shortage_reports: {
        Row: {
          company_id: string
          created_at: string | null
          equipment_item_id: string
          id: string
          impact_level: string | null
          order_id: string | null
          quantity_available: number
          quantity_needed: number
          reported_by: string
          resolution_notes: string | null
          resolution_status: string | null
          resolved_at: string | null
          resolved_by: string | null
          shortage_date: string
          shortage_quantity: number
        }
        Insert: {
          company_id: string
          created_at?: string | null
          equipment_item_id: string
          id?: string
          impact_level?: string | null
          order_id?: string | null
          quantity_available: number
          quantity_needed: number
          reported_by: string
          resolution_notes?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shortage_date: string
          shortage_quantity: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          equipment_item_id?: string
          id?: string
          impact_level?: string | null
          order_id?: string | null
          quantity_available?: number
          quantity_needed?: number
          reported_by?: string
          resolution_notes?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          shortage_date?: string
          shortage_quantity?: number
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
            foreignKeyName: "equipment_shortage_reports_equipment_item_id_fkey"
            columns: ["equipment_item_id"]
            isOneToOne: false
            referencedRelation: "equipment_items"
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
      event_milestones: {
        Row: {
          company_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          description: string | null
          id: string
          milestone_name: string
          milestone_type: string
          notes: string | null
          order_id: string
          scheduled_time: string | null
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          milestone_name: string
          milestone_type: string
          notes?: string | null
          order_id: string
          scheduled_time?: string | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          milestone_name?: string
          milestone_type?: string
          notes?: string | null
          order_id?: string
          scheduled_time?: string | null
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_milestones_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_milestones_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_submissions: {
        Row: {
          assigned_to: string | null
          attachments: string[] | null
          category: string | null
          client_id: string | null
          company_id: string
          created_at: string | null
          feedback_type: string
          id: string
          message: string
          order_id: string | null
          rating: number | null
          resolution_notes: string | null
          resolved_at: string | null
          status: string | null
          subject: string
          submitter_email: string | null
          submitter_name: string
          submitter_phone: string | null
          updated_at: string | null
          urgency: string | null
        }
        Insert: {
          assigned_to?: string | null
          attachments?: string[] | null
          category?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string | null
          feedback_type: string
          id?: string
          message: string
          order_id?: string | null
          rating?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string | null
          subject: string
          submitter_email?: string | null
          submitter_name: string
          submitter_phone?: string | null
          updated_at?: string | null
          urgency?: string | null
        }
        Update: {
          assigned_to?: string | null
          attachments?: string[] | null
          category?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string | null
          feedback_type?: string
          id?: string
          message?: string
          order_id?: string | null
          rating?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string | null
          subject?: string
          submitter_email?: string | null
          submitter_name?: string
          submitter_phone?: string | null
          updated_at?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_submissions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_submissions_order_id_fkey"
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
          assignment_id: string | null
          battery_level: number | null
          company_id: string
          driver_id: string
          heading_degrees: number | null
          id: string
          is_moving: boolean | null
          latitude: number
          longitude: number
          recorded_at: string
          speed_kmh: number | null
        }
        Insert: {
          accuracy_meters?: number | null
          assignment_id?: string | null
          battery_level?: number | null
          company_id: string
          driver_id: string
          heading_degrees?: number | null
          id?: string
          is_moving?: boolean | null
          latitude: number
          longitude: number
          recorded_at?: string
          speed_kmh?: number | null
        }
        Update: {
          accuracy_meters?: number | null
          assignment_id?: string | null
          battery_level?: number | null
          company_id?: string
          driver_id?: string
          heading_degrees?: number | null
          id?: string
          is_moving?: boolean | null
          latitude?: number
          longitude?: number
          recorded_at?: string
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
            foreignKeyName: "gps_tracking_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_tracking_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string
          company_id: string
          created_at: string | null
          current_stock: number | null
          description: string | null
          id: string
          is_active: boolean | null
          minimum_stock: number | null
          name: string
          reorder_point: number | null
          sku: string | null
          storage_location: string | null
          supplier_contact: string | null
          supplier_name: string | null
          unit: string
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          category: string
          company_id: string
          created_at?: string | null
          current_stock?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          minimum_stock?: number | null
          name: string
          reorder_point?: number | null
          sku?: string | null
          storage_location?: string | null
          supplier_contact?: string | null
          supplier_name?: string | null
          unit: string
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string | null
          current_stock?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          minimum_stock?: number | null
          name?: string
          reorder_point?: number | null
          sku?: string | null
          storage_location?: string | null
          supplier_contact?: string | null
          supplier_name?: string | null
          unit?: string
          unit_cost?: number | null
          updated_at?: string | null
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
      kitchen_duties: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          assigned_to: string
          company_id: string
          created_at: string | null
          duty_type: Database["public"]["Enums"]["duty_type"]
          id: string
          notes: string | null
          order_id: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          status: string | null
          task_description: string
          updated_at: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          assigned_to: string
          company_id: string
          created_at?: string | null
          duty_type: Database["public"]["Enums"]["duty_type"]
          id?: string
          notes?: string | null
          order_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: string | null
          task_description: string
          updated_at?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          assigned_to?: string
          company_id?: string
          created_at?: string | null
          duty_type?: Database["public"]["Enums"]["duty_type"]
          id?: string
          notes?: string | null
          order_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: string | null
          task_description?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_duties_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_duties_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_duties_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          budget_range: string | null
          client_id: string | null
          company_id: string
          company_name: string | null
          contacted_at: string | null
          converted_at: string | null
          created_at: string | null
          email: string
          event_date: string | null
          event_type: string | null
          guest_count: number | null
          id: string
          metadata: Json | null
          name: string
          notes: string | null
          phone: string | null
          qualified_at: string | null
          source: Database["public"]["Enums"]["lead_source"] | null
          status: Database["public"]["Enums"]["lead_status"] | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          budget_range?: string | null
          client_id?: string | null
          company_id: string
          company_name?: string | null
          contacted_at?: string | null
          converted_at?: string | null
          created_at?: string | null
          email: string
          event_date?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          metadata?: Json | null
          name: string
          notes?: string | null
          phone?: string | null
          qualified_at?: string | null
          source?: Database["public"]["Enums"]["lead_source"] | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          budget_range?: string | null
          client_id?: string | null
          company_id?: string
          company_name?: string | null
          contacted_at?: string | null
          converted_at?: string | null
          created_at?: string | null
          email?: string
          event_date?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          metadata?: Json | null
          name?: string
          notes?: string | null
          phone?: string | null
          qualified_at?: string | null
          source?: Database["public"]["Enums"]["lead_source"] | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          updated_at?: string | null
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
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
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
          company_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          read_at: string | null
          reference_id: string | null
          reference_type: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          action_url?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          action_url?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
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
      optimized_routes: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string | null
          created_by: string
          driver_id: string
          estimated_duration_minutes: number | null
          id: string
          optimization_method: string | null
          route_date: string
          route_name: string
          started_at: string | null
          status: string | null
          stops: Json
          total_distance_km: number | null
          total_stops: number | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          driver_id: string
          estimated_duration_minutes?: number | null
          id?: string
          optimization_method?: string | null
          route_date: string
          route_name: string
          started_at?: string | null
          status?: string | null
          stops: Json
          total_distance_km?: number | null
          total_stops?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          driver_id?: string
          estimated_duration_minutes?: number | null
          id?: string
          optimization_method?: string | null
          route_date?: string
          route_name?: string
          started_at?: string | null
          status?: string | null
          stops?: Json
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
            foreignKeyName: "optimized_routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          notes: string | null
          order_id: string
          prep_assigned_to: string | null
          prep_status: string | null
          product_id: string | null
          quantity: number
          total_price: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          notes?: string | null
          order_id: string
          prep_assigned_to?: string | null
          prep_status?: string | null
          product_id?: string | null
          quantity: number
          total_price: number
          unit?: string | null
          unit_price: number
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          notes?: string | null
          order_id?: string
          prep_assigned_to?: string | null
          prep_status?: string | null
          product_id?: string | null
          quantity?: number
          total_price?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_prep_assigned_to_fkey"
            columns: ["prep_assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_driver: string | null
          assigned_kitchen_staff: string[] | null
          balance_due: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          client_id: string
          company_id: string
          completed_at: string | null
          created_at: string | null
          deleted_at: string | null
          delivered_at: string | null
          delivery_fee: number | null
          delivery_instructions: string | null
          departed_at: string | null
          deposit_amount: number | null
          dietary_requirements: Json | null
          event_date: string
          event_name: string
          event_time: string | null
          guest_count: number
          id: string
          internal_notes: string | null
          order_number: string
          pickup_time: string | null
          prep_completed_at: string | null
          prep_started_at: string | null
          quote_id: string | null
          setup_time: string | null
          special_requests: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          subtotal: number | null
          tax_amount: number | null
          total_amount: number
          updated_at: string | null
          venue_address: string
          venue_lat: number | null
          venue_lng: number | null
          venue_name: string | null
        }
        Insert: {
          assigned_driver?: string | null
          assigned_kitchen_staff?: string[] | null
          balance_due?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_id: string
          company_id: string
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          delivered_at?: string | null
          delivery_fee?: number | null
          delivery_instructions?: string | null
          departed_at?: string | null
          deposit_amount?: number | null
          dietary_requirements?: Json | null
          event_date: string
          event_name: string
          event_time?: string | null
          guest_count: number
          id?: string
          internal_notes?: string | null
          order_number: string
          pickup_time?: string | null
          prep_completed_at?: string | null
          prep_started_at?: string | null
          quote_id?: string | null
          setup_time?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount: number
          updated_at?: string | null
          venue_address: string
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
        }
        Update: {
          assigned_driver?: string | null
          assigned_kitchen_staff?: string[] | null
          balance_due?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          client_id?: string
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          deleted_at?: string | null
          delivered_at?: string | null
          delivery_fee?: number | null
          delivery_instructions?: string | null
          departed_at?: string | null
          deposit_amount?: number | null
          dietary_requirements?: Json | null
          event_date?: string
          event_name?: string
          event_time?: string | null
          guest_count?: number
          id?: string
          internal_notes?: string | null
          order_number?: string
          pickup_time?: string | null
          prep_completed_at?: string | null
          prep_started_at?: string | null
          quote_id?: string | null
          setup_time?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string | null
          venue_address?: string
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_driver_fkey"
            columns: ["assigned_driver"]
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
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string | null
          currency: string | null
          due_date: string | null
          id: string
          invoice_number: string | null
          metadata: Json | null
          notes: string | null
          order_id: string | null
          payment_date: string | null
          payment_method: string | null
          payment_provider: string | null
          payment_provider_transaction_id: string | null
          payment_type: string
          status: Database["public"]["Enums"]["payment_status"] | null
          subscription_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          metadata?: Json | null
          notes?: string | null
          order_id?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          payment_provider_transaction_id?: string | null
          payment_type: string
          status?: Database["public"]["Enums"]["payment_status"] | null
          subscription_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string | null
          metadata?: Json | null
          notes?: string | null
          order_id?: string | null
          payment_date?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          payment_provider_transaction_id?: string | null
          payment_type?: string
          status?: Database["public"]["Enums"]["payment_status"] | null
          subscription_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
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
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prep_lists: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          items: Json
          notes: string | null
          order_id: string
          prep_date: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          items: Json
          notes?: string | null
          order_id: string
          prep_date: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          items?: Json
          notes?: string | null
          order_id?: string
          prep_date?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
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
      products: {
        Row: {
          base_price: number
          category: string
          company_id: string
          cost_price: number | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          metadata: Json | null
          name: string
          sort_order: number | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          base_price?: number
          category: string
          company_id: string
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          sort_order?: number | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          base_price?: number
          category?: string
          company_id?: string
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          sort_order?: number | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_id: string | null
          created_at: string | null
          department_ids: string[] | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          last_login: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          department_ids?: string[] | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          last_login?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string | null
          department_ids?: string[] | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
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
      quote_items: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          product_id: string | null
          quantity: number
          quote_id: string
          sort_order: number | null
          total_price: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          product_id?: string | null
          quantity?: number
          quote_id: string
          sort_order?: number | null
          total_price: number
          unit?: string | null
          unit_price: number
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          product_id?: string | null
          quantity?: number
          quote_id?: string
          sort_order?: number | null
          total_price?: number
          unit?: string | null
          unit_price?: number
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
          additional_services: Json | null
          catering_details: Json
          client_id: string | null
          company_id: string
          contact_details: Json
          created_at: string | null
          created_by: string
          event_details: Json
          id: string
          internal_notes: string | null
          lead_id: string | null
          pricing: Json | null
          quote_number: string
          rejected_at: string | null
          sent_at: string | null
          special_requests: string | null
          status: Database["public"]["Enums"]["quote_status"] | null
          subtotal: number | null
          tax_amount: number | null
          total_amount: number | null
          updated_at: string | null
          valid_until: string
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          additional_services?: Json | null
          catering_details: Json
          client_id?: string | null
          company_id: string
          contact_details: Json
          created_at?: string | null
          created_by: string
          event_details: Json
          id?: string
          internal_notes?: string | null
          lead_id?: string | null
          pricing?: Json | null
          quote_number: string
          rejected_at?: string | null
          sent_at?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["quote_status"] | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
          valid_until: string
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          additional_services?: Json | null
          catering_details?: Json
          client_id?: string | null
          company_id?: string
          contact_details?: Json
          created_at?: string | null
          created_by?: string
          event_details?: Json
          id?: string
          internal_notes?: string | null
          lead_id?: string | null
          pricing?: Json | null
          quote_number?: string
          rejected_at?: string | null
          sent_at?: string | null
          special_requests?: string | null
          status?: Database["public"]["Enums"]["quote_status"] | null
          subtotal?: number | null
          tax_amount?: number | null
          total_amount?: number | null
          updated_at?: string | null
          valid_until?: string
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
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          company_id: string
          cook_time_minutes: number | null
          cost_per_serving: number | null
          created_at: string | null
          description: string | null
          id: string
          ingredients: Json
          instructions: string | null
          is_active: boolean | null
          name: string
          prep_time_minutes: number | null
          product_id: string | null
          servings: number
          updated_at: string | null
        }
        Insert: {
          company_id: string
          cook_time_minutes?: number | null
          cost_per_serving?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          ingredients?: Json
          instructions?: string | null
          is_active?: boolean | null
          name: string
          prep_time_minutes?: number | null
          product_id?: string | null
          servings?: number
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          cook_time_minutes?: number | null
          cost_per_serving?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          ingredients?: Json
          instructions?: string | null
          is_active?: boolean | null
          name?: string
          prep_time_minutes?: number | null
          product_id?: string | null
          servings?: number
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
            foreignKeyName: "recipes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_emails: {
        Row: {
          body: string
          company_id: string
          created_at: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          recipient_email: string
          recipient_name: string | null
          scheduled_for: string
          sent_at: string | null
          status: string | null
          subject: string
          template_id: string | null
          workflow_id: string | null
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email: string
          recipient_name?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: string | null
          subject: string
          template_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email?: string
          recipient_name?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string | null
          subject?: string
          template_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_emails_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_emails_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_emails_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string | null
          department_ids: string[] | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          metadata: Json | null
          name: string
          role: Database["public"]["Enums"]["user_role"]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string | null
          department_ids?: string[] | null
          email: string
          expires_at: string
          id?: string
          invited_by: string
          metadata?: Json | null
          name: string
          role: Database["public"]["Enums"]["user_role"]
          status?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string | null
          department_ids?: string[] | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          metadata?: Json | null
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          token?: string
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
      stock_transactions: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          inventory_item_id: string
          notes: string | null
          performed_by: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          total_cost: number | null
          transaction_type: string
          unit_cost: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          inventory_item_id: string
          notes?: string | null
          performed_by: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          total_cost?: number | null
          transaction_type: string
          unit_cost?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          inventory_item_id?: string
          notes?: string | null
          performed_by?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          total_cost?: number | null
          transaction_type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          auto_upgrade_enabled: boolean | null
          cancel_at_period_end: boolean | null
          cancelled_at: string | null
          company_id: string
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          order_limit: number | null
          orders_this_month: number | null
          payment_provider: string | null
          payment_provider_subscription_id: string | null
          plan_id: Database["public"]["Enums"]["subscription_plan"]
          status: Database["public"]["Enums"]["subscription_status"]
          trial_end_date: string | null
          updated_at: string | null
        }
        Insert: {
          auto_upgrade_enabled?: boolean | null
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          company_id: string
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          order_limit?: number | null
          orders_this_month?: number | null
          payment_provider?: string | null
          payment_provider_subscription_id?: string | null
          plan_id?: Database["public"]["Enums"]["subscription_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_end_date?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_upgrade_enabled?: boolean | null
          cancel_at_period_end?: boolean | null
          cancelled_at?: string | null
          company_id?: string
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          order_limit?: number | null
          orders_this_month?: number | null
          payment_provider?: string | null
          payment_provider_subscription_id?: string | null
          plan_id?: Database["public"]["Enums"]["subscription_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_end_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          company_id: string
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          message_body: string
          message_type: string
          metadata: Json | null
          read_at: string | null
          recipient_name: string | null
          recipient_phone: string
          reference_id: string | null
          reference_type: string | null
          sent_at: string | null
          status: string | null
          template_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_body: string
          message_type: string
          metadata?: Json | null
          read_at?: string | null
          recipient_name?: string | null
          recipient_phone: string
          reference_id?: string | null
          reference_type?: string | null
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_body?: string
          message_type?: string
          metadata?: Json | null
          read_at?: string | null
          recipient_name?: string | null
          recipient_phone?: string
          reference_id?: string | null
          reference_type?: string | null
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      is_company_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      assignment_status:
        | "assigned"
        | "en_route"
        | "arrived"
        | "loading"
        | "departed"
        | "completed"
        | "cancelled"
      duty_type: "prep" | "cook" | "pack" | "clean" | "inventory"
      equipment_condition:
        | "excellent"
        | "good"
        | "fair"
        | "needs_repair"
        | "damaged"
        | "missing"
      lead_source:
        | "website"
        | "referral"
        | "social_media"
        | "phone"
        | "email"
        | "walk_in"
        | "event"
        | "other"
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "proposal_sent"
        | "negotiating"
        | "converted"
        | "lost"
        | "archived"
      notification_type:
        | "order_update"
        | "payment_reminder"
        | "driver_assignment"
        | "route_optimized"
        | "equipment_shortage"
        | "inventory_low"
        | "quote_update"
        | "system_alert"
      order_status:
        | "pending"
        | "confirmed"
        | "in_prep"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "completed"
        | "cancelled"
      payment_status:
        | "pending"
        | "processing"
        | "paid"
        | "partial"
        | "refunded"
        | "failed"
        | "overdue"
      quote_status:
        | "draft"
        | "sent"
        | "viewed"
        | "accepted"
        | "rejected"
        | "expired"
        | "converted"
      subscription_plan: "trial" | "starter" | "professional" | "enterprise"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "paused"
        | "cancelled"
        | "expired"
      user_role:
        | "super_admin"
        | "admin"
        | "kitchen"
        | "driver"
        | "shopping"
        | "cleaning"
        | "client"
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
      assignment_status: [
        "assigned",
        "en_route",
        "arrived",
        "loading",
        "departed",
        "completed",
        "cancelled",
      ],
      duty_type: ["prep", "cook", "pack", "clean", "inventory"],
      equipment_condition: [
        "excellent",
        "good",
        "fair",
        "needs_repair",
        "damaged",
        "missing",
      ],
      lead_source: [
        "website",
        "referral",
        "social_media",
        "phone",
        "email",
        "walk_in",
        "event",
        "other",
      ],
      lead_status: [
        "new",
        "contacted",
        "qualified",
        "proposal_sent",
        "negotiating",
        "converted",
        "lost",
        "archived",
      ],
      notification_type: [
        "order_update",
        "payment_reminder",
        "driver_assignment",
        "route_optimized",
        "equipment_shortage",
        "inventory_low",
        "quote_update",
        "system_alert",
      ],
      order_status: [
        "pending",
        "confirmed",
        "in_prep",
        "ready",
        "out_for_delivery",
        "delivered",
        "completed",
        "cancelled",
      ],
      payment_status: [
        "pending",
        "processing",
        "paid",
        "partial",
        "refunded",
        "failed",
        "overdue",
      ],
      quote_status: [
        "draft",
        "sent",
        "viewed",
        "accepted",
        "rejected",
        "expired",
        "converted",
      ],
      subscription_plan: ["trial", "starter", "professional", "enterprise"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "paused",
        "cancelled",
        "expired",
      ],
      user_role: [
        "super_admin",
        "admin",
        "kitchen",
        "driver",
        "shopping",
        "cleaning",
        "client",
      ],
    },
  },
} as const
