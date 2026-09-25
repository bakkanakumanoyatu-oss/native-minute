import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceSetupScreen } from "./VoiceSetupScreen";
import type { PracticeApi } from "../practice/api";

vi.mock("../lib/app-lifecycle", () => ({
  addAppStateChangeListener: async () => ({ remove: async () => undefined })
}));

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
beforeEach(() => {
  now = 1_000;
  recordingNumber = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn(async () => createStream()) } });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Mobile clone sample", () => {
  function api(status: "consent_required" | "sample_required" | "ready", createVoiceFromSample = vi.fn(async () => ({ kind: "success" as const, status: "ready" as const, created: true }))) {
    return {
      getVoiceSetup: vi.fn(async () => ({ kind: "success" as const, status, created: false })),
      acceptVoiceConsent: vi.fn(async () => ({ kind: "success" as const, status: "sample_required" as const, created: false })),
      createVoiceFromSample
    } as unknown as PracticeApi;
  }

  async function mount(practiceApi: PracticeApi) {
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<VoiceSetupScreen api={practiceApi} isOnline onNavigate={() => undefined} />); });
    return view;
  }

  it("keeps consent and sample purposes separate and leaves a saved voice alone", async () => {
    const consentApi = api("consent_required");
    const consentView = await mount(consentApi);
    expect(textOf(consentView.root)).toContain("声を使う同意");
    expect(consentView.root.findAllByProps({ "data-testid": "voice-sample-recording-guide" })).toHaveLength(0);
    expect(consentApi.createVoiceFromSample).not.toHaveBeenCalled();
    act(() => consentView.root.findByType("input").props.onChange({ target: { checked: true } }));
    await act(async () => { button(consentView, "同意して次へ").props.onClick(); });
    expect(consentApi.acceptVoiceConsent).toHaveBeenCalledTimes(1);
    expect(consentView.root.findAllByProps({ "data-testid": "voice-sample-recording-guide" })).toHaveLength(1);
    expect(consentApi.createVoiceFromSample).not.toHaveBeenCalled();
    act(() => consentView.unmount());

    const readyApi = api("ready");
    const readyView = await mount(readyApi);
    expect(textOf(readyView.root)).toContain("お手本ボイスの準備ができました");
    expect(readyView.root.findAllByType("audio")).toHaveLength(0);
    expect(readyApi.createVoiceFromSample).not.toHaveBeenCalled();
    act(() => readyView.unmount());
  });

  it("shows recording advice, previews, retakes, and sends only the adopted take once", async () => {
    let resolveCreate!: (value: { kind: "success"; status: "ready"; created: true }) => void;
    const createVoiceFromSample = vi.fn(() => new Promise<{ kind: "success"; status: "ready"; created: true }>((resolve) => { resolveCreate = resolve; }));
    const practiceApi = api("sample_required", createVoiceFromSample);
    const view = await mount(practiceApi);
    const guide = view.root.findByProps({ "data-testid": "voice-sample-recording-guide" });
    expect(textOf(guide)).toContain("静かで反響の少ない場所");
    expect(textOf(guide)).toContain("お手本ボイスの品質に影響");
    expect(textOf(guide)).toContain("発音・アクセント・感情");

    await record(view, "声を録音する", "録音を止める");
    const firstUrl = view.root.findByType("audio").props.src;
    expect(firstUrl).toMatch(/^blob:/);
    expect(textOf(view.root)).toContain("この元声が自分の声であることを確認しました");
    expect(button(view, "この録音を使って").props.disabled).toBe(true);
    act(() => button(view, "録り直す").props.onClick());
    expect(view.root.findAllByType("audio")).toHaveLength(0);
    expect(createVoiceFromSample).not.toHaveBeenCalled();

    await record(view, "声を録音する", "録音を止める");
    expect(view.root.findByType("audio").props.src).not.toBe(firstUrl);
    act(() => view.root.findByType("input").props.onChange({ target: { checked: true } }));
    const use = button(view, "この録音を使って");
    expect(use.props.disabled).toBe(false);
    act(() => { use.props.onClick(); use.props.onClick(); });
    expect(createVoiceFromSample).toHaveBeenCalledTimes(1);
    expect(button(view, "録り直す").props.disabled).toBe(true);

    await act(async () => { resolveCreate({ kind: "success", status: "ready", created: true }); });
    expect(view.root.findAllByType("audio")).toHaveLength(0);
    expect(textOf(view.root)).toContain("お手本ボイスの準備ができました");
    act(() => view.unmount());
  });
});
