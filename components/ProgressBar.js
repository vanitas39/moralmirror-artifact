"use client";

export default function ProgressBar({ current, total }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-gray-500">
        시나리오 {current}/{total}
      </span>
      <div className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${
              i < current ? "bg-gray-900" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
