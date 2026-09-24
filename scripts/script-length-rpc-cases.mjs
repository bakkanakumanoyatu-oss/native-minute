import { getScriptLength } from "../lib/script-length.ts";

const words = count => Array.from({ length: count }, () => "word").join(" ");
const bothExact = "x".repeat(10) + Array.from({ length: 199 }, () => ` ${"x".repeat(9)}`).join("");
const jsWhitespace = [
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
  0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029,
  0x202f, 0x205f, 0x3000, 0xfeff
];
const cases = [
  ["empty", ""],
  ["only_js_whitespace", " \t\n\u00a0\ufeff\u3000"],
  ["words_199", words(199)],
  ["words_200", words(200)],
  ["words_201", words(201)],
  ["characters_1999", "a".repeat(1999)],
  ["characters_2000", "a".repeat(2000)],
  ["characters_2001", "a".repeat(2001)],
  ["both_exact", bothExact],
  ["both_over", Array.from({ length: 201 }, () => "abcdefghij").join(" ")],
  ["contraction", "can't go"],
  ["hyphenated", "well-known phrase"],
  ["tabs_newlines_multiple", " one\t\t two\n\n three \r\nfour "],
  ["leading_trailing_unicode_space", " \u00a0\ufeffalpha\u3000beta\u2029"],
  ["non_ascii_bmp", "café 漢字"],
  ["astral", " x😀 "],
  ["astral_exact", "a".repeat(1998) + "😀"],
  ["astral_over", "a".repeat(1999) + "😀"],
  ["nel_not_js_space", "a\u0085b"],
  ["mongolian_not_js_space", "a\u180eb"],
  ["zero_width_not_js_space", "a\u200bb"],
  ["every_js_space", jsWhitespace.map((codePoint, index) =>
    `w${index}${String.fromCodePoint(codePoint)}`).join("") + "last"],
  ...jsWhitespace.map((codePoint, index) => [
    `trim_js_space_${index}`, `${String.fromCodePoint(codePoint)}x${String.fromCodePoint(codePoint)}`
  ])
];

process.stdout.write(JSON.stringify(cases.map(([label, content]) => {
  const { wordCount, characterCount, exceedsLimit } = getScriptLength(content);
  return { label, content, word_count: wordCount, character_count: characterCount,
    allowed: !exceedsLimit && characterCount > 0 };
})));
