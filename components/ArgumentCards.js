"use client";

import { Lightbulb } from "lucide-react";

export default function ArgumentCards({ arguments: args }) {
  if (!args || args.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
        <Lightbulb size={16} />
        당신의 핵심 논거
      </h3>
      <div className="grid gap-3">
        {args.map((arg, i) => (
          <div
            key={i}
            className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900"
          >
            <span className="font-semibold text-amber-700 mr-2">#{i + 1}</span>
            {arg}
          </div>
        ))}
      </div>
    </div>
  );
}
