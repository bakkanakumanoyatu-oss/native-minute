import "server-only";
import { createAccountDeletionStorageAdapter, type AccountDeletionStorageAdapter } from "@/services/account-deletion/account-deletion-storage-adapter";
import { createVoiceSourceCleanupClient } from "./voice-source-cleanup-client";

/** Keep Account's exact raw-info absence contract, with bounded R1 DELETE I/O. */
export function createVoiceSourceCleanupStorageAdapter(): AccountDeletionStorageAdapter {
  const verification = createAccountDeletionStorageAdapter();
  const deletion = createAccountDeletionStorageAdapter(createVoiceSourceCleanupClient());
  return {
    listOwnedInventory: verification.listOwnedInventory,
    verifyObjectAbsence: verification.verifyObjectAbsence,
    deleteObject: input => input.targetKind === "voice_sample" || input.targetKind === "voice_consent_recording"
      ? deletion.deleteObject(input) : Promise.resolve({ kind: "invalid_target" })
  };
}
