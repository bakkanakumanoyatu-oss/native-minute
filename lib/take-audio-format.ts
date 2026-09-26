// Shared binary/filename contract. No account identifiers or storage names enter exports.
export function takeAudioFormat(contentType: string, bytes: Uint8Array) {
  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  const ascii = (offset: number, text: string) => [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  if (["audio/wav", "audio/wave", "audio/x-wav"].includes(mime) && ascii(0, "RIFF") && ascii(8, "WAVE")) return { contentType: "audio/wav", extension: "wav" };
  if (["audio/mp4", "audio/x-m4a"].includes(mime) && ascii(4, "ftyp")) return { contentType: "audio/mp4", extension: "m4a" };
  if (mime === "audio/mpeg" && (ascii(0, "ID3") || (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0))) return { contentType: mime, extension: "mp3" };
  if (mime === "audio/ogg" && ascii(0, "OggS")) return { contentType: mime, extension: "ogg" };
  if (mime === "audio/webm" && [0x1a, 0x45, 0xdf, 0xa3].every((b, i) => bytes[i] === b)) return { contentType: mime, extension: "webm" };
  return null;
}

export function takeExportFilename(displayName: string | null, scriptTitle: string, extension: string) {
  const clean = (input: string) => Array.from(input.normalize("NFKC")
    .replace(/(?:https?:\/\/|file:\/\/|storage:\/\/|recordings\/)[^\s]+/gi, " ")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, " ")
    .replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, " ")
    .replace(/(?:eyJ|sk-|sb_secret_)[A-Za-z0-9._-]+/g, " ")
    .replace(/\.(wav|m4a|mp3|mp4|ogg|webm)$/i, "")
    .replace(/[^\p{L}\p{N} _-]/gu, " ").replace(/\s+/g, " ").trim())
    .slice(0, 60).join("").trim();
  return `${clean(displayName ?? "") || clean(scriptTitle) || "Native Minutes recording"}.${extension}`;
}
