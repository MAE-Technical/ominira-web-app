"use client";

import { ChevronDown, ExternalLink, Loader2, Lock, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { resolveBookThumbnailSrc, type CoverSource } from "@/lib/materials/image";
import { formatTimeAgo } from "@/lib/reader/timeAgo";
import { formatBytes } from "@/lib/materials/uploadLimits";
import TopicPickerTrigger, { TopicChips, type PickableItem } from "@/app/components/home/TopicPicker";
import BookCover from "@/app/components/shared/BookCover";
import AdminPageHeader from "@/app/admin/AdminPageHeader";
import TextField from "@/app/components/auth/TextField";
import TextAreaField from "@/app/components/auth/TextAreaField";

type AdminBookStatus = "published" | "unpublished";
type Visibility = "personal" | "public";

export type AdminBookRow = {
  id: string;
  slug: string;
  title: string;
  author: string;
  description: string | null;
  materialType: string;
  fileSizeBytes: number | null;
  visibility: Visibility;
  cover_url: string | null;
  thumbnail_url: string | null;
  // The other two cover sources materials carry alongside our own
  // cover_url/thumbnail_url — see lib/materials/image.ts's priority chain.
  // Surfaced so the edit panel can offer them as alternates when our own
  // pick looks wrong, not because anything else in the app reads them.
  googleCoverUrl: string | null;
  googleThumbnailUrl: string | null;
  openlibraryCoverUrl: string | null;
  openlibraryThumbnailUrl: string | null;
  // Which of the three sources above is currently preferred — see
  // migrations/20260829_materials_cover_source.sql. Switching this never
  // overwrites cover_url/thumbnail_url/the metadata columns, so it's always
  // reversible, unlike editing cover_url directly.
  coverSource: CoverSource;
  categories: string[];
  status: AdminBookStatus;
  updated_at: string;
};

// Same danger red used for the reader's own "Delete highlight" confirmation
// (NotesSidebar.tsx/SelectionMenu.tsx) — one color for "this is destructive"
// across the app.
const DANGER_COLOR = "#f26b6b";

const FORMAT_LABELS: Record<string, string> = { book: "EPUB", pdf: "PDF", docx: "DOCX", webpage: "Web" };
const formatLabel = (materialType: string) => FORMAT_LABELS[materialType] ?? materialType.toUpperCase();

const thumbnailOf = (book: AdminBookRow) =>
  resolveBookThumbnailSrc({
    cover: book.cover_url,
    thumbnail: book.thumbnail_url,
    googleCoverUrl: book.googleCoverUrl,
    googleThumbnailUrl: book.googleThumbnailUrl,
    openlibraryCoverUrl: book.openlibraryCoverUrl,
    openlibraryThumbnailUrl: book.openlibraryThumbnailUrl,
    coverSource: book.coverSource,
  }) ?? undefined;

// Matches TextField's input styling — the search box has no visible label, so
// it can't use TextField itself.
const searchInputClass =
  "w-full rounded-sm border border-sand-300 bg-[var(--reader-surface)] py-2.5 pl-8 pr-4 font-medium text-[13px] leading-5 text-[var(--reader-text)] outline-none transition-colors placeholder:text-sand-400 focus:border-brand-400";

export default function LibraryAdminView({ books, categories }: { books: AdminBookRow[]; categories: string[] }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [items, setItems] = useState(() => books);
  // router.refresh() re-renders the server page with fresh rows; adopt them
  // here, since `items` only seeds from `books` once.
  const [syncedBooks, setSyncedBooks] = useState(books);
  if (books !== syncedBooks) {
    setSyncedBooks(books);
    setItems(books);
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");

  const formats = useMemo(() => Array.from(new Set(books.map((b) => b.materialType))).sort(), [books]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (b) =>
        (format === "all" || b.materialType === format) &&
        (!q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.categories.some((c) => c.toLowerCase().includes(q)))
    );
  }, [items, query, format]);

  const selectedBook = items.find((book) => book.id === selectedId) ?? null;

  const updateBook = (id: string, next: Partial<AdminBookRow>) => {
    setItems((current) => current.map((book) => (book.id === id ? { ...book, ...next } : book)));
  };

  const removeBook = (id: string) => {
    setItems((current) => current.filter((book) => book.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  };

  return (
    <div className={`transition-[padding] ${selectedBook ? "xl:pr-[440px]" : ""}`}>
      <AdminPageHeader
        title="Library"
        subtitle={`${items.length.toLocaleString("en")} materials`}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startRefresh(() => router.refresh())}
              disabled={refreshing}
              aria-label="Refresh"
              title="Refresh"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-[var(--reader-border)] bg-transparent text-[var(--reader-text-muted)] transition-colors hover:bg-[var(--reader-surface-hover)] hover:text-[var(--reader-text)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} />
            </button>
            <Link
              href="/admin/library/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--reader-border)] px-3.5 text-[12px] font-bold text-[var(--reader-text)] transition-colors hover:bg-[var(--reader-surface-hover)]"
            >
              <Plus size={14} />
              Add books
            </Link>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--reader-text-subtle)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, author or tag"
            aria-label="Search materials"
            className={searchInputClass}
          />
        </label>
        {/* Same styling as SelectField, minus its visible label. */}
        <label className="relative">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            aria-label="Filter by format"
            className="cursor-pointer appearance-none rounded-sm border border-sand-300 bg-[var(--reader-surface)] py-2.5 pl-4 pr-10 font-medium text-[13px] leading-5 text-[var(--reader-text)] outline-none transition-colors focus:border-brand-400"
          >
            <option value="all">All formats</option>
            {formats.map((f) => (
              <option key={f} value={f}>
                {formatLabel(f)}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute inset-y-0 right-3.5 my-auto text-sand-500" />
        </label>
      </div>

      <div className="overflow-x-auto rounded-sm border border-[var(--reader-border)]">
        {visible.length === 0 ? (
          <p className="m-0 px-5 py-10 text-center text-sm text-[var(--reader-text-muted)]">
            {items.length === 0 ? "No materials yet." : "Nothing matches that search."}
          </p>
        ) : (
          <table className="w-full min-w-[860px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-[var(--reader-border)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--reader-text-subtle)]">
                <th className="w-14 px-3 py-2.5 font-[inherit]">
                  <span className="sr-only">Cover</span>
                </th>
                <th className="px-3 py-2.5 font-[inherit]">Title</th>
                <th className="px-3 py-2.5 font-[inherit]">Author</th>
                <th className="px-3 py-2.5 font-[inherit]">Format</th>
                <th className="px-3 py-2.5 text-right font-[inherit]">Size</th>
                <th className="px-3 py-2.5 font-[inherit]">Status</th>
                <th className="px-3 py-2.5 font-[inherit]">Tags</th>
                <th className="px-3 py-2.5 font-[inherit]">Updated</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((book) => {
                const isActive = selectedId === book.id;
                return (
                  <tr
                    key={book.id}
                    onClick={() => setSelectedId(book.id)}
                    className={`cursor-pointer border-b border-[var(--reader-border)] transition-colors last:border-b-0 ${
                      isActive ? "bg-[var(--reader-surface-hover)]" : "hover:bg-[var(--reader-surface-hover)]"
                    }`}
                  >
                    <td className="px-3 py-2 align-middle">
                      <BookCover materialType={book.materialType} src={thumbnailOf(book)} alt="" className="h-11 w-8 rounded-sm border border-[var(--reader-border)]" iconSize={13} />
                    </td>
                    <td className="max-w-[260px] px-3 py-2 align-middle">
                      <button
                        type="button"
                        onClick={() => setSelectedId(book.id)}
                        className="block w-full cursor-pointer truncate border-none bg-transparent p-0 text-left text-[12px] font-semibold text-[var(--reader-text)]"
                      >
                        {book.title}
                      </button>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2 align-middle text-[var(--reader-text-muted)]">{book.author || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 align-middle text-[var(--reader-text-muted)]">{formatLabel(book.materialType)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right align-middle tabular-nums text-[var(--reader-text-muted)]">
                      {book.fileSizeBytes ? formatBytes(book.fileSizeBytes) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-middle">
                      <StatusBadge status={book.status} visibility={book.visibility} />
                    </td>
                    <td className="max-w-[200px] px-3 py-2 align-middle">
                      <span className="block truncate text-[var(--reader-text-muted)]">{book.categories.join(", ") || "—"}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 align-middle text-[var(--reader-text-muted)]">
                      {formatTimeAgo(new Date(book.updated_at).getTime())}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedBook && (
        <>
          {/* Below xl the panel overlays the table, so give it a backdrop to dismiss. */}
          <div className="fixed inset-0 z-40 bg-black/30 xl:hidden" onClick={() => setSelectedId(null)} aria-hidden />
          <aside
            aria-label="Edit material"
            className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto border-l border-[var(--reader-border)] bg-[var(--reader-surface)] shadow-xl sm:w-[440px] xl:shadow-none"
          >
            <BookEditPanel
              key={selectedBook.id}
              book={selectedBook}
              availableCategories={categories}
              onSaved={updateBook}
              onDeleted={removeBook}
              onClose={() => setSelectedId(null)}
            />
          </aside>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status, visibility }: { status: AdminBookStatus; visibility: Visibility }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`rounded-full bg-[var(--reader-surface-hover)] px-2 py-0.5 text-[11px] font-semibold ${
          status === "published" ? "text-[var(--reader-text)]" : "text-[var(--reader-text-muted)]"
        }`}
      >
        {status === "published" ? "Published" : "Unpublished"}
      </span>
      {visibility === "personal" && (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[var(--reader-text-muted)]" title="Only visible to the member who uploaded it">
          <Lock size={11} aria-hidden />
          Private
        </span>
      )}
    </span>
  );
}

function BookEditPanel({
  book,
  availableCategories,
  onSaved,
  onDeleted,
  onClose,
}: {
  book: AdminBookRow;
  availableCategories: string[];
  onSaved: (id: string, next: Partial<AdminBookRow>) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [description, setDescription] = useState(book.description ?? "");
  const [categories, setCategories] = useState(book.categories);
  const [coverSource, setCoverSource] = useState(book.coverSource);
  const [visibility, setVisibility] = useState(book.visibility);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteState, setDeleteState] = useState<"idle" | "deleting" | "error">("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [enrichState, setEnrichState] = useState<"idle" | "loading" | "error">("idle");
  const [enrichMessage, setEnrichMessage] = useState<string | null>(null);

  // Admin's manual trigger for the same Google Books -> OpenLibrary lookup
  // an upload kicks off automatically (lib/materials/enrichMaterial.ts) —
  // for a book that predates that, or whose first pass found nothing.
  // Always `force`s a fresh lookup server-side (see that route's own doc
  // comment). Description/author (when they were auto-detected as empty)
  // are written straight to the row by the enrich endpoint itself, so
  // there's nothing further to persist for those — this just needs to
  // mirror the response into local state/the table. Cover is one step
  // further: when the book has no own cover to prefer, the newly found
  // alternate is auto-selected and saved immediately too, so a lookup
  // alone is enough — no separate "Save" click required.
  const handleEnrich = async () => {
    setEnrichState("loading");
    setEnrichMessage(null);
    try {
      const response = await fetch(`/api/admin/materials/${book.id}/enrich`, { method: "POST" });
      const result = (await response.json().catch(() => null)) as
        | { error?: string; ran?: boolean; foundGoogle?: boolean; foundOpenLibrary?: boolean; item?: Partial<AdminBookRow> }
        | null;
      if (!response.ok) throw new Error(result?.error || "We could not look this book up.");

      if (result?.item) {
        if (result.item.description !== undefined) setDescription(result.item.description ?? "");
        if (result.item.author !== undefined) setAuthor(result.item.author ?? "");
        onSaved(book.id, result.item);

        const hasOwnCover = Boolean(book.cover_url || book.thumbnail_url);
        const foundSource: CoverSource | null = hasOwnCover
          ? null
          : result.item.openlibraryCoverUrl || result.item.openlibraryThumbnailUrl
            ? "openlibrary"
            : result.item.googleCoverUrl || result.item.googleThumbnailUrl
              ? "google"
              : null;

        if (foundSource && foundSource !== coverSource) {
          setCoverSource(foundSource);
          await fetch(`/api/admin/materials/${book.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ coverSource: foundSource }),
          });
          onSaved(book.id, { coverSource: foundSource });
        }
      }

      setEnrichState("idle");
      setEnrichMessage(
        result?.foundGoogle || result?.foundOpenLibrary ? "Description and cover updated." : "No match found on Google Books or OpenLibrary."
      );
    } catch (err) {
      setEnrichState("error");
      setEnrichMessage(err instanceof Error ? err.message : "We could not look this book up.");
    }
  };

  const handleDelete = async () => {
    setDeleteState("deleting");
    setDeleteError(null);
    try {
      const response = await fetch(`/api/admin/materials/${book.id}`, { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "We could not delete this material.");
      onDeleted(book.id);
    } catch (err) {
      setDeleteState("error");
      setDeleteError(err instanceof Error ? err.message : "We could not delete this material.");
    }
  };

  // The curated config list, plus any tag this material already carries that
  // has since been renamed or removed there — kept visible and removable
  // rather than silently dropped. A category is its own id in the picker.
  const categoryItems: PickableItem[] = Array.from(new Set([...availableCategories, ...book.categories])).map((c) => ({ id: c, name: c }));

  // The three cover sources a material can carry (see lib/materials/image.ts).
  // Picking one here only changes which the resolver tries first — it never
  // touches cover_url/thumbnail_url/the metadata columns, so it's always
  // reversible by picking a different one back.
  const coverSources: { id: CoverSource; label: string; thumbnailUrl: string }[] = [
    book.cover_url || book.thumbnail_url ? { id: "own" as const, label: "Uploaded", thumbnailUrl: book.thumbnail_url ?? book.cover_url! } : null,
    book.openlibraryCoverUrl || book.openlibraryThumbnailUrl
      ? { id: "openlibrary" as const, label: "OpenLibrary", thumbnailUrl: book.openlibraryThumbnailUrl ?? book.openlibraryCoverUrl! }
      : null,
    book.googleCoverUrl || book.googleThumbnailUrl
      ? { id: "google" as const, label: "Google Books", thumbnailUrl: book.googleThumbnailUrl ?? book.googleCoverUrl! }
      : null,
  ].filter((source) => source !== null);

  const submit = async (nextStatus: AdminBookStatus = book.status) => {
    setState("saving");
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/materials/${book.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          author,
          description: description.trim() || null,
          categories,
          coverSource,
          visibility,
          status: nextStatus,
        }),
      });

      const result = (await response.json().catch(() => null)) as { error?: string; item?: { updated_at?: string } } | null;
      if (!response.ok) throw new Error(result?.error || "We could not update this material.");

      setState("saved");
      setMessage(nextStatus === book.status ? "Changes saved." : nextStatus === "published" ? "Published." : "Unpublished.");
      onSaved(book.id, {
        title,
        author,
        description: description.trim() || null,
        categories,
        coverSource,
        visibility,
        status: nextStatus,
        updated_at: result?.item?.updated_at ?? book.updated_at,
      });
    } catch (updateError) {
      setState("error");
      setMessage(updateError instanceof Error ? updateError.message : "We could not update this material.");
    }
  };

  const iconButton =
    "inline-flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[var(--reader-text-muted)] transition-colors hover:bg-[var(--reader-surface-hover)] hover:text-[var(--reader-text)] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--reader-border)] bg-[var(--reader-surface)] px-5 py-3">
        <BookCover materialType={book.materialType} src={thumbnailOf(book)} alt="" className="h-12 w-9 flex-none rounded-sm border border-[var(--reader-border)]" iconSize={14} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[13px] font-bold text-[var(--reader-text)]">{book.title}</p>
          <p className="m-0 text-[11px] text-[var(--reader-text-muted)]">
            {formatLabel(book.materialType)}
            {book.fileSizeBytes ? ` · ${formatBytes(book.fileSizeBytes)}` : ""}
          </p>
        </div>
        {book.status === "published" && (
          <Link href={`/library/${book.slug}`} target="_blank" rel="noopener noreferrer" aria-label="View live" title="View live" className={iconButton}>
            <ExternalLink size={15} />
          </Link>
        )}
        <button
          type="button"
          onClick={() => void handleEnrich()}
          disabled={enrichState === "loading"}
          aria-label="Look up cover & description"
          title="Look up cover & description"
          className={iconButton}
        >
          {enrichState === "loading" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
        <button type="button" onClick={onClose} aria-label="Close editor" className={iconButton}>
          <X size={16} />
        </button>
      </div>

      {enrichMessage && (
        <p role="status" className={`m-0 px-5 pt-3 text-[11px] font-semibold ${enrichState === "error" ? "text-red-600" : "text-[var(--reader-text-muted)]"}`}>
          {enrichMessage}
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(book.status);
        }}
        className="flex flex-1 flex-col gap-5 px-5 py-5"
      >
        <TextField label="Title" id="material-title" value={title} onChange={(event) => setTitle(event.target.value)} />

        <TextField label="Author" id="material-author" value={author} onChange={(event) => setAuthor(event.target.value)} />

        <TextAreaField
          label="Description"
          id="material-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={5}
        />

        <Field label="Tags">
          <div className="flex flex-wrap items-center gap-1.5">
            <TopicChips topics={categoryItems} selectedIds={categories} onChange={setCategories} />
            <TopicPickerTrigger topics={categoryItems} selectedIds={categories} onChange={setCategories} />
          </div>
        </Field>

        <Field label="Cover">
          {coverSources.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {coverSources.map((source) => {
                const active = source.id === coverSource;
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => setCoverSource(source.id)}
                    aria-pressed={active}
                    className={`flex cursor-pointer flex-col items-center gap-1 rounded-sm border bg-transparent p-1 transition-colors ${
                      active ? "border-brand-500" : "border-[var(--reader-border)] hover:border-brand-300"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- external provider thumbnail, not an app asset */}
                    <img src={source.thumbnailUrl} alt="" className="h-20 w-14 rounded-xs bg-[var(--reader-surface-hover)] object-cover" />
                    <span className={`text-[10px] font-semibold ${active ? "text-brand-500" : "text-[var(--reader-text-muted)]"}`}>{source.label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="m-0 text-[12px] text-[var(--reader-text-muted)]">No cover yet — try the lookup button above.</p>
          )}
        </Field>

        <Field label="Visibility">
          <label className="inline-flex select-none items-center gap-2 text-[12px] font-semibold text-[var(--reader-text-muted)]">
            <input
              type="checkbox"
              checked={visibility === "public"}
              onChange={(e) => setVisibility(e.target.checked ? "public" : "personal")}
              className="h-3.5 w-3.5 accent-[var(--reader-text)]"
            />
            Visible to everyone in the library
          </label>
        </Field>

        {message && (
          <p
            role="status"
            className={`m-0 rounded-[var(--radius-sm)] px-3 py-2.5 text-[12px] font-semibold text-[var(--reader-text)] ${
              state === "error" ? "bg-brand-500/10" : "bg-emerald-500/10"
            }`}
          >
            {message}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={state === "saving"}
            className="inline-flex h-9 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border-none bg-brand-500 px-4 text-[12px] font-bold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === "saving" ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            disabled={state === "saving"}
            onClick={() => void submit(book.status === "published" ? "unpublished" : "published")}
            className="inline-flex h-9 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-[var(--reader-border)] bg-transparent px-4 text-[12px] font-bold text-[var(--reader-text)] transition-colors hover:bg-[var(--reader-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {book.status === "published" ? "Unpublish" : "Publish"}
          </button>
        </div>

        <div className="mt-auto border-t border-[var(--reader-border)] pt-4">
          {confirmingDelete ? (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-[12px] font-medium leading-relaxed text-[var(--reader-text)]">
                Delete this material and all its files (cover, images, audio)? This can&rsquo;t be undone.
              </p>
              {deleteError && (
                <p role="status" className="m-0 text-[12px] font-semibold" style={{ color: DANGER_COLOR }}>
                  {deleteError}
                </p>
              )}
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleteState === "deleting"}
                  style={{ color: DANGER_COLOR }}
                  className="inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleteState === "deleting" && <Loader2 size={14} className="animate-spin" />}
                  {deleteState === "deleting" ? "Deleting…" : "Delete"}
                </button>
                <button
                  type="button"
                  disabled={deleteState === "deleting"}
                  onClick={() => {
                    setConfirmingDelete(false);
                    setDeleteState("idle");
                    setDeleteError(null);
                  }}
                  className="cursor-pointer border-none bg-transparent p-0 text-xs font-semibold text-[var(--reader-text-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              style={{ color: DANGER_COLOR }}
              className="inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-xs font-bold"
            >
              <Trash2 size={13} />
              Delete material
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-2 block text-[13px] font-bold text-[var(--reader-text)]">{label}</span>
      {children}
    </div>
  );
}
