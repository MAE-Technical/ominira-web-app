// Mirrors api-spec.md's "Shared Types" section exactly — these are the
// camelCase JSON shapes every route handler below serializes to. Nothing
// snake_case ever reaches the client (api-spec.md's Conventions).

import type { CoverSource } from "@/lib/materials/image";

export type AnnotationRange = { passageId: string; start: number; end: number };

export type NoteContent =
  | { kind: "text"; text: string }
  | { kind: "voice"; audioUrl: string; durationMs: number };

export type NoteVisibility = "public" | "private";

export type MaterialSummary = {
  id: string;
  slug: string;
  materialType: string;
  title: string;
  author: string;
  description: string | null;
  cover: string | null;
  thumbnail: string | null;
  googleCoverUrl: string | null;
  googleThumbnailUrl: string | null;
  /** Google's own book blurb — see BookDetailView's `googleDescription ??
   * openlibraryDescription` cascade, which this mirrors; `description`
   * above (first-party) is left out of that cascade, it isn't reliably
   * populated. */
  googleDescription: string | null;
  openlibraryCoverUrl: string | null;
  openlibraryThumbnailUrl: string | null;
  openlibraryDescription: string | null;
  coverSource: CoverSource;
  language: string | null;
  publishedYear: number | null;
  pageCountEstimate: number | null;
  categories: string[];
  /**
   * Comrades currently reading/listening to this material
   * (`reader_activities`), most recently active first, capped (lib/reader/
   * constants.ts's CURRENT_READERS_DISPLAY_CAP for a list page,
   * CURRENT_READERS_DETAIL_CAP for a single book-detail page) — see
   * lib/reader/activity.ts's listCurrentReaders. Empty on a MaterialSummary
   * `toMaterialSummary` built directly (its own safe default) — only
   * `listPublishedMaterials`/`getMaterialDetail` actually enrich this.
   * `audioTimeMs` non-null means their most recent activity was listening,
   * not reading — drives the roster's mode icon.
   */
  currentReaders: { readerId: string; pseudonym: string; audioTimeMs: number | null; updatedAt: string }[];
  /** Real count of active readers — may exceed currentReaders.length once
   * the display cap kicks in; that gap is exactly the UI's "+N more". */
  currentReaderCount: number;
  /** Reader who uploaded this into their personal library — null for the
   * editorial catalog (see reader-uploads-spec.md). */
  uploadedBy: string | null;
  visibility: "personal" | "public";
};

export type Note = {
  id: string;
  /** Null for a book-less discussion post (HomeComposer's plain "what's on
   * your mind" posts, `thread_type: 'discussion'` with no attached book) —
   * every book-anchored note/reply still always has one. */
  materialId: string | null;
  author: { readerId: string; pseudonym: string; city: string | null };
  ranges: AnnotationRange[];
  parentId: string | null;
  replyingToId: string | null;
  content: NoteContent;
  visibility: NoteVisibility;
  reactionCount: number;
  reactedByMe: boolean;
  /** The post's default topic name — always topicNames[0] (migrations/
   * 20260919_topics_and_posts.sql's required topic_id), null only if the
   * topic lookup itself failed. Surfaced so AuthorRow can show "· in
   * {topicName}". */
  topicName: string | null;
  /** topicName's own slug — lets AuthorRow link the topic label straight
   * into Home's `?topic=<slug>` filter (CategoryPills' own href shape),
   * without a client-side name->slug lookup. Null exactly when topicName
   * is. */
  topicSlug: string | null;
  /** Every topic the post is tagged under, default first (migrations/
   * 20260927_post_topics.sql) — a reader can tag a post under several
   * topics via the composer's multi-select picker. Empty only alongside a
   * null topicName. */
  topicNames: string[];
  /** Same set as topicNames, name+slug pairs — what AuthorRow actually
   * renders (every tagged topic, each linked into Home's `?topic=<slug>`
   * filter), rather than just the default. */
  topics: { name: string; slug: string }[];
  createdAt: string;
  updatedAt: string;
};

export type NoteThread = { note: Note; replies: Note[] };

export type Highlight = {
  id: string;
  materialId: string;
  readerId: string;
  ranges: AnnotationRange[];
  createdAt: string;
  updatedAt: string;
};

/**
 * One `reader_activities` row (migrations/20260831_reader_activities.sql) — a
 * reader's position in one material, text and/or audio. Not embedded on
 * ReaderProfile (nothing read that field; see GET /api/auth/me/continue-reading
 * for the enriched, sorted view of these).
 */
export type CurrentReadingEntry = {
  materialId: string;
  sectionId: string;
  passageIndex: number;
  audioTimeMs: number | null;
  progressPercent: number;
  updatedAt: string;
};

/**
 * `materials.toc`'s own shape (api-spec.md § Materials) — deliberately
 * lighter than `lib/book/schema.ts`'s `Section`: `label`/`passageCount` are
 * *resolved* values computed once at publish time, specifically so a
 * DB-only consumer (the book-detail page) never needs passage content to
 * render a chapter list or a progress bar.
 */
export type TocSection = {
  id: string;
  label: string | null;
  kind: "front" | "body" | "back" | "unknown";
  passageCount: number;
  children: TocSection[];
  audioDurationMs?: number;
  narratorIds?: string[];
};

export type ReaderAgeRange = "13_17" | "18_24" | "25_34" | "35_44" | "45_54" | "55_64" | "65_plus";

export type ReaderProfile = {
  id: string;
  email: string;
  fullName: string;
  pseudonym: string;
  city: string | null;
  country: string | null;
  interests: string[];
  surveyReadMaterialIds: string[];
  /** Optional — the survey lets a reader skip demographic questions entirely. */
  ageRange: ReaderAgeRange | null;
  /** Free text, capped at 40 chars — no fixed list of options (lib/auth/profile.ts). */
  genderIdentity: string | null;
  onboardingStatus: "pending_survey" | "pending_welcome" | "active";
  joinedAt: string;
  updatedAt: string;
};
