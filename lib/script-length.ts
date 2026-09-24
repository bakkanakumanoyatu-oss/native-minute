export const MAX_SCRIPT_WORDS = 200;
export const MAX_SCRIPT_CHARACTERS = 2_000;

// Match the existing script UI/readiness rule: trim, then count whitespace-separated tokens.
// String.length matches the existing Zod character limit (UTF-16 code units).
export function countScriptWords(content: string) {
  const trimmed = content.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

export function getScriptLength(content: string) {
  const trimmed = content.trim();
  const wordCount = countScriptWords(trimmed);
  const characterCount = trimmed.length;
  const excessWords = Math.max(0, wordCount - MAX_SCRIPT_WORDS);
  const excessCharacters = Math.max(0, characterCount - MAX_SCRIPT_CHARACTERS);
  return { wordCount, characterCount, excessWords, excessCharacters, exceedsLimit: excessWords > 0 || excessCharacters > 0 };
}

export function getScriptLengthError(content: string) {
  const { excessWords, excessCharacters } = getScriptLength(content);
  const reasons = [
    excessWords > 0 ? `200語を${excessWords}語超えています` : null,
    excessCharacters > 0 ? `2,000文字を${excessCharacters}文字超えています` : null
  ].filter(Boolean);
  return reasons.length > 0 ? `台本本文が${reasons.join("。台本本文が")}。` : null;
}
