import { BookMarked, BookOpen, Home, LibraryBig } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// `size`/`strokeWidth`/`className` (SVGProps covers the rest) — lucide's own
// icon props, widened from just `{ size }` now that AppBottomNav also varies
// strokeWidth and className per active state.
export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number | string }>;
};

// Shared by AppSidebar (desktop) and AppBottomNav (mobile) so destinations,
// icons and order never drift between the two navigation surfaces. Shelf
// sits right after Home — it used to be a mobile-only "Reading" destination
// listing in-progress books, with desktop instead exposing the same list
// directly in the sidebar (SidebarContinueReading); now that it's a proper
// nav item on both surfaces, that sidebar shelf is gone.
//
// Renamed from "Reading" (/reading) once it grew Saved and Finished tabs:
// reading became one drawer of the shelf rather than the whole of it, so a
// tab and the page containing it can't both be called the same thing. The
// old path permanently redirects (next.config.ts).
//
// Saved (bookmarks) and Finished are tabs inside Shelf, deliberately not
// nav items of their own. See ShelfView's own doc comment; the short
// version is that they're all the same shelf, and this list has already
// settled once that one idea gets one destination.
//
// Account used to be a nav item here (desktop sidebar + mobile tab bar) but
// is now reached exclusively through AppHeader's ProfileMenu (the avatar
// dropdown) — one destination for it instead of two.
export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  // BookMarked, not Library/BookOpen: the neighbouring Library tab already
  // owns the shelf-of-books glyph, and this page is no longer only about
  // reading. A book with a marker in it covers all three of its tabs.
  { href: "/shelf", label: "Shelf", icon: LibraryBig },
  { href: "/library", label: "Library", icon: BookOpen },
  // { href: "/notes", label: "Notes", icon: MessageCircle },
];

// Shared by AppSidebar and AppBottomNav so a nav item's "active" rule can't
// drift between the two surfaces the way two independent copies of this
// function eventually would.
export function isNavItemActive(pathname: string, href: string) {
  // /library alone: a material's own detail page (/library/[slug]) is a
  // destination reached *from* the library listing, not a sub-section of
  // it — closer to /read/[slug] or a reader profile than to a page the
  // Library tab should still show as "you're here" while looking at it. No
  // sub-routes of Library exist that a reader would want it active for.
  if (href === "/library") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
