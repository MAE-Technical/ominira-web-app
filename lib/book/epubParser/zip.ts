// Thin wrapper around JSZip so the parser reads by normalized zip-internal
// path without caring whether it's running in the browser (File/Blob) or in
// the Node test harness (a Buffer read from disk).

import JSZip from "jszip";

export class ZipReader {
  private zip: JSZip;

  private constructor(zip: JSZip) {
    this.zip = zip;
  }

  static async open(data: ArrayBuffer | Blob | Uint8Array): Promise<ZipReader> {
    const zip = await JSZip.loadAsync(data);
    return new ZipReader(zip);
  }

  async readText(path: string): Promise<string | null> {
    const file = this.zip.file(path);
    if (!file) return null;
    return file.async("string");
  }

  async readArrayBuffer(path: string): Promise<ArrayBuffer | null> {
    const file = this.zip.file(path);
    if (!file) return null;
    return file.async("arraybuffer");
  }

  has(path: string): boolean {
    return this.zip.file(path) !== null;
  }
}
