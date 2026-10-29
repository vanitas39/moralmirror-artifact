import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const FRAMES = ["공리주의", "의무론", "관계주의", "법치주의", "감정"];

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getArg(name, fallback = null) {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!raw) return fallback;
  return raw.slice(name.length + 3);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function normalizeResponseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const outputItems = Array.isArray(response?.output) ? response.output : [];
  const text = outputItems
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .map((part) => {
      if (typeof part?.text === "string") return part.text;
      if (typeof part?.content === "string") return part.content;
      return "";
    })
    .join("")
    .trim();
  return text;
}

function parseJsonObject(text) {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function buildEthicsRescorePrompt() {
  return `You are a strict ethics scoring rater for a moral dilemma experiment.

You will receive a JSON object containing:
- initialReasoning: participant's first reasoning text
- phase1UserMessages, phase2UserMessages, phase3UserMessages: participant-only messages by phase
- finalReflection: participant's final written reflection
- scenario metadata

Task:
1) Score the participant's INITIAL ethical-frame emphasis from initialReasoning only.
2) Score the participant's ADJUSTED ethical-frame emphasis from the full participant text
   (phase1~phase3 user messages + finalReflection). For baseline condition, use all available user messages.
3) Use only these 5 frames exactly:
   - 공리주의
   - 의무론
   - 관계주의
   - 법치주의
   - 감정
4) Each score must be an integer 1~5.
5) Do NOT infer scores from initialChoice/finalChoice labels alone.
   Evidence must come from participant text content.
6) Do NOT mechanically invert all five frames when choices differ.
   Allow asymmetric changes by frame.

Output JSON only, no markdown:
{
  "initialScores": {
    "공리주의": 1,
    "의무론": 1,
    "관계주의": 1,
    "법치주의": 1,
    "감정": 1
  },
  "adjustedScores": {
    "공리주의": 1,
    "의무론": 1,
    "관계주의": 1,
    "법치주의": 1,
    "감정": 1
  }
}`;
}

function asFrameRows(scenarioResponseId, parsed, fallback) {
  const initialScores = parsed?.initialScores || {};
  const adjustedScores = parsed?.adjustedScores || {};
  return FRAMES.map((frame) => {
    const initial = clampScore(initialScores[frame] ?? fallback?.[frame]?.initial ?? 1);
    const adjusted = clampScore(adjustedScores[frame] ?? fallback?.[frame]?.adjusted ?? initial);
    return {
      scenario_response_id: scenarioResponseId,
      frame,
      initial_score: initial,
      adjusted_score: adjusted,
      delta: initial - adjusted,
    };
  });
}

function toFallbackByFrame(existingRows = []) {
  const map = {};
  for (const frame of FRAMES) {
    map[frame] = { initial: 1, adjusted: 1 };
  }
  for (const row of existingRows) {
    if (!FRAMES.includes(row.frame)) continue;
    map[row.frame] = {
      initial: clampScore(row.initial_score),
      adjusted: clampScore(row.adjusted_score),
    };
  }
  return map;
}

async function main() {
  loadLocalEnv();

  const dryRun = !hasFlag("write");
  const includePractice = hasFlag("include-practice");
  const participantArg = getArg("participants", "");
  const participantsFilter = participantArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const limitArg = getArg("limit", "");
  const limit = limitArg ? Number.parseInt(limitArg, 10) : null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiModel = process.env.ETHICS_RESCORE_MODEL || "gpt-5.5";

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase env missing: NEXT_PUBLIC_SUPABASE_URL and key are required.");
  }
  if (!openaiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const openai = new OpenAI({ apiKey: openaiKey });

  const [{ data: sessions, error: sessionsErr }, { data: participants, error: pErr }] =
    await Promise.all([
      supabase.from("experiment_sessions").select("id, participant_id"),
      supabase.from("participants").select("participant_id, condition"),
    ]);
  if (sessionsErr) throw sessionsErr;
  if (pErr) throw pErr;

  const sessionPidById = new Map((sessions || []).map((s) => [s.id, s.participant_id]));
  const conditionByPid = new Map((participants || []).map((p) => [p.participant_id, p.condition]));

  const { data: allResponses, error: respErr } = await supabase
    .from("scenario_responses")
    .select("id, session_id, scenario_id, initial_choice, final_choice, initial_reasoning, final_reflection, is_practice");
  if (respErr) throw respErr;

  let targetResponses = (allResponses || []).filter((r) => {
    if (!includePractice && r.is_practice) return false;
    const pid = String(sessionPidById.get(r.session_id) || "").toLowerCase();
    if (participantsFilter.length > 0 && !participantsFilter.includes(pid)) return false;
    return true;
  });
  if (Number.isFinite(limit) && limit > 0) {
    targetResponses = targetResponses.slice(0, limit);
  }

  if (targetResponses.length === 0) {
    console.log("대상 scenario_responses가 없습니다.");
    return;
  }

  const responseIds = targetResponses.map((r) => r.id);
  const [{ data: messages, error: msgErr }, { data: oldScores, error: oldErr }] = await Promise.all(
    [
      supabase
        .from("phase_messages")
        .select("scenario_response_id, phase, role, content, message_order, created_at")
        .in("scenario_response_id", responseIds),
      supabase
        .from("ethics_scores")
        .select("scenario_response_id, frame, initial_score, adjusted_score, delta")
        .in("scenario_response_id", responseIds),
    ]
  );
  if (msgErr) throw msgErr;
  if (oldErr) throw oldErr;

  const msgByResp = new Map();
  for (const m of messages || []) {
    const key = m.scenario_response_id;
    if (!msgByResp.has(key)) msgByResp.set(key, []);
    msgByResp.get(key).push(m);
  }
  for (const arr of msgByResp.values()) {
    arr.sort((a, b) => {
      const ao = Number.isFinite(a.message_order) ? a.message_order : 0;
      const bo = Number.isFinite(b.message_order) ? b.message_order : 0;
      if (ao !== bo) return ao - bo;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });
  }

  const oldByResp = new Map();
  for (const s of oldScores || []) {
    const key = s.scenario_response_id;
    if (!oldByResp.has(key)) oldByResp.set(key, []);
    oldByResp.get(key).push(s);
  }

  const prompt = buildEthicsRescorePrompt();
  const recomputed = [];

  for (let i = 0; i < targetResponses.length; i += 1) {
    const resp = targetResponses[i];
    const pid = sessionPidById.get(resp.session_id) || "";
    const condition = conditionByPid.get(pid) || "";
    const allMsgs = msgByResp.get(resp.id) || [];

    const userByPhase = {
      phase1: [],
      phase2: [],
      phase3: [],
      baseline: [],
    };
    for (const m of allMsgs) {
      if (m.role !== "user") continue;
      const text = String(m.content || "").trim();
      if (!text) continue;
      if (m.phase === "phase1") userByPhase.phase1.push(text);
      else if (m.phase === "phase2") userByPhase.phase2.push(text);
      else if (m.phase === "phase3") userByPhase.phase3.push(text);
      else if (m.phase === "baseline") userByPhase.baseline.push(text);
    }

    if (condition === "C" && userByPhase.baseline.length > 0 && userByPhase.phase1.length === 0) {
      userByPhase.phase1 = [...userByPhase.baseline];
    }

    const payload = {
      scenarioResponseId: resp.id,
      participantId: pid,
      scenarioId: resp.scenario_id,
      condition,
      initialChoice: resp.initial_choice || "",
      finalChoice: resp.final_choice || resp.initial_choice || "",
      initialReasoning: resp.initial_reasoning || "",
      phase1UserMessages: userByPhase.phase1,
      phase2UserMessages: userByPhase.phase2,
      phase3UserMessages: userByPhase.phase3,
      finalReflection: resp.final_reflection || "",
    };

    const fallback = toFallbackByFrame(oldByResp.get(resp.id) || []);
    let rows;
    let rawText = "";
    let parseFailed = false;
    try {
      const llmRes = await openai.responses.create({
        model: openaiModel,
        reasoning: { effort: "low" },
        instructions: prompt,
        input: [{ role: "user", content: JSON.stringify(payload, null, 2) }],
        max_output_tokens: 600,
      });
      rawText = normalizeResponseText(llmRes);
      const parsed = parseJsonObject(rawText);
      if (!parsed?.initialScores || !parsed?.adjustedScores) {
        parseFailed = true;
      }
      rows = asFrameRows(resp.id, parsed, fallback);
    } catch (error) {
      parseFailed = true;
      rows = asFrameRows(resp.id, null, fallback);
      rawText = `LLM error: ${error?.message || "unknown error"}`;
    }

    recomputed.push({
      scenarioResponseId: resp.id,
      participantId: pid,
      scenarioId: resp.scenario_id,
      condition,
      parseFailed,
      previous: oldByResp.get(resp.id) || [],
      next: rows,
      modelOutput: rawText,
    });

    console.log(
      `[${i + 1}/${targetResponses.length}] ${pid} / scenario ${resp.scenario_id} / ${parseFailed ? "fallback" : "rescored"}`
    );
  }

  if (!dryRun) {
    for (const item of recomputed) {
      const { error: delErr } = await supabase
        .from("ethics_scores")
        .delete()
        .eq("scenario_response_id", item.scenarioResponseId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("ethics_scores").insert(item.next);
      if (insErr) throw insErr;
    }
  }

  const changedResponses = recomputed.filter((item) => {
    const prevMap = new Map((item.previous || []).map((r) => [r.frame, r]));
    return item.next.some((n) => {
      const p = prevMap.get(n.frame);
      if (!p) return true;
      return (
        clampScore(p.initial_score) !== n.initial_score ||
        clampScore(p.adjusted_score) !== n.adjusted_score ||
        clampScore(p.delta) !== n.delta
      );
    });
  });
  const zeroDeltaResponses = recomputed.filter((item) =>
    item.next.every((r) => Number(r.delta) === 0)
  ).length;
  const parseFailedCount = recomputed.filter((item) => item.parseFailed).length;

  const outDir = path.resolve(process.cwd(), "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `ethics-rescore-report-${stamp}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun,
        includePractice,
        participantsFilter,
        model: openaiModel,
        totalResponses: recomputed.length,
        changedResponses: changedResponses.length,
        zeroDeltaResponses,
        parseFailedCount,
        results: recomputed,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("-----");
  console.log(`mode: ${dryRun ? "DRY-RUN" : "WRITE"}`);
  console.log(`total responses: ${recomputed.length}`);
  console.log(`changed responses: ${changedResponses.length}`);
  console.log(`all-zero-delta responses: ${zeroDeltaResponses}`);
  console.log(`parse fallback count: ${parseFailedCount}`);
  console.log(`report: ${outPath}`);
}

main().catch((error) => {
  console.error("재계산 실패:", error);
  process.exit(1);
});
