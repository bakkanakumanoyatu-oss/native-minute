import { AppError } from "@/lib/errors";
import type { AppSupabaseClient } from "@/lib/supabase/client";
import { takeMetadataSchema } from "@/schemas/take-metadata";

type MetadataRow = { id: string; favorite: boolean; display_name: string | null };
type UpdateQuery = {
  eq(column: string, value: string): UpdateQuery;
  select(columns: string): UpdateQuery;
  maybeSingle(): Promise<{ data: MetadataRow | null; error: unknown }>;
};

export async function updateTakeMetadata(client: AppSupabaseClient, userId: string, takeId: string, input: unknown) {
  const parsed = takeMetadataSchema.safeParse(input);
  if (!parsed.success) throw new AppError(400, "録音名またはお気に入りの指定を確認してください。");
  // The WHERE owner check and existing RLS both apply to the atomic update.
  // Explicit field mapping prevents evaluation/identity changes and lost updates
  // to an unrelated metadata field. Never upsert a missing/deleted Take.
  const values = {
    ...(parsed.data.favorite !== undefined ? { favorite: parsed.data.favorite } : {}),
    ...(parsed.data.displayName !== undefined ? { display_name: parsed.data.displayName } : {})
  };
  const takes = client.from("takes") as unknown as { update(values: { favorite?: boolean; display_name?: string | null }): UpdateQuery };
  const { data, error } = await takes.update(values)
    .eq("id", takeId).eq("user_id", userId).eq("status", "reviewed")
    .select("id, favorite, display_name").maybeSingle();
  // Do not include DB errors or the private display name in operational logs.
  if (error) throw new AppError(500, "録音の情報を保存できませんでした。");
  if (!data) throw new AppError(404, "保存済み録音が見つかりませんでした。");
  return { takeId: data.id, favorite: data.favorite, displayName: data.display_name };
}
