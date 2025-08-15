export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      couple_restaurants: {
        Row: {
          couple_id: string;
          restaurant_id: string;
          created_at: string;
          is_favorited: boolean;
        };
        Insert: {
          couple_id: string;
          restaurant_id: string;
          created_at?: string;
          is_favorited?: boolean;
        };
        Update: Partial<{
          couple_id?: string;
          restaurant_id?: string;
          created_at?: string;
          is_favorited?: boolean;
        }>;
      };
      curated_lists: {
        Row: {
          id: string;
          created_at: string;
          name: string;
          description: string | null;
          restaurant_ids: Json;
          icon: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          name: string;
          description?: string | null;
          restaurant_ids: Json;
          icon?: string | null;
        };
        Update: Partial<{
          id?: string;
          created_at?: string;
          name?: string;
          description?: string | null;
          restaurant_ids?: Json;
          icon?: string | null;
        }>;
      };
      user_profiles: {
        Row: {
          email: string;
          name: string;
          role: string;
          couple_id: string | null;
          allowed_views: Json | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
        };
        Insert: {
          email: string;
          name: string;
          role: string;
          couple_id?: string | null;
          allowed_views?: Json | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
        };
        Update: Partial<{
          email?: string;
          name?: string;
          role?: string;
          couple_id?: string | null;
          allowed_views?: Json | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
        }>;
      };
      lists: {
        Row: {
          id: string;
          created_at: string;
          title: string;
          description: string | null;
          url: string | null;
          image_url: string | null;
          list_type: string;
          user_email: string;
          is_done: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          title: string;
          description?: string | null;
          url?: string | null;
          image_url?: string | null;
          list_type: string;
          user_email: string;
          is_done?: boolean;
        };
        Update: Partial<{
          id?: string;
          created_at?: string;
          title?: string;
          description?: string | null;
          url?: string | null;
          image_url?: string | null;
          list_type?: string;
          user_email?: string;
          is_done?: boolean;
        }>;
      };
      job_applications: {
        Row: {
          id: string;
          created_at: string;
          company_name: string;
          role_name: string;
          status: string;
          notes: string | null;
          image_url: string | null;
          user_email: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          company_name: string;
          role_name: string;
          status: string;
          notes?: string | null;
          image_url?: string | null;
          user_email: string;
        };
        Update: Partial<{
          id?: string;
          created_at?: string;
          company_name?: string;
          role_name?: string;
          status?: string;
          notes?: string | null;
          image_url?: string | null;
          user_email?: string;
        }>;
      };
      restaurants: {
        Row: {
          id: string;
          name: string;
          category: string;
          cuisine: string | null;
          locations: Json;
          image: string | null;
          wants_to_go: Json;
          reviews: Json;
          addedBy: string;
          inTourOqfc: boolean | null;
          price_range: number | null;
          google_rating: number | null;
          google_rating_count: number | null;
          google_rating_source_uri: string | null;
          google_rating_source_title: string | null;
          memories: Json;
          menu_url: string | null;
          vibe: string | null;
          created_at: string;
          weekly_promotions: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          cuisine?: string | null;
          locations?: Json;
          image?: string | null;
          wants_to_go?: Json;
          reviews?: Json;
          addedBy?: string;
          inTourOqfc?: boolean | null;
          price_range?: number | null;
          google_rating?: number | null;
          google_rating_count?: number | null;
          google_rating_source_uri?: string | null;
          google_rating_source_title?: string | null;
          memories?: Json;
          menu_url?: string | null;
          vibe?: string | null;
          created_at?: string;
          weekly_promotions?: string | null;
        };
        Update: Partial<{
          id?: string;
          name?: string;
          category?: string;
          cuisine?: string | null;
          locations?: Json;
          image?: string | null;
          wants_to_go?: Json;
          reviews?: Json;
          addedBy?: string;
          inTourOqfc?: boolean | null;
          price_range?: number | null;
          google_rating?: number | null;
          google_rating_count?: number | null;
          google_rating_source_uri?: string | null;
          google_rating_source_title?: string | null;
          memories?: Json;
          menu_url?: string | null;
          vibe?: string | null;
          created_at?: string;
          weekly_promotions?: string | null;
        }>;
      };
      recipes: {
        Row: {
          id: string;
          created_at: string;
          name: string;
          category: string;
          prep_time_minutes: number | null;
          image_url: string | null;
          source_url: string | null;
          ingredients: Json | null;
          instructions: string | null;
          added_by: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          name: string;
          category: string;
          prep_time_minutes?: number | null;
          image_url?: string | null;
          source_url?: string | null;
          ingredients?: Json | null;
          instructions?: string | null;
          added_by?: string | null;
        };
        Update: Partial<{
          id?: string;
          created_at?: string;
          name?: string;
          category?: string;
          prep_time_minutes?: number | null;
          image_url?: string | null;
          source_url?: string | null;
          ingredients?: Json | null;
          instructions?: string | null;
          added_by?: string | null;
        }>;
      };
      expenses: {
        Row: {
          id: string;
          created_at: string;
          description: string;
          amount: number;
          due_date: string | null;
          payment_source: string;
          is_paid: boolean;
          couple_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          description: string;
          amount: number;
          due_date?: string | null;
          payment_source: string;
          is_paid?: boolean;
          couple_id?: string | null;
        };
        Update: Partial<{
          id?: string;
          created_at?: string;
          description?: string;
          amount?: number;
          due_date?: string | null;
          payment_source?: string;
          is_paid?: boolean;
          couple_id?: string | null;
        }>;
      };
      recurring_expenses: {
        Row: {
          id: string;
          created_at: string;
          description: string;
          amount: number;
          payment_source: string;
          day_of_month: number;
          start_date: string;
          end_date: string | null;
          last_generated_date: string | null;
          is_active: boolean;
          google_calendar_event_id: string | null;
          couple_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          description: string;
          amount: number;
          payment_source: string;
          day_of_month: number;
          start_date: string;
          end_date?: string | null;
          last_generated_date?: string | null;
          is_active?: boolean;
          google_calendar_event_id?: string | null;
          couple_id?: string | null;
        };
        Update: Partial<{
          id?: string;
          created_at?: string;
          description?: string;
          amount?: number;
          payment_source?: string;
          day_of_month?: number;
          start_date?: string;
          end_date?: string | null;
          last_generated_date?: string | null;
          is_active?: boolean;
          google_calendar_event_id?: string | null;
          couple_id?: string | null;
        }>;
      };
      reminders: {
        Row: {
          id: string;
          created_at: string;
          title: string;
          content: string | null;
          due_date: string | null;
          color: string;
          is_done: boolean;
          created_by: string;
          assigned_to: Json;
          subtasks: Json | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          title: string;
          content?: string | null;
          due_date?: string | null;
          color: string;
          is_done?: boolean;
          created_by: string;
          assigned_to: Json;
          subtasks?: Json | null;
        };
        Update: Partial<{
          id?: string;
          created_at?: string;
          title?: string;
          content?: string | null;
          due_date?: string | null;
          color?: string;
          is_done?: boolean;
          created_by?: string;
          assigned_to?: Json;
          subtasks?: Json | null;
        }>;
      };
      monthly_closings: {
        Row: {
          id: string;
          created_at: string;
          month_year: string;
          income_nicolas: number;
          income_ana: number;
          shared_goal: number | null;
          notes: string | null;
          goal_allocations: Json | null;
          analysis: Json | null;
          couple_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          month_year: string;
          income_nicolas?: number;
          income_ana?: number;
          shared_goal?: number | null;
          notes?: string | null;
          goal_allocations?: Json | null;
          analysis?: Json | null;
          couple_id?: string | null;
        };
        Update: Partial<{
          id?: string;
          created_at?: string;
          month_year?: string;
          income_nicolas?: number;
          income_ana?: number;
          shared_goal?: number | null;
          notes?: string | null;
          goal_allocations?: Json | null;
          analysis?: Json | null;
          couple_id?: string | null;
        }>;
      };
      goals: {
        Row: {
            id: string;
            created_at: string;
            name: string;
            target_amount: number;
            current_amount: number;
            created_by: string;
            is_archived: boolean;
            couple_id: string | null;
        };
        Insert: {
            id?: string;
            created_at?: string;
            name: string;
            target_amount: number;
            current_amount?: number;
            created_by: string;
            is_archived?: boolean;
            couple_id?: string | null;
        };
        Update: Partial<{
            id?: string;
            created_at?: string;
            name?: string;
            target_amount?: number;
            current_amount?: number;
            created_by?: string;
            is_archived?: boolean;
            couple_id?: string | null;
        }>;
      };
      habits: {
        Row: {
            id: string;
            created_at: string;
            name: string;
            icon: string | null;
            users: string[];
        };
        Insert: {
            id?: string;
            created_at?: string;
            name: string;
            icon?: string | null;
            users: string[];
        };
        Update: Partial<{
            id?: string;
            created_at?: string;
            name?: string;
            icon?: string | null;
            users?: string[];
        }>;
      };
      habit_entries: {
        Row: {
            id: string;
            created_at: string;
            habit_id: string;
            user_id: string;
            entry_date: string;
        };
        Insert: {
            id?: string;
            created_at?: string;
            habit_id: string;
            user_id: string;
            entry_date: string;
        };
        Update: Partial<{
            id?: string;
            created_at?: string;
            habit_id?: string;
            user_id?: string;
            entry_date?: string;
        }>;
      };
      mood_entries: {
        Row: {
            id: string;
            created_at: string;
            user_id: string;
            mood: number;
            entry_date: string;
        };
        Insert: {
            id?: string;
            created_at?: string;
            user_id: string;
            mood: number;
            entry_date: string;
        };
        Update: Partial<{
            id?: string;
            created_at?: string;
            user_id?: string;
            mood?: number;
            entry_date?: string;
        }>;
      };
      date_plans: {
        Row: {
          id: string;
          created_at: string;
          restaurant_id: string;
          restaurant_name: string;
          restaurant_image_url: string | null;
          created_by: string;
          proposed_datetime: string;
          status: string;
          participants_status: Json;
        };
        Insert: {
          id?: string;
          created_at?: string;
          restaurant_id: string;
          restaurant_name: string;
          restaurant_image_url?: string | null;
          created_by: string;
          proposed_datetime: string;
          status?: string;
          participants_status: Json;
        };
        Update: Partial<{
          id?: string;
          created_at?: string;
          restaurant_id?: string;
          restaurant_name?: string;
          restaurant_image_url?: string | null;
          created_by?: string;
          proposed_datetime?: string;
          status?: string;
          participants_status?: Json;
        }>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}