import type { MobileAuthController } from "../auth/mobile-auth";
import { addAppStateChangeListener } from "../lib/app-lifecycle";
import type { ProgressMemory } from "./progress-memory";
import { bindDisplayMemory } from "./display-memory-lifecycle";

export function bindProgressMemory(memory: ProgressMemory, auth: MobileAuthController, ownerUserId: string, addNativeListener = addAppStateChangeListener) {
  return bindDisplayMemory([memory], auth, ownerUserId, addNativeListener);
}
