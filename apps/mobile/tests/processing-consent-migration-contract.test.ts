import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../../../supabase/migrations/0013_g5a_canonical_processing_consents.sql", import.meta.url)
);
const migration = readFileSync(migrationPath, "utf8");

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const sql = compact(migration);

describe("processing_consents migration RLS and audit-timestamp contract", () => {
  it("keeps owner reads and authorized accept/withdraw operations isolated without an owner DELETE policy", () => {
    expect(sql).toContain("alter table public.processing_consents enable row level security;");
    expect(sql).toContain(
      'create policy "processing_consents_select_own" on public.processing_consents for select to authenticated using (auth.uid() = user_id);'
    );
    expect(sql).toContain(
      'create policy "processing_consents_insert_own" on public.processing_consents for insert to authenticated with check (auth.uid() = user_id);'
    );
    expect(sql).toContain(
      'create policy "processing_consents_withdraw_own" on public.processing_consents for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);'
    );
    expect(sql).not.toContain("on public.processing_consents for delete");
    expect(sql).not.toContain("on public.processing_consents for all");
  });

  it("has the trigger author every acceptance timestamp instead of trusting an insert payload", () => {
    expect(sql).toContain("if tg_op = 'UPDATE' then");
    expect(sql).toContain("new.accepted_at := now(); new.created_at := now(); new.updated_at := now();");
    expect(sql).toContain("if new.status <> 'active' or new.withdrawn_at is not null then");
  });

  it("has the trigger author withdrawal and update timestamps while preserving acceptance history", () => {
    expect(sql).toContain("new.withdrawn_at := now(); new.updated_at := now(); return new;");
    expect(sql).toContain("or new.accepted_at <> old.accepted_at");
    expect(sql).toContain("or new.created_at <> old.created_at");
    expect(sql).toContain("or old.status = 'withdrawn'");
    expect(sql).toContain("or old.status <> 'active'");
    expect(sql).toContain("or new.status <> 'withdrawn' then");
  });

  it("keeps the canonical consent fields immutable and accepts only the fixed v1 contracts", () => {
    for (const column of [
      "id",
      "user_id",
      "consent_type",
      "consent_version",
      "purpose_id",
      "purpose_version",
      "provider_set",
      "data_categories"
    ]) {
      expect(sql).toContain(`new.${column} <> old.${column}`);
    }

    expect(sql).toContain("new.consent_version <> '2026-08-22.v1'");
    expect(sql).toContain("new.provider_set <> array['openai', 'azure']");
    expect(sql).toContain("new.provider_set <> array['elevenlabs']");
  });

  it("does not add a second timestamp trigger that could weaken the consent-specific contract", () => {
    expect(sql).toContain("drop trigger if exists set_updated_at_processing_consents on public.processing_consents;");
    expect(sql).not.toContain("create trigger set_updated_at_processing_consents");
  });
});
