/**
 * Both engines' mp3 responses carry their own ID3v2 tag (Kokoro-FastAPI's
 * ffmpeg/libav mux adds one; Edge's service does too). Left in, joining
 * several chunk buffers would embed a non-audio ID3 block in the middle of
 * the frame stream — decoders resync past it, but it's an avoidable click.
 * Stripping each chunk's tag first keeps the joined file a clean run of
 * MPEG frames, so audio assembled from N split chunks plays back as one
 * gapless clip.
 */
export function concatMp3(chunks: Buffer[]): Buffer {
  return Buffer.concat(chunks.map(stripId3v2));
}

function stripId3v2(buf: Buffer): Buffer {
  if (buf.length < 10 || buf.toString("latin1", 0, 3) !== "ID3") return buf;
  // Tag size is a 4-byte synchsafe integer (7 bits used per byte) at offset 6.
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  return buf.subarray(10 + size);
}
