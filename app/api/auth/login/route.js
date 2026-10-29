import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req) {
  const { participantId } = await req.json();
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase
    .from("participants")
    .select("participant_id, is_active")
    .eq("participant_id", participantId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "등록되지 않은 참가자 ID입니다." },
      { status: 401 }
    );
  }

  if (!data.is_active) {
    return NextResponse.json(
      { error: "비활성화된 참가자 ID입니다." },
      { status: 403 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("participant_id", participantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
    path: "/",
  });

  return response;
}
