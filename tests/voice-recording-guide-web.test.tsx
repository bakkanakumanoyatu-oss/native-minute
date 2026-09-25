import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserVoiceRecorder } from "@/components/voice/browser-voice-recorder";
import { CreateVoiceForm } from "@/components/voice/create-voice-form";
import { VoiceConsentForm } from "@/components/voice/voice-consent-form";
import type { VoiceProviderRequirements } from "@/providers/voice";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

let now = 1_000;
let recordingNumber = 0;

function createStream() {
  const track = {
    enabled: true,
    readyState: "live",
    muted: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    stop: vi.fn()
  };
  return { getAudioTracks: () => [track], getTracks: () => [track] };
}

class FakeMediaRecorder {
  static isTypeSupported() { return true; }
  mimeType = "audio/webm";
  state = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  start() { this.state = "recording"; }

  stop() {
    this.state = "inactive";
    const blob = new Blob([`sample-${++recordingNumber}`], { type: this.mimeType });
    queueMicrotask(() => {
      this.ondataavailable?.({ data: blob });
      this.onstop?.();
    });
  }
}

function textOf(node: ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : textOf(child)).join("");
}

function button(view: ReactTestRenderer, label: string) {
  const found = view.root.findAllByType("button").find((item) => textOf(item).includes(label));
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

async function record(view: ReactTestRenderer, startLabel: string, stopLabel: string) {
  await act(async () => { button(view, startLabel).props.onClick(); });
  now += 11_000;
  await act(async () => { button(view, stopLabel).props.onClick(); });
}
const requirements: VoiceProviderRequirements = {
  provider: "elevenlabs",
  providerLabel: "ElevenLabs",
  voiceLabel: "ElevenLabs voice clone",
  requiresConsentName: false,
  requiresConsentLanguage: false,
  requiresConsentRecording: false,
  requiresSampleAudio: true,
  requiresProviderConsentId: false,
  entitlementSensitive: false,
  builtInVoiceFallbackAvailable: false,
  recommendedDevelopmentFallbackProvider: "mock"
};

beforeEach(() => {
  now = 1_000;
  recordingNumber = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => createStream()) } });
  refresh.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Web clone sample", () => {
  it("labels a required consent recording without showing clone sample advice", () => {
    let view!: ReactTestRenderer;
    act(() => { view = create(<VoiceConsentForm requirements={{ ...requirements, provider: "openai", requiresConsentRecording: true }} />); });
    expect(textOf(view.root.findByProps({ "data-testid": "voice-consent-browser-recorder" }))).toContain("同意のための短い音声");
    expect(view.root.findAllByProps({ "data-testid": "voice-sample-recording-guide" })).toHaveLength(0);
    act(() => view.unmount());
  });

  it("shows the guide at the sample recorder, separate from consent, and previews a chosen file before upload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, data: { sampleAudio: { audioPath: "storage://voice-samples/test/sample.webm" } } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<CreateVoiceForm consentId="consent" requirements={requirements} />); });

    const guide = view.root.findByProps({ "data-testid": "voice-sample-recording-guide" });
    expect(textOf(guide)).toContain("静かで反響の少ない場所");
    expect(textOf(guide)).toContain("お手本ボイスの品質に影響");
    expect(textOf(guide)).toContain("発音・アクセント・感情");
    expect(textOf(view.root.findByProps({ "data-testid": "voice-create-browser-recorder" }))).toContain("同意音声とは別");
    expect(fetchMock).not.toHaveBeenCalled();

    const file = new File(["sample"], "sample.webm", { type: "audio/webm" });
    await act(async () => {
      view.root.findByProps({ "data-testid": "voice-create-sample-file" }).props.onChange({ target: { files: [file] } });
    });
    expect(view.root.findByProps({ "data-testid": "voice-create-file-preview" }).props.src).toMatch(/^blob:/);
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await view.root.findByProps({ "data-testid": "voice-create-form" }).props.onSubmit({ preventDefault() {} });
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/uploads/voice-sample", "/api/create-voice"]);
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => view.unmount());
  });

  it("previews, adopts and retakes only the current local recording", async () => {
    const choices: Array<File | null> = [];
    let selected: File | null = null;
    let view!: ReactTestRenderer;
    const renderRecorder = () => <BrowserVoiceRecorder id="test-sample" title="元声" description="同意音声とは別" filePrefix="sample" minSeconds={10} selectedFile={selected} onUseRecording={(file) => {
      selected = file;
      choices.push(file);
      view.update(renderRecorder());
    }} />;
    act(() => { view = create(renderRecorder()); });

    await record(view, "録音を開始", "停止する");
    const first = view.root.findByType("audio").props.src;
    expect(first).toMatch(/^blob:/);
    expect(selected).toBeNull();
    act(() => button(view, "この録音を使う").props.onClick());
    const firstFile = selected;
    expect(firstFile).toBeInstanceOf(File);

    await act(async () => { button(view, "録音を開始").props.onClick(); });
    expect(selected).toBeNull();
    expect(view.root.findAllByType("audio")).toHaveLength(0);
    now += 11_000;
    await act(async () => { button(view, "停止する").props.onClick(); });
    expect(view.root.findByType("audio").props.src).not.toBe(first);
    expect(selected).toBeNull();
    act(() => button(view, "録り直す").props.onClick());
    expect(view.root.findAllByType("audio")).toHaveLength(0);
    expect(selected).toBeNull();

    await record(view, "録音を開始", "停止する");
    const otherFile = new File(["external"], "external.webm", { type: "audio/webm" });
    act(() => { selected = otherFile; view.update(renderRecorder()); });
    expect(view.root.findAllByType("audio")).toHaveLength(0);
    expect(view.root.findAllByType("button").some((item) => textOf(item).includes("この録音を使う"))).toBe(false);
    await record(view, "録音を開始", "停止する");
    act(() => button(view, "この録音を使う").props.onClick());
    expect(selected).toBeInstanceOf(File);
    expect(selected).not.toBe(firstFile);
    expect(choices.at(-1)).toBe(selected);
    act(() => view.unmount());
  });

  it("does not upload or create a voice twice on a rapid double submit", async () => {
    let resolveUpload!: (value: unknown) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveUpload = resolve; }))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    let view!: ReactTestRenderer;
    act(() => { view = create(<CreateVoiceForm consentId="consent" requirements={requirements} />); });
    act(() => {
      view.root.findByProps({ "data-testid": "voice-create-sample-file" }).props.onChange({ target: { files: [new File(["sample"], "sample.webm", { type: "audio/webm" })] } });
    });
    const form = view.root.findByProps({ "data-testid": "voice-create-form" });
    act(() => {
      form.props.onSubmit({ preventDefault() {} });
      form.props.onSubmit({ preventDefault() {} });
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveUpload({ ok: true, json: async () => ({ ok: true, data: { sampleAudio: { audioPath: "storage://voice-samples/test/sample.webm" } } }) });
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => view.unmount());
  });
});
