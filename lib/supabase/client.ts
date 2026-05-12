import { createSupabaseServerClient } from "./server";

export type AppSupabaseClient = ReturnType<typeof createSupabaseServerClient>;
