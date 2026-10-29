"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ETHICS_FRAMES } from "@/constants/scenarios";

function normalizeScore(frame, scenarioLogs) {
  const totalScore = scenarioLogs.reduce((sum, log) => {
    return sum + (log.ethicsScore?.[frame] || 0);
  }, 0);

  const maxSum = scenarioLogs.reduce((sum, log) => {
    const allMaps = Object.values(log.scenario.ethicsMap);
    const maxVal = Math.max(...allMaps.map((m) => m[frame] || 0));
    return sum + maxVal;
  }, 0);

  return maxSum === 0 ? 0 : Math.round((totalScore / maxSum) * 10);
}

function computeAdjustedScores(scenarioLogs) {
  if (scenarioLogs[0]?.ethicsScores) {
    const adjusted = {};
    ETHICS_FRAMES.forEach((frame) => {
      const totalInitial = scenarioLogs.reduce((sum, log) => {
        const s = log.ethicsScores?.find((e) => e.frame === frame);
        return sum + (s?.adjustedScore ?? s?.initialScore ?? 0);
      }, 0);
      const maxSum = scenarioLogs.reduce((sum, log) => {
        const allMaps = Object.values(log.scenario.ethicsMap);
        return sum + Math.max(...allMaps.map((m) => m[frame] || 0));
      }, 0);
      adjusted[frame] = maxSum === 0 ? 0 : Math.round((totalInitial / maxSum) * 10);
    });
    return adjusted;
  }

  const adjusted = {};
  ETHICS_FRAMES.forEach((frame) => {
    adjusted[frame] = normalizeScore(frame, scenarioLogs);
  });

  scenarioLogs.forEach((log) => {
    if (log.phase3Log?.length > 0) {
      const aiMessages = log.phase3Log.filter((m) => m.role === "assistant");
      const hasValidRebuttal = aiMessages.some((m) =>
        m.content.includes("타당합니다")
      );
      if (hasValidRebuttal && log.ethicsScore) {
        Object.entries(log.ethicsScore).forEach(([frame, score]) => {
          if (score >= 3) {
            adjusted[frame] = Math.max(0, (adjusted[frame] || 0) - 1);
          }
        });
      }
    }
  });

  return adjusted;
}

export default function RadarChartView({ scenarioLogs }) {
  const initialScores = {};
  ETHICS_FRAMES.forEach((frame) => {
    initialScores[frame] = normalizeScore(frame, scenarioLogs);
  });

  const adjustedScores = computeAdjustedScores(scenarioLogs);

  const chartData = ETHICS_FRAMES.map((frame) => ({
    subject: frame,
    initial: initialScores[frame],
    adjusted: adjustedScores[frame],
    fullMark: 10,
  }));

  const conflictFrame = ETHICS_FRAMES.reduce(
    (max, frame) => {
      const delta = Math.abs(initialScores[frame] - adjustedScores[frame]);
      return delta > max.delta ? { frame, delta } : max;
    },
    { frame: "", delta: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-base font-bold text-gray-900 mb-4">
          도덕적 자화상
        </h3>
        <ResponsiveContainer width="100%" height={380}>
          <RadarChart data={chartData}>
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fontSize: 12, fill: "#374151" }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 10]}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
            />
            <Radar
              name="초기 성향"
              dataKey="initial"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.3}
            />
            <Radar
              name="성찰 후 보정"
              dataKey="adjusted"
              stroke="#f97316"
              fill="#f97316"
              fillOpacity={0.2}
            />
            <Legend
              wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {conflictFrame.delta > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-amber-800 mb-1">
            충돌 지점 분석
          </h4>
          <p className="text-sm text-amber-700">
            당신은 <strong>{conflictFrame.frame}</strong> 가치를 강하게
            주장했지만, 스스로의 반박 과정에서 이 부분이 가장 많이
            흔들렸습니다. (변화량: {conflictFrame.delta}점)
          </p>
        </div>
      )}
    </div>
  );
}
