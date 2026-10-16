import Loader from "@/app/components/Loader";

// The intercepted modal route's own row lookup (page.tsx's loadReaderMaterial)
// had no loading.tsx of its own before this — meaning Next had no fallback
// scoped specifically to this segment while that data resolved, and fell
// back on whatever Suspense boundary it found instead. Giving this segment
// its own explicit one is the standard fix: Loader's own default (fixed,
// translucent, full viewport) reads as a page-wide transition into the
// reader rather than disturbing anything already on screen underneath it.
export default function ReadBookModalLoading() {
  return <Loader />;
}
