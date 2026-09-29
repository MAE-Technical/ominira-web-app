/**
 * Stand-in for `pdfjs-dist/web/pdf_viewer.mjs`, aliased in next.config.ts.
 *
 * react-pdf imports that module only for `EventBus` and `SimpleLinkService`
 * (react-pdf/dist/LinkService.js), and its LinkService overrides nearly every
 * method it inherits. The real module is ~10k lines of full-viewer code — and,
 * even in pdf.js's legacy build, contains a regex literal with the `v` flag
 * (Autolinker). Safari < 17 can't parse that, so the whole chunk failed to
 * load and the PDF reader fell through to the error boundary. This shim keeps
 * just the surface react-pdf and pdf.js's annotation layer actually touch.
 */

type Listener = (data?: unknown) => void;

export class EventBus {
  #listeners = new Map<string, Set<Listener>>();

  on(eventName: string, listener: Listener, options?: { once?: boolean; signal?: AbortSignal }) {
    const wrapped: Listener = options?.once
      ? (data) => {
          this.off(eventName, wrapped);
          listener(data);
        }
      : listener;
    let set = this.#listeners.get(eventName);
    if (!set) this.#listeners.set(eventName, (set = new Set()));
    set.add(wrapped);
    options?.signal?.addEventListener("abort", () => this.off(eventName, wrapped), { once: true });
  }

  off(eventName: string, listener: Listener) {
    this.#listeners.get(eventName)?.delete(listener);
  }

  dispatch(eventName: string, data?: unknown) {
    const set = this.#listeners.get(eventName);
    if (set) for (const listener of [...set]) listener(data);
  }
}

// Mirrors PDFLinkService's constructor state; every navigation method is
// overridden by react-pdf's LinkService.
export class SimpleLinkService {
  externalLinkEnabled = true;
  eventBus: EventBus | undefined;
  externalLinkTarget: number | null;
  externalLinkRel: string | null;
  baseUrl: string | null = null;
  pdfDocument: unknown = null;
  pdfViewer: unknown = null;
  pdfHistory: unknown = null;

  constructor({
    eventBus,
    externalLinkTarget = null,
    externalLinkRel = null,
  }: { eventBus?: EventBus; externalLinkTarget?: number | null; externalLinkRel?: string | null } = {}) {
    this.eventBus = eventBus;
    this.externalLinkTarget = externalLinkTarget;
    this.externalLinkRel = externalLinkRel;
  }

  setDocument() {}
}
