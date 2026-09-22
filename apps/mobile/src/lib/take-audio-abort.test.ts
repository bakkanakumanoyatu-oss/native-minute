import { expect, it, vi } from "vitest";
import { downloadMobileTakeAudio } from "./api";

it("cancels body reception, releases the abort listener/timeout, and does not retry", async () => {
  const controller = new AbortController(), remove = vi.spyOn(controller.signal, "removeEventListener");
  let signal!: AbortSignal;
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    signal = init!.signal!;
    return new Response(new ReadableStream({ start(stream) {
      stream.enqueue(new Uint8Array([1, 2, 3]));
      signal.addEventListener("abort", () => stream.error(new DOMException("aborted", "AbortError")), { once: true });
    } }), { headers: { "content-type": "audio/wav" } });
  });
  const pending = downloadMobileTakeAudio("https://fixture.invalid", "token", "take", { fetchImpl, signal: controller.signal });
  await Promise.resolve(); controller.abort();
  expect((await pending).kind).not.toBe("success"); expect(signal.aborted).toBe(true);
  expect(fetchImpl).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});
it("a signal already aborted before scheduling does not send a GET", async () => {
  const controller = new AbortController(); controller.abort();
  const fetchImpl = vi.fn();
  expect((await downloadMobileTakeAudio("https://fixture.invalid", "token", "take", { fetchImpl, signal: controller.signal })).kind).not.toBe("success");
  expect(fetchImpl).not.toHaveBeenCalled();
});
