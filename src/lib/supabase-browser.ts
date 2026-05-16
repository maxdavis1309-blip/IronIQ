import { createClient } from "@/utils/supabase/client";

export function getSupabaseBrowserClient() {
  return createClient();
}
