import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildLoginHref } from "@/lib/navigation";
import { getPersonalGalleryItem } from "@/services/gallery/personal-gallery.service";
import { PersonalGalleryForm } from "@/components/gallery/personal-gallery-form";
import { personalGalleryEnabled } from "@/lib/gallery/personal-rollout";
export const dynamic = "force-dynamic";
export default async function EditPersonalGalleryPage({ params }: { params: { id: string } }) {
  if (!personalGalleryEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(buildLoginHref(`/gallery/mine/${params.id}/edit`, "login_required", "/gallery"));
  const item = await getPersonalGalleryItem(createSupabaseServerClient(), user.id, params.id);
  if (!item) notFound();
  return <PersonalGalleryForm initial={item} />;
}
