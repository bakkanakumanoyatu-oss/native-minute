import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

function isSet(value) {
  return Boolean(value && value.trim());
}

function printSection(title) {
  console.log(`\n[${title}]`);
}

function printCheck(label, ok, success, failure) {
  console.log(`- ${label}: ${ok ? success : failure}`);
}

const pronunciationProvider = (process.env.PRONUNCIATION_PROVIDER || "mock").trim().toLowerCase();
const transcriptionProvider = (process.env.TRANSCRIPTION_PROVIDER || "mock").trim().toLowerCase();
const hasSupabaseUrl = isSet(process.env.NEXT_PUBLIC_SUPABASE_URL);
const hasSupabaseAnonKey = isSet(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const hasAppUrl = isSet(process.env.NEXT_PUBLIC_APP_URL);
const hasAzureSpeechKey = isSet(process.env.AZURE_SPEECH_KEY);
const hasAzureSpeechRegion = isSet(process.env.AZURE_SPEECH_REGION);
const hasOpenAiKey = isSet(process.env.OPENAI_API_KEY);
const transcriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "whisper-1";

console.log("Native Minute pronunciation provider preflight");
console.log(`- pronunciation provider: ${pronunciationProvider}`);
console.log(`- transcription provider: ${transcriptionProvider}`);

printSection("Shared app env");
printCheck("NEXT_PUBLIC_SUPABASE_URL", hasSupabaseUrl, "set", "missing");
printCheck("NEXT_PUBLIC_SUPABASE_ANON_KEY", hasSupabaseAnonKey, "set", "missing");
printCheck("NEXT_PUBLIC_APP_URL", hasAppUrl, "set", "missing");

printSection("Transcription");
if (transcriptionProvider === "openai") {
  printCheck("OPENAI_API_KEY", hasOpenAiKey, "set", "missing");
  printCheck("OPENAI_TRANSCRIPTION_MODEL", true, transcriptionModel, "n/a");
  console.log("- Record flow can proceed without transcript fallback once OpenAI transcription is live.");
} else if (transcriptionProvider === "mock") {
  printCheck("provider mode", true, "mock transcript fallback", "n/a");
  console.log("- Record flow still needs transcriptText fallback during manual smoke.");
} else {
  printCheck("provider", false, "n/a", `unsupported TRANSCRIPTION_PROVIDER=${transcriptionProvider}`);
}

if (pronunciationProvider === "azure") {
  printSection("Azure");
  printCheck("AZURE_SPEECH_KEY", hasAzureSpeechKey, "set", "missing");
  printCheck("AZURE_SPEECH_REGION", hasAzureSpeechRegion, "set", "missing");
  printCheck("audio format", true, "PCM wav required (browser-side normalization available when decode succeeds)", "n/a");
  printCheck("recognition mode", true, "continuous recognition for ~1 minute takes", "n/a");
  printCheck("locale", true, "script locale (default en-US)", "n/a");
  printCheck("prosody", true, "enabled for en-US takes", "n/a");

  printSection("Next step");
  if (hasAzureSpeechKey && hasAzureSpeechRegion && hasSupabaseUrl && hasSupabaseAnonKey && hasAppUrl) {
    console.log("- Repo-side preflight is satisfied.");
    if (transcriptionProvider === "mock") {
      console.log("- Manual smoke still needs transcriptText fallback because TRANSCRIPTION_PROVIDER=mock.");
    }
    if (transcriptionProvider === "openai" && !hasOpenAiKey) {
      console.log("- Repo-side preflight is still blocked by missing OPENAI_API_KEY above.");
    } else {
      console.log("- Next human check: open /scripts/[id]/record and try browser recording or wav upload -> evaluate -> review.");
      console.log("- If browser-side normalization fails, retry with a wav / PCM file.");
      console.log("- Stop conditions beyond this point: Azure key/resource validity, browser/manual smoke, and live provider response.");
    }
  } else {
    console.log("- Repo-side preflight is blocked by missing env above.");
  }
}

if (pronunciationProvider === "mock") {
  printSection("Mock");
  printCheck("provider mode", true, "mock evaluator main loop available", "n/a");
  console.log("- Real Azure manual smoke is not selected because PRONUNCIATION_PROVIDER=mock.");
}

if (!["mock", "azure"].includes(pronunciationProvider)) {
  printSection("Provider");
  console.log(`- Unsupported PRONUNCIATION_PROVIDER=${pronunciationProvider}`);
}

printSection("Not checked here");
console.log("- Azure resource validity / entitlement / quota");
console.log("- live pronunciation response quality");
console.log("- browser-side decode / normalization support");
console.log("- wav/PCM file quality");
console.log("- browser-side record/review/progress behavior");
