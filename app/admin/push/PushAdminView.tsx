"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { formatTimeAgo } from "@/lib/reader/timeAgo";

export type AdminBroadcastRow = {
  id: string;
  title: string;
  body: string;
  url: string;
  recipient_count: number;
  failure_count: number;
  created_at: string;
};

export default function PushAdminView({ broadcasts }: { broadcasts: AdminBroadcastRow[] }) {
  const [items, setItems] = useState(() => broadcasts);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSend = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/push/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send broadcast.");
        return;
      }
      setItems((current) => [data.item, ...current]);
      setTitle("");
      setBody("");
      setUrl("/");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-[640px]">
      <header className="mb-6">
        <p className="mb-2 text-sm font-semibold text-brand-500">Admin</p>
        <h1 className="m-0 font-serif text-2xl font-bold tracking-tight text-[var(--reader-text)]">Push notifications</h1>
      </header>

      <div className="mb-8 rounded-2xl border border-[var(--reader-border)] p-5">
        <h2 className="mt-0 mb-3 text-sm font-semibold text-[var(--reader-text)]">Send to everyone</h2>
        <div className="flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="rounded-md border border-[var(--reader-border)] bg-transparent px-3 py-2 text-sm text-[var(--reader-text)]"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message"
            rows={3}
            className="rounded-md border border-[var(--reader-border)] bg-transparent px-3 py-2 text-sm text-[var(--reader-text)]"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Link (e.g. /home)"
            className="rounded-md border border-[var(--reader-border)] bg-transparent px-3 py-2 text-sm text-[var(--reader-text)]"
          />
          {error && <p className="m-0 text-xs font-medium text-red-500">{error}</p>}
          <button
            type="button"
            onClick={onSend}
            disabled={sending || !title.trim() || !body.trim()}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent bg-[var(--reader-accent)] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending && <Loader2 size={14} className="animate-spin" />}
            {sending ? "Sending…" : "Send to everyone"}
          </button>
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-[var(--reader-text)]">History</h2>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--reader-text-muted)]">No broadcasts sent yet.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--reader-border)]">
          {items.map((item, i) => (
            <div key={item.id} className={`p-4 ${i > 0 ? "border-t border-[var(--reader-border)]" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="m-0 text-sm font-semibold text-[var(--reader-text)]">{item.title}</p>
                <span className="flex-none text-xs font-medium text-[var(--reader-text-subtle)]">
                  {formatTimeAgo(new Date(item.created_at).getTime())}
                </span>
              </div>
              <p className="mt-1 mb-2 text-sm text-[var(--reader-text-muted)]">{item.body}</p>
              <p className="m-0 text-xs font-medium text-[var(--reader-text-subtle)]">
                {item.recipient_count} recipients
                {item.failure_count > 0 ? ` · ${item.failure_count} failed` : ""} · {item.url}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
