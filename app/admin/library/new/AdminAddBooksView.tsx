"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import AddBookModal from "@/app/components/shell/AddBookModal";
import AdminPageHeader from "@/app/admin/AdminPageHeader";
import { useIsAuthenticated } from "@/lib/auth/useIsAuthenticated";
import { useSessionStore } from "@/stores/session-store";
import { ADMIN_UPLOAD_LIMITS } from "@/lib/materials/uploadLimits";

/**
 * The members' "Add a book" composer (AddBookModal), inline as a page with
 * the admin caps. Uploads go through the same signed flow as members' and
 * are attributed to the signed-in admin — the server only grants the higher
 * caps to ADMIN_EMAILS.
 */
export default function AdminAddBooksView({ categories }: { categories: string[] }) {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  // Render neither branch until the stored session has loaded, so a signed-in
  // admin never sees the sign-in prompt flash first.
  const hasHydrated = useSessionStore((s) => s.hasHydrated);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <AdminPageHeader
        title="Add books"
        subtitle="Grow the library — uploads are published as soon as they finish."
        back={{ href: "/admin/library", label: "Library" }}
      />
      {!hasHydrated ? null : isAuthenticated ? (
        <AddBookModal
          layout="page"
          limits={ADMIN_UPLOAD_LIMITS}
          categories={categories}
          onClose={() => router.push("/admin/library")}
        />
      ) : (
        <p className="m-0 rounded-lg border border-[var(--reader-border)] px-5 py-8 text-center text-sm text-[var(--reader-text-muted)]">
          <Link href="/auth/login" className="font-semibold text-[var(--reader-accent)]">
            Sign in
          </Link>{" "}
          with your admin account to upload books.
        </p>
      )}
    </div>
  );
}
