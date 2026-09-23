import { AppError } from "@/lib/errors";
import type { Database } from "@/types/database";
import type { CreateScriptInput, UpdateScriptInput } from "@/schemas/script";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { ScriptListItem, ScriptRow } from "./types";
type ScriptRpcName = "create_script" | "edit_script" | "set_script_archived";
async function scriptRpc<N extends ScriptRpcName>(client: AppSupabaseClient, name: N, args: Database["public"]["Functions"][N]["Args"]) {
  const rpc = client as unknown as { rpc(name: N, args: Database["public"]["Functions"][N]["Args"]): Promise<{ data: ScriptRow; error: { message: string } | null }> };
  return rpc.rpc(name, args);
}
export { MAX_PRACTICE_SLOTS } from "@/lib/practice-limits";

export class ScriptStateError extends AppError {
  constructor(public readonly reasonCode: string, status = 409) {
    const messages: Record<string, string> = {
      script_not_found: "台本が見つかりませんでした。",
      script_archived: "この台本は削除済みです。復元してから練習してください。",
      script_limit_reached: "台本は最大10本です。不要な台本を一覧から外してから追加・復元してください。",
      account_deletion_active: "アカウントの削除処理中です。",
    };
    super(status, messages[reasonCode] ?? "台本が変更されました。入力を残したまま最新の状態を確認してください。");
  }
}
export function mapScriptStateError(error: { message: string }) {
  const code = ["script_not_found", "script_archived", "script_limit_reached", "script_edit_conflict", "script_revision_conflict", "practice_state_conflict", "recording_revision_conflict", "review_claim_conflict", "account_deletion_active"].find(value => error.message.includes(value));
  return code ? new ScriptStateError(code, code === "script_not_found" ? 404 : code === "account_deletion_active" ? 403 : 409) : new AppError(500, "台本の処理に失敗しました。");
}
export function toScriptListItem(row: ScriptRow): ScriptListItem {
  return { id: row.id, title: row.title, content: row.content, locale: row.locale,
    targetSeconds: row.target_seconds, createdAt: row.created_at, updatedAt: row.updated_at,
    currentRevisionId: row.current_revision_id, archivedAt: row.archived_at,
    lockVersion: row.lock_version, practiceEpoch: row.practice_epoch };
}
export async function listScripts(client: AppSupabaseClient, userId: string, scope: "active" | "archived" | "all" = "active") {
  let query = client.from("scripts").select("*").eq("user_id", userId);
  if (scope === "active") query = query.is("archived_at", null);
  if (scope === "archived") query = query.not("archived_at", "is", null);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw mapScriptStateError(error);
  return (data ?? []).map(toScriptListItem);
}
export async function getScript(client: AppSupabaseClient, userId: string, scriptId: string) {
  const { data, error } = await client.from("scripts").select("*").eq("user_id", userId).eq("id", scriptId).maybeSingle();
  if (error) throw mapScriptStateError(error);
  return data ? toScriptListItem(data) : null;
}
export function assertPracticeScript(script: ScriptListItem, expected?: { expectedRevisionId: string; expectedPracticeEpoch: number }) {
  if (script.archivedAt) throw new ScriptStateError("script_archived");
  if (!script.currentRevisionId || !script.practiceEpoch) throw new ScriptStateError("script_revision_conflict");
  if (expected && script.currentRevisionId !== expected.expectedRevisionId) throw new ScriptStateError("script_revision_conflict");
  if (expected && script.practiceEpoch !== expected.expectedPracticeEpoch) throw new ScriptStateError("practice_state_conflict");
}
export async function createScript(client: AppSupabaseClient, _userId: string, input: CreateScriptInput) {
  const { data, error } = await scriptRpc(client, "create_script", { p_title: input.title, p_content: input.content, p_locale: input.locale, p_target_seconds: input.targetSeconds });
  if (error) throw mapScriptStateError(error);
  return toScriptListItem(data);
}
export async function updateScript(client: AppSupabaseClient, _userId: string, input: UpdateScriptInput) {
  const { data, error } = await scriptRpc(client, "edit_script", { p_script_id: input.id, p_expected_revision_id: input.expectedRevisionId,
    p_expected_lock_version: input.expectedLockVersion, p_patch: { title: input.title, content: input.content, locale: input.locale, target_seconds: input.targetSeconds } });
  if (error) throw mapScriptStateError(error);
  return toScriptListItem(data);
}
export async function setScriptArchived(client: AppSupabaseClient, _userId: string, scriptId: string, archived: boolean, expectedLockVersion: number) {
  const { data, error } = await scriptRpc(client, "set_script_archived", { p_script_id: scriptId, p_archived: archived, p_expected_lock_version: expectedLockVersion });
  if (error) throw mapScriptStateError(error);
  return toScriptListItem(data);
}
// Compatibility DELETE is a one-way archive, never a physical delete.
export async function deleteScript(client: AppSupabaseClient, userId: string, scriptId: string, expectedLockVersion?: number) {
  const script = await getScript(client, userId, scriptId);
  if (!script) throw new ScriptStateError("script_not_found", 404);
  return setScriptArchived(client, userId, scriptId, true, expectedLockVersion ?? script.lockVersion);
}
