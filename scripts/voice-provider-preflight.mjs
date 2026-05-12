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

const provider = (process.env.VOICE_PROVIDER || "mock").trim().toLowerCase();
const hasSupabaseUrl = isSet(process.env.NEXT_PUBLIC_SUPABASE_URL);
const hasSupabaseAnonKey = isSet(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const hasAppUrl = isSet(process.env.NEXT_PUBLIC_APP_URL);
const hasServiceRole = isSet(process.env.SUPABASE_SERVICE_ROLE_KEY);
const hasOpenAiKey = isSet(process.env.OPENAI_API_KEY);
const hasElevenLabsKey = isSet(process.env.ELEVENLABS_API_KEY);
const elevenLabsModel = process.env.ELEVENLABS_TTS_MODEL_ID?.trim() || "eleven_multilingual_v2 (default)";

console.log("Native Minute voice provider preflight");
console.log(`- provider: ${provider}`);

printSection("Shared env");
printCheck("NEXT_PUBLIC_SUPABASE_URL", hasSupabaseUrl, "set", "missing");
printCheck("NEXT_PUBLIC_SUPABASE_ANON_KEY", hasSupabaseAnonKey, "set", "missing");
printCheck("NEXT_PUBLIC_APP_URL", hasAppUrl, "set", "missing");
printCheck("SUPABASE_SERVICE_ROLE_KEY", hasServiceRole, "set", "missing");

if (provider === "openai") {
  printSection("OpenAI");
  printCheck("OPENAI_API_KEY", hasOpenAiKey, "set", "missing");
  printCheck("consent mode", true, "provider-side consent endpoint required", "n/a");
  printCheck("consent recording", true, "required", "n/a");
  printCheck("sample audio", true, "required", "n/a");
  printCheck("synthesize source", true, "inline-bytes path", "n/a");
  printCheck("entitlement sensitivity", true, "custom voice entitlement required", "n/a");
  printCheck("provider scope", true, "setup/listen read only rows for current VOICE_PROVIDER", "n/a");

  printSection("Next step");
  if (hasOpenAiKey && hasServiceRole && hasSupabaseUrl && hasSupabaseAnonKey && hasAppUrl) {
    console.log("- Repo-side preflight is satisfied.");
    console.log("- Next human check: open /setup/voice and try consent -> sample upload -> create voice -> listen once.");
    console.log("- If consent registration or create voice fails with endpoint access wording, treat it as entitlement-dependent and fall back to VOICE_PROVIDER=mock for main-loop work.");
    console.log("- Stop conditions beyond this point: organization entitlement and real browser/provider response.");
  } else {
    console.log("- Repo-side preflight is blocked by missing env above.");
  }
}

if (provider === "elevenlabs") {
  printSection("ElevenLabs");
  printCheck("ELEVENLABS_API_KEY", hasElevenLabsKey, "set", "missing");
  printCheck("ELEVENLABS_TTS_MODEL_ID", true, `${elevenLabsModel}`, "n/a");
  printCheck("consent mode", true, "app-owned consent only", "n/a");
  printCheck("sample audio", true, "required", "n/a");
  printCheck("output format", true, "mp3_44100_128 -> app-owned replay", "n/a");
  printCheck("synthesize source", true, "inline-bytes path", "n/a");
  printCheck("verification pending", true, "fail-fast (not persisted)", "n/a");
  printCheck("provider scope", true, "setup/listen read only rows for current VOICE_PROVIDER", "n/a");

  printSection("Next step");
  if (hasElevenLabsKey && hasServiceRole && hasSupabaseUrl && hasSupabaseAnonKey && hasAppUrl) {
    console.log("- Repo-side preflight is satisfied.");
    console.log("- Next human check: open /setup/voice and try sample upload -> create voice clone -> listen through protected replay.");
    console.log("- Stop conditions beyond this point: real provider response and browser-based manual smoke.");
  } else {
    console.log("- Repo-side preflight is blocked by missing env above.");
  }
}

if (provider === "mock") {
  printSection("Mock");
  printCheck("provider mode", true, "mock main loop available", "n/a");
  console.log("- Real provider manual smoke is not selected because VOICE_PROVIDER=mock.");
}

if (!["mock", "openai", "elevenlabs"].includes(provider)) {
  printSection("Provider");
  console.log(`- Unsupported VOICE_PROVIDER=${provider}`);
}

printSection("Not checked here");
console.log("- bucket existence / storage policy");
console.log("- provider entitlement");
console.log("- live provider request/response");
console.log("- browser-side setup/voice and listen behavior");
