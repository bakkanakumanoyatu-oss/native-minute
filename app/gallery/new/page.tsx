import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/auth";
import { buildLoginHref } from "@/lib/navigation";
import { PersonalGalleryForm } from "@/components/gallery/personal-gallery-form";
import { personalGalleryEnabled } from "@/lib/gallery/personal-rollout";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function NewPersonalGalleryPage() {
  if (!personalGalleryEnabled()) notFound();
  if (!await getCurrentUser()) redirect(buildLoginHref("/gallery/new", "login_required", "/gallery"));
  return <PersonalGalleryForm />;
}
