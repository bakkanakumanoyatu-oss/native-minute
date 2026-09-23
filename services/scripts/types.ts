import type { Database } from "@/types/database";

export type ScriptRow = Database["public"]["Tables"]["scripts"]["Row"];

export interface ScriptListItem {
  currentRevisionId: string;
  archivedAt: string | null;
  lockVersion: number;
  practiceEpoch: number;
  id: string;
  title: string;
  content: string;
  targetSeconds: number;
  locale: string;
  createdAt: string;
  updatedAt: string;
}
