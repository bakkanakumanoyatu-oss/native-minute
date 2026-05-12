import { AppError } from "@/lib/errors";
import type { Database, Json } from "@/types/database";

export type SavedModelAudioRow = Database["public"]["Tables"]["script_saved_model_audios"]["Row"];
export type SavedBestTakeRow = Database["public"]["Tables"]["script_saved_best_takes"]["Row"];

export type AudioLibraryErrorCode =
  | "library_full"
  | "slot_occupied"
  | "already_saved"
  | "saved_entry_not_found"
  | "script_not_found"
  | "script_audio_not_found"
  | "take_not_found"
  | "ownership_mismatch"
  | "invalid_slot"
  | "label_too_long"
  | "audio_library_write_failed";

export class AudioLibraryError extends AppError {
  code: AudioLibraryErrorCode;

  constructor(status: number, code: AudioLibraryErrorCode, message: string) {
    super(status, message);
    this.name = "AudioLibraryError";
    this.code = code;
  }
}

export type SaveModelAudioInput = {
  scriptId: string;
  scriptAudioId: string;
  label?: string;
  slot?: number;
};

export type ReplaceSavedModelAudioSlotInput = {
  scriptId: string;
  scriptAudioId: string;
  slot: number;
  label?: string;
};

export type UpdateSavedModelAudioLabelInput = {
  scriptId: string;
  savedModelAudioId: string;
  label: string;
};

export type ReplaceSavedModelAudioEntrySlotInput = {
  scriptId: string;
  savedModelAudioId: string;
  scriptAudioId: string;
  slot: number;
  label?: string;
};

export type SaveBestTakeInput = {
  scriptId: string;
  takeId: string;
  label?: string;
  slot?: number;
};

export type ReplaceSavedBestTakeSlotInput = {
  scriptId: string;
  takeId: string;
  slot: number;
  label?: string;
};

export type UpdateSavedBestTakeLabelInput = {
  scriptId: string;
  savedBestTakeId: string;
  label: string;
};

export type ReplaceSavedBestTakeEntrySlotInput = {
  scriptId: string;
  savedBestTakeId: string;
  takeId: string;
  slot: number;
  label?: string;
};

// Audio Library metadata is an allowlisted snapshot for display/audit only.
// Safe future model-audio keys include provider, voice_id, voice_style_preset,
// target_speed, target_wpm, pause_density, cache key hash/prefix, content_type,
// and byte_length. Never store raw script text, audio bytes, signed URLs, raw
// provider request/response payloads, secrets, auth headers, or user email here.
export type AudioLibraryMetadata = { [key: string]: Json | undefined };
