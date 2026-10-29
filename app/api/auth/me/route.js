import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const participantId = cookieStore.get("participant_id")?.value;

  if (!participantId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

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
    .select("participant_id, condition, scenario_order")
    .eq("participant_id", participantId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "참가자 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    participantId: data.participant_id,
    condition: data.condition || "A",
    scenarioOrder: data.scenario_order || "1-2-3",
  });
}
