/**
 * Tipos generados de la base de datos. NO EDITAR A MANO.
 *
 * Regenerar cuando cambie supabase/schema.sql:
 *   npx supabase gen types typescript --project-id <PROJECT_ID> --schema public > src/types/supabase.ts
 *
 * Hasta que el proyecto Supabase exista, este stub mantiene el tipado genérico
 * de supabase-js compilando. Los tipos de dominio viven en src/types/index.ts.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      [key: string]: {
        Row: Record<string, Json>;
        Insert: Record<string, Json | undefined>;
        Update: Record<string, Json | undefined>;
        Relationships: [];
      };
    };
    Views: {
      [key: string]: {
        Row: Record<string, Json>;
        Relationships: [];
      };
    };
    Functions: {
      [key: string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: {
      [key: string]: string;
    };
    CompositeTypes: Record<string, never>;
  };
};
