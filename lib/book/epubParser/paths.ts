// Href normalization — ported 1:1 from ingestion-pipeline/src/ingestion/epubparser/_paths.py.
// Every href found anywhere in the book is resolved against its *own document's*
// directory, URL-decoded, and normalized before it is ever compared to a
// manifest path. All indexes key on the normalized zip-internal path.

const EXTERNAL = /^([a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/;

export function isExternal(href: string): boolean {
  return EXTERNAL.test(href);
}

/** posixpath.normpath equivalent: collapses `.`/`..`/duplicate slashes without touching the filesystem. */
export function normpath(path: string): string {
  if (path === "") return ".";
  const isAbsolute = path.startsWith("/");
  const parts = path.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!isAbsolute) out.push("..");
    } else {
      out.push(part);
    }
  }
  let joined = out.join("/");
  if (isAbsolute) joined = "/" + joined;
  return joined || (isAbsolute ? "/" : ".");
}

export function normalize(path: string): string {
  if (!path) return "";
  return normpath(decodeURIComponentSafe(path)).replace(/^\/+/, "");
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function joinPath(base: string, path: string): string {
  if (path.startsWith("/")) return path;
  if (!base) return path;
  return `${base}/${path}`;
}

/** (zip path, fragment) for an internal href relative to `baseDir`, or (null, null)
 * for external URLs. A fragment-only href ("#x") returns ("", fragment) — the
 * caller knows its own document path. */
export function resolveHref(baseDir: string, href: string): [string | null, string | null] {
  if (isExternal(href)) return [null, null];
  const hashIndex = href.indexOf("#");
  const rawPath = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const rawFragment = hashIndex === -1 ? "" : href.slice(hashIndex + 1);
  const fragment = decodeURIComponentSafe(rawFragment) || null;
  if (!rawPath) return ["", fragment];
  const decodedPath = decodeURIComponentSafe(rawPath);
  const joined = base_dirNonEmpty(baseDir) ? joinPath(baseDir, decodedPath) : decodedPath;
  return [normpath(joined).replace(/^\/+/, ""), fragment];
}

function base_dirNonEmpty(baseDir: string): boolean {
  return baseDir.length > 0;
}

export function dirOf(zipPath: string): string {
  const idx = zipPath.lastIndexOf("/");
  return idx === -1 ? "" : zipPath.slice(0, idx);
}
