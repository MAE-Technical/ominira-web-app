// App-wide loading indicator — no hooks of its own, safe to render from a
// Server Component (a route's loading.tsx) or a client one (Reader.tsx's
// hydration gate) alike. Just the spinner, no label.
//
// Fixed to the true viewport by default (not confined to whatever
// container it happens to render inside) and translucent rather than a
// solid fill — a route transition is expected to read as a dimmed-through
// overlay sitting on top of the *whole* app shell (sidebar included), not
// as page content getting swapped out for a small loading box wherever it
// happened to live in the layout. That box-wherever-it-lived version is
// exactly what this replaced: an ancestor confining Loader's old
// absolute-positioned self to just the AppShell's <main> column (rather
// than the sidebar/bottom nav too) read as a hole opening up in the middle
// of the page instead of a page-wide transition.
//
// The unconfined (fixed) variant carries z-40 — the same level as
// ReaderModal's own scrim (see ReaderModal.tsx) — since every unconfined
// caller is a route's loading.tsx standing in for content that itself
// renders at or above that level once it mounts (the intercepted read-modal
// route in particular: without this, its pre-mount Loader had no z-index at
// all, so a `relative z-10` element already on the page underneath it — e.g.
// a community note's "See more" toggle — would paint on top of this
// nominally full-viewport dim instead of being covered by it).
//
// `confined` opts back into the old absolute-inset-0 behavior — Reader.tsx's
// own hydration gate is the one legitimate exception: it's nested inside
// ReaderModal's already sidebar-inset panel (shell:left-[var(
// --app-sidebar-w)], see ReaderModal's own doc comment), and a fixed
// viewport-relative loader there would ignore that inset and cover the
// sidebar anyway, undoing the whole "the app underneath keeps visibly
// existing" effect for however briefly it's shown.
//
// Uses the --reader-* theme tokens (light/dark, see app/globals.css)
// rather than a fixed color, so it matches whichever theme is actually set
// instead of flashing the wrong one over a themed page. ThemeProvider
// (mounted once in app/layout.tsx) puts data-reader-theme on <html> itself,
// not just its own subtree, specifically so these tokens resolve correctly
// here even on a Server Component route's loading.tsx, outside Reader's own
// themed div.
export default function Loader({ confined = false }: { confined?: boolean }) {
  return (
    <div
      className={`${confined ? "absolute" : "fixed z-40"} inset-0 flex items-center justify-center select-none no-callout`}
      style={{ background: "color-mix(in srgb, var(--reader-bg) 90%, transparent)" }}
    >
      <div
        aria-hidden
        className="loader-spin w-8 h-8 rounded-full"
        style={{
          border: "2.5px solid var(--reader-border)",
          borderTopColor: "var(--color-brand-500)",
        }}
      />
    </div>
  );
}
