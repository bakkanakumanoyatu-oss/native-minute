import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { buildPublicGalleryManifest } from "../lib/gallery/manifest.ts";
import { getGalleryFilterOptions } from "../lib/gallery/public.ts";
import { buildGalleryRuntimeArtifact, assertRuntimeMatchesPublic } from "../lib/gallery/runtime-schema.ts";
import {
  assertReleasePayloadSeparation,
  buildFirstWorldBetaOverlay,
  FIRST_COLLECTION_DECISION_SHA256,
  FIRST_COLLECTION_SOURCE_SHA256,
  FIRST_COLLECTION_VERSION,
  FIRST_COLLECTION_ZIP_SHA256,
  FIRST_WORLD_BETA_DISCOVERY_IDS,
  FIRST_WORLD_BETA_PRACTICE_IDS,
  FIRST_WORLD_BETA_RELEASE_VERSION
} from "../lib/gallery/release-decision.ts";

const approvedPractice = {
  textDisplayReview: "APPROVED",
  translationReview: "APPROVED_FOR_PACKAGE_NEW_TRANSLATION",
  ttsReview: "APPROVED_WITH_HUMAN_CONFIRMED_PROVIDER_CONTRACT",
  userRecordingReview: "APPROVED",
  sharingReview: "APPROVED_WITHOUT_SOURCE_AUDIO",
  commercialReview: "APPROVED",
  territoryReview: "APPROVED_WORLDWIDE_RISK_SCREENED"
};
const approvedDiscovery = {
  textDisplayReview: "UNRESOLVED_NOT_INVOKED",
  translationReview: "UNRESOLVED_NOT_INVOKED",
  ttsReview: "UNRESOLVED_NOT_INVOKED",
  userRecordingReview: "UNRESOLVED_NOT_INVOKED",
  sharingReview: "UNRESOLVED_NOT_INVOKED",
  commercialReview: "APPROVED_METADATA_ONLY",
  territoryReview: "APPROVED_WORLDWIDE_METADATA_ONLY"
};
const sourceUrlOverrideIds = [
  "nm-fc-hidden-bathroom", "nm-fc-network-get-mad", "nm-fc-conan-worst-fear",
  "nm-fc-jfk-hard", "nm-fc-keller-language"
];
const allIds = [...FIRST_WORLD_BETA_DISCOVERY_IDS, ...FIRST_WORLD_BETA_PRACTICE_IDS];

const reviewedCopy = {
  "nm-fc-gwh-your-move-chief": {
    moment: "知識で相手を言い負かす青年に、セラピストはWill自身の経験を問いかける。",
    contextJa: "公園のベンチでSeanがWillへ語る場面。読んだ知識だけでは分からない愛や喪失について話し、最後はWill自身が何を語るかに選択を返す。"
  },
  "nm-fc-prada-sweater-chosen": { contextJa: "編集部の服選びでAndyが示した無関心に、Mirandaが青いセーターの来歴を説明する。ひとつの色がデザイナーや流通を経て、本人が無関係だと思っていた選択にまでつながっていることを示す。" },
  "nm-fc-hidden-bathroom": { contextJa: "実在人物をもとにした映画上のKatherineが、利用できるトイレまでの距離、服装規定、コーヒーの扱いなど、職場で抱えていた具体的な負担を上司と同僚へ言葉にする場面。" },
  "nm-fc-network-get-mad": { contextJa: "放送中のニュースキャスターHoward Bealeが、視聴者へ怒りを言葉にするよう呼びかける独白。テレビをめぐる風刺の中で、受け身の不満を、自分の人生には価値があるという主張へ変えていく。" },
  "nm-fc-douglass-struggle": { contextJa: "1857年、ニューヨーク州Canandaiguaで西インド諸島の奴隷解放を記念して行われた演説の一節。作物・雷雨・海の比喩を重ねながら、自由を求めるには要求と抵抗が伴うと説く。" },
  "nm-fc-bly-work": { contextJa: "『Ten Days in a Mad-House』の序文。施設への潜入取材を記事にした後、読者からの反響と、その後のケア予算の増額を本人が振り返っている。" },
  "nm-fc-keller-language": { contextJa: "『The Story of My Life』第I部Chapter IV。井戸小屋で、水に触れながら手のひらに綴られた言葉とその意味が結びついた瞬間を、著者が後年振り返る。" }
};

test("the checked-in public catalog has the exact reviewed metadata and only populated filters", () => {
  const catalog = JSON.parse(readFileSync(new URL("../lib/gallery/public-gallery.json", import.meta.url), "utf8"));
  assert.equal(catalog.items.length, 12);
  assert.deepEqual(new Set(catalog.items.filter(item => item.publicationMode === "PRACTICE").map(item => item.id)), new Set(FIRST_WORLD_BETA_PRACTICE_IDS));
  assert.deepEqual(new Set(catalog.items.filter(item => item.publicationMode === "DISCOVERY").map(item => item.id)), new Set(FIRST_WORLD_BETA_DISCOVERY_IDS));
  assert.equal(catalog.items.every(item => item.speakingNotes.length > 0), true);
  assert.equal(catalog.items.every(item => !("practiceTextEn" in item) && !("translationJa" in item)), true);
  for (const [id, copy] of Object.entries(reviewedCopy)) {
    const item = catalog.items.find(entry => entry.id === id);
    assert.ok(item, `missing ${id}`);
    for (const [field, expected] of Object.entries(copy)) assert.equal(item[field], expected, `${id}.${field}`);
  }
  const filters = getGalleryFilterOptions(catalog);
  assert.deepEqual(filters.sources, ["Movies", "Speeches", "Books, Essays & Letters"]);
  assert.deepEqual(filters.themes, catalog.themes.filter(theme => theme !== "Time & Mortality"));
  assert.equal(filters.themes.includes("Time & Mortality"), false);
  assert.equal(catalog.themes.length, 12);
});

function fixture() {
  const items = allIds.map(id => {
    const hasText = FIRST_WORLD_BETA_PRACTICE_IDS.includes(id) || id === "nm-fc-jfk-hard";
    const rights = Object.fromEntries(Object.keys(approvedPractice).map(axis => [axis, { state: "UNRESOLVED", evidenceRefs: [] }]));
    return {
      id, collectionVersion: FIRST_COLLECTION_VERSION, editorialStatus: hasText ? "COMPLETE" : "NEEDS_USER_TEXT_INSERTION",
      publicationMode: "HOLD",
      identity: { title: `Synthetic ${id}`, workTitle: "Invented work", sourceType: "Speeches", speaker: "Test speaker", addressee: null, year: 2026 },
      editorial: { moment: "Invented situation.", contextJa: "架空の文脈です。", whyItMattersJa: "合成テストです。", speakingNotes: ["Pause."], themes: ["Choice"], moreLikeThis: [] },
      practice: { practiceTextEn: hasText ? `Synthetic ${id} chooses ${id} clearly, then ${id} speaks ${id} with many invented test words.` : null,
        translationJa: hasText ? `これは${id}だけの合成訳です。${id}の別表現で検査します。` : null,
        targetSeconds: hasText ? 60 : null, expectedReadingSeconds: null, sourceSegmentSeconds: null, locale: "en-US" },
      source: { primarySourceUrl: "https://example.org/original", canonicalSourceLocator: "Invented source", sourceKind: "official", startCue: null,
        endCue: null, releasedMasterTimecode: null, releasedMasterTimecodeRequired: false, sourceCheckedAt: "2026-09-27T00:00:00.000Z" },
      rights: { ...rights, rightsNote: null, evidenceRefs: [] }
    };
  });
  const source = { schemaVersion: "gallery-editorial/v1", collectionVersion: FIRST_COLLECTION_VERSION, themes: ["Choice"], items };
  const decision = {
    schemaVersion: "gallery-release-decision/v1", releaseDecisionVersion: FIRST_WORLD_BETA_RELEASE_VERSION,
    sourcePackage: { collectionVersion: FIRST_COLLECTION_VERSION, mainJsonSha256: FIRST_COLLECTION_SOURCE_SHA256, zipSha256: FIRST_COLLECTION_ZIP_SHA256 },
    humanDecisions: { distributionScope: "WORLDWIDE_BETA", practiceTextAndTranslationPublicGitHub: false,
      runtimeDelivery: "PRIVATE_RUNTIME_SERVER_ONLY", elevenLabsEndUserIntegration: "HUMAN_CONFIRMED_OK" },
    releaseShape: { practice: 5, discovery: 7, hold: 0 },
    items: allIds.map(id => ({ id, publicationMode: FIRST_WORLD_BETA_PRACTICE_IDS.includes(id) ? "PRACTICE" : "DISCOVERY",
      ...(sourceUrlOverrideIds.includes(id) ? { publicSourceUrlOverride: `https://example.org/release/${id}` } : {}) })),
    rightsDecision: { practice5: { ...approvedPractice }, discovery7: { ...approvedDiscovery } },
    globalScreeningNotes: []
  };
  return { source, decision };
}

test("a synthetic world release keeps its source intact and separates public and private payloads", () => {
  const { source, decision } = fixture();
  const before = JSON.stringify(source);
  const { editorial } = buildFirstWorldBetaOverlay(source, decision);
  assert.equal(JSON.stringify(source), before);
  assert.equal(source.items.every(item => item.publicationMode === "HOLD"), true);
  assert.equal(editorial.items.filter(item => item.publicationMode === "PRACTICE").length, 5);
  assert.equal(editorial.items.filter(item => item.publicationMode === "DISCOVERY").length, 7);
  for (const id of sourceUrlOverrideIds) {
    assert.equal(editorial.items.find(item => item.id === id).source.primarySourceUrl, `https://example.org/release/${id}`);
  }
  const practice = editorial.items.find(item => item.id === FIRST_WORLD_BETA_PRACTICE_IDS[0]);
  assert.equal(practice.rights.ttsReview.state, "APPROVED");
  assert.ok(practice.rights.ttsReview.evidenceRefs.some(ref => ref.includes(FIRST_COLLECTION_DECISION_SHA256)));
  const discovery = editorial.items.find(item => item.id === FIRST_WORLD_BETA_DISCOVERY_IDS[0]);
  assert.equal(discovery.rights.textDisplayReview.state, "UNRESOLVED");
  assert.equal(discovery.rights.territoryReview.state, "APPROVED");

  const catalog = buildPublicGalleryManifest(editorial);
  const runtime = buildGalleryRuntimeArtifact(editorial, FIRST_WORLD_BETA_RELEASE_VERSION);
  assert.equal(catalog.items.length, 12);
  assert.equal(catalog.items.every(item => item.speakingNotes.length > 0), true);
  assert.deepEqual(new Set(runtime.items.map(item => item.id)), new Set(FIRST_WORLD_BETA_PRACTICE_IDS));
  assertRuntimeMatchesPublic(runtime, catalog);
  assert.doesNotThrow(() => assertReleasePayloadSeparation(source, catalog, runtime));
  assert.equal(JSON.stringify(source), before);
});

test("decision drift and a protected metadata fragment fail closed", () => {
  const { source, decision } = fixture();
  decision.items.find(item => item.id === FIRST_WORLD_BETA_PRACTICE_IDS[0]).publicationMode = "DISCOVERY";
  assert.throws(() => buildFirstWorldBetaOverlay(source, decision), /PRACTICE IDs/);
  decision.items.find(item => item.id === FIRST_WORLD_BETA_PRACTICE_IDS[0]).publicationMode = "PRACTICE";
  decision.rightsDecision.practice5.ttsReview = "UNRESOLVED_NOT_INVOKED";
  assert.throws(() => buildFirstWorldBetaOverlay(source, decision), /Rights decision/);
  decision.rightsDecision.practice5.ttsReview = "APPROVED_WITH_HUMAN_CONFIRMED_PROVIDER_CONTRACT";

  const { editorial } = buildFirstWorldBetaOverlay(source, decision);
  const catalog = buildPublicGalleryManifest(editorial);
  const runtime = buildGalleryRuntimeArtifact(editorial, FIRST_WORLD_BETA_RELEASE_VERSION);
  const leaked = structuredClone(catalog);
  leaked.items[0].contextJa = source.items.find(item => item.id === "nm-fc-jfk-hard").practice.translationJa.slice(0, 50);
  assert.throws(() => assertReleasePayloadSeparation(source, leaked, runtime), /Protected translationJa fragment/);
  const englishLeak = structuredClone(catalog);
  englishLeak.items[0].moment = source.items.find(item => item.id === FIRST_WORLD_BETA_PRACTICE_IDS[0]).practice.practiceTextEn.split(" ").slice(2, 10).join(" ");
  assert.throws(() => assertReleasePayloadSeparation(source, englishLeak, runtime), /Protected practiceTextEn fragment/);
  const noteLeak = structuredClone(catalog);
  noteLeak.items[0].speakingNotes = [source.items.find(item => item.id === FIRST_WORLD_BETA_PRACTICE_IDS[0]).practice.practiceTextEn.split(" ").slice(2, 10).join(" ")];
  assert.throws(() => assertReleasePayloadSeparation(source, noteLeak, runtime), /Protected practiceTextEn fragment/);
});
