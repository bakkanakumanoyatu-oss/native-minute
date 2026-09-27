import { z } from "zod";
import { editorialGallerySchema, type EditorialGallery, type PublicGallery } from "./schema";
import type { GalleryRuntime } from "./runtime-schema";
import { assertDiscoveryPayloadAbsentFromRuntime, assertPublicGalleryPayloadSeparation } from "./payload-separation";

export const FIRST_COLLECTION_SOURCE_SHA256 = "2d65bd56968e88c993b97f563b4d93af40bb5f504698b078d921409cc37788e4";
export const FIRST_COLLECTION_DECISION_SHA256 = "71f565f613fa46342ea5acaab322eaa7598174beab6ea4706f6d1cda6bc52402";
export const FIRST_COLLECTION_ZIP_SHA256 = "92808ca7894c23e88389e9373b7ab05147f661a6b642a916101daf0251754f41";
export const FIRST_COLLECTION_VERSION = "2026-09-27-first-collection-editorial-v1";
export const FIRST_WORLD_BETA_RELEASE_VERSION = "2026-09-27-world-beta-v1";

export const FIRST_WORLD_BETA_PRACTICE_IDS = [
  "nm-fc-roosevelt-arena",
  "nm-fc-douglass-struggle",
  "nm-fc-shackleton-endurance",
  "nm-fc-bly-work",
  "nm-fc-jacobs-retreat"
] as const;
export const FIRST_WORLD_BETA_DISCOVERY_IDS = [
  "nm-fc-gwh-your-move-chief",
  "nm-fc-prada-sweater-chosen",
  "nm-fc-hidden-bathroom",
  "nm-fc-network-get-mad",
  "nm-fc-conan-worst-fear",
  "nm-fc-jfk-hard",
  "nm-fc-keller-language"
] as const;

const expectedSourceUrlOverrideIds = new Set([
  "nm-fc-hidden-bathroom",
  "nm-fc-network-get-mad",
  "nm-fc-conan-worst-fear",
  "nm-fc-jfk-hard",
  "nm-fc-keller-language"
]);

const expectedPracticeRights = {
  textDisplayReview: "APPROVED",
  translationReview: "APPROVED_FOR_PACKAGE_NEW_TRANSLATION",
  ttsReview: "APPROVED_WITH_HUMAN_CONFIRMED_PROVIDER_CONTRACT",
  userRecordingReview: "APPROVED",
  sharingReview: "APPROVED_WITHOUT_SOURCE_AUDIO",
  commercialReview: "APPROVED",
  territoryReview: "APPROVED_WORLDWIDE_RISK_SCREENED"
} as const;
const expectedDiscoveryRights = {
  textDisplayReview: "UNRESOLVED_NOT_INVOKED",
  translationReview: "UNRESOLVED_NOT_INVOKED",
  ttsReview: "UNRESOLVED_NOT_INVOKED",
  userRecordingReview: "UNRESOLVED_NOT_INVOKED",
  sharingReview: "UNRESOLVED_NOT_INVOKED",
  commercialReview: "APPROVED_METADATA_ONLY",
  territoryReview: "APPROVED_WORLDWIDE_METADATA_ONLY"
} as const;
type RightsAxis = keyof typeof expectedPracticeRights;

const decisionItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  publicationMode: z.enum(["PRACTICE", "DISCOVERY"]),
  publicSourceUrlOverride: z.string().url().regex(/^https:\/\//u).optional()
}).strict();
const rightsRecord = z.object(Object.fromEntries(
  Object.keys(expectedPracticeRights).map(axis => [axis, z.string().min(1)])
) as Record<RightsAxis, z.ZodString>).strict();

export const firstWorldBetaDecisionSchema = z.object({
  schemaVersion: z.literal("gallery-release-decision/v1"),
  releaseDecisionVersion: z.literal(FIRST_WORLD_BETA_RELEASE_VERSION),
  sourcePackage: z.object({
    collectionVersion: z.literal(FIRST_COLLECTION_VERSION),
    mainJsonSha256: z.literal(FIRST_COLLECTION_SOURCE_SHA256),
    zipSha256: z.literal(FIRST_COLLECTION_ZIP_SHA256)
  }).strict(),
  humanDecisions: z.object({
    distributionScope: z.literal("WORLDWIDE_BETA"),
    practiceTextAndTranslationPublicGitHub: z.literal(false),
    runtimeDelivery: z.literal("PRIVATE_RUNTIME_SERVER_ONLY"),
    elevenLabsEndUserIntegration: z.literal("HUMAN_CONFIRMED_OK")
  }).strict(),
  releaseShape: z.object({ practice: z.literal(5), discovery: z.literal(7), hold: z.literal(0) }).strict(),
  items: z.array(decisionItemSchema).length(12),
  rightsDecision: z.object({ practice5: rightsRecord, discovery7: rightsRecord }).strict(),
  globalScreeningNotes: z.array(z.string())
}).strict();

export type FirstWorldBetaDecision = z.infer<typeof firstWorldBetaDecisionSchema>;

function assertExactIds(actual: string[], expected: readonly string[], label: string) {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length ||
    actual.some(id => !expected.includes(id))) {
    throw new Error(`${label} IDs do not match the pinned release decision`);
  }
}

function assertRightsDecision(decision: FirstWorldBetaDecision) {
  for (const axis of Object.keys(expectedPracticeRights) as RightsAxis[]) {
    if (decision.rightsDecision.practice5[axis] !== expectedPracticeRights[axis] ||
      decision.rightsDecision.discovery7[axis] !== expectedDiscoveryRights[axis]) {
      throw new Error(`Rights decision differs for ${axis}`);
    }
  }
}

// Metadata cleanup is specific to this human-reviewed release. The canonical
// editorial package remains byte-for-byte intact outside the public repository.
const releaseEditorialOverrides: Record<string, { moment?: string; contextJa?: string }> = {
  "nm-fc-gwh-your-move-chief": {
    moment: "知識で相手を言い負かす青年に、セラピストはWill自身の経験を問いかける。",
    contextJa: "公園のベンチでSeanがWillへ語る場面。読んだ知識だけでは分からない愛や喪失について話し、最後はWill自身が何を語るかに選択を返す。"
  },
  "nm-fc-prada-sweater-chosen": {
    contextJa: "編集部の服選びでAndyが示した無関心に、Mirandaが青いセーターの来歴を説明する。ひとつの色がデザイナーや流通を経て、本人が無関係だと思っていた選択にまでつながっていることを示す。"
  },
  "nm-fc-hidden-bathroom": {
    contextJa: "実在人物をもとにした映画上のKatherineが、利用できるトイレまでの距離、服装規定、コーヒーの扱いなど、職場で抱えていた具体的な負担を上司と同僚へ言葉にする場面。"
  },
  "nm-fc-network-get-mad": {
    contextJa: "放送中のニュースキャスターHoward Bealeが、視聴者へ怒りを言葉にするよう呼びかける独白。テレビをめぐる風刺の中で、受け身の不満を、自分の人生には価値があるという主張へ変えていく。"
  },
  "nm-fc-conan-worst-fear": {
    contextJa: "2011年6月12日のDartmouth卒業式。Conanは前年の公の挫折を振り返り、進路が変わることについて話す。"
  },
  "nm-fc-jfk-hard": {
    contextJa: "1962年9月12日、Rice Universityでの宇宙開発演説。月へ向かう選択を、力と技術を結集して試す挑戦として述べた。"
  },
  "nm-fc-douglass-struggle": {
    contextJa: "1857年、ニューヨーク州Canandaiguaで西インド諸島の奴隷解放を記念して行われた演説の一節。作物・雷雨・海の比喩を重ねながら、自由を求めるには要求と抵抗が伴うと説く。"
  },
  "nm-fc-bly-work": {
    contextJa: "『Ten Days in a Mad-House』の序文。施設への潜入取材を記事にした後、読者からの反響と、その後のケア予算の増額を本人が振り返っている。"
  },
  "nm-fc-keller-language": {
    contextJa: "『The Story of My Life』第I部Chapter IV。井戸小屋で、水に触れながら手のひらに綴られた言葉とその意味が結びついた瞬間を、著者が後年振り返る。"
  }
};

export function buildFirstWorldBetaOverlay(sourceInput: unknown, decisionInput: unknown): {
  editorial: EditorialGallery;
  decision: FirstWorldBetaDecision;
} {
  const source = editorialGallerySchema.parse(sourceInput);
  const decision = firstWorldBetaDecisionSchema.parse(decisionInput);
  if (source.collectionVersion !== FIRST_COLLECTION_VERSION || source.items.length !== 12 ||
    source.items.some(item => item.publicationMode !== "HOLD")) {
    throw new Error("Canonical First Collection is not the pinned HOLD source");
  }
  const expectedIds = [...FIRST_WORLD_BETA_PRACTICE_IDS, ...FIRST_WORLD_BETA_DISCOVERY_IDS];
  assertExactIds(source.items.map(item => item.id), expectedIds, "Source");
  assertExactIds(decision.items.map(item => item.id), expectedIds, "Decision");
  assertExactIds(decision.items.filter(item => item.publicationMode === "PRACTICE").map(item => item.id), FIRST_WORLD_BETA_PRACTICE_IDS, "PRACTICE");
  assertExactIds(decision.items.filter(item => item.publicationMode === "DISCOVERY").map(item => item.id), FIRST_WORLD_BETA_DISCOVERY_IDS, "DISCOVERY");
  assertExactIds(decision.items.filter(item => item.publicSourceUrlOverride).map(item => item.id), [...expectedSourceUrlOverrideIds], "Source URL override");
  assertRightsDecision(decision);

  const byId = new Map(decision.items.map(item => [item.id, item]));
  const overlay = structuredClone(source);
  for (const item of overlay.items) {
    const release = byId.get(item.id)!;
    const rightsForMode = release.publicationMode === "PRACTICE" ? decision.rightsDecision.practice5 : decision.rightsDecision.discovery7;
    item.publicationMode = release.publicationMode;
    if (release.publicSourceUrlOverride) item.source.primarySourceUrl = release.publicSourceUrlOverride;
    if (releaseEditorialOverrides[item.id]) {
      item.editorial = { ...item.editorial, ...releaseEditorialOverrides[item.id] };
    }
    for (const axis of Object.keys(expectedPracticeRights) as RightsAxis[]) {
      if (!rightsForMode[axis].startsWith("APPROVED")) continue;
      item.rights[axis] = {
        ...item.rights[axis],
        state: "APPROVED",
        evidenceRefs: [...item.rights[axis].evidenceRefs,
          `release-decision/sha256:${FIRST_COLLECTION_DECISION_SHA256}#${item.id}/${axis}`]
      };
    }
  }
  return { editorial: editorialGallerySchema.parse(overlay), decision };
}

export function assertReleasePayloadSeparation(source: EditorialGallery, catalog: PublicGallery, runtime: GalleryRuntime) {
  assertPublicGalleryPayloadSeparation(source, catalog);
  assertDiscoveryPayloadAbsentFromRuntime(source, runtime);
}
