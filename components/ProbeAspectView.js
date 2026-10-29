"use client";

const ASPECT_LABELS = [
  ["EthicalStance", "윤리적 입장"],
  ["MoralTension", "도덕적 긴장"],
  ["AnalogicalReasoning", "유비적 추론"],
  ["Feeling", "감정"],
  ["DecisionJustification", "결정 정당화"],
  ["Insight", "통찰"],
  ["AlternativePerspective", "대안 관점"],
];

export default function ProbeAspectView({ scenarioLogs }) {
  const totals = {
    EthicalStance: 0,
    MoralTension: 0,
    AnalogicalReasoning: 0,
    Feeling: 0,
    DecisionJustification: 0,
    Insight: 0,
    AlternativePerspective: 0,
  };

  let breadthSum = 0;
  let depthSum = 0;
  let n = 0;

  scenarioLogs.forEach((log) => {
    const pm = log.probeMetrics || {};
    totals.EthicalStance += pm.ethicalStanceCount || 0;
    totals.MoralTension += pm.moralTensionCount || 0;
    totals.AnalogicalReasoning += pm.analogicalReasoningCount || 0;
    totals.Feeling += pm.feelingCount || 0;
    totals.DecisionJustification += pm.decisionJustificationCount || 0;
    totals.Insight += pm.insightCount || 0;
    totals.AlternativePerspective += pm.alternativePerspectiveCount || 0;

    if (typeof pm.probeBreadth === "number") {
      breadthSum += pm.probeBreadth;
      n += 1;
    }
    if (typeof pm.probeDepth === "number") {
      depthSum += pm.probeDepth;
    }
  });

  const maxVal = Math.max(...Object.values(totals), 1);
  const avgBreadth = n > 0 ? (breadthSum / n).toFixed(1) : "0.0";
  const avgDepth = n > 0 ? Math.round(depthSum / n) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-900">PROBE Aspect 분석</h3>
        <div className="text-xs text-gray-500">
          평균 Breadth {avgBreadth} / 7 · 평균 Depth {avgDepth}%
        </div>
      </div>

      <div className="space-y-3">
        {ASPECT_LABELS.map(([key, label]) => {
          const value = totals[key];
          const width = Math.max(6, Math.round((value / maxVal) * 100));
          return (
            <div key={key} className="grid grid-cols-[140px_1fr_36px] items-center gap-3">
              <span className="text-xs text-gray-600">{label}</span>
              <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gray-800"
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 text-right">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
