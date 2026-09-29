// Textarea selection offsets use normalized line endings. Map them back to the
// persisted string so the server receives an exact contiguous substring.
function sourceIndex(source: string, textareaOffset: number) {
  let normalized = 0;
  for (let index = 0; index < source.length;) {
    if (normalized >= textareaOffset) return index;
    if (source[index] === "\r" && source[index + 1] === "\n") index += 2;
    else index += 1;
    normalized += 1;
  }
  return source.length;
}
function validUtf16Boundary(source: string, index: number) {
  if (index <= 0 || index >= source.length) return true;
  const before = source.charCodeAt(index - 1), after = source.charCodeAt(index);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}
export function selectedStoredExcerpt(source: string, start: number, end: number) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) return "";
  const first = sourceIndex(source, start), last = sourceIndex(source, end);
  if (!validUtf16Boundary(source, first) || !validUtf16Boundary(source, last)) return "";
  return source.slice(first, last);
}
