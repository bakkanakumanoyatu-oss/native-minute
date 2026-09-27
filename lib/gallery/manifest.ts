import type { EditorialGallery, PublicGallery, PublicGalleryItem } from "./schema";
import { editorialGallerySchema, publicGallerySchema, PUBLIC_GALLERY_SCHEMA_VERSION } from "./schema";
import { getScriptLength } from "../script-length";

export function buildPublicGalleryManifest(input: unknown): PublicGallery {
  const editorial = editorialGallerySchema.parse(input);
  const items: PublicGalleryItem[] = [];
  for (const item of editorial.items) {
    if (item.publicationMode === "HOLD") continue;
    const common = {
      id: item.id,
      collectionVersion: item.collectionVersion,
      title: item.identity.title,
      workTitle: item.identity.workTitle,
      sourceType: item.identity.sourceType,
      speaker: item.identity.speaker,
      year: item.identity.year,
      moment: item.editorial.moment,
      contextJa: item.editorial.contextJa,
      whyItMattersJa: item.editorial.whyItMattersJa,
      speakingNotes: item.editorial.speakingNotes,
      themes: item.editorial.themes,
      moreLikeThis: item.editorial.moreLikeThis,
      primarySourceUrl: item.source.primarySourceUrl,
      canonicalSourceLocator: item.source.canonicalSourceLocator,
      sourceKind: item.source.sourceKind
    };
    if (item.publicationMode === "DISCOVERY") {
      items.push({ ...common, publicationMode: "DISCOVERY" });
      continue;
    }
    items.push({
      ...common,
      publicationMode: "PRACTICE" as const,
      practiceAvailable: true as const,
      targetSeconds: item.practice.targetSeconds!,
      locale: item.practice.locale,
      wordCount: getScriptLength(item.practice.practiceTextEn!).wordCount,
      characterCount: getScriptLength(item.practice.practiceTextEn!).characterCount
    });
  }
  // Relations to held items cannot point at a public detail page.
  const publicIds = new Set(items.map(item => item.id));
  const publicItems = items.map(item => ({
    ...item,
    moreLikeThis: item.moreLikeThis.filter(id => publicIds.has(id))
  }));
  return publicGallerySchema.parse({
    schemaVersion: PUBLIC_GALLERY_SCHEMA_VERSION,
    collectionVersion: editorial.collectionVersion,
    themes: editorial.themes,
    items: publicItems
  });
}

export function validateFirstCollection(editorial: EditorialGallery) {
  const counts = {
    total: editorial.items.length,
    themes: editorial.themes.length,
    movies: editorial.items.filter(item => item.identity.sourceType === "Movies").length,
    speeches: editorial.items.filter(item => item.identity.sourceType === "Speeches").length,
    books: editorial.items.filter(item => item.identity.sourceType === "Books, Essays & Letters").length,
    complete: editorial.items.filter(item => item.editorialStatus === "COMPLETE").length,
    insertion: editorial.items.filter(item => item.editorialStatus === "NEEDS_USER_TEXT_INSERTION").length
  };
  const expected = { total: 12, themes: 12, movies: 4, speeches: 4, books: 4, complete: 6, insertion: 6 };
  const identityOf = (item: EditorialGallery["items"][number]) => `${item.identity.sourceType}|${item.identity.sourceType === "Movies" ? item.identity.workTitle : item.identity.speaker}|${item.identity.title}`;
  const actualIdentities = new Set(editorial.items.map(identityOf));
  const expectedIdentities = [
    "Movies|Good Will Hunting|Your Move, Chief",
    "Movies|The Devil Wears Prada|The Sweater Was Chosen for You",
    "Movies|Hidden Figures|There Is No Bathroom for Me Here",
    "Movies|Network|First, You’ve Got to Get Mad",
    "Speeches|Conan O’Brien|Your Worst Fear, Realized",
    "Speeches|Theodore Roosevelt|The Person in the Arena",
    "Speeches|John F. Kennedy|Because They Are Hard",
    "Speeches|Frederick Douglass|No Progress Without Struggle",
    "Books, Essays & Letters|Ernest Shackleton|The End of the Endurance",
    "Books, Essays & Letters|Nellie Bly|Because of My Work",
    "Books, Essays & Letters|Helen Keller|The Mystery of Language",
    "Books, Essays & Letters|Harriet Jacobs|The Loophole of Retreat"
  ];
  const mismatches = Object.entries(expected).filter(([key, value]) => counts[key as keyof typeof counts] !== value)
    .map(([key]) => `${key}: expected ${expected[key as keyof typeof expected]}, got ${counts[key as keyof typeof counts]}`);
  for (const identity of expectedIdentities) if (!actualIdentities.has(identity)) mismatches.push(`missing identity: ${identity}`);
  for (const identity of actualIdentities) if (!expectedIdentities.includes(identity)) mismatches.push(`unexpected identity: ${identity}`);
  const needsInsertion = new Set([0, 1, 2, 3, 4, 10]);
  const movieSpeaker = ["Sean", "Miranda", "Katherine", "Howard"];
  for (const [index, identity] of expectedIdentities.entries()) {
    const actual = editorial.items.find(item => identityOf(item) === identity);
    if (!actual) continue;
    const expectedSource = index < 4 ? "Movies" : index < 8 ? "Speeches" : "Books, Essays & Letters";
    const expectedStatus = needsInsertion.has(index) ? "NEEDS_USER_TEXT_INSERTION" : "COMPLETE";
    if (actual.identity.sourceType !== expectedSource) mismatches.push(`${identity}: source mismatch`);
    if (actual.editorialStatus !== expectedStatus) mismatches.push(`${identity}: editorial status mismatch`);
    if (index < 4 && !new RegExp(`\\b${movieSpeaker[index]}\\b`, "iu").test(actual.identity.speaker)) mismatches.push(`${identity}: movie speaker mismatch`);
  }
  return { counts, mismatches };
}
