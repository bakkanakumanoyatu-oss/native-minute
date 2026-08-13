import { describe, expect, it, vi } from "vitest";
import { AudioObjectUrl } from "./object-url";

describe("AudioObjectUrl", () => {
  it("revokes a replaced URL and clears the final URL exactly once", () => {
    const createObjectURL = vi.fn()
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const revokeObjectURL = vi.fn();
    const resource = new AudioObjectUrl({ createObjectURL, revokeObjectURL });

    expect(resource.replace(new Blob(["first"]))).toBe("blob:first");
    expect(resource.replace(new Blob(["second"]))).toBe("blob:second");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");

    resource.clear();
    resource.clear();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenLastCalledWith("blob:second");
    expect(resource.value).toBeNull();
  });
});
