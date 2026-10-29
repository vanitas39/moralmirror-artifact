"use client";

import { useReducer, useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SCENARIOS, PRACTICE_SCENARIO, ETHICS_FRAMES } from "@/constants/scenarios";
import {
  buildPhase1Prompt,
  buildPhase1BPrompt,
  buildPracticePhase1Prompt,
  buildPracticePhase2Prompt,
  buildPracticePhase3Prompt,
  buildBaselinePrompt,
  buildBaselineFirstMessage,
  buildExtractionPrompt,
  buildPhase2Prompt,
  buildPhase3Prompt,
  buildEthicsRescorePrompt,
} from "@/lib/prompts";
import ProgressBar from "@/components/ProgressBar";
import PhaseIndicator from "@/components/PhaseIndicator";
import ChatInterface from "@/components/ChatInterface";
import ArgumentCards from "@/components/ArgumentCards";
import TrolleyAnimation from "@/components/TrolleyAnimation";
import { Loader2, ArrowRight, CheckCircle, RotateCcw, Home, SkipForward } from "lucide-react";

// ─── State ───────────────────────────────────────────────

const initialState = {
  isPractice: true,
  currentScenario: 0,
  phase: "start", // start | phase1 | phase2 | phase3 | reflection | practice_notice | scenario_break
  choice: null,
  reasoning: "",
  conversationHistory: [],   // { role, content, timestamp, responseTimeMs }
  extractedArguments: [],
  phase2History: [],         // { role, content, timestamp, responseTimeMs }
  selfRebuttal: "",
  phase3History: [],         // { role, content, timestamp, responseTimeMs }
  finalChoice: null,
  finalReflection: "",
  scenarioLogs: [],
};

const EXPERIMENT_STATE_KEY = "experimentStateV1";
const VALID_PHASES = [
  "start",
  "phase1",
  "phase2",
  "phase3",
  "reflection",
  "practice_notice",
  "scenario_break",
  "finished",
];
const SCENARIO_ORDER_FALLBACK = "1-2-3";

function getOrderedScenarios(orderText, scenarios) {
  const base = Array.isArray(scenarios) ? scenarios : [];
  if (base.length === 0) return [];
  const parsed = String(orderText || SCENARIO_ORDER_FALLBACK)
    .split("-")
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
  const uniqueParsed = [...new Set(parsed)];
  const ordered = uniqueParsed
    .map((id) => base.find((s) => s.id === id))
    .filter(Boolean);
  if (ordered.length === base.length) return ordered;
  const remaining = base.filter((s) => !ordered.some((o) => o.id === s.id));
  return [...ordered, ...remaining];
}

function dedupeScenarioLogsById(logs) {
  const byId = new Map();
  for (const log of logs || []) {
    if (typeof log?.scenarioId !== "number") continue;
    byId.set(log.scenarioId, log);
  }
  return Array.from(byId.values());
}

function loadExperimentState(baseState) {
  if (typeof window === "undefined") return baseState;
  try {
    const raw = sessionStorage.getItem(EXPERIMENT_STATE_KEY);
    if (!raw) return baseState;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return baseState;

    const next = { ...baseState };
    if (typeof parsed.isPractice === "boolean") next.isPractice = parsed.isPractice;
    if (typeof parsed.currentScenario === "number") {
      next.currentScenario = Math.min(
        Math.max(0, parsed.currentScenario),
        Math.max(0, SCENARIOS.length - 1)
      );
    }
    if (VALID_PHASES.includes(parsed.phase)) next.phase = parsed.phase;
    if (typeof parsed.choice === "string" || parsed.choice === null) next.choice = parsed.choice;
    if (typeof parsed.reasoning === "string") next.reasoning = parsed.reasoning;
    if (Array.isArray(parsed.conversationHistory)) next.conversationHistory = parsed.conversationHistory;
    if (Array.isArray(parsed.extractedArguments)) next.extractedArguments = parsed.extractedArguments;
    if (Array.isArray(parsed.phase2History)) next.phase2History = parsed.phase2History;
    if (typeof parsed.selfRebuttal === "string") next.selfRebuttal = parsed.selfRebuttal;
    if (Array.isArray(parsed.phase3History)) next.phase3History = parsed.phase3History;
    if (typeof parsed.finalChoice === "string" || parsed.finalChoice === null) next.finalChoice = parsed.finalChoice;
    if (typeof parsed.finalReflection === "string") next.finalReflection = parsed.finalReflection;
    if (Array.isArray(parsed.scenarioLogs)) next.scenarioLogs = parsed.scenarioLogs;

    return next;
  } catch {
    return baseState;
  }
}

function reducer(state, action) {
  switch (action.type) {
    case "SET_CHOICE":
      return { ...state, choice: action.payload };
    case "SET_REASONING":
      return { ...state, reasoning: action.payload };
    case "START_PHASE1":
      return { ...state, phase: "phase1", conversationHistory: [] };
    case "ADD_MESSAGE":
      return {
        ...state,
        conversationHistory: [...state.conversationHistory, action.payload],
      };
    case "UPDATE_LAST_MESSAGE":
      if (state.conversationHistory.length === 0) return state;
      return {
        ...state,
        conversationHistory: [
          ...state.conversationHistory.slice(0, -1),
          {
            ...state.conversationHistory[state.conversationHistory.length - 1],
            content: action.payload,
          },
        ],
      };
    case "START_PHASE2":
      return { ...state, phase: "phase2", phase2History: [] };
    case "SET_EXTRACTED_ARGUMENTS":
      return { ...state, extractedArguments: action.payload };
    case "ADD_PHASE2_MESSAGE":
      return {
        ...state,
        phase2History: [...state.phase2History, action.payload],
      };
    case "UPDATE_LAST_PHASE2_MESSAGE":
      if (state.phase2History.length === 0) return state;
      return {
        ...state,
        phase2History: [
          ...state.phase2History.slice(0, -1),
          {
            ...state.phase2History[state.phase2History.length - 1],
            content: action.payload,
          },
        ],
      };
    case "SET_SELF_REBUTTAL":
      return { ...state, selfRebuttal: action.payload };
    case "START_PHASE3":
      return { ...state, phase: "phase3", phase3History: [] };
    case "ADD_PHASE3_MESSAGE":
      return {
        ...state,
        phase3History: [...state.phase3History, action.payload],
      };
    case "UPDATE_LAST_PHASE3_MESSAGE":
      if (state.phase3History.length === 0) return state;
      return {
        ...state,
        phase3History: [
          ...state.phase3History.slice(0, -1),
          {
            ...state.phase3History[state.phase3History.length - 1],
            content: action.payload,
          },
        ],
      };
    case "START_REFLECTION":
      return {
        ...state,
        phase: "reflection",
        finalChoice: state.choice,
      };
    case "SET_FINAL_CHOICE":
      return { ...state, finalChoice: action.payload };
    case "SET_FINAL_REFLECTION":
      return { ...state, finalReflection: action.payload };
    case "SKIP_PRACTICE":
      return {
        ...initialState,
        isPractice: false,
        currentScenario: 0,
        scenarioLogs: state.scenarioLogs,
      };
    case "SKIP_TO_NEXT_SCENARIO":
      if (state.currentScenario >= SCENARIOS.length - 1) return state;
      return {
        ...initialState,
        isPractice: false,
        currentScenario: state.currentScenario + 1,
        scenarioLogs: state.scenarioLogs,
      };
    case "COMPLETE_SCENARIO": {
      const log = action.payload;
      const newLogs = [...state.scenarioLogs, log];
      if (state.isPractice) {
        return {
          ...initialState,
          isPractice: false,
          phase: "practice_notice",
          scenarioLogs: newLogs,
        };
      }
      const nextScenario = state.currentScenario + 1;
      if (nextScenario >= SCENARIOS.length) {
        return { ...state, scenarioLogs: newLogs, phase: "finished" };
      }
      return {
        ...initialState,
        isPractice: false,
        currentScenario: nextScenario,
        phase: "scenario_break",
        scenarioLogs: newLogs,
      };
    }
    case "START_MAIN_EXPERIMENT":
      return {
        ...initialState,
        isPractice: false,
        currentScenario: 0,
        scenarioLogs: state.scenarioLogs,
      };
    case "START_NEXT_SCENARIO":
      return {
        ...state,
        phase: "start",
      };
    default:
      return state;
  }
}

// ─── Helpers ─────────────────────────────────────────────

async function callChat(systemPrompt, messages, options = {}) {
  const { maxOutputTokens = 1000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  let res;
  try {
    const payload = { systemPrompt, messages };
    if (typeof maxOutputTokens === "number" && maxOutputTokens > 0) {
      payload.maxOutputTokens = maxOutputTokens;
    }
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("AI 응답 시간이 초과되었습니다. 다시 시도해주세요.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore parse error
  }
  if (!res.ok) {
    throw new Error(data?.error || "API call failed");
  }
  if (data?.error) throw new Error(data.error);
  return data?.content || "";
}

function parseArguments(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* fallback */ }
  const match = text.match(/\[[\s\S]*?\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* ignore */ }
  }
  const items = text.match(/"([^"]+)"/g);
  if (items) return items.map((s) => s.replace(/"/g, ""));
  return ["논거를 추출하지 못했습니다."];
}

function summarizePhase2UserRebuttal(phase2History) {
  const userTexts = phase2History
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean);
  if (userTexts.length === 0) return "";
  return userTexts.join(" / ");
}

function clampEthicsScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function buildFallbackEthicsScores(scenario, initialChoice, finalChoice) {
  const initialScores = scenario?.ethicsMap?.[initialChoice] || {};
  const adjustedScores = scenario?.ethicsMap?.[finalChoice] || initialScores;
  return ETHICS_FRAMES.map((frame) => {
    const initial = clampEthicsScore(initialScores[frame] ?? 1);
    const adjusted = clampEthicsScore(adjustedScores[frame] ?? initial);
    return {
      frame,
      initialScore: initial,
      adjustedScore: adjusted,
      delta: initial - adjusted,
    };
  });
}

function parseEthicsScoresJson(text) {
  if (typeof text !== "string" || !text.trim()) return null;
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

function pickUserContents(messages = []) {
  return (messages || [])
    .filter((m) => m?.role === "user")
    .map((m) => String(m.content || "").trim())
    .filter(Boolean);
}

async function computeEthicsScoresFromDiscussion({
  scenario,
  condition,
  initialChoice,
  finalChoice,
  initialReasoning,
  phase1Log,
  phase2Log,
  phase3Log,
  finalReflection,
}) {
  const fallback = buildFallbackEthicsScores(scenario, initialChoice, finalChoice);
  const payload = {
    scenarioId: scenario?.id ?? null,
    scenarioTitle: scenario?.title ?? "",
    condition: condition || "",
    initialChoice: initialChoice || "",
    finalChoice: finalChoice || "",
    initialReasoning: String(initialReasoning || ""),
    phase1UserMessages: pickUserContents(phase1Log),
    phase2UserMessages: pickUserContents(phase2Log),
    phase3UserMessages: pickUserContents(phase3Log),
    finalReflection: String(finalReflection || ""),
  };

  try {
    const responseText = await callChat(
      buildEthicsRescorePrompt(),
      [{ role: "user", content: JSON.stringify(payload, null, 2) }],
      { maxOutputTokens: 600 }
    );
    const parsed = parseEthicsScoresJson(responseText);
    if (!parsed?.initialScores || !parsed?.adjustedScores) return fallback;

    return ETHICS_FRAMES.map((frame) => {
      const initial = clampEthicsScore(parsed.initialScores[frame]);
      const adjusted = clampEthicsScore(parsed.adjustedScores[frame]);
      return {
        frame,
        initialScore: initial,
        adjustedScore: adjusted,
        delta: initial - adjusted,
      };
    });
  } catch {
    return fallback;
  }
}

function computeProbeMetrics(state) {
  const p1UserMsgs = state.conversationHistory.filter((m) => m.role === "user");
  const p2UserMsgs = state.phase2History.filter((m) => m.role === "user");
  const p3UserMsgs = state.phase3History.filter((m) => m.role === "user");
  const allUserMsgs = [...p1UserMsgs, ...p2UserMsgs, ...p3UserMsgs];

  return {
    probeBreadth: null,
    probeDepth: null,
    ethicalStanceCount: null,
    moralTensionCount: null,
    analogicalReasoningCount: null,
    feelingCount: null,
    decisionJustificationCount: null,
    insightCount: null,
    alternativePerspectiveCount: null,
    classifiedUnits: [],
    reasoningLength: state.reasoning.length,
    rebuttalLength: (state.selfRebuttal || "").length,
    phase1UserAvgLength:
      p1UserMsgs.length > 0
        ? Math.round(
            p1UserMsgs.reduce((s, m) => s + m.content.length, 0) /
              p1UserMsgs.length
          )
        : 0,
    phase2UserAvgLength:
      p2UserMsgs.length > 0
        ? Math.round(
            p2UserMsgs.reduce((s, m) => s + m.content.length, 0) /
              p2UserMsgs.length
          )
        : 0,
    phase3UserAvgLength:
      p3UserMsgs.length > 0
        ? Math.round(
            p3UserMsgs.reduce((s, m) => s + m.content.length, 0) /
              p3UserMsgs.length
          )
        : 0,
    totalUserMessages: allUserMsgs.length,
  };
}

// ─── Component ───────────────────────────────────────────

export default function ExperimentPage() {
  const [state, dispatch] = useReducer(reducer, initialState, loadExperimentState);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [phase1ConfirmAction, setPhase1ConfirmAction] = useState(null);
  const [condition, setCondition] = useState("A");
  const [scenarioOrder, setScenarioOrder] = useState(SCENARIO_ORDER_FALLBACK);
  const [isTestAccount, setIsTestAccount] = useState(false);
  const [isConditionLoading, setIsConditionLoading] = useState(true);
  const [fadeKey, setFadeKey] = useState(0);
  const router = useRouter();

  // ─── Timing refs ───
  const sessionStartRef = useRef(null);
  const scenarioStartRef = useRef(null);
  const choiceTimeRef = useRef(null);
  const reasoningDoneRef = useRef(null);
  const phase1StartRef = useRef(null);
  const phase1EndRef = useRef(null);
  const phase2StartRef = useRef(null);
  const phase2EndRef = useRef(null);
  const phase3StartRef = useRef(null);
  const phase3EndRef = useRef(null);
  const reflectionStartRef = useRef(null);
  const lastMessageTimeRef = useRef(null);
  const completingRef = useRef(false);
  const sessionSavedRef = useRef(false);
  const autosavingRef = useRef(false);
  const pendingAutosaveRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchCondition() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) throw new Error("Failed to load condition");
        const data = await res.json();
        if (!cancelled) {
          setCondition(["A", "B", "C"].includes(data.condition) ? data.condition : "A");
          setScenarioOrder(
            typeof data.scenarioOrder === "string" && data.scenarioOrder.trim()
              ? data.scenarioOrder
              : SCENARIO_ORDER_FALLBACK
          );
          const participantId = String(data.participantId || "").toLowerCase();
          const isTestSession =
            /^t\d+/.test(participantId) || participantId.startsWith("test");
          setIsTestAccount(isTestSession);
        }
      } catch {
        if (!cancelled) {
          setCondition("A");
          setScenarioOrder(SCENARIO_ORDER_FALLBACK);
          setIsTestAccount(false);
        }
      } finally {
        if (!cancelled) setIsConditionLoading(false);
      }
    }

    fetchCondition();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(EXPERIMENT_STATE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (state.phase === "finished") return;
    const params = new URLSearchParams();
    params.set("phase", state.phase);
    params.set("scenario", state.isPractice ? "practice" : String(state.currentScenario + 1));
    params.set("mode", state.isPractice ? "practice" : "main");
    const nextUrl = `/experiment?${params.toString()}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl !== nextUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [router, state.phase, state.currentScenario, state.isPractice]);

  if (!sessionStartRef.current) sessionStartRef.current = Date.now();
  if (!scenarioStartRef.current) scenarioStartRef.current = Date.now();

  const orderedScenarios = getOrderedScenarios(scenarioOrder, SCENARIOS);
  const scenario = state.isPractice
    ? PRACTICE_SCENARIO
    : orderedScenarios[state.currentScenario];
  const userMessageCount = state.conversationHistory.filter(
    (m) => m.role === "user"
  ).length;
  const phase1RequiredInputCount = 3;
  const phase1SeedOffset = ["B", "C"].includes(condition) ? 1 : 0;
  const phase1ActualUserInputCount = Math.max(0, userMessageCount - phase1SeedOffset);
  const phase2UserCount = state.phase2History.filter(
    (m) => m.role === "user"
  ).length;
  const phase3UserCount = state.phase3History.filter(
    (m) => m.role === "user"
  ).length;

  const triggerFade = useCallback(() => setFadeKey((k) => k + 1), []);

  function now() { return Date.now(); }
  function elapsed(ref) { return ref.current ? now() - ref.current : null; }
  const isChatPhase = ["phase1", "phase2", "phase3"].includes(state.phase);

  function stampMessage(role, content) {
    const ts = new Date().toISOString();
    const responseTimeMs = lastMessageTimeRef.current
      ? now() - lastMessageTimeRef.current
      : null;
    lastMessageTimeRef.current = now();
    return { role, content, timestamp: ts, responseTimeMs };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function typeAssistantResponse(addActionType, updateActionType, text) {
    const assistantMsg = stampMessage("assistant", "");
    dispatch({ type: addActionType, payload: assistantMsg });

    const start = now();
    const fullText = String(text || "");
    for (let i = 1; i <= fullText.length; i += 1) {
      dispatch({ type: updateActionType, payload: fullText.slice(0, i) });
      await sleep(6);
    }

    const elapsedMs = now() - start;
    if (elapsedMs < 500) {
      await sleep(500 - elapsedMs);
    }
  }

  function buildPhase1SystemPrompt() {
    if (state.isPractice) {
      return buildPracticePhase1Prompt(state.choice, state.reasoning);
    }

    return condition === "B"
      ? buildPhase1BPrompt(state.choice, state.reasoning)
      : buildPhase1Prompt(state.choice, state.reasoning);
  }

  function buildCurrentScenarioPartialLog() {
    const hasAnyConversation =
      state.conversationHistory.length > 0 ||
      state.phase2History.length > 0 ||
      state.phase3History.length > 0;
    const hasCoreInput = Boolean(state.choice && state.reasoning.trim());
    const hasReflection = Boolean(state.finalReflection.trim());
    const hasAnyInput = hasCoreInput || hasAnyConversation || hasReflection;

    if (!hasAnyInput || !hasCoreInput) {
      return null;
    }

    const completedAt = new Date().toISOString();

    return {
      condition,
      isPractice: state.isPractice,
      scenarioId: scenario.id,
      scenario,
      initialChoice: state.choice,
      initialReasoning: state.reasoning,
      phase1Log: state.conversationHistory,
      extractedArguments: state.extractedArguments,
      phase2Log: state.phase2History,
      selfRebuttal: state.selfRebuttal,
      phase3Log: state.phase3History,
      finalChoice: state.finalChoice || state.choice,
      finalReflection: state.finalReflection || null,
      ethicsScores: [],
      ethicsScore: scenario.ethicsMap[state.choice],
      probeMetrics: computeProbeMetrics(state),
      timing: {
        choiceDurationMs: choiceTimeRef.current
          ? choiceTimeRef.current - scenarioStartRef.current
          : null,
        reasoningDurationMs:
          reasoningDoneRef.current && choiceTimeRef.current
            ? reasoningDoneRef.current - choiceTimeRef.current
            : null,
        phase1DurationMs: phase1StartRef.current && phase1EndRef.current
          ? phase1EndRef.current - phase1StartRef.current
          : null,
        phase2DurationMs: phase2StartRef.current && phase2EndRef.current
          ? phase2EndRef.current - phase2StartRef.current
          : null,
        phase3DurationMs: phase3StartRef.current && phase3EndRef.current
          ? phase3EndRef.current - phase3StartRef.current
          : null,
        reflectionDurationMs: reflectionStartRef.current
          ? now() - reflectionStartRef.current
          : null,
        totalDurationMs: scenarioStartRef.current
          ? now() - scenarioStartRef.current
          : null,
      },
      phase1ExchangeCount: state.conversationHistory.filter((m) => m.role === "user")
        .length,
      phase2ExchangeCount: state.phase2History.filter((m) => m.role === "user").length,
      phase3ExchangeCount: state.phase3History.filter((m) => m.role === "user").length,
      startedAt: new Date(scenarioStartRef.current).toISOString(),
      completedAt,
    };
  }

  async function persistSessionSnapshot({ includeCurrentScenario, isCompleted }) {
    if (sessionSavedRef.current) return;

    const logs = [...state.scenarioLogs];
    if (includeCurrentScenario) {
      const partialLog = buildCurrentScenarioPartialLog();
      if (partialLog) logs.push(partialLog);
    }
    const dedupedLogs = dedupeScenarioLogsById(logs);

    if (dedupedLogs.length === 0) return;

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioLogs: dedupedLogs,
          totalDurationMs: now() - sessionStartRef.current,
          isCompleted,
          sessionStartedAt: new Date(sessionStartRef.current).toISOString(),
        }),
      });
      if (response.ok && isCompleted) {
        sessionSavedRef.current = true;
      }
    } catch {
      // ignore save failure on exit path
    }
  }

  async function runAutosave() {
    if (sessionSavedRef.current) return;
    if (autosavingRef.current) {
      pendingAutosaveRef.current = true;
      return;
    }

    autosavingRef.current = true;
    try {
      await persistSessionSnapshot({
        includeCurrentScenario: true,
        isCompleted: false,
      });
    } finally {
      autosavingRef.current = false;
      if (pendingAutosaveRef.current) {
        pendingAutosaveRef.current = false;
        void runAutosave();
      }
    }
  }

  // ─── Handlers ───

  async function handleStartDebate() {
    reasoningDoneRef.current = now();
    triggerFade();
    dispatch({ type: "START_PHASE1" });
    phase1StartRef.current = now();
    lastMessageTimeRef.current = now();

    setIsLoading(true);
    try {
      const systemPrompt =
        condition === "C" ? buildBaselinePrompt() : buildPhase1SystemPrompt();
      const firstUserContent =
        condition === "C"
          ? buildBaselineFirstMessage(
              scenario.description,
              state.choice,
              state.reasoning
            )
          : state.reasoning;
      const userMsg = stampMessage("user", firstUserContent);
      dispatch({ type: "ADD_MESSAGE", payload: userMsg });

      const response = await callChat(systemPrompt, [
        { role: "user", content: firstUserContent },
      ], {
        maxOutputTokens: condition === "C" ? null : 1000,
      });
      await typeAssistantResponse("ADD_MESSAGE", "UPDATE_LAST_MESSAGE", response);
    } catch {
      await typeAssistantResponse(
        "ADD_MESSAGE",
        "UPDATE_LAST_MESSAGE",
        "죄송합니다, 오류가 발생했습니다. 다시 시도해주세요."
      );
    }
    void runAutosave();
    setIsLoading(false);
  }

  async function handlePhase1Message(userMessage) {
    const systemPrompt =
      condition === "C" ? buildBaselinePrompt() : buildPhase1SystemPrompt();
    const userMsg = stampMessage("user", userMessage);
    dispatch({ type: "ADD_MESSAGE", payload: userMsg });

    setIsLoading(true);
    try {
      const allMessages = [...state.conversationHistory, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const response = await callChat(systemPrompt, allMessages, {
        maxOutputTokens: condition === "C" ? null : 1000,
      });
      await typeAssistantResponse("ADD_MESSAGE", "UPDATE_LAST_MESSAGE", response);
    } catch {
      await typeAssistantResponse(
        "ADD_MESSAGE",
        "UPDATE_LAST_MESSAGE",
        "응답 생성이 지연되거나 실패했습니다. 잠시 후 다시 시도해주세요."
      );
    } finally {
      void runAutosave();
      setIsLoading(false);
    }
  }

  async function handleGoToPhase2() {
    phase1EndRef.current = now();
    triggerFade();
    dispatch({ type: "START_PHASE2" });
    phase2StartRef.current = now();
    lastMessageTimeRef.current = now();
    setIsExtracting(true);

    let extracted = [];
    try {
      const systemPrompt = buildExtractionPrompt();
      const conversationText = state.conversationHistory
        .map((m) => `${m.role === "user" ? "사용자" : "AI"}: ${m.content}`)
        .join("\n");

      const response = await callChat(systemPrompt, [
        { role: "user", content: conversationText },
      ]);
      extracted = parseArguments(response);
      dispatch({
        type: "SET_EXTRACTED_ARGUMENTS",
        payload: extracted,
      });
    } catch {
      extracted = ["논거 추출에 실패했습니다. 그래도 논박을 시도해보세요."];
      dispatch({
        type: "SET_EXTRACTED_ARGUMENTS",
        payload: extracted,
      });
    }

    try {
      const systemPrompt = state.isPractice
        ? buildPracticePhase2Prompt(state.choice, state.reasoning, extracted)
        : buildPhase2Prompt(state.choice, state.reasoning, extracted, scenario.title);
      const opener = await callChat(systemPrompt, [
        {
          role: "user",
          content:
            "이제부터 당신은 내 초기 주장을 대변하세요. 내가 그 논리를 깨보겠습니다.",
        },
      ]);
      await typeAssistantResponse(
        "ADD_PHASE2_MESSAGE",
        "UPDATE_LAST_PHASE2_MESSAGE",
        opener
      );
    } catch {
      await typeAssistantResponse(
        "ADD_PHASE2_MESSAGE",
        "UPDATE_LAST_PHASE2_MESSAGE",
        "좋습니다. 당신의 초기 논거를 제가 대변하겠습니다. 반박해보세요."
      );
    }

    void runAutosave();
    setIsExtracting(false);
  }

  async function handlePhase2Message(userMessage) {
    const systemPrompt = state.isPractice
      ? buildPracticePhase2Prompt(
          state.choice,
          state.reasoning,
          state.extractedArguments
        )
      : buildPhase2Prompt(
          state.choice,
          state.reasoning,
          state.extractedArguments,
          scenario.title
        );
    const userMsg = stampMessage("user", userMessage);
    dispatch({ type: "ADD_PHASE2_MESSAGE", payload: userMsg });

    setIsLoading(true);
    try {
      const allMessages = [...state.phase2History, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const response = await callChat(systemPrompt, allMessages);
      await typeAssistantResponse(
        "ADD_PHASE2_MESSAGE",
        "UPDATE_LAST_PHASE2_MESSAGE",
        response
      );
    } catch {
      await typeAssistantResponse(
        "ADD_PHASE2_MESSAGE",
        "UPDATE_LAST_PHASE2_MESSAGE",
        "응답 생성이 지연되거나 실패했습니다. 잠시 후 다시 시도해주세요."
      );
    } finally {
      void runAutosave();
      setIsLoading(false);
    }
  }

  async function handleGoToPhase3() {
    phase2EndRef.current = now();
    const phase2Summary = summarizePhase2UserRebuttal(state.phase2History);
    dispatch({ type: "SET_SELF_REBUTTAL", payload: phase2Summary });

    triggerFade();
    dispatch({ type: "START_PHASE3" });
    phase3StartRef.current = now();
    lastMessageTimeRef.current = now();

    setIsLoading(true);
    try {
      const systemPrompt = state.isPractice
        ? buildPracticePhase3Prompt(
            state.extractedArguments,
            phase2Summary || "사용자 반박 요약 없음"
          )
        : buildPhase3Prompt(
            state.choice,
            state.extractedArguments,
            phase2Summary || "사용자 반박 요약 없음"
          );
      const response = await callChat(systemPrompt, [
        {
          role: "user",
          content:
            "Phase 2 토론을 바탕으로 제가 무엇을 기준으로 최종 선택을 정해야 하는지 질문해주세요.",
        },
      ]);
      await typeAssistantResponse(
        "ADD_PHASE3_MESSAGE",
        "UPDATE_LAST_PHASE3_MESSAGE",
        response
      );
    } catch {
      await typeAssistantResponse(
        "ADD_PHASE3_MESSAGE",
        "UPDATE_LAST_PHASE3_MESSAGE",
        "죄송합니다, 오류가 발생했습니다. 다시 시도해주세요."
      );
    }
    void runAutosave();
    setIsLoading(false);
  }

  async function handlePhase3Message(userMessage) {
    const phase2Summary = summarizePhase2UserRebuttal(state.phase2History);
    const systemPrompt = state.isPractice
      ? buildPracticePhase3Prompt(
          state.extractedArguments,
          phase2Summary || "사용자 반박 요약 없음"
        )
      : buildPhase3Prompt(
          state.choice,
          state.extractedArguments,
          phase2Summary || "사용자 반박 요약 없음"
        );
    const userMsg = stampMessage("user", userMessage);
    dispatch({ type: "ADD_PHASE3_MESSAGE", payload: userMsg });

    setIsLoading(true);
    try {
      const allMessages = [...state.phase3History, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const response = await callChat(systemPrompt, allMessages);
      await typeAssistantResponse(
        "ADD_PHASE3_MESSAGE",
        "UPDATE_LAST_PHASE3_MESSAGE",
        response
      );
    } catch {
      await typeAssistantResponse(
        "ADD_PHASE3_MESSAGE",
        "UPDATE_LAST_PHASE3_MESSAGE",
        "응답 생성이 지연되거나 실패했습니다. 잠시 후 다시 시도해주세요."
      );
    } finally {
      void runAutosave();
      setIsLoading(false);
    }
  }

  function handleGoToReflection() {
    phase3EndRef.current = now();
    triggerFade();
    dispatch({ type: "START_REFLECTION" });
    reflectionStartRef.current = now();
    void runAutosave();
  }

  function handleEndBaselineConversation() {
    phase1EndRef.current = now();
    triggerFade();
    dispatch({ type: "START_REFLECTION" });
    reflectionStartRef.current = now();
    void runAutosave();
  }

  function handleOpenPhase1Confirm(actionType) {
    setPhase1ConfirmAction(actionType);
  }

  function handleClosePhase1Confirm() {
    setPhase1ConfirmAction(null);
  }

  async function handleConfirmPhase1Action() {
    const actionType = phase1ConfirmAction;
    setPhase1ConfirmAction(null);
    if (actionType === "end_baseline") {
      handleEndBaselineConversation();
      return;
    }
    if (actionType === "go_phase2") {
      await handleGoToPhase2();
      return;
    }
    if (actionType === "go_phase3") {
      await handleGoToPhase3();
      return;
    }
    if (actionType === "go_reflection") {
      handleGoToReflection();
    }
  }

  function handleStartNextScenario() {
    triggerFade();
    dispatch({ type: "START_NEXT_SCENARIO" });
    scenarioStartRef.current = now();
    choiceTimeRef.current = null;
    reasoningDoneRef.current = null;
    phase1StartRef.current = null;
    phase1EndRef.current = null;
    phase2StartRef.current = null;
    phase2EndRef.current = null;
    phase3StartRef.current = null;
    phase3EndRef.current = null;
    reflectionStartRef.current = null;
    lastMessageTimeRef.current = null;
  }

  function handleStartMainExperiment() {
    triggerFade();
    dispatch({ type: "START_MAIN_EXPERIMENT" });
    scenarioStartRef.current = now();
    choiceTimeRef.current = null;
    reasoningDoneRef.current = null;
    phase1StartRef.current = null;
    phase1EndRef.current = null;
    phase2StartRef.current = null;
    phase2EndRef.current = null;
    phase3StartRef.current = null;
    phase3EndRef.current = null;
    reflectionStartRef.current = null;
    lastMessageTimeRef.current = null;
  }

  async function handleGoHome() {
    await persistSessionSnapshot({
      includeCurrentScenario: true,
      isCompleted: false,
    });
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    sessionStorage.removeItem(EXPERIMENT_STATE_KEY);
    sessionStorage.removeItem("scenarioLogs");
    router.push("/login");
  }

  async function handleCompleteScenario() {
    if (completingRef.current) return;
    completingRef.current = true;
    setIsCompleting(true);

    const completedAt = new Date().toISOString();
    try {
      const probeMetrics = computeProbeMetrics(state);
      const effectiveFinalChoice = state.finalChoice || state.choice;
      const ethicsScores = await computeEthicsScoresFromDiscussion({
        scenario,
        condition,
        initialChoice: state.choice,
        finalChoice: effectiveFinalChoice,
        initialReasoning: state.reasoning,
        phase1Log: state.conversationHistory,
        phase2Log: state.phase2History,
        phase3Log: state.phase3History,
        finalReflection: state.finalReflection,
      });

      const timing = {
        choiceDurationMs: choiceTimeRef.current
          ? choiceTimeRef.current - scenarioStartRef.current
          : null,
        reasoningDurationMs:
          reasoningDoneRef.current && choiceTimeRef.current
            ? reasoningDoneRef.current - choiceTimeRef.current
            : null,
        phase1DurationMs: elapsed(phase1StartRef) !== null && phase1EndRef.current
          ? phase1EndRef.current - phase1StartRef.current
          : null,
        phase2DurationMs: phase2StartRef.current && phase2EndRef.current
          ? phase2EndRef.current - phase2StartRef.current
          : null,
        phase3DurationMs: phase3StartRef.current && phase3EndRef.current
          ? phase3EndRef.current - phase3StartRef.current
          : null,
        reflectionDurationMs: reflectionStartRef.current
          ? now() - reflectionStartRef.current
          : null,
        totalDurationMs: scenarioStartRef.current
          ? now() - scenarioStartRef.current
          : null,
      };

      const log = {
        condition,
        isPractice: state.isPractice,
        scenarioId: scenario.id,
        scenario,
        initialChoice: state.choice,
        initialReasoning: state.reasoning,
        phase1Log: state.conversationHistory,
        extractedArguments: state.extractedArguments,
        phase2Log: state.phase2History,
        selfRebuttal: state.selfRebuttal,
        phase3Log: state.phase3History,
        finalChoice: effectiveFinalChoice,
        finalReflection: state.finalReflection,
        ethicsScores,
        ethicsScore: scenario.ethicsMap[state.choice],
        probeMetrics,
        timing,
        phase1ExchangeCount: userMessageCount,
        phase2ExchangeCount: phase2UserCount,
        phase3ExchangeCount: phase3UserCount,
        startedAt: new Date(scenarioStartRef.current).toISOString(),
        completedAt,
      };

      if (state.currentScenario >= orderedScenarios.length - 1) {
        const allLogs = dedupeScenarioLogsById([...state.scenarioLogs, log]);
        sessionStorage.setItem("scenarioLogs", JSON.stringify(allLogs));

        try {
          const response = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scenarioLogs: allLogs,
              totalDurationMs: now() - sessionStartRef.current,
              isCompleted: true,
              sessionStartedAt: new Date(sessionStartRef.current).toISOString(),
            }),
          });
          if (response.ok) {
            sessionSavedRef.current = true;
          }
        } catch {
          // 네트워크 저장 실패여도 결과 화면 이동은 유지
        }

        dispatch({ type: "COMPLETE_SCENARIO", payload: log });
        router.push("/result");
      } else {
        await persistSessionSnapshot({
          includeCurrentScenario: true,
          isCompleted: false,
        });
        triggerFade();
        dispatch({ type: "COMPLETE_SCENARIO", payload: log });
        scenarioStartRef.current = now();
        choiceTimeRef.current = null;
        reasoningDoneRef.current = null;
        phase1StartRef.current = null;
        phase1EndRef.current = null;
        phase2StartRef.current = null;
        phase2EndRef.current = null;
        phase3StartRef.current = null;
        phase3EndRef.current = null;
        reflectionStartRef.current = null;
        lastMessageTimeRef.current = null;
      }
    } finally {
      completingRef.current = false;
      setIsCompleting(false);
    }
  }

  function resetScenarioProgressRefs() {
    scenarioStartRef.current = now();
    choiceTimeRef.current = null;
    reasoningDoneRef.current = null;
    phase1StartRef.current = null;
    phase1EndRef.current = null;
    phase2StartRef.current = null;
    phase2EndRef.current = null;
    phase3StartRef.current = null;
    phase3EndRef.current = null;
    reflectionStartRef.current = null;
    lastMessageTimeRef.current = null;
  }

  function handleSkipPractice() {
    if (!isTestAccount || !state.isPractice) return;
    triggerFade();
    dispatch({ type: "SKIP_PRACTICE" });
    resetScenarioProgressRefs();
  }

  function handleSkipCurrentScenario() {
    if (!isTestAccount || state.isPractice) return;
    if (state.currentScenario >= orderedScenarios.length - 1) return;
    const confirmed = window.confirm(
      "현재 시나리오를 저장하지 않고 다음 시나리오로 이동할까요?"
    );
    if (!confirmed) return;
    triggerFade();
    dispatch({ type: "SKIP_TO_NEXT_SCENARIO" });
    resetScenarioProgressRefs();
  }

  async function handleSkipCurrentPhaseForTest() {
    if (!isTestAccount) return;
    if (!["phase1", "phase2", "phase3"].includes(state.phase)) return;

    const phaseTargetLabel =
      state.phase === "phase1"
        ? condition === "C"
          ? "최종 성찰"
          : "Phase 2"
        : state.phase === "phase2"
          ? "Phase 3"
          : "최종 성찰";

    const confirmed = window.confirm(
      `테스트용으로 현재 단계를 건너뛰고 ${phaseTargetLabel}(으)로 이동할까요?`
    );
    if (!confirmed) return;

    if (state.phase === "phase1") {
      if (condition === "C") {
        handleEndBaselineConversation();
      } else {
        await handleGoToPhase2();
      }
      return;
    }

    if (state.phase === "phase2") {
      await handleGoToPhase3();
      return;
    }

    if (state.phase === "phase3") {
      handleGoToReflection();
    }
  }

  // ─── Render ────────────────────────────────────────────

  if (isConditionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200 px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleGoHome}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
            >
              <Home size={14} />
              초기 화면
            </button>
            <span className="text-sm font-bold text-gray-900">Moral Mirror</span>
          </div>
          <div className="flex items-center gap-2">
            {isTestAccount &&
              !state.isPractice &&
              state.phase !== "practice_notice" &&
              state.phase !== "finished" &&
              state.currentScenario < orderedScenarios.length - 1 && (
                <button
                  onClick={handleSkipCurrentScenario}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  <SkipForward size={12} />
                  테스트용: 시나리오 건너뛰기
                </button>
              )}
            {state.phase !== "practice_notice" && (
              <ProgressBar
                current={state.isPractice ? 0 : state.currentScenario + 1}
                total={orderedScenarios.length}
              />
            )}
          </div>
        </div>
      </header>

      <main
        key={fadeKey}
        className={`${isChatPhase ? "max-w-4xl" : "max-w-3xl"} mx-auto px-6 py-6 animate-[fadeIn_0.4s_ease]`}
      >
        {/* ===== START ===== */}
        {state.phase === "start" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                {scenario.title}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">
                  {state.isPractice
                    ? "연습 시나리오"
                    : `시나리오 ${state.currentScenario + 1}/${orderedScenarios.length}`}
                </span>
                {isTestAccount && state.isPractice && (
                  <button
                    onClick={handleSkipPractice}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                  >
                    <SkipForward size={12} />
                    테스트용: 연습 건너뛰기
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {!state.isPractice && condition !== "C" && (
                <TrolleyAnimation scenarioId={scenario.id} choice={state.choice} />
              )}
              <div className="p-5">
                <p className="text-sm text-gray-700 leading-relaxed">
                  {scenario.description}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                당신의 선택
              </label>
              <div className="flex gap-3">
                {scenario.choices.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      if (!choiceTimeRef.current) choiceTimeRef.current = now();
                      dispatch({ type: "SET_CHOICE", payload: c });
                    }}
                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                      state.choice === c
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  선택 이유
                </label>
                <span
                  className={`text-xs ${
                    state.reasoning.length > 0
                      ? "text-green-600"
                      : "text-gray-400"
                  }`}
                >
                  {state.reasoning.length}자
                </span>
              </div>
              <textarea
                value={state.reasoning}
                onChange={(e) =>
                  dispatch({ type: "SET_REASONING", payload: e.target.value })
                }
                placeholder="왜 이 선택을 했는지 설명해주세요"
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
            </div>

            <button
              onClick={handleStartDebate}
              disabled={!state.choice || !state.reasoning.trim()}
              className="w-full py-3 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              토론 시작
            </button>
          </div>
        )}

        {state.phase === "practice_notice" && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
            <h2 className="text-xl font-bold text-emerald-900 mb-2">연습 세션 완료</h2>
            <p className="text-sm text-emerald-800 mb-6">
              이제 본 실험을 시작합니다. 안내에 따라 시나리오를 진행해 주세요.
            </p>
            <button
              onClick={handleStartMainExperiment}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-medium text-white hover:bg-emerald-800 transition-colors"
            >
              <ArrowRight size={16} />
              본 실험 시작
            </button>
          </div>
        )}

        {/* ===== PHASE 1: STEEL-MANNING ===== */}
        {state.phase === "phase1" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {condition === "C"
                    ? "자유 대화"
                    : condition === "B"
                      ? "Phase 1: 논거 공격"
                      : "Phase 1: 논거 강화"}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {condition === "C"
                    ? "시나리오와 선택 이유를 바탕으로 자유롭게 대화하세요"
                    : condition === "B"
                      ? "AI가 당신의 선택을 정면으로 비판하며 핵심 전제를 흔듭니다"
                      : "AI가 당신의 선택을 함께 옹호하며 주장을 강화합니다"}
                </p>
              </div>
              {condition !== "C" && <PhaseIndicator currentPhase="phase1" />}
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold text-gray-700">{scenario.title}</p>
              <p className="mt-1 max-h-20 overflow-y-auto text-xs leading-relaxed text-gray-600">
                {scenario.description}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 h-[720px] flex flex-col">
              <ChatInterface
                messages={state.conversationHistory}
                onSendMessage={handlePhase1Message}
                isLoading={isLoading}
                phase="phase1"
                condition={condition}
                placeholder={
                  condition === "C"
                    ? "시나리오에 대해 자유롭게 생각을 말해보세요..."
                    : condition === "B"
                      ? "AI의 반박에 답하며 당신의 입장을 방어해보세요..."
                      : "당신의 생각을 더 발전시켜보세요..."
                }
              />
            </div>

            {isTestAccount && (
              <button
                onClick={handleSkipCurrentPhaseForTest}
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                테스트용: 현재 단계 건너뛰기
              </button>
            )}

            {condition === "C" ? (
              <button
                onClick={() => handleOpenPhase1Confirm("end_baseline")}
                disabled={phase1ActualUserInputCount < phase1RequiredInputCount || isLoading}
                className="w-full py-3.5 flex items-center justify-center gap-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-semibold hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle size={18} />
                대화 종료
              </button>
            ) : (
              <button
                onClick={() => handleOpenPhase1Confirm("go_phase2")}
                disabled={phase1ActualUserInputCount < phase1RequiredInputCount || isLoading}
                className="w-full py-3.5 flex items-center justify-center gap-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-semibold hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowRight size={18} />
                다음 단계로
              </button>
            )}
          </div>
        )}

        {/* ===== PHASE 2: EXTRACTION & REVERSAL ===== */}
        {condition !== "C" && state.phase === "phase2" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Phase 2: 내 주장 챗봇과 대결
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  당신의 초기 주장을 대변하는 챗봇을 논박해보세요
                </p>
              </div>
              <PhaseIndicator currentPhase="phase2" />
            </div>

            {isExtracting ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 flex flex-col items-center gap-3">
                <Loader2 className="animate-spin text-gray-400" size={28} />
                <p className="text-sm text-gray-500">논거를 분석하는 중...</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-semibold text-gray-700">{scenario.title}</p>
                  <p className="mt-1 max-h-20 overflow-y-auto text-xs leading-relaxed text-gray-600">
                    {scenario.description}
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <ArgumentCards arguments={state.extractedArguments} />
                </div>

                <div className="bg-gray-100 rounded-xl p-3 text-xs text-gray-700">
                  아래 챗봇은 당신의 초기 주장을 방어합니다. 직접
                  반박해보세요.
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-5 h-[750px] flex flex-col">
                  <ChatInterface
                    messages={state.phase2History}
                    onSendMessage={handlePhase2Message}
                    isLoading={isLoading}
                    phase="phase2"
                    condition={condition}
                    placeholder="초기 주장을 반박해보세요..."
                  />
                </div>

                {isTestAccount && (
                  <button
                    onClick={handleSkipCurrentPhaseForTest}
                    disabled={isLoading || isExtracting}
                    className="w-full py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    테스트용: 현재 단계 건너뛰기
                  </button>
                )}

                <button
                onClick={() => handleOpenPhase1Confirm("go_phase3")}
                  disabled={phase2UserCount < 3 || isLoading}
                className="w-full py-3.5 flex items-center justify-center gap-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-semibold hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                <ArrowRight size={18} />
                  메타 성찰 단계로
                </button>
              </>
            )}
          </div>
        )}

        {/* ===== PHASE 3: SOCRATIC DECONSTRUCTION ===== */}
        {condition !== "C" && state.phase === "phase3" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Phase 3: 논리 해체
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  방금 토론을 바탕으로 판단 기준을 명료화합니다
                </p>
              </div>
              <PhaseIndicator currentPhase="phase3" />
            </div>

            <details className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <summary className="cursor-pointer text-xs font-semibold text-gray-700">
                시나리오 다시 보기
              </summary>
              <p className="mt-2 max-h-24 overflow-y-auto text-xs leading-relaxed text-gray-600">
                {scenario.description}
              </p>
            </details>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 h-[680px] flex flex-col">
              <ChatInterface
                messages={state.phase3History}
                onSendMessage={handlePhase3Message}
                isLoading={isLoading}
                phase="phase3"
                condition={condition}
                placeholder="내가 무엇을 기준으로 최종 선택해야 하는지 답해보세요..."
              />
            </div>

            {isTestAccount && (
              <button
                onClick={handleSkipCurrentPhaseForTest}
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                테스트용: 현재 단계 건너뛰기
              </button>
            )}

            <button
              onClick={() => handleOpenPhase1Confirm("go_reflection")}
              disabled={phase3UserCount < 1 || isLoading}
              className="w-full py-3.5 flex items-center justify-center gap-2.5 bg-emerald-600 text-white rounded-2xl text-sm font-semibold hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowRight size={18} />
              최종 성찰로
            </button>
          </div>
        )}

        {state.phase === "scenario_break" && (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 p-8 text-center">
            <h2 className="text-xl font-bold text-teal-900 mb-2">시나리오 종료</h2>
            <p className="text-sm text-teal-800 mb-6">
              잠시 쉬신 뒤 다음 시나리오를 시작해 주세요.
            </p>
            <button
              onClick={handleStartNextScenario}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
            >
              <ArrowRight size={16} />
              다음 시나리오 시작
            </button>
          </div>
        )}

        {/* ===== REFLECTION: FINAL CHOICE  ===== */}
        {state.phase === "reflection" && (
          <div className="space-y-8">
            <div>
              <h2 className="text-lg font-bold text-gray-900">최종 성찰</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                토론을 거친 후, 최종 입장을 정리합니다
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                <p className="font-medium text-gray-900 mb-1">
                  {scenario.title}
                </p>
                <p>{scenario.description}</p>
              </div>

              <div className="text-sm text-gray-500">
                초기 선택:{" "}
                <span className="font-medium text-gray-900">
                  {state.choice}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                최종 선택
                {state.finalChoice !== state.choice && (
                  <span className="ml-2 text-amber-600 text-xs font-normal">
                    (초기 선택과 다릅니다)
                  </span>
                )}
              </label>
              <div className="flex gap-3">
                {scenario.choices.map((c) => (
                  <button
                    key={c}
                    onClick={() =>
                      dispatch({ type: "SET_FINAL_CHOICE", payload: c })
                    }
                    className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                      state.finalChoice === c
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
                    }`}
                  >
                    {c}
                    {c === state.choice && (
                      <span className="ml-1 text-xs opacity-60">(초기)</span>
                    )}
                  </button>
                ))}
              </div>
              {state.finalChoice !== state.choice && (
                <button
                  onClick={() =>
                    dispatch({ type: "SET_FINAL_CHOICE", payload: state.choice })
                  }
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                >
                  <RotateCcw size={12} />
                  초기 선택으로 되돌리기
                </button>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  최종 결정 이유
                </label>
                <span
                  className={`text-xs ${
                    state.finalReflection.length > 0
                      ? "text-green-600"
                      : "text-gray-400"
                  }`}
                >
                  {state.finalReflection.length}자
                </span>
              </div>
              <textarea
                value={state.finalReflection}
                onChange={(e) =>
                  dispatch({
                    type: "SET_FINAL_REFLECTION",
                    payload: e.target.value,
                  })
                }
                placeholder="토론을 거친 후 최종 결정의 이유를 적어주세요."
                rows={5}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
            </div>

            <button
              onClick={handleCompleteScenario}
              disabled={
                !state.finalChoice || !state.finalReflection.trim() || isCompleting
              }
              className="w-full py-3 flex items-center justify-center gap-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle size={16} />
              {isCompleting
                ? "저장 중..."
                : state.isPractice
                  ? "연습 완료 — 본 실험 안내로"
                  : state.currentScenario >= orderedScenarios.length - 1
                  ? "실험 완료 — 결과 보기"
                  : "시나리오 완료 — 다음으로"}
            </button>
          </div>
        )}
      </main>

      {phase1ConfirmAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={handleClosePhase1Confirm}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-gray-900 text-center">
              {phase1ConfirmAction === "end_baseline"
                ? "다음 단계로 진행하시겠습니까?"
                : "다음 단계로 진행하시겠습니까?"}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button
                onClick={handleClosePhase1Confirm}
                className="rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleConfirmPhase1Action}
                className="rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                다음 단계로
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
