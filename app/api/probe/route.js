import OpenAI from "openai";
import { buildProbeAspectPrompt } from "@/lib/prompts";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ASPECTS = [
  "EthicalStance",
  "MoralTension",
  "AnalogicalReasoning",
  "Feeling",
  "DecisionJustification",
  "Insight",
  "AlternativePerspective",
];

function splitIntoUnits(text) {
  return text
    .split(/\n|(?<=[.!?])\s+|(?<=다\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export async function POST(req) {
  try {
    const { userTexts = [], scenarioContext = "" } = await req.json();

    const units = [];
    userTexts.forEach((entry, sourceIdx) => {
      splitIntoUnits(entry.content || "").forEach((u, idx) => {
        units.push({
          unitId: `s${sourceIdx}_u${idx}`,
          source: entry.source || "unknown",
          text: u,
        });
      });
    });

    if (units.length === 0) {
      return Response.json({
        classifiedUnits: [],
        aspectCounts: Object.fromEntries(ASPECTS.map((a) => [a, 0])),
        breadth: 0,
        depthPercent: 0,
      });
    }

    const systemPrompt = buildProbeAspectPrompt();
    const userPrompt = [
      `시나리오 컨텍스트: ${scenarioContext}`,
      "아래 thought units를 분류하세요:",
      JSON.stringify(units.map((u) => ({ unitId: u.unitId, text: u.text }))),
    ].join("\n");

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 1600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = response.choices[0].message.content || "{}";
    const parsed = safeParseJson(content);
    const classifiedUnits = Array.isArray(parsed?.classifiedUnits)
      ? parsed.classifiedUnits
      : [];

    const normalized = units.map((u) => {
      const hit = classifiedUnits.find((c) => c.unitId === u.unitId);
      const aspect = ASPECTS.includes(hit?.aspect)
        ? hit.aspect
        : "DecisionJustification";
      return {
        ...u,
        aspect,
        isElaborated: Boolean(hit?.isElaborated),
      };
    });

    const aspectCounts = Object.fromEntries(ASPECTS.map((a) => [a, 0]));
    normalized.forEach((u) => {
      aspectCounts[u.aspect] += 1;
    });

    const breadth = Object.values(aspectCounts).filter((n) => n > 0).length;
    const elaboratedCount = normalized.filter((u) => u.isElaborated).length;
    const depthPercent =
      normalized.length === 0
        ? 0
        : Math.round((elaboratedCount / normalized.length) * 100);

    return Response.json({
      classifiedUnits: normalized,
      aspectCounts,
      breadth,
      depthPercent,
    });
  } catch (error) {
    console.error("PROBE API error:", error);
    return Response.json(
      { error: "PROBE 분석에 실패했습니다." },
      { status: 500 }
    );
  }
}
