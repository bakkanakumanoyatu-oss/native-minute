import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSupabaseClient } from "../../../lib/supabase/client";
import { getScriptLength, getScriptLengthError } from "../../../lib/script-length";
import { createScriptSchema, updateScriptSchema } from "../../../schemas/script";
import { createScript } from "../../../services/scripts/scripts.service";

const routeState = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/config", () => ({ hasSupabaseConfig: () => true }));
vi.mock("@/lib/supabase/route", () => ({ createSupabaseRouteClient: () => routeState.client }));
vi.mock("@/lib/supabase/auth", () => ({ requireCurrentUser: async () => ({ id: "owner" }) }));

import { POST } from "../../../app/api/scripts/route";
import { PATCH } from "../../../app/api/scripts/[id]/route";

const id = "20000000-0000-4000-8000-000000000001";
const originalRevision = "60000000-0000-4000-8000-000000000001";
const nextRevision = "60000000-0000-4000-8000-000000000002";
const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");
const createBody = (content: string) => ({ title: "Title", content, locale: "en-US", targetSeconds: 60 });
const editBody = (content: string) => ({ content, expectedRevisionId: originalRevision, expectedLockVersion: 1 });

function request(method: "POST" | "PATCH", content: object) {
  return new NextRequest(`https://fixture.test/api/scripts${method === "PATCH" ? `/${id}` : ""}`, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(content)
  });
}

function fixture(content = "Original content") {
  let row = {
    id, user_id: "owner", title: "Title", content, locale: "en-US", target_seconds: 60,
    current_revision_id: originalRevision, lock_version: 1, practice_epoch: 1, archived_at: null,
    created_at: "2026-09-01", updated_at: "2026-09-01"
  };
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  const eq = vi.fn(() => ({ eq: () => ({ maybeSingle }) }));
  const from = vi.fn(() => ({ select: () => ({ eq }) }));
  const rpc = vi.fn(async (name: string, args: { p_title?: string; p_content?: string; p_patch?: { title?: string; content?: string } }) => {
    if (name === "create_script") {
      row = { ...row, title: args.p_title ?? row.title, content: args.p_content ?? row.content };
    } else {
      const nextContent = args.p_patch?.content ?? row.content;
      const changed = nextContent !== row.content;
      row = { ...row, title: args.p_patch?.title ?? row.title, content: nextContent,
        current_revision_id: changed ? nextRevision : row.current_revision_id,
        lock_version: row.lock_version + 1, practice_epoch: row.practice_epoch + (changed ? 1 : 0) };
    }
    return { data: row, error: null };
  });
  const client = { from, rpc } as unknown as AppSupabaseClient;
  return { client, rpc, from, get row() { return row; } };
}

beforeEach(() => { routeState.client = null; });

describe("script body counting and write boundaries", () => {
  it.each([199, 200, 201])("counts %i whitespace-separated words", count => {
    const content = words(count);
    expect(getScriptLength(content).wordCount).toBe(count);
    expect(createScriptSchema.safeParse(createBody(content)).success).toBe(count <= 200);
  });

  it.each([1999, 2000, 2001])("counts %i characters with one word", count => {
    const content = "a".repeat(count);
    expect(getScriptLength(content).characterCount).toBe(count);
    expect(createScriptSchema.safeParse(createBody(content)).success).toBe(count <= 2000);
  });

  it("reports word-only, character-only and combined excess without changing the input", () => {
    const wordOnly = words(201);
    const charOnly = "a".repeat(2001);
    const both = Array.from({ length: 201 }, () => "abcdefghij").join(" ");
    expect(getScriptLength(wordOnly)).toMatchObject({ excessWords: 1, excessCharacters: 0 });
    expect(getScriptLength(charOnly)).toMatchObject({ excessWords: 0, excessCharacters: 1 });
    expect(getScriptLength(both)).toMatchObject({ excessWords: 1, excessCharacters: 210 });
    expect(getScriptLengthError(both)).toContain("200語を1語");
    expect(getScriptLengthError(both)).toContain("2,000文字を210文字");
    expect(both).toHaveLength(2210);
  });

  it("retains the existing whitespace and UTF-16 conventions", () => {
    expect(getScriptLength("  can't\twell-known\n café  ")).toMatchObject({ wordCount: 3, characterCount: 22 });
    expect(getScriptLength(" x😀 ")).toMatchObject({ wordCount: 1, characterCount: 3 });
  });

  it.each([words(201), "a".repeat(2001)])("rejects an over-limit Web create before any write", async content => {
    const db = fixture();
    routeState.client = db.client;
    const response = await POST(request("POST", createBody(content)));
    expect(response.status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("accepts both exact boundaries through the Web create route", async () => {
    const bothExact = "x".repeat(10) + Array.from({ length: 199 }, () => ` ${"x".repeat(9)}`).join("");
    expect(getScriptLength(bothExact)).toMatchObject({ wordCount: 200, characterCount: 2000, exceedsLimit: false });
    for (const content of [words(200), "a".repeat(2000), bothExact]) {
      const db = fixture();
      routeState.client = db.client;
      const response = await POST(request("POST", createBody(content)));
      expect(response.status).toBe(201);
      expect(db.rpc).toHaveBeenCalledWith("create_script", expect.objectContaining({ p_content: content }));
    }
  });

  it("defends the service when a caller bypasses the create schema", async () => {
    const db = fixture();
    await expect(createScript(db.client, "owner", createBody(words(201)))).rejects.toThrow("1語");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it.each([words(201), "a".repeat(2001)])("rejects an over-limit body edit with no revision, pointer or epoch update", async content => {
    const db = fixture();
    routeState.client = db.client;
    const before = { ...db.row };
    const response = await PATCH(request("PATCH", editBody(content)), { params: { id } });
    expect(response.status).toBe(400);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.row).toEqual(before);
  });

  it("allows a title-only edit of an existing long body without changing revision or epoch", async () => {
    const longBody = "a".repeat(4501);
    const db = fixture(longBody);
    routeState.client = db.client;
    const response = await PATCH(request("PATCH", { ...editBody(longBody), title: "Renamed" }), { params: { id } });
    expect(response.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledOnce();
    expect(db.row).toMatchObject({ title: "Renamed", content: longBody, current_revision_id: originalRevision, practice_epoch: 1 });
    expect(updateScriptSchema.safeParse({ id, ...editBody(longBody), title: "Renamed" }).success).toBe(true);
  });

  it("sends valid boundary body edits through the existing expected-version RPC contract", async () => {
    for (const content of [words(200), "a".repeat(2000)]) {
      const db = fixture();
      routeState.client = db.client;
      const response = await PATCH(request("PATCH", { ...editBody(content), title: "Renamed" }), { params: { id } });
      expect(response.status).toBe(200);
      expect(db.rpc).toHaveBeenCalledWith("edit_script", expect.objectContaining({
        p_expected_revision_id: originalRevision, p_expected_lock_version: 1,
        p_patch: expect.objectContaining({ content })
      }));
      expect(db.row).toMatchObject({ current_revision_id: nextRevision, lock_version: 2, practice_epoch: 2 });
    }
  });
});
