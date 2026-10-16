"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import Reader from "./Reader";
import Loader from "../Loader";
import type { BookMetadata } from "@/lib/book/schema";
import type { ReaderBook } from "@/lib/materials/readerFiles";

/** Fetches a book's reader.json from the CDN, then mounts Reader on it; the
 * prose follows chunk by chunk (useProgressiveText). The server sends only
 * `metadata`, from the materials row, which wins over the document's own
 * (a reader can retitle their upload; the cover cascade lives on the row). */
export default function BookReader({
  metadata,
  ...props
}: Omit<ComponentProps<typeof Reader>, "book"> & { metadata: BookMetadata }) {
  const { contentBase } = props;
  const [loaded, setLoaded] = useState<{ base: string; book: ReaderBook } | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${contentBase}reader.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`reader.json: ${res.status}`))))
      .then((book: ReaderBook) => !cancelled && setLoaded({ base: contentBase, book }))
      .catch((err: Error) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [contentBase]);

  const book = useMemo(
    () => (loaded?.base === contentBase ? { ...loaded.book, metadata } : null),
    [loaded, contentBase, metadata]
  );

  if (error) throw error;
  if (!book) return <Loader />;
  return <Reader key={contentBase} book={book} {...props} />;
}
