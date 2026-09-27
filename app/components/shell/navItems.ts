import { BookOpen, Home, Library } from "lucide-react";
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
// icons and order never drift between the two navigation surfaces. Reading
// (in-progress books) sits right after Home — it used to be a mobile-only
// destination, with desktop instead exposing the same list directly in the
// sidebar (SidebarContinueReading); now that it's a proper nav item on both
// surfaces, that sidebar shelf is gone.
// Account used to be a nav item here (desktop sidebar + mobile tab bar) but
// is now reached exclusively through AppHeader's ProfileMenu (the avatar
// dropdown) — one destination for it instead of two.
export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/reading", label: "Reading", icon: BookOpen },
  { href: "/library", label: "Library", icon: Library },
  // { href: "/notes", label: "Notes", icon: MessageCircle },
];
