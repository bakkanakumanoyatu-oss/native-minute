export type PersonalGallerySummary = {
  id: string;
  sceneTitle: string;
  workTitle: string | null;
  speaker: string | null;
  sourceType: string | null;
  themes: string[];
  shortNote: string | null;
  sourceExampleId: string | null;
  createdAt: string;
  lockVersion: number;
};

export type PersonalGalleryItem = PersonalGallerySummary & {
  context: string | null;
  personalNote: string | null;
  excerptText: string | null;
  sourceUrl: string | null;
  sourceLocator: string | null;
  speakingNotes: string[];
  locale: string;
  updatedAt: string;
  linkedScriptId: string | null;
  linkedScriptArchivedAt: string | null;
};

export type PersonalGalleryList = { items: PersonalGallerySummary[]; nextOffset: number | null };
