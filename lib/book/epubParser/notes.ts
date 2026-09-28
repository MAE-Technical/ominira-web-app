// Resolves harvested note bodies against citing marks — ported 1:1 from
// ingestion-pipeline/src/ingestion/epubparser/notes.py.
//
// Targets are file-scoped (path, fragment) pairs end to end. Notes are
// numbered in spine reading order, so `note-1` is the first note a reader
// actually meets. An ordinary internal link whose target turns out to be a
// harvested note body is upgraded to a note mark; a labeled note mark whose
// target was never harvested is dropped rather than shipped dangling.

import type { FileContent, Mark, Passage, Table } from "./content";

const BODY_MARKER = /^\s*[[(]?(\d{1,4}|[*†‡§¶#]+|[ivxlc]{1,6})[\])\.:]?\s/i;

export interface Note {
  id: string;
  sectionId: string;
  marker: string;
  text: string;
}

function* iterMarkHolders(passage: Passage): Generator<[string, Mark[]]> {
  yield [passage.text, passage.marks ?? (passage.marks = [])];
  if (passage.table) {
    for (const group of ["header", "rows", "footer"] as const) {
      for (const row of passage.table[group] ?? []) {
        for (const cell of row) {
          if (cell.marks) yield [cell.text, cell.marks];
        }
      }
    }
  }
}

function markerFromBody(body: string): string | null {
  const m = BODY_MARKER.exec(body);
  return m ? m[1] : null;
}

function cleanNoteBody(body: string, marker: string): string {
  let text = body.replace(/ /g, " ");
  if (marker) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const lead = new RegExp(`^\\s*[[(]?${escaped}[\\])]?[.):\\]]?\\s+`, "i");
    const match = lead.exec(text);
    if (match) text = text.slice(match[0].length);
  }
  return text.split(/\s+/).filter(Boolean).join(" ");
}

/** `sections` in spine reading order: (sectionId, passages). Mutates marks
 * in place (sets noteId, upgrades links, drops dangling notes) and returns
 * the ordered note list. */
export function resolveNotes(sections: [string, Passage[]][], files: Map<string, FileContent>): Note[] {
  const notes: Note[] = [];
  const noteIdByTarget = new Map<string, string>();

  const bodyFor = (target: [string, string | null] | undefined): string | undefined => {
    if (!target) return undefined;
    const [path, fragment] = target;
    if (!fragment) return undefined;
    return files.get(path)?.notes.get(fragment);
  };

  for (const [sectionId, passages] of sections) {
    for (const passage of passages) {
      for (const [text, marks] of iterMarkHolders(passage)) {
        const kept: Mark[] = [];
        for (const mark of marks) {
          let target = mark.noteTarget;
          if (mark.kind === "link" && mark.linkTarget) {
            if (bodyFor(mark.linkTarget) !== undefined) target = mark.linkTarget;
          }
          if (!target) {
            kept.push(mark);
            continue;
          }
          const body = bodyFor(target);
          if (body === undefined) {
            if (mark.kind === "note") continue; // dangling labeled reference — drop
            kept.push(mark);
            continue;
          }
          const key = `${target[0]}\u0000${target[1] ?? ""}`;
          let noteId = noteIdByTarget.get(key);
          if (noteId === undefined) {
            noteId = `note-${notes.length + 1}`;
            const marker = text.slice(mark.start, mark.end).trim() || markerFromBody(body) || "*";
            notes.push({ id: noteId, sectionId, marker, text: cleanNoteBody(body, marker) });
            noteIdByTarget.set(key, noteId);
          }
          mark.kind = "note";
          mark.noteId = noteId;
          mark.linkTarget = undefined;
          mark.href = undefined;
          kept.push(mark);
        }
        marks.length = 0;
        marks.push(...kept);
      }
    }
  }
  return notes;
}

// Re-exported for callers that only need the table-cell type shape.
export type { Table };
