import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getScript } from "@/services/scripts/scripts.service";
import { EditScriptForm } from "@/components/scripts/edit-script-form";
export default async function EditScriptPage({ params }: { params: { id: string } | Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const script = await getScript(createSupabaseServerClient(), user.id, (await params).id);
  if (!script) notFound();
  return <EditScriptForm script={script} />;
}
