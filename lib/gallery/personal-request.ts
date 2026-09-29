import { AppError } from "@/lib/errors";
import type { NextRequest } from "next/server";
import type { z } from "zod";

export async function parsePersonalGalleryBody<S extends z.ZodTypeAny>(request: NextRequest, schema: S): Promise<z.infer<S>> {
  const text = await request.text();
  if (text.length > 90000) throw new AppError(400, "入力が大きすぎます。");
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new AppError(400, "入力を確認してください。"); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? "入力を確認してください。");
  return parsed.data;
}

export function assertPersonalGalleryOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) throw new AppError(403, "この操作は利用できません。");
}
