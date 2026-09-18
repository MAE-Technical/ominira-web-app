/** The small pulsing brand-colored dot used wherever something is "live" —
 * a reader present right now (CurrentReaders.tsx), a section currently being
 * read (ChaptersDrawer.tsx). One shared visual so every "this is happening
 * now" signal in the app reads the same way. */
export default function PulseDot({ className = "" }: { className?: string }) {
  return <span className={`h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-brand-500 ${className}`} />;
}
