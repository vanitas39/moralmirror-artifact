"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RadarChartView from "@/components/RadarChartView";
import { buildReflectionPrompt } from "@/lib/prompts";
import {
  Loader2,
  Download,
  LogOut,
  BookOpen,
  AlertCircle,
  Home,
} from "lucide-react";

function dedupeScenarioLogsById(logs) {
  const byId = new Map();
  for (const log of logs || []) {
    if (typeof log?.scenarioId !== "number") continue;
    byId.set(log.scenarioId, log);
  }
  return Array.from(byId.values());
}

export default function ResultPage() {
  const [scenarioLogs, setScenarioLogs] = useState(null);
  const [reflection, setReflection] = useState(null);
  const [reflectionLoading, setReflectionLoading] = useState(false);
  const [reflectionError, setReflectionError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const stored = sessionStorage.getItem("scenarioLogs");
    if (!stored) {
      router.push("/experiment");
      return;
    }
    const logs = dedupeScenarioLogsById(JSON.parse(stored));
    setScenarioLogs(logs);
    const resultCondition = logs?.[0]?.condition;
    if (resultCondition !== "C") {
      fetchReflection(logs);
    }
  }, [router]);

  async function fetchReflection(logs) {
    setReflectionLoading(true);
    setReflectionError("");
    try {
      const systemPrompt = buildReflectionPrompt(logs);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt,
          messages: [{ role: "user", content: "분석 결과를 제공해주세요." }],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      try {
        const parsed = JSON.parse(data.content);
        setReflection(parsed);
      } catch {
        const jsonMatch = data.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          setReflection(JSON.parse(jsonMatch[0]));
        } else {
          setReflection({
            dominantFrame: "분석 결과를 파싱하지 못했습니다.",
            strongestArgument: data.content,
            weakestArgument: "",
            reflection: "",
          });
        }
      }
    } catch {
      setReflectionError("AI 성찰 요약을 생성하지 못했습니다.");
    }
    setReflectionLoading(false);
  }

  function handleExport() {
    if (!scenarioLogs) return;
    const presentedScenarioOrder = scenarioLogs
      .map((log) => log.scenarioId)
      .filter((id) => typeof id === "number")
      .join("-");
    const exportData = {
      exportedAt: new Date().toISOString(),
      presentedScenarioOrder,
      participantData: scenarioLogs.map((log) => ({
        presentedOrderIndex:
          scenarioLogs.findIndex((item) => item.scenarioId === log.scenarioId) + 1,
        scenarioId: log.scenarioId,
        scenarioTitle: log.scenario?.title,
        initialChoice: log.initialChoice || log.choice,
        initialReasoning: log.initialReasoning,
        phase1Log: log.phase1Log,
        phase2Log: log.phase2Log,
        extractedArguments: log.extractedArguments,
        selfRebuttal: log.selfRebuttal,
        phase3Log: log.phase3Log,
        finalChoice: log.finalChoice,
        finalReflection: log.finalReflection,
        ethicsScores: log.ethicsScores,
        ethicsScore: log.ethicsScore,
        probeMetrics: log.probeMetrics,
        timing: log.timing,
        phase1ExchangeCount: log.phase1ExchangeCount,
        phase2ExchangeCount: log.phase2ExchangeCount,
        phase3ExchangeCount: log.phase3ExchangeCount,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `moral-mirror-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    sessionStorage.removeItem("experimentStateV1");
    sessionStorage.removeItem("scenarioLogs");
    router.push("/login");
  }

  async function handleGoHome() {
    await handleLogout();
  }

  if (!scenarioLogs) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  const resultCondition = scenarioLogs?.[0]?.condition;
  const isBaselineResult = resultCondition === "C";
  const shouldShowReflection = resultCondition !== "C";

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
            <span className="text-sm font-bold text-gray-900">
              Moral Mirror — 결과 분석
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <LogOut size={14} />
            종료
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {!isBaselineResult && (
          <>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                당신의 도덕적 자화상
              </h1>
              <p className="text-sm text-gray-500">
                3개 딜레마 시나리오를 통해 분석되었습니다
              </p>
            </div>

            <RadarChartView scenarioLogs={scenarioLogs} />

            {/* 선택 요약 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h3 className="text-base font-bold text-gray-900 mb-4">
                시나리오별 선택
              </h3>
              <div className="space-y-3">
                {scenarioLogs.map((log, idx) => {
                  const initial = log.initialChoice || log.choice;
                  const final = log.finalChoice || initial;
                  const changed = initial !== final;
                  return (
                    <div
                      key={`${log.scenarioId}-${log.completedAt || "na"}-${idx}`}
                      className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0"
                    >
                      <span className="text-sm text-gray-700">
                        {log.scenarioId}. {log.scenario.title}
                      </span>
                      <div className="flex items-center gap-2">
                        {changed && (
                          <>
                            <span className="text-xs text-gray-400 line-through">
                              {initial}
                            </span>
                            <span className="text-xs text-gray-400">→</span>
                          </>
                        )}
                        <span
                          className={`text-sm font-medium px-3 py-1 rounded-full ${
                            changed
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-100 text-gray-900"
                          }`}
                        >
                          {final}
                        </span>
                        {log.timing?.totalDurationMs && (
                          <span className="text-xs text-gray-400">
                            {Math.round(log.timing.totalDurationMs / 1000)}초
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {shouldShowReflection && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BookOpen size={18} />
              AI 성찰 요약
            </h3>
            {reflectionLoading ? (
              <div className="flex items-center gap-3 py-6 justify-center">
                <Loader2 className="animate-spin text-gray-400" size={20} />
                <span className="text-sm text-gray-500">
                  성찰 요약을 생성하는 중...
                </span>
              </div>
            ) : reflectionError ? (
              <div className="flex items-center gap-2 text-red-600 text-sm py-4">
                <AlertCircle size={16} />
                <span>{reflectionError}</span>
                <button
                  onClick={() => fetchReflection(scenarioLogs)}
                  className="ml-2 underline hover:no-underline"
                >
                  재시도
                </button>
              </div>
            ) : reflection ? (
              <dl className="space-y-4">
                <div>
                  <dt className="text-xs font-medium text-gray-500 mb-1">
                    지배적 윤리 프레임
                  </dt>
                  <dd className="text-sm text-gray-900">
                    {reflection.dominantFrame}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 mb-1">
                    가장 강하게 방어한 논거
                  </dt>
                  <dd className="text-sm text-gray-900">
                    {reflection.strongestArgument}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 mb-1">
                    가장 취약했던 논거
                  </dt>
                  <dd className="text-sm text-gray-900">
                    {reflection.weakestArgument}
                  </dd>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <dt className="text-xs font-medium text-blue-700 mb-1">
                    성찰 제언
                  </dt>
                  <dd className="text-sm text-blue-900">
                    {reflection.reflection}
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={handleExport}
            className="flex-1 py-3 flex items-center justify-center gap-2 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <Download size={16} />
            데이터 내보내기 (JSON)
          </button>
          <button
            onClick={handleLogout}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            실험 종료
          </button>
        </div>
      </main>
    </div>
  );
}
