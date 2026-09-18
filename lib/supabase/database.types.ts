// Hand-written to match models-spec.md exactly — there's no `supabase gen types`
// step in this project (see plan.md's Phase 0 note on skipping the CLI entirely),
// so this is the one place that has to be kept in sync by hand whenever the schema
// changes. Passed as createClient<Database>()'s generic (lib/supabase/adminClient.ts)
// so every table read/write across the app is checked against real column names
// instead of silently collapsing to `never` (supabase-js's default-generic quirk).
//
// jsonb columns are typed as `Json` here, same as `supabase gen types` would do —
// callers cast to the real app-level shape (AnnotationRange[], TocSection[], etc.,
// both defined in api-spec.md) on read, and rely on structural compatibility with
// `Json` on write. Nothing here should leak into JSON API responses verbatim; that
// snake_case -> camelCase translation is the route handler's job (api-spec.md's
// Conventions).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };

export type Database = {
  public: {
    Tables: {
      readers: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          pseudonym: string;
          city: string | null;
          country: string | null;
          interests: Json;
          survey_read_material_ids: Json;
          age_range: "13_17" | "18_24" | "25_34" | "35_44" | "45_54" | "55_64" | "65_plus" | null;
          gender_identity: string | null;
          onboarding_status: "pending_survey" | "pending_welcome" | "active";
          joined_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          pseudonym: string;
          city?: string | null;
          country?: string | null;
          interests?: Json;
          survey_read_material_ids?: Json;
          age_range?: "13_17" | "18_24" | "25_34" | "35_44" | "45_54" | "55_64" | "65_plus" | null;
          gender_identity?: string | null;
          onboarding_status?: "pending_survey" | "pending_welcome" | "active";
          joined_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["readers"]["Insert"]>;
        Relationships: [];
      };
      materials: {
        Row: {
          id: string;
          slug: string;
          material_type: string;
          title: string;
          author: string;
          description: string | null;
          cover_url: string | null;
          thumbnail_url: string | null;
          /** { googleBooksId, isbn, coverUrl, thumbnailUrl, description } — see
           * scripts/generate-material-google-metadata.ts and lib/materials/providerMeta.ts. */
          google_meta_data: Json | null;
          /** { coverUrl, thumbnailUrl, description } — see
           * scripts/generate-material-openlibrary-metadata.ts. */
          openlibrary_meta_data: Json | null;
          /** Which of cover_url/thumbnail_url ("own"), openlibrary_meta_data, or
           * google_meta_data resolveBookCoverSrc/resolveBookThumbnailSrc
           * (lib/materials/image.ts) tries first — see migrations/20260829_materials_cover_source.sql. */
          cover_source: "own" | "openlibrary" | "google";
          language: string | null;
          published_year: number | null;
          page_count_estimate: number | null;
          categories: Json;
          narrator_count: number;
          toc: Json;
          toc_titles: string;
          spine: Json;
          json_storage_path: string;
          status: "draft" | "published";
          search_vector: string | null;
        } & Timestamps;
        Insert: {
          id?: string;
          slug: string;
          material_type?: string;
          title: string;
          author: string;
          description?: string | null;
          cover_url?: string | null;
          thumbnail_url?: string | null;
          google_meta_data?: Json | null;
          openlibrary_meta_data?: Json | null;
          cover_source?: "own" | "openlibrary" | "google";
          language?: string | null;
          published_year?: number | null;
          page_count_estimate?: number | null;
          categories?: Json;
          narrator_count?: number;
          toc?: Json;
          toc_titles?: string;
          spine?: Json;
          json_storage_path: string;
          status?: "draft" | "published";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["materials"]["Insert"]>;
        Relationships: [];
      };
      highlights: {
        Row: {
          id: string;
          reader_id: string;
          material_id: string;
          ranges: Json;
        } & Timestamps;
        Insert: {
          id?: string;
          reader_id: string;
          material_id: string;
          ranges: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["highlights"]["Insert"]>;
        Relationships: [];
      };
      // One row per (reader, material) — replaces readers.current_reading (a jsonb
      // map) as of migrations/20260831_reader_activities.sql. "activities", not
      // "reading_positions": audio_time_ms means this covers listening too.
      reader_activities: {
        Row: {
          reader_id: string;
          material_id: string;
          section_id: string;
          passage_index: number;
          audio_time_ms: number | null;
          progress_percent: number;
          updated_at: string;
        };
        Insert: {
          reader_id: string;
          material_id: string;
          section_id: string;
          passage_index: number;
          audio_time_ms?: number | null;
          progress_percent: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reader_activities"]["Insert"]>;
        Relationships: [];
      };
      notes: {
        Row: {
          id: string;
          reader_id: string;
          material_id: string;
          parent_id: string | null;
          replying_to_id: string | null;
          ranges: Json;
          content_kind: "text" | "voice";
          content_text: string | null;
          content_audio_url: string | null;
          content_audio_duration_ms: number | null;
          visibility: "public" | "private";
          reaction_count: number;
        } & Timestamps;
        Insert: {
          id?: string;
          reader_id: string;
          material_id: string;
          parent_id?: string | null;
          replying_to_id?: string | null;
          ranges: Json;
          content_kind: "text" | "voice";
          content_text?: string | null;
          content_audio_url?: string | null;
          content_audio_duration_ms?: number | null;
          visibility?: "public" | "private";
          reaction_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notes"]["Insert"]>;
        Relationships: [];
      };
      note_reactions: {
        Row: { note_id: string; reader_id: string; created_at: string };
        Insert: { note_id: string; reader_id: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["note_reactions"]["Insert"]>;
        Relationships: [];
      };
    };
    // Required by supabase-js's GenericSchema shape even though this project has
    // neither — omitting them collapses the whole schema (and every table's row
    // type) to `never` rather than erroring loudly, which is its own trap.
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
