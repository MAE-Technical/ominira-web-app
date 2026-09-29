/**
 * Runtime APIs pdf.js 6 calls that its `legacy` build does *not* polyfill
 * (it core-js-polyfills Map#getOrInsertComputed, Promise.try, Iterator
 * helpers, etc., but assumes these as baseline). Missing on Safari < 17.4 —
 * `Promise.withResolvers()` alone throws "undefined is not a function" the
 * moment a document loads. Imported on the main thread (lib/pdf/setup.ts) and
 * in the worker (lib/pdf/pdf.worker.ts), since each has its own globals.
 * Every shim is a no-op where the browser already has the real thing.
 */

type Resolvers<T> = { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void };

const P = Promise as unknown as { withResolvers?: <T>() => Resolvers<T> };
P.withResolvers ??= function <T>() {
  let resolve!: Resolvers<T>["resolve"];
  let reject!: Resolvers<T>["reject"];
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// Safari 17.4
if (typeof AbortSignal !== "undefined" && !("any" in AbortSignal)) {
  (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any = (signals) => {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        break;
      }
      signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true, signal: controller.signal });
    }
    return controller.signal;
  };
}

// Safari 17.4 — a copying fallback; the original buffer isn't detached, which
// pdf.js never relies on.
const AB = ArrayBuffer.prototype as ArrayBuffer & { transferToFixedLength?: (length?: number) => ArrayBuffer };
AB.transferToFixedLength ??= function (this: ArrayBuffer, length = this.byteLength) {
  const copy = new Uint8Array(length);
  copy.set(new Uint8Array(this, 0, Math.min(length, this.byteLength)));
  return copy.buffer;
};

// Safari 18
for (const proto of [
  typeof Response !== "undefined" ? Response.prototype : null,
  typeof Blob !== "undefined" ? Blob.prototype : null,
]) {
  if (proto && !("bytes" in proto)) {
    Object.defineProperty(proto, "bytes", {
      configurable: true,
      writable: true,
      async value(this: Response | Blob) {
        return new Uint8Array(await this.arrayBuffer());
      },
    });
  }
}

// `for await (… of readableStream)` — used for text content and
// DecompressionStream output. Not in Safari at all before 26.
if (typeof ReadableStream !== "undefined" && !(Symbol.asyncIterator in ReadableStream.prototype)) {
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    async *value(this: ReadableStream) {
      const reader = this.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export {};
