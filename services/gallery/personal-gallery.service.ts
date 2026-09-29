import "server-only";

import { AppError } from "@/lib/errors";
import { getGalleryItem } from "@/lib/gallery/public";
import type { PersonalGalleryItem, PersonalGalleryList, PersonalGallerySummary } from "@/lib/gallery/personal-types";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type { CreatePersonalGalleryInput, PersonalGalleryListInput, UpdatePersonalGalleryInput } from "@/schemas/personal-gallery";
import { toScriptListItem } from "@/services/scripts/scripts.service";

type Row = Database["public"]["Tables"]["personal_gallery_items"]["Row"];
type RpcName = "create_personal_gallery_item" | "save_personal_gallery_example" | "update_personal_gallery_item" |
  "delete_personal_gallery_item" | "create_script_from_personal_gallery" | "search_personal_gallery_items";

async function rpc<N extends RpcName>(client: AppSupabaseClient, name: N, args: Database["public"]["Functions"][N]["Args"]) {
  const runner = client as unknown as { rpc(name: N, args: Database["public"]["Functions"][N]["Args"]): Promise<{ data: unknown; error: { message: string } | null }> };
  const result = await runner.rpc(name, args);
  if (result.error) throw mapGalleryError(result.error);
  return result.data;
}

function mapGalleryError(error: { message: string }) {
  const code = ["gallery_item_not_found", "gallery_edit_conflict", "gallery_excerpt_required", "gallery_range_invalid", "script_limit_reached", "account_deletion_active", "request_invalid", "gallery_request_invalid"].find(value => error.message.includes(value));
  const messages: Record<string, string> = {
    gallery_item_not_found: "保存した場面が見つかりません。",
    gallery_edit_conflict: "場面が変更されました。入力を残したまま読み直してください。",
    gallery_excerpt_required: "先に英文を追加してください。",
    gallery_range_invalid: "選んだ範囲を保存済み英文の中で確認できません。",
    script_limit_reached: "台本は最大10本です。不要な台本を一覧から外してください。",
    account_deletion_active: "アカウントの削除処理中です。",
    request_invalid: "台本の長さまたは入力を確認してください。",
    gallery_request_invalid: "場面の入力を確認してください。"
  };
  return new AppError(code === "gallery_item_not_found" ? 404 : code === "account_deletion_active" ? 403 : code === "gallery_edit_conflict" || code === "script_limit_reached" ? 409 : code ? 400 : 500,
    messages[code ?? ""] ?? "コレクションを処理できませんでした。");
}

function summary(row: Row): PersonalGallerySummary {
  return { id: row.id, sceneTitle: row.scene_title, workTitle: row.work_title, speaker: row.speaker,
    sourceType: row.source_type, themes: row.themes, shortNote: (row.personal_note ?? row.context)?.slice(0, 160) ?? null,
    sourceExampleId: row.source_example_id, createdAt: row.created_at, lockVersion: row.lock_version };
}

async function detail(client: AppSupabaseClient, userId: string, row: Row): Promise<PersonalGalleryItem> {
  const { data: script, error } = await client.from("scripts").select("id,archived_at").eq("user_id", userId).eq("source_gallery_item_id", row.id).maybeSingle();
  if (error) throw mapGalleryError(error);
  return { ...summary(row), context: row.context, personalNote: row.personal_note, excerptText: row.excerpt_text,
    sourceUrl: row.source_url, sourceLocator: row.source_locator, speakingNotes: row.speaking_notes,
    locale: row.locale, updatedAt: row.updated_at,
    linkedScriptId: (script as { id: string } | null)?.id ?? null,
    linkedScriptArchivedAt: (script as { archived_at: string | null } | null)?.archived_at ?? null };
}

function toPatch(input: Partial<CreatePersonalGalleryInput>) {
  return Object.fromEntries(Object.entries({
    scene_title: input.sceneTitle, source_type: input.sourceType, work_title: input.workTitle,
    speaker: input.speaker, context: input.context, personal_note: input.personalNote,
    excerpt_text: input.excerptText, source_url: input.sourceUrl, source_locator: input.sourceLocator,
    speaking_notes: input.speakingNotes, themes: input.themes, locale: input.locale
  }).filter(([, value]) => value !== undefined));
}

export async function listPersonalGallery(client: AppSupabaseClient, _userId: string, input: PersonalGalleryListInput): Promise<PersonalGalleryList> {
  const rows = await rpc(client, "search_personal_gallery_items", {
    p_query: input.query, p_source_type: input.sourceType, p_theme: input.theme,
    p_sort: input.sort, p_limit: input.limit + 1, p_offset: input.offset
  }) as Row[] | null;
  const page = rows ?? [];
  return { items: page.slice(0, input.limit).map(summary), nextOffset: page.length > input.limit ? input.offset + input.limit : null };
}

export async function getPersonalGalleryItem(client: AppSupabaseClient, userId: string, id: string) {
  const { data, error } = await client.from("personal_gallery_items").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw mapGalleryError(error);
  return data ? detail(client, userId, data) : null;
}

export async function quickAddPersonalGallery(client: AppSupabaseClient, userId: string, input: CreatePersonalGalleryInput) {
  const row = await rpc(client, "create_personal_gallery_item", { p_patch: toPatch(input) }) as Row;
  return detail(client, userId, row);
}

export async function savePersonalGalleryExample(client: AppSupabaseClient, userId: string, exampleId: string) {
  const example = getGalleryItem(exampleId);
  if (!example) throw new AppError(404, "この見本は公開されていません。");
  const patch = {
    source_example_id: example.id, scene_title: example.title, work_title: example.workTitle,
    source_type: example.sourceType, speaker: example.speaker,
    context: [example.moment, example.contextJa, example.whyItMattersJa].filter(Boolean).join("\n\n"),
    source_url: example.primarySourceUrl, source_locator: example.canonicalSourceLocator,
    speaking_notes: example.speakingNotes, themes: example.themes,
    locale: example.publicationMode === "PRACTICE" ? example.locale : "en-US"
  };
  const row = await rpc(createSupabaseAdminClient() as unknown as AppSupabaseClient, "save_personal_gallery_example", { p_user_id: userId, p_patch: patch }) as Row;
  return detail(client, userId, row);
}

export async function updatePersonalGallery(client: AppSupabaseClient, userId: string, id: string, input: UpdatePersonalGalleryInput) {
  const { expectedLockVersion, ...fields } = input;
  const row = await rpc(client, "update_personal_gallery_item", { p_item_id: id, p_expected_lock_version: expectedLockVersion, p_patch: toPatch(fields) }) as Row;
  return detail(client, userId, row);
}

export async function deletePersonalGallery(client: AppSupabaseClient, _userId: string, id: string, expectedLockVersion: number) {
  await rpc(client, "delete_personal_gallery_item", { p_item_id: id, p_expected_lock_version: expectedLockVersion });
  return { deleted: true as const };
}

export async function createScriptFromPersonalGallery(client: AppSupabaseClient, _userId: string, id: string, input: { expectedLockVersion: number; scriptTitle: string; selectedText?: string | null }) {
  const row = await rpc(client, "create_script_from_personal_gallery", { p_item_id: id, p_expected_lock_version: input.expectedLockVersion,
    p_script_title: input.scriptTitle, p_selected_text: input.selectedText ?? null }) as Database["public"]["Tables"]["scripts"]["Row"];
  return toScriptListItem(row);
}
