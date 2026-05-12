import { AppError } from "@/lib/errors";
import type { Database } from "@/types/database";
import type { CreateScriptInput, UpdateScriptInput } from "@/schemas/script";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import type { ScriptListItem, ScriptRow } from "./types";

type ScriptInsert = Database["public"]["Tables"]["scripts"]["Insert"];
type ScriptUpdate = Database["public"]["Tables"]["scripts"]["Update"];
type PostgrestErrorLike = { message: string };

type ScriptSingleResult = Promise<{ data: ScriptRow; error: PostgrestErrorLike | null }>;

type ScriptInsertBuilder = {
  select(columns?: string): {
    single(): ScriptSingleResult;
  };
};

type ScriptUpdateBuilder = {
  eq(column: "user_id" | "id", value: string): ScriptUpdateBuilder;
  select(columns?: string): {
    single(): ScriptSingleResult;
  };
};

function toScriptListItem(row: ScriptRow): ScriptListItem {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    targetSeconds: row.target_seconds,
    locale: row.locale,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapScriptError(operation: "一覧取得" | "取得" | "作成" | "更新" | "削除", error: { message: string }) {
  return new AppError(500, `台本の${operation}に失敗しました。${error.message}`);
}

export async function listScripts(client: AppSupabaseClient, userId: string) {
  const { data, error } = await client
    .from("scripts")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw mapScriptError("一覧取得", error);
  }

  return (data ?? []).map(toScriptListItem);
}

export async function getScript(client: AppSupabaseClient, userId: string, scriptId: string) {
  const { data, error } = await client
    .from("scripts")
    .select("*")
    .eq("user_id", userId)
    .eq("id", scriptId)
    .maybeSingle();

  if (error) {
    throw mapScriptError("取得", error);
  }

  return data ? toScriptListItem(data) : null;
}

export async function createScript(client: AppSupabaseClient, userId: string, input: CreateScriptInput) {
  const scriptsTable: Database["public"]["Tables"]["scripts"]["Insert"] = {
    user_id: userId,
    title: input.title,
    content: input.content,
    target_seconds: input.targetSeconds,
    locale: input.locale
  };

  const scripts = client.from("scripts") as unknown as {
    insert(values: ScriptInsert): ScriptInsertBuilder;
  };

  const { data, error } = await scripts
    .insert(scriptsTable)
    .select("*")
    .single();

  if (error) {
    throw mapScriptError("作成", error);
  }

  return toScriptListItem(data);
}

export async function updateScript(client: AppSupabaseClient, userId: string, input: UpdateScriptInput) {
  const { id, ...rest } = input;
  const patch: Database["public"]["Tables"]["scripts"]["Update"] = {};

  if (rest.title !== undefined) {
    patch.title = rest.title;
  }

  if (rest.content !== undefined) {
    patch.content = rest.content;
  }

  if (rest.targetSeconds !== undefined) {
    patch.target_seconds = rest.targetSeconds;
  }

  if (rest.locale !== undefined) {
    patch.locale = rest.locale;
  }

  const scripts = client.from("scripts") as unknown as {
    update(values: ScriptUpdate): ScriptUpdateBuilder;
  };

  const { data, error } = await scripts
    .update(patch)
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw mapScriptError("更新", error);
  }

  return toScriptListItem(data);
}

export async function deleteScript(client: AppSupabaseClient, userId: string, scriptId: string) {
  const { error } = await client.from("scripts").delete().eq("user_id", userId).eq("id", scriptId);

  if (error) {
    throw mapScriptError("削除", error);
  }

  return { id: scriptId };
}
