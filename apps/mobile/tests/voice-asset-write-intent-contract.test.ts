import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { createVoiceAssetWriteIntentRepository } from "@/services/voice/voice-asset-write-intent.repository";

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0019_g5c_b4_db_cleanup_and_consent_withdrawal.sql", import.meta.url)
);

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("G5C-B4 durable voice asset writer intent contract", () => {
  it("adds only the focused two-kind durable state with no direct browser or mobile authority", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("create table if not exists public.voice_asset_write_intents");
    for (const column of [
      "id uuid primary key",
      "user_id uuid not null",
      "kind text not null",
      "status text not null",
      "lease_token uuid",
      "lease_expires_at timestamptz",
      "created_at timestamptz not null",
      "updated_at timestamptz not null"
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("kind in ('voice_create', 'script_audio_create')");
    expect(sql).toContain("status in ('reserved', 'completed', 'cancelled', 'manual_required')");
    expect(sql).toContain("alter table public.voice_asset_write_intents enable row level security");
    expect(sql).toContain("revoke all privileges on table public.voice_asset_write_intents from public, anon, authenticated, service_role");
    expect(sql).not.toContain("create table if not exists public.jobs");
    expect(sql).not.toContain("provider_voice_id = 'pending'");
  });

  it("serializes reservation, target seal, and consent seal through one user lock helper", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("create or replace function public.g5c_b4_lock_voice_asset_user(p_user_id uuid)");
    expect(sql).toContain("pg_advisory_xact_lock(pg_catalog.hashtextextended('g5c-b4-voice-assets:' || p_user_id::text, 0))");
    expect(sql.match(/perform public\.g5c_b4_lock_voice_asset_user\(p_user_id\)/g)).toHaveLength(6);
    expect(sql).toContain("create or replace function public.seal_voice_deletion_snapshot(");
    expect(sql).toContain("create or replace function public.seal_voice_deletion_consent_snapshot(");
  });

  it("reserves before external work and rejects every active deletion or unresolved duplicate", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("create or replace function public.reserve_voice_asset_write_intent(");
    expect(sql).toContain("status in ('pending', 'processing', 'partial_failure', 'manual_required')");
    expect(sql).toContain("message = 'voice_deletion_active'");
    expect(sql).toContain("message = 'voice_asset_writer_in_progress'");
    expect(sql).toContain("insert into public.voice_asset_write_intents");
    expect(sql.indexOf("message = 'voice_deletion_active'")).toBeLessThan(sql.indexOf("insert into public.voice_asset_write_intents"));
  });

  it("re-resolves the writer-expandable universe inside the locked target seal", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("message = 'voice_asset_snapshot_stale'");
    expect(sql).toContain("target.value ->> 'target_kind' = 'voice_binding'");
    expect(sql).toContain("target.value ->> 'target_kind' = 'script_audio'");
    expect(sql).toContain("target.value ->> 'target_kind' = 'script_audio_storage'");
    expect(sql).toContain("target.value ->> 'target_kind' = 'saved_model_audio'");
    expect(sql.indexOf("message = 'voice_asset_snapshot_stale'")).toBeLessThan(
      sql.indexOf("insert into public.voice_deletion_targets")
    );
  });

  it("treats expiry only as stale evidence and never auto-cancels an unresolved writer", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("set status = 'manual_required', lease_token = null, lease_expires_at = null");
    expect(sql).toContain("status = 'reserved' and lease_expires_at <= now()");
    expect(sql).toContain("last_failure_category = 'writer_intent_manual_required'");
    expect(sql).not.toContain("status = 'cancelled' where user_id = p_user_id and status = 'reserved' and lease_expires_at <= now()");
    expect(sql).toContain("writer cancellation requires known no side effect");
    expect(sql).toContain("where user_id = p_user_id and status = 'manual_required'");
    expect(sql).toContain("where user_id = p_user_id and status = 'reserved'");
    expect(sql).not.toContain("where user_id = p_user_id and status in ('completed', 'cancelled')");
  });

  it("atomically creates canonical voice/script-audio rows and completes their intent", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("create or replace function public.finalize_voice_create_write_intent(");
    expect(sql).toContain("insert into public.voices (");
    expect(sql).toContain("create or replace function public.finalize_script_audio_write_intent(");
    expect(sql).toContain("insert into public.script_audios (");
    expect(sql).toContain("set status = 'completed', lease_token = null, lease_expires_at = null");
  });

  it("blocks every foreign or unsealed dependent before any cascade-capable delete", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    for (const reason of [
      "voice_binding_cross_user_or_unsealed_dependent",
      "script_audio_cross_user_or_unsealed_dependent"
    ]) {
      expect(sql).toContain(reason);
    }
    const firstDelete = sql.indexOf("delete from public.script_saved_model_audios as saved");
    expect(sql.indexOf("dependent_audio.voice_id = binding_target.source_row_id")).toBeLessThan(firstDelete);
    expect(sql.indexOf("dependent_saved.script_audio_id = audio_target.source_row_id")).toBeLessThan(firstDelete);
  });

  it("fences both OLD and NEW target relations while allowing unrelated rows", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("v_old_script_user_id");
    expect(sql).toContain("old.voice_id");
    expect(sql).toContain("public.g5c_b4_voice_deletion_writer_fence_active(v_old_script_user_id)");
    expect(sql).toContain("public.g5c_b4_voice_deletion_writer_fence_active(v_new_script_user_id)");
    expect(sql).toContain("v_new_voice_user_id is distinct from v_new_script_user_id");
    expect(sql).toContain("v_new_script_owner is distinct from new.user_id");
  });

  it("moves missing pending DB targets to manual while durable verified absence remains idempotent", () => {
    const sql = compact(readFileSync(migrationPath, "utf8"));

    expect(sql).toContain("pending_saved_model_audio_source_missing");
    expect(sql).toContain("pending_script_audio_source_missing");
    expect(sql).toContain("pending_voice_binding_source_missing");
    expect(sql.match(/target\.status <> 'verified_absent'/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(sql).toContain("and status <> 'verified_absent'");
  });

  it("maps reservation rejection safely and never exposes an intent locator", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "voice_deletion_active" } }));
    const repository = createVoiceAssetWriteIntentRepository({ rpc } as never);

    await expect(repository.reserve({
      userId: "user-a",
      kind: "voice_create",
      leaseToken: "lease-a",
      leaseSeconds: 900
    })).rejects.toMatchObject({ status: 409 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
