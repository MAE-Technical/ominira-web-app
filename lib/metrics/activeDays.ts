import { after } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/adminClient";

// Readers already recorded today by this server instance. Every signed-in API
// request passes through here, so without it an active reader would cost a
// write per request; with it, the first request of the day per instance writes
// and the rest are a Set lookup. Other instances may write the same row again —
// harmless, the upsert is idempotent.
function dayRecorder(read: boolean) {
  let recordedDay = "";
  const recorded = new Set<string>();

  return (readerId: string): void => {
    const day = new Date().toISOString().slice(0, 10);
    if (day !== recordedDay) {
      recordedDay = day;
      recorded.clear();
    }
    if (recorded.has(readerId)) return;
    recorded.add(readerId);

    after(async () => {
      // An active-day write ignores an existing row so it never clears `read`;
      // a reading write updates it to set the flag.
      const { error } = await getSupabaseAdminClient()
        .from("reader_active_days")
        .upsert({ day, reader_id: readerId, ...(read && { read }) }, { onConflict: "day,reader_id", ignoreDuplicates: !read });
      // Forget it so the reader's next request retries rather than losing the day.
      if (error) recorded.delete(readerId);
    });
  };
}

/**
 * Marks `readerId` active today (UTC) in `public.reader_active_days`
 * (migrations/20261004_reader_active_days.sql). Called from
 * getAuthenticatedReader, so "active" means made any signed-in request.
 * The write runs after the response is sent — never on a request's hot path.
 */
export const recordActiveDay = dayRecorder(false);

/**
 * Also flags today's row as a reading day (`read`, migrations/
 * 20261009_reader_active_days_read.sql). Called when a reading position is saved.
 */
export const recordReadingDay = dayRecorder(true);
