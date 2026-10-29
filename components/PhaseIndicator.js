"use client";

const PHASE_LABELS = ["논거 강화", "논거 반전", "논리 해체"];

export default function PhaseIndicator({ currentPhase }) {
  const phaseIndex =
    currentPhase === "phase1" ? 0 : currentPhase === "phase2" ? 1 : 2;

  return (
    <div className="flex items-center gap-4">
      {PHASE_LABELS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full transition-colors duration-300 ${
              i <= phaseIndex ? "bg-gray-900" : "bg-gray-300"
            }`}
          />
          <span
            className={`text-xs transition-colors duration-300 ${
              i <= phaseIndex
                ? "text-gray-900 font-medium"
                : "text-gray-400"
            }`}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
