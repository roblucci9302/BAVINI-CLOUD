/**
 * =============================================================================
 * BAVINI CLOUD - Supabase Database Types
 * =============================================================================
 * Types TypeScript pour le schéma de base de données.
 * Générés à partir du schéma SQL dans supabase/migrations/
 * =============================================================================
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
          plan: 'free' | 'pro' | 'team' | 'enterprise';
          plan_expires_at: string | null;
          projects_count: number;
          storage_used_bytes: number;
          preferences: Json;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
          plan?: 'free' | 'pro' | 'team' | 'enterprise';
          plan_expires_at?: string | null;
          projects_count?: number;
          storage_used_bytes?: number;
          preferences?: Json;
        };
        Update: {
          id?: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
          plan?: 'free' | 'pro' | 'team' | 'enterprise';
          plan_expires_at?: string | null;
          projects_count?: number;
          storage_used_bytes?: number;
          preferences?: Json;
        };
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          slug: string;
          template: string;
          framework: string;
          status: 'active' | 'archived' | 'deleted';
          is_public: boolean;
          created_at: string;
          updated_at: string;
          last_opened_at: string;
          files_count: number;
          total_size_bytes: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          slug: string;
          template?: string;
          framework?: string;
          status?: 'active' | 'archived' | 'deleted';
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
          last_opened_at?: string;
          files_count?: number;
          total_size_bytes?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          slug?: string;
          template?: string;
          framework?: string;
          status?: 'active' | 'archived' | 'deleted';
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
          last_opened_at?: string;
          files_count?: number;
          total_size_bytes?: number;
        };
      };
      project_files: {
        Row: {
          id: string;
          project_id: string;
          path: string;
          name: string;
          content: string | null;
          storage_path: string | null;
          mime_type: string | null;
          size_bytes: number;
          is_directory: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          path: string;
          name: string;
          content?: string | null;
          storage_path?: string | null;
          mime_type?: string | null;
          size_bytes?: number;
          is_directory?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          path?: string;
          name?: string;
          content?: string | null;
          storage_path?: string | null;
          mime_type?: string | null;
          size_bytes?: number;
          is_directory?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      build_cache: {
        Row: {
          id: string;
          project_id: string;
          cache_key: string;
          bundle_code: string;
          bundle_css: string | null;
          entry_point: string;
          build_time_ms: number | null;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          cache_key: string;
          bundle_code: string;
          bundle_css?: string | null;
          entry_point: string;
          build_time_ms?: number | null;
          created_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          cache_key?: string;
          bundle_code?: string;
          bundle_css?: string | null;
          entry_point?: string;
          build_time_ms?: number | null;
          created_at?: string;
          expires_at?: string;
        };
      };
      chat_sessions: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string | null;
          title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          artifacts: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          artifacts?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          role?: 'user' | 'assistant' | 'system';
          content?: string;
          artifacts?: Json | null;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      plan_type: 'free' | 'pro' | 'team' | 'enterprise';
      project_status: 'active' | 'archived' | 'deleted';
      message_role: 'user' | 'assistant' | 'system';
    };
  };
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

export type Project = Database['public']['Tables']['projects']['Row'];
export type ProjectInsert = Database['public']['Tables']['projects']['Insert'];
export type ProjectUpdate = Database['public']['Tables']['projects']['Update'];

export type ProjectFile = Database['public']['Tables']['project_files']['Row'];
export type ProjectFileInsert = Database['public']['Tables']['project_files']['Insert'];
export type ProjectFileUpdate = Database['public']['Tables']['project_files']['Update'];

export type BuildCache = Database['public']['Tables']['build_cache']['Row'];
export type BuildCacheInsert = Database['public']['Tables']['build_cache']['Insert'];

export type ChatSession = Database['public']['Tables']['chat_sessions']['Row'];
export type ChatSessionInsert = Database['public']['Tables']['chat_sessions']['Insert'];

export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];
