import { describe, expect, it } from "vitest";
import { getScriptLength } from "../../../lib/script-length";
import { buildPublicGalleryManifest, validateFirstCollection } from "../../../lib/gallery/manifest";
import { filterGalleryItems, getGalleryFilterOptions } from "../../../lib/gallery/public";
import { editorialGallerySchema, publicGallerySchema } from "../../../lib/gallery/schema";
import { buildGalleryRuntimeArtifact, parseGalleryRuntimeBytes, selectGalleryRuntimeItem } from "../../../lib/gallery/runtime-schema";
import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import GalleryPage from "../../../app/gallery/page";

const approved = () => ({ state: "APPROVED", evidenceRefs: ["editorial-review-1"] });
const unresolved = () => ({ state: "UNRESOLVED", evidenceRefs: [] });
const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index + 1}`).join(" ");

function item(id: string, publicationMode: "PRACTICE" | "DISCOVERY" | "HOLD" = "PRACTICE") {
  return {
    id,
    collectionVersion: "synthetic-v1",
    editorialStatus: "COMPLETE" as const,
    publicationMode,
    identity: { title: `Synthetic ${id}`, workTitle: "Invented work", sourceType: "Speeches" as const, speaker: "Test speaker", addressee: null, year: 2026 },
    editorial: { moment: "A fictional moment for testing.", contextJa: "架空の状況です。", whyItMattersJa: "テスト用です。", speakingNotes: ["Pause clearly."], themes: ["Choice"], moreLikeThis: [] as string[] },
    practice: { practiceTextEn: "I chose to speak clearly.", translationJa: "明確に話すと決めました。", targetSeconds: 60, expectedReadingSeconds: 10, sourceSegmentSeconds: 20, locale: "en-US" },
    source: { primarySourceUrl: "https://example.org/source", canonicalSourceLocator: "Synthetic source, page 1", sourceKind: "official" as const, startCue: null, endCue: null, releasedMasterTimecode: null, releasedMasterTimecodeRequired: false, sourceCheckedAt: "2026-09-27T00:00:00.000Z" },
    rights: { textDisplayReview: approved(), translationReview: approved(), ttsReview: approved(), userRecordingReview: approved(), sharingReview: approved(), commercialReview: approved(), territoryReview: approved(), rightsNote: null, evidenceRefs: ["editorial-review-1"] }
  };
}

function catalog(items: unknown[] = []) {
  return { schemaVersion: "gallery-editorial/v1", collectionVersion: "synthetic-v1", themes: ["Choice"], items };
}

describe("Gallery intake and public projection", () => {
  it("renders the Web release catalog and manual creation path", () => {
    const html = renderToStaticMarkup(GalleryPage({}));
    expect(html).toContain("/gallery/nm-fc-roosevelt-arena");
    expect(html).toContain("/gallery/nm-fc-gwh-your-move-chief");
    expect(html).toContain("/scripts/new");
    expect(html).toContain("自分で見つける / Your Story");
    expect(html).not.toContain('<option value="Conversations">');
    expect(html).not.toContain('<option value="Your Story">');
    expect(html).not.toContain('<option value="Time &amp; Mortality">');
    expect(html).not.toContain("I chose to speak clearly.");
  });
  it("supports empty, one, and mixed catalogs without inventing content", () => {
    expect(buildPublicGalleryManifest(catalog()).items).toEqual([]);
    const practice = item("practice");
    const discovery = item("discovery", "DISCOVERY");
    discovery.practice.practiceTextEn = "Restricted synthetic text.";
    discovery.practice.translationJa = "非公開の合成訳。";
    discovery.rights.textDisplayReview = unresolved();
    discovery.rights.translationReview = unresolved();
    const hold = item("hold", "HOLD");
    hold.rights.commercialReview = unresolved();
    const output = buildPublicGalleryManifest(catalog([practice, discovery, hold]));
    expect(output.items.map(entry => entry.id)).toEqual(["practice", "discovery"]);
    expect(JSON.stringify(output)).not.toContain("Restricted synthetic text");
    expect(JSON.stringify(output)).not.toContain("非公開の合成訳");
    expect(JSON.stringify(output)).not.toContain("I chose to speak clearly.");
    expect(JSON.stringify(output)).not.toContain("明確に話すと決めました。");
    expect(JSON.stringify(output)).not.toContain("hold");
    expect(output.items[0]).toMatchObject({ publicationMode: "PRACTICE", practiceAvailable: true });
    expect(output.items[0]).toMatchObject({ speakingNotes: ["Pause clearly."], canonicalSourceLocator: "Invented work", sourceKind: "source link" });
    expect(publicGallerySchema.safeParse({ ...output, items: [{ ...output.items[1], practiceTextEn: "leak" }] }).success).toBe(false);
    expect(publicGallerySchema.safeParse({ ...output, items: [{ ...output.items[0], translationJa: "leak" }] }).success).toBe(false);
    expect(publicGallerySchema.safeParse({ ...output, items: [{ ...practice, publicationMode: "HOLD" }] }).success).toBe(false);
  });

  it("keeps source and theme filtering data driven, including zero item categories", () => {
    const output = buildPublicGalleryManifest(catalog([item("one"), item("two")]));
    expect(getGalleryFilterOptions(output)).toEqual({ sources: ["Speeches"], themes: ["Choice"] });
    expect(filterGalleryItems({ query: "fictional" }, output)).toHaveLength(2);
    expect(filterGalleryItems({ sourceType: "Movies" }, output)).toHaveLength(0);
    expect(filterGalleryItems({ theme: "Choice" }, output)).toHaveLength(2);
    expect(filterGalleryItems({ query: "missing" }, output)).toHaveLength(0);
  });

  it("rejects protected fragments in editorial notes before any manifest can be written", () => {
    const candidate = item("note-leak");
    candidate.practice.practiceTextEn = words(10);
    candidate.editorial.speakingNotes = [words(8)];
    expect(() => buildPublicGalleryManifest(catalog([candidate]))).toThrow(/Protected practiceTextEn fragment/);
    candidate.editorial.speakingNotes = ["Pause clearly."];
    candidate.practice.translationJa = "一".repeat(30);
    candidate.editorial.speakingNotes = ["一".repeat(24)];
    expect(() => buildPublicGalleryManifest(catalog([candidate]))).toThrow(/Protected translationJa fragment/);
  });

  it("rejects duplicate IDs, unknown themes and broken or self relations", () => {
    expect(editorialGallerySchema.safeParse(catalog([item("same"), item("same")])).success).toBe(false);
    const unknownTheme = item("one"); unknownTheme.editorial.themes = ["Missing"];
    expect(editorialGallerySchema.safeParse(catalog([unknownTheme])).success).toBe(false);
    const broken = item("one"); broken.editorial.moreLikeThis = ["missing"];
    expect(editorialGallerySchema.safeParse(catalog([broken])).success).toBe(false);
    broken.editorial.moreLikeThis = ["one"];
    expect(editorialGallerySchema.safeParse(catalog([broken])).success).toBe(false);
  });

  it("fails closed on seven distinct rights decisions and requires evidence", () => {
    for (const axis of ["textDisplayReview", "translationReview", "ttsReview", "userRecordingReview", "sharingReview", "commercialReview", "territoryReview"] as const) {
      const candidate = item("one"); candidate.rights[axis] = unresolved();
      expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(false);
    }
    const missingEvidence = item("one"); missingEvidence.rights.ttsReview.evidenceRefs = [];
    expect(editorialGallerySchema.safeParse(catalog([missingEvidence])).success).toBe(false);
    const incomplete = { ...item("one"), editorialStatus: "NEEDS_USER_TEXT_INSERTION" };
    expect(editorialGallerySchema.safeParse(catalog([incomplete])).success).toBe(false);
  });

  it("checks provenance, URL, placeholders, movie timecode and schema version", () => {
    const candidate = item("one");
    candidate.source.canonicalSourceLocator = "TODO";
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(false);
    candidate.source.canonicalSourceLocator = "Synthetic source, page 1";
    candidate.source.primarySourceUrl = "javascript:alert(1)";
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(false);
    candidate.source.primarySourceUrl = "https://example.org/source";
    candidate.identity.sourceType = "Movies" as "Speeches";
    candidate.source.releasedMasterTimecodeRequired = true;
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(false);
    candidate.publicationMode = "DISCOVERY";
    candidate.editorial.speakingNotes = ["Pause before the final sentence."];
    candidate.source.canonicalSourceLocator = "A private subtitle locator for editors only.";
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(true);
    const discovery = buildPublicGalleryManifest(catalog([candidate])).items[0];
    expect(discovery).toMatchObject({
      publicationMode: "DISCOVERY",
      speakingNotes: ["Pause before the final sentence."],
      canonicalSourceLocator: "Invented work",
      sourceKind: "source link"
    });
    expect(JSON.stringify(discovery)).not.toContain("private subtitle");
    candidate.publicationMode = "HOLD";
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(true);
    expect(editorialGallerySchema.safeParse({ ...catalog(), schemaVersion: "gallery-editorial/v0" }).success).toBe(false);
  });

  it("reuses the canonical 200-word and 2000 UTF-16 unit boundaries", () => {
    const candidate = item("one");
    candidate.practice.practiceTextEn = words(200);
    expect(getScriptLength(candidate.practice.practiceTextEn).wordCount).toBe(200);
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(true);
    candidate.practice.practiceTextEn = words(201);
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(false);
    candidate.practice.practiceTextEn = "a".repeat(2000);
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(true);
    candidate.practice.practiceTextEn += "a";
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(false);
    candidate.publicationMode = "DISCOVERY";
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(false);
    candidate.publicationMode = "HOLD";
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(true);
  });

  it("accepts the canonical 15–120 target range and rejects invalid locale and labels", () => {
    const candidate = item("one");
    for (const seconds of [15, 72, 120]) {
      candidate.practice.targetSeconds = seconds;
      expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(true);
    }
    candidate.practice.targetSeconds = 121;
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(false);
    candidate.practice.targetSeconds = 60;
    candidate.practice.locale = "ja-JP";
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(false);
    candidate.practice.locale = "en-US";
    candidate.practice.practiceTextEn = "INT. TEST ROOM";
    expect(editorialGallerySchema.safeParse(catalog([candidate])).success).toBe(false);
  });

  it("does not update a copied user script when a catalog item changes", () => {
    const candidate = item("one");
    const savedUserScript = { title: candidate.identity.title, content: candidate.practice.practiceTextEn, targetSeconds: candidate.practice.targetSeconds, locale: candidate.practice.locale };
    candidate.practice.practiceTextEn = "The editorial source changed.";
    expect(savedUserScript.content).toBe("I chose to speak clearly.");
    expect(buildPublicGalleryManifest(catalog([candidate])).items[0]).toMatchObject({ practiceAvailable: true });
    expect(JSON.stringify(buildPublicGalleryManifest(catalog([candidate])))).not.toContain("The editorial source changed.");
  });

  it("builds only approved PRACTICE runtime fields and verifies the exact release bytes", () => {
    const discovery = item("discovery", "DISCOVERY");
    const hold = item("hold", "HOLD");
    const editorial = catalog([item("practice"), discovery, hold]);
    const publicCatalog = buildPublicGalleryManifest(editorial);
    const runtime = buildGalleryRuntimeArtifact(editorial, "synthetic-release-v1");
    expect(runtime.items.map(entry => entry.id)).toEqual(["practice"]);
    expect(runtime.items[0]).toMatchObject({ practiceTextEn: "I chose to speak clearly.", translationJa: "明確に話すと決めました。" });
    expect(JSON.stringify(runtime)).not.toContain("editorial-review-1");
    expect(JSON.stringify(runtime)).not.toContain("fictional moment");
    const bytes = Buffer.from(JSON.stringify(runtime));
    const hash = createHash("sha256").update(bytes).digest("hex");
    const loaded = parseGalleryRuntimeBytes(bytes, hash, "synthetic-release-v1", publicCatalog);
    expect(selectGalleryRuntimeItem(loaded, publicCatalog, "practice")?.practiceTextEn).toBe("I chose to speak clearly.");
    expect(selectGalleryRuntimeItem(loaded, publicCatalog, "discovery")).toBeNull();
    expect(selectGalleryRuntimeItem(loaded, publicCatalog, "hold")).toBeNull();
    expect(selectGalleryRuntimeItem(loaded, publicCatalog, "unknown")).toBeNull();
    expect(() => parseGalleryRuntimeBytes(bytes, "0".repeat(64), "synthetic-release-v1", publicCatalog)).toThrow();
    const malformed = Buffer.from(JSON.stringify({ ...runtime, items: [{ ...runtime.items[0], rightsNote: "secret" }] }));
    expect(() => parseGalleryRuntimeBytes(malformed, createHash("sha256").update(malformed).digest("hex"), "synthetic-release-v1", publicCatalog)).toThrow();
    const wrongCollection = { ...runtime, sourceCollectionVersion: "other" };
    const wrongBytes = Buffer.from(JSON.stringify(wrongCollection));
    expect(() => parseGalleryRuntimeBytes(wrongBytes, createHash("sha256").update(wrongBytes).digest("hex"), "synthetic-release-v1", publicCatalog)).toThrow();
  });

  it("checks each First Collection status and movie speaker, beyond aggregate counts", () => {
    const entries = [
      ["Movies", "Good Will Hunting", "Your Move, Chief", "Sean", "NEEDS_USER_TEXT_INSERTION"],
      ["Movies", "The Devil Wears Prada", "The Sweater Was Chosen for You", "Miranda", "NEEDS_USER_TEXT_INSERTION"],
      ["Movies", "Hidden Figures", "There Is No Bathroom for Me Here", "Katherine", "NEEDS_USER_TEXT_INSERTION"],
      ["Movies", "Network", "First, You’ve Got to Get Mad", "Howard Beale", "NEEDS_USER_TEXT_INSERTION"],
      ["Speeches", "Test speech", "Your Worst Fear, Realized", "Conan O’Brien", "NEEDS_USER_TEXT_INSERTION"],
      ["Speeches", "Test speech", "The Person in the Arena", "Theodore Roosevelt", "COMPLETE"],
      ["Speeches", "Test speech", "Because They Are Hard", "John F. Kennedy", "COMPLETE"],
      ["Speeches", "Test speech", "No Progress Without Struggle", "Frederick Douglass", "COMPLETE"],
      ["Books, Essays & Letters", "Test book", "The End of the Endurance", "Ernest Shackleton", "COMPLETE"],
      ["Books, Essays & Letters", "Test book", "Because of My Work", "Nellie Bly", "COMPLETE"],
      ["Books, Essays & Letters", "Test book", "The Mystery of Language", "Helen Keller", "NEEDS_USER_TEXT_INSERTION"],
      ["Books, Essays & Letters", "Test book", "The Loophole of Retreat", "Harriet Jacobs", "COMPLETE"]
    ] as const;
    const items = entries.map(([sourceType, workTitle, title, speaker, editorialStatus], index) => ({
      ...item(`synthetic-${index}`, "HOLD"),
      editorialStatus,
      identity: { ...item(`synthetic-${index}`).identity, sourceType, workTitle, title, speaker }
    }));
    const parsed = editorialGallerySchema.parse({ ...catalog(items), themes: Array.from({ length: 12 }, (_, index) => index ? `Theme ${index}` : "Choice") });
    expect(validateFirstCollection(parsed).mismatches).toEqual([]);
    parsed.items[0]!.editorialStatus = "COMPLETE";
    parsed.items[5]!.editorialStatus = "NEEDS_USER_TEXT_INSERTION";
    expect(validateFirstCollection(parsed).mismatches).toContain("Movies|Good Will Hunting|Your Move, Chief: editorial status mismatch");
    parsed.items[0]!.editorialStatus = "NEEDS_USER_TEXT_INSERTION";
    parsed.items[5]!.editorialStatus = "COMPLETE";
    parsed.items[0]!.identity.speaker = "Miranda";
    expect(validateFirstCollection(parsed).mismatches).toContain("Movies|Good Will Hunting|Your Move, Chief: movie speaker mismatch");
  });
});
