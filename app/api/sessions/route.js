import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function splitIntoSentenceUnits(text) {
  return String(text || "")
    .split(/\n|(?<=[.!?])\s+|(?<=다\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildRawUnits(log) {
  const sources = [
    { source: "initial_reasoning", content: log.initialReasoning },
    ...((log.phase1Log || [])
      .filter((m) => m.role === "user")
      .map((m, i) => ({ source: `phase1_${i}`, content: m.content }))),
    ...((log.phase2Log || [])
      .filter((m) => m.role === "user")
      .map((m, i) => ({ source: `phase2_${i}`, content: m.content }))),
    ...((log.phase3Log || [])
      .filter((m) => m.role === "user")
      .map((m, i) => ({ source: `phase3_${i}`, content: m.content }))),
    { source: "final_reflection", content: log.finalReflection },
  ];

  const units = [];
  let idx = 0;
  sources.forEach((entry, sourceIdx) => {
    const parts = splitIntoSentenceUnits(entry.content);
    parts.forEach((text, sentenceIdx) => {
      units.push({
        source: entry.source,
        unit_id: `s${sourceIdx}_u${sentenceIdx}`,
        unit_index: idx,
        text_unit: text,
      });
      idx += 1;
    });
  });
  return units;
}

export async function POST(req) {
  try {
    const cookieStore = await cookies();
    const participantId = cookieStore.get("participant_id")?.value;

    if (!participantId) {
      return NextResponse.json(
        { error: "인증되지 않은 요청입니다." },
        { status: 401 }
      );
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
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch { /* Server Component */ }
          },
        },
      }
    );

    const {
      scenarioLogs = [],
      totalDurationMs,
      isCompleted = true,
      sessionStartedAt = null,
    } = await req.json();
    const savableLogs = scenarioLogs.filter(
      (log) => log?.initialChoice && log?.initialReasoning
    );

    if (savableLogs.length === 0) {
      return NextResponse.json({ success: true, sessionId: null, skipped: true });
    }
    const startedAtIso = sessionStartedAt || new Date().toISOString();

    // 1) experiment_sessions upsert-like 처리
    // 동일 participant + started_at 세션이 있으면 재사용하여 즉시 저장 스냅샷을 덮어쓴다.
    let sessionId = null;
    const { data: existingSession } = await supabase
      .from("experiment_sessions")
      .select("id")
      .eq("participant_id", participantId)
      .eq("started_at", startedAtIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession?.id) {
      sessionId = existingSession.id;
      const { error: updateSessionErr } = await supabase
        .from("experiment_sessions")
        .update({
          completed_at: isCompleted ? new Date().toISOString() : null,
          total_duration_ms: totalDurationMs || null,
          is_completed: Boolean(isCompleted),
        })
        .eq("id", sessionId);

      if (updateSessionErr) {
        console.error("Session update error:", updateSessionErr);
        return NextResponse.json(
          { error: "세션 갱신에 실패했습니다." },
          { status: 500 }
        );
      }
    } else {
      const { data: session, error: sessionErr } = await supabase
        .from("experiment_sessions")
        .insert({
          participant_id: participantId,
          started_at: startedAtIso,
          completed_at: isCompleted ? new Date().toISOString() : null,
          total_duration_ms: totalDurationMs || null,
          is_completed: Boolean(isCompleted),
        })
        .select("id")
        .single();

      if (sessionErr) {
        console.error("Session insert error:", sessionErr);
        return NextResponse.json(
          { error: "세션 생성에 실패했습니다." },
          { status: 500 }
        );
      }
      sessionId = session.id;
    }

    // 1-1) 즉시 저장 재실행 시 중복 방지를 위해 기존 시나리오 하위 데이터 삭제 후 재삽입
    await supabase.from("scenario_responses").delete().eq("session_id", sessionId);

    // 2) 각 시나리오별 데이터 저장
    for (const log of savableLogs) {
      const isBaselineCondition = log.condition === "C";
      // 2a) scenario_responses
      const { data: scenResp, error: scenErr } = await supabase
        .from("scenario_responses")
        .insert({
          session_id: sessionId,
          scenario_id: log.scenarioId,
          initial_choice: log.initialChoice,
          initial_reasoning: log.initialReasoning,
          self_rebuttal: log.selfRebuttal || null,
          final_choice: log.finalChoice || log.initialChoice,
          final_reflection: log.finalReflection || null,
          is_practice: Boolean(log.isPractice),
          phase1_exchange_count: log.phase1ExchangeCount || 0,
          phase2_exchange_count: log.phase2ExchangeCount || 0,
          phase3_exchange_count: log.phase3ExchangeCount || 0,
          choice_duration_ms: log.timing?.choiceDurationMs || null,
          reasoning_duration_ms: log.timing?.reasoningDurationMs || null,
          phase1_duration_ms: log.timing?.phase1DurationMs || null,
          phase2_duration_ms: log.timing?.phase2DurationMs || null,
          phase3_duration_ms: log.timing?.phase3DurationMs || null,
          reflection_duration_ms: log.timing?.reflectionDurationMs || null,
          total_duration_ms: log.timing?.totalDurationMs || null,
          started_at: log.startedAt || null,
          completed_at: log.completedAt || null,
        })
        .select("id")
        .single();

      if (scenErr) {
        console.error(`Scenario ${log.scenarioId} insert error:`, scenErr);
        continue;
      }

      const responseId = scenResp.id;

      // 2b) phase_messages — Phase 1
      if (log.phase1Log?.length > 0) {
        const p1Messages = log.phase1Log.map((m, i) => ({
          scenario_response_id: responseId,
          phase: isBaselineCondition ? "baseline" : "phase1",
          role: m.role,
          content: m.content,
          message_order: i,
          response_time_ms: m.responseTimeMs || null,
          created_at: m.timestamp || new Date().toISOString(),
        }));
        await supabase.from("phase_messages").insert(p1Messages);
      }

      // 2c) phase_messages — Phase 2
      if (log.phase2Log?.length > 0) {
        const p2Messages = log.phase2Log.map((m, i) => ({
          scenario_response_id: responseId,
          phase: "phase2",
          role: m.role,
          content: m.content,
          message_order: i,
          response_time_ms: m.responseTimeMs || null,
          created_at: m.timestamp || new Date().toISOString(),
        }));
        await supabase.from("phase_messages").insert(p2Messages);
      }

      // 2d) phase_messages — Phase 3
      if (log.phase3Log?.length > 0) {
        const p3Messages = log.phase3Log.map((m, i) => ({
          scenario_response_id: responseId,
          phase: "phase3",
          role: m.role,
          content: m.content,
          message_order: i,
          response_time_ms: m.responseTimeMs || null,
          created_at: m.timestamp || new Date().toISOString(),
        }));
        await supabase.from("phase_messages").insert(p3Messages);
      }

      // 2e) extracted_arguments
      if (log.extractedArguments?.length > 0) {
        const args = log.extractedArguments.map((content, i) => ({
          scenario_response_id: responseId,
          argument_index: i,
          content,
        }));
        await supabase.from("extracted_arguments").insert(args);
      }

      // 2f) ethics_scores
      if (log.ethicsScores?.length > 0) {
        const scores = log.ethicsScores.map((s) => ({
          scenario_response_id: responseId,
          frame: s.frame,
          initial_score: s.initialScore,
          adjusted_score: s.adjustedScore,
          delta: s.delta,
        }));
        await supabase.from("ethics_scores").insert(scores);
      }

      // 2g) probe_metrics
      if (log.probeMetrics) {
        const pm = log.probeMetrics;
        await supabase.from("probe_metrics").insert({
          scenario_response_id: responseId,
          probe_breadth: pm.probeBreadth,
          probe_depth: pm.probeDepth,
          ethical_stance_count: pm.ethicalStanceCount,
          moral_tension_count: pm.moralTensionCount,
          analogical_reasoning_count: pm.analogicalReasoningCount,
          feeling_count: pm.feelingCount,
          decision_justification_count: pm.decisionJustificationCount,
          insight_count: pm.insightCount,
          alternative_perspective_count: pm.alternativePerspectiveCount,
          reasoning_length: pm.reasoningLength,
          rebuttal_length: pm.rebuttalLength,
          phase1_user_avg_length: pm.phase1UserAvgLength,
          phase2_user_avg_length: pm.phase2UserAvgLength,
          phase3_user_avg_length: pm.phase3UserAvgLength,
          total_user_messages: pm.totalUserMessages,
        });
      }

      // 2h) probe_thought_units (문장 단위 raw 저장, 라벨은 이후 코딩)
      const rawUnits = buildRawUnits(log);
      if (rawUnits.length > 0) {
        await supabase.from("probe_thought_units").insert(
          rawUnits.map((u) => ({
            scenario_response_id: responseId,
            source: u.source,
            unit_id: u.unit_id,
            unit_index: u.unit_index,
            text_unit: u.text_unit,
            aspect: null,
            is_elaborated: null,
            confidence: null,
          }))
        );
      }
    }

    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    console.error("Session API error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
