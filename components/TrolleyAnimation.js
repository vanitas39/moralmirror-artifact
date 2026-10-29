"use client";

import { useEffect, useState } from "react";

function isLeverChoice(choice = "") {
  return String(choice ?? "").includes("레버를 당긴다");
}

function isHeinzSteal(choice = "") {
  return String(choice ?? "").includes("약을 훔친다");
}

function isWhistleReport(choice = "") {
  return String(choice ?? "").includes("신고한다");
}

export default function TrolleyAnimation({ scenarioId, choice }) {
  const [displayedChoice, setDisplayedChoice] = useState(String(choice || ""));
  const [isResetting, setIsResetting] = useState(false);
  const [heinzStealDone, setHeinzStealDone] = useState(false);
  const animationStyles = (
    <style jsx>{`
      @keyframes handshake-pop {
        0% {
          transform: scale(0);
          opacity: 0;
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }
      @keyframes handshake-sway {
        0% {
          transform: rotate(-10deg);
        }
        100% {
          transform: rotate(10deg);
        }
      }
      @keyframes heinz-hand-trip {
        0% {
          transform: translate(0, 0);
        }
        35% {
          transform: translate(-192px, 4px);
        }
        55% {
          transform: translate(-192px, 4px);
        }
        100% {
          transform: translate(0, 0);
        }
      }
      @keyframes heinz-pill-appear {
        0% {
          opacity: 0;
          transform: translateY(2px) scale(0.92);
        }
        54% {
          opacity: 0;
          transform: translateY(2px) scale(0.92);
        }
        68% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes heinz-cabinet-pill {
        0% {
          opacity: 1;
        }
        58% {
          opacity: 1;
        }
        68% {
          opacity: 0;
        }
        100% {
          opacity: 0;
        }
      }
      @keyframes whistle-letter-route {
        0% {
          transform: translate(0px, 0px);
        }
        100% {
          transform: translate(155px, -42px);
        }
      }
      @keyframes whistle-police-route {
        0% {
          transform: translate(0px, 0px);
          opacity: 0;
        }
        12% {
          opacity: 1;
        }
        100% {
          transform: translate(170px, 8px);
          opacity: 1;
        }
      }
      @keyframes siren-blink {
        0% {
          opacity: 1;
        }
        50% {
          opacity: 0.2;
        }
        100% {
          opacity: 1;
        }
      }
    `}</style>
  );

  useEffect(() => {
    const nextChoice = String(choice || "");

    // 버튼 선택이 바뀌면 항상 출발점으로 리셋 후 재생
    setIsResetting(true);
    setDisplayedChoice("");

    if (!nextChoice) {
      const resetOnlyTimer = window.setTimeout(() => {
        setIsResetting(false);
      }, 220);
      return () => window.clearTimeout(resetOnlyTimer);
    }

    const timer = window.setTimeout(() => {
      setDisplayedChoice(nextChoice);
      setIsResetting(false);
    }, 260);

    return () => window.clearTimeout(timer);
  }, [choice, scenarioId]);

  useEffect(() => {
    if (scenarioId !== 2) {
      setHeinzStealDone(false);
      return;
    }

    const stealSelected = isHeinzSteal(displayedChoice);
    setHeinzStealDone(false);
    if (!stealSelected || isResetting) return;

    const timer = window.setTimeout(() => {
      setHeinzStealDone(true);
    }, 1700);

    return () => window.clearTimeout(timer);
  }, [scenarioId, displayedChoice, isResetting]);

  if (scenarioId === 1) {
    const pending = !displayedChoice;
    const takesBranch = isLeverChoice(displayedChoice);

    const hitMainTrackGroup = !pending && !takesBranch;
    const hitBranchTrackGroup = !pending && takesBranch;

    // 사람에게 닿기 전 위치에서 멈춤
    const trainClass = pending
      ? "left-[14%] top-[63%]"
      : takesBranch
        ? "left-[65%] top-[36%]"
        : "left-[65%] top-[63%]";

    return (
      <div className="relative h-[190px] w-full overflow-hidden rounded-t-2xl bg-gray-100">
        <svg viewBox="0 0 900 260" className="h-full w-full">
          {/* 본선 (왼쪽 -> 분기점) */}
          <line x1="40" y1="168" x2="360" y2="168" stroke="#4b5563" strokeWidth="4" />
          <line x1="40" y1="178" x2="360" y2="178" stroke="#4b5563" strokeWidth="4" />

          {/* Y 분기 상단 선로 (1명 방향) */}
          <line x1="360" y1="168" x2="780" y2="88" stroke="#4b5563" strokeWidth="4" />
          <line x1="360" y1="178" x2="780" y2="98" stroke="#4b5563" strokeWidth="4" />

          {/* Y 분기 직진 선로 (5명 방향) */}
          <line x1="360" y1="168" x2="830" y2="168" stroke="#4b5563" strokeWidth="4" />
          <line x1="360" y1="178" x2="830" y2="178" stroke="#4b5563" strokeWidth="4" />

          {/* 분기점 표시 */}
          <circle cx="360" cy="173" r="7" fill="#374151" />
        </svg>

        <div
          className={`absolute h-8 w-11 -translate-y-1/2 rounded-md border border-red-700 bg-red-500 shadow-sm ${
            pending || isResetting ? "transition-none" : "transition-all duration-1000"
          } ${trainClass}`}
        />
        <div
          className={`absolute h-1.5 w-12 -translate-y-1/2 rounded-full bg-red-900/30 ${
            pending || isResetting ? "transition-none" : "transition-all duration-1000"
          } ${trainClass}`}
        />

        {[...Array(5)].map((_, i) => (
          <span
            key={`worker-${i}`}
            className={`absolute top-[63%] text-2xl transition-opacity duration-500 ${
              hitMainTrackGroup ? "opacity-20" : "opacity-100"
            }`}
            style={{ left: `${77 + i * 3.3}%` }}
          >
            👷
          </span>
        ))}

        <span
          className={`absolute right-[8.2%] top-[29%] text-2xl transition-opacity duration-500 ${
            hitBranchTrackGroup ? "opacity-20" : "opacity-100"
          }`}
        >
          👷
        </span>

        {hitMainTrackGroup && (
          <span className="absolute left-[83.5%] top-[56%] text-xl font-bold text-red-600">
            ✕
          </span>
        )}
        {hitBranchTrackGroup && (
          <span className="absolute right-[8.4%] top-[22%] text-xl font-bold text-red-600">
            ✕
          </span>
        )}
      </div>
    );
  }

  if (scenarioId === 2) {
    const pending = !displayedChoice;
    const isSteal = isHeinzSteal(displayedChoice);
    const isNotSteal = !pending && !isSteal;
    const spouseEmoji = isSteal ? (heinzStealDone ? "😊" : "😵‍💫") : isNotSteal ? "😵" : "😵‍💫";

    return (
      <div className="relative h-[190px] w-full overflow-hidden rounded-t-2xl bg-gray-100">
        <svg viewBox="0 0 900 240" className="h-full w-full">
          <rect x="300" y="46" width="300" height="2" fill="#9ca3af" />
        </svg>
        <div className="absolute left-[8%] top-[28%] h-[86px] w-[170px] rounded-xl border-2 border-slate-500 bg-slate-200">
          <span className="absolute left-[14%] top-[20%] text-3xl">🗄️</span>
        </div>
        <div className="absolute right-[8%] top-[28%] h-[86px] w-[170px] rounded-xl border-2 border-slate-500 bg-slate-200">
          <span className="absolute left-[10%] top-[20%] text-3xl">🛏️</span>
          <span
            className={`absolute right-[12%] top-[20%] text-3xl ${
              isNotSteal
                ? "opacity-20 transition-opacity duration-[1500ms]"
                : "opacity-100 transition-opacity duration-500"
            }`}
          >
            {spouseEmoji}
          </span>
          {isSteal && (
            <span className="absolute right-[8%] top-[10%] text-2xl text-emerald-600 animate-pulse">
              💚
            </span>
          )}
          {isNotSteal && (
            <span className="absolute right-[8%] top-[10%] text-2xl font-bold text-red-600">
              ✕
            </span>
          )}
        </div>
        <span
          className={`absolute left-[16%] top-[52%] text-2xl ${
            pending ? "animate-pulse" : ""
          } ${
            pending || isResetting
              ? "transition-none"
              : "transition-opacity duration-300"
          }`}
          style={
            isSteal && !isResetting
              ? { animation: "heinz-cabinet-pill 1.7s ease-in-out forwards" }
              : undefined
          }
        >
          💊
        </span>
        <div
          className={`absolute left-[43%] top-[49%] flex items-center gap-1 text-3xl ${
            pending || isResetting
              ? "transition-none"
              : ""
          }`}
          style={
            isSteal && !isResetting
              ? { animation: "heinz-hand-trip 1.7s ease-in-out" }
              : undefined
          }
        >
          <span>✋</span>
          {isSteal && (
            <span
              className="text-2xl"
              style={
                !isResetting
                  ? { animation: "heinz-pill-appear 1.7s ease-in-out forwards" }
                  : undefined
              }
            >
              💊
            </span>
          )}
        </div>
        <span
          className={`absolute left-[16.6%] top-[46.5%] text-2xl ${
            isNotSteal ? "opacity-100 transition-opacity duration-300" : "opacity-0 transition-opacity duration-200"
          }`}
        >
          🔒
        </span>

        {animationStyles}
      </div>
    );
  }

  if (scenarioId === 3) {
    const pending = !displayedChoice;
    const isReport = isWhistleReport(displayedChoice);
    const isNotReport = !pending && !isReport;
    const selfEmoji = isNotReport ? "🤫" : "🙂";

    return (
      <div className="relative h-[190px] w-full overflow-hidden rounded-t-2xl bg-gray-100">
        <svg viewBox="0 0 900 240" className="h-full w-full">
          <rect x="370" y="56" width="160" height="108" rx="12" fill="#e2e8f0" stroke="#64748b" strokeWidth="3" />
        </svg>
        <span className="absolute left-[24%] top-[55%] text-3xl">{selfEmoji}</span>
        {isReport ? (
          <div className="absolute right-[21.5%] top-[47.5%] h-16 w-16 rounded-md border-2 border-slate-500 bg-white/70">
            <div className="absolute left-[12px] top-[5px] h-[52px] w-[3px] rounded bg-slate-600" />
            <div className="absolute left-[23px] top-[5px] h-[52px] w-[3px] rounded bg-slate-600" />
            <div className="absolute left-[34px] top-[5px] h-[52px] w-[3px] rounded bg-slate-600" />
            <div className="absolute left-[45px] top-[5px] h-[52px] w-[3px] rounded bg-slate-600" />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[44%] text-3xl">
              🧑
            </span>
          </div>
        ) : (
          <span className="absolute right-[24%] top-[55%] text-3xl">🧑</span>
        )}
        <span className="absolute left-[47%] top-[38%] text-3xl">🏢</span>

        <span
          className={`absolute left-[30%] top-[58%] text-2xl ${
            pending || isResetting ? "transition-none" : "transition-all duration-900"
          }`}
          style={
            isReport && !isResetting
              ? { animation: "whistle-letter-route 0.9s ease-in-out forwards" }
              : undefined
          }
        >
          ✉️
        </span>

        {isReport && (
          <div
            className="absolute left-[49%] top-[37%]"
            style={
              !isResetting
                ? { animation: "whistle-police-route 0.85s ease-in-out 0.95s forwards" }
                : undefined
            }
          >
            <span
              className="absolute left-[2px] top-[-18px] text-xl"
              style={{ animation: "siren-blink 0.35s ease-in-out infinite" }}
            >
              🚨
            </span>
            <span className="text-2xl">🚔</span>
          </div>
        )}

        {isNotReport && (
          <>
            <span className="absolute left-[31.2%] top-[55%] text-xl font-bold text-red-600">
              ✕
            </span>
            <span className="absolute right-[29%] top-[57%] text-2xl">
              🛡️
            </span>
          </>
        )}
        {animationStyles}
      </div>
    );
  }

  return null;
}
