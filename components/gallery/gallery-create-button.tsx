"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GalleryCreateButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/gallery/${encodeURIComponent(itemId)}/create-script`, { method: "POST" });
      const result = await response.json() as { ok: boolean; data?: { id: string }; message?: string };
      if (!response.ok || !result.ok || !result.data?.id) {
        setError(result.message ?? "台本を保存できませんでした。");
        return;
      }
      router.push(`/scripts/${result.data.id}/listen?created=1`);
      router.refresh();
    } catch {
      setError("通信に失敗しました。後で試してください。");
    } finally {
      setSaving(false);
    }
  }

  return <><button className="mt-4 inline-flex rounded-xl bg-[var(--cta-primary-bg)] px-5 py-3 text-sm font-semibold text-[var(--cta-primary-text)]" type="button" disabled={saving} onClick={() => void create()}>{saving ? "保存中…" : "この一節で練習する"}</button>{error ? <p role="alert" className="mt-3 text-sm text-ink-700">{error}</p> : null}</>;
}
