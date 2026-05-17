import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = requestUrl.searchParams.get("next") ?? "/";

  const supabase = await createClient();

  if (code) {
    await supabase?.auth.exchangeCodeForSession(code);
  } else if (tokenHash && type) {
    await supabase?.auth.verifyOtp({ token_hash: tokenHash, type });
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
