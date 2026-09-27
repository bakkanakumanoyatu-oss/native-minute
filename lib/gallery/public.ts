import manifest from "./public-gallery.json";
import { publicGallerySchema, type PublicGalleryItem } from "./schema";

export const gallery = publicGallerySchema.parse(manifest);

export function getGalleryItem(id: string): PublicGalleryItem | undefined {
  return gallery.items.find(item => item.id === id);
}

export function filterGalleryItems(input: { query?: string; sourceType?: string; theme?: string }, catalog = gallery) {
  const query = input.query?.trim().toLocaleLowerCase() ?? "";
  return catalog.items.filter(item => {
    if (input.sourceType && item.sourceType !== input.sourceType) return false;
    if (input.theme && !item.themes.includes(input.theme)) return false;
    if (!query) return true;
    return [item.title, item.workTitle, item.speaker, item.moment, item.contextJa, item.sourceType, ...item.themes]
      .some(value => value.toLocaleLowerCase().includes(query));
  });
}
