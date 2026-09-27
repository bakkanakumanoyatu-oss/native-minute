import type { EditorialGallery, PublicGallery } from "./schema";
import type { GalleryRuntime } from "./runtime-schema";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

function normalizedCharacters(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function protectedNeedles(value: string, language: "en" | "ja") {
  const normalized = normalizedCharacters(value);
  const needles = new Set([normalized]);
  if (language === "en") {
    const words = value.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    for (let index = 0; index + 8 <= words.length; index++) {
      needles.add(words.slice(index, index + 8).join(""));
    }
  } else {
    const characters = Array.from(normalized);
    for (let index = 0; index + 24 <= characters.length; index++) {
      needles.add(characters.slice(index, index + 24).join(""));
    }
  }
  return [...needles].filter(Boolean);
}

function containsProtectedFragment(payload: string, publicValues: string[], language: "en" | "ja") {
  const candidates = publicValues.map(normalizedCharacters);
  return protectedNeedles(payload, language).some(needle => candidates.some(value => value.includes(needle)));
}

// Compare values, not serialized JSON, so escaped newlines and punctuation do
// not conceal substantial source fragments in any public metadata field.
export function assertPublicGalleryPayloadSeparation(source: EditorialGallery, catalog: PublicGallery) {
  const publicValues = strings(catalog);
  for (const item of catalog.items) {
    if ("practiceTextEn" in item || "translationJa" in item) {
      throw new Error(`Protected fields reached public metadata for ${item.id}`);
    }
  }
  for (const sourceItem of source.items) {
    for (const [field, language] of [["practiceTextEn", "en"], ["translationJa", "ja"]] as const) {
      const payload = sourceItem.practice[field];
      if (payload && containsProtectedFragment(payload, publicValues, language)) {
        throw new Error(`Protected ${field} fragment reached public metadata for ${sourceItem.id}`);
      }
    }
  }
}

export function assertDiscoveryPayloadAbsentFromRuntime(source: EditorialGallery, runtime: GalleryRuntime) {
  const runtimeValues = strings(runtime);
  for (const sourceItem of source.items) {
    if (runtime.items.some(item => item.id === sourceItem.id)) continue;
    for (const [field, language] of [["practiceTextEn", "en"], ["translationJa", "ja"]] as const) {
      const payload = sourceItem.practice[field];
      if (payload && containsProtectedFragment(payload, runtimeValues, language)) {
        throw new Error(`DISCOVERY ${field} fragment reached private runtime for ${sourceItem.id}`);
      }
    }
  }
}
