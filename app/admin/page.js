"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { Plus, ToggleLeft, ToggleRight, RefreshCw } from "lucide-react";

const CONDITIONS = ["B", "C"];
const SCENARIO_ORDERS = ["1-2-3", "1-3-2", "2-1-3", "2-3-1", "3-1-2", "3-2-1"];
const TARGET_PER_SLOT = 3;

function normalizeScenarioOrder(order) {
  return SCENARIO_ORDERS.includes(order) ? order : "1-2-3";
}

function getMainBlockOrderOverride(participantId = "") {
  const normalized = String(participantId || "").trim().toLowerCase();
  const match = normalized.match(/^p(\d+)$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1 || n > 36) return null;
  if (n <= 6) return "1-2-3";
  if (n <= 12) return "2-1-3";
  if (n <= 18) return "1-3-2";
  if (n <= 24) return "2-3-1";
  if (n <= 30) return "3-1-2";
  return "3-2-1";
}

function getTestSlotOverride(participantId = "") {
  const normalized = String(participantId || "").trim().toLowerCase();
  const match = normalized.match(/^t(\d+)$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  return {
    condition: n <= 6 ? "B" : "C",
    scenario_order: SCENARIO_ORDERS[(n - 1) % SCENARIO_ORDERS.length],
  };
}

function buildSlotCounts(participants = []) {
  const counts = {};
  CONDITIONS.forEach((condition) => {
    SCENARIO_ORDERS.forEach((order) => {
      counts[`${condition}|${order}`] = 0;
    });
  });
  (participants || []).forEach((p) => {
    const condition = CONDITIONS.includes(p.condition) ? p.condition : null;
    const order = normalizeScenarioOrder(p.scenario_order);
    if (condition) {
      counts[`${condition}|${order}`] += 1;
    }
  });
  return counts;
}

function pickBalancedSlot(participants, participantId) {
  const testOverride = getTestSlotOverride(participantId);
  if (testOverride) return testOverride;

  const counts = buildSlotCounts(participants);
  const fixedOrder = getMainBlockOrderOverride(participantId);
  if (fixedOrder) {
    const bCount = counts[`B|${fixedOrder}`] ?? 0;
    const cCount = counts[`C|${fixedOrder}`] ?? 0;
    return {
      condition: bCount <= cCount ? "B" : "C",
      scenario_order: fixedOrder,
    };
  }

  let assignedCondition = CONDITIONS[0];
  let assignedOrder = SCENARIO_ORDERS[0];
  let minCount = Number.POSITIVE_INFINITY;

  for (const condition of CONDITIONS) {
    for (const order of SCENARIO_ORDERS) {
      const count = counts[`${condition}|${order}`] ?? 0;
      if (count < TARGET_PER_SLOT && count < minCount) {
        minCount = count;
        assignedCondition = condition;
        assignedOrder = order;
      }
    }
  }

  if (!Number.isFinite(minCount)) {
    for (const condition of CONDITIONS) {
      for (const order of SCENARIO_ORDERS) {
        const count = counts[`${condition}|${order}`] ?? 0;
        if (count < minCount) {
          minCount = count;
          assignedCondition = condition;
          assignedOrder = order;
        }
      }
    }
  }

  return { condition: assignedCondition, scenario_order: assignedOrder };
}

export default function AdminPage() {
  const [participants, setParticipants] = useState([]);
  const [newId, setNewId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  const fetchParticipants = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from("participants")
      .select("*")
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError("참가자 목록을 불러올 수 없습니다.");
    } else {
      setParticipants(data || []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchParticipants();
  }, [fetchParticipants]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newId.trim()) return;

    setCreating(true);
    setError("");

    const assignedSlot = pickBalancedSlot(participants, newId.trim());

    const { error: insertError } = await supabase
      .from("participants")
      .insert({
        participant_id: newId.trim(),
        condition: assignedSlot.condition,
        scenario_order: assignedSlot.scenario_order,
      });

    if (insertError) {
      setError(
        insertError.code === "23505"
          ? "이미 존재하는 참가자 ID입니다."
          : "생성에 실패했습니다."
      );
    } else {
      setNewId("");
      fetchParticipants();
    }
    setCreating(false);
  }

  async function toggleActive(participantId, currentActive) {
    const { error: updateError } = await supabase
      .from("participants")
      .update({ is_active: !currentActive })
      .eq("participant_id", participantId);

    if (updateError) {
      setError("상태 변경에 실패했습니다.");
    } else {
      fetchParticipants();
    }
  }

  const slotCounts = buildSlotCounts(participants);
  const slotStatusText = SCENARIO_ORDERS.map((order) => {
    const b = slotCounts[`B|${order}`] ?? 0;
    const c = slotCounts[`C|${order}`] ?? 0;
    const done = b >= TARGET_PER_SLOT && c >= TARGET_PER_SLOT;
    return `${order}: B(${b}/${TARGET_PER_SLOT}) C(${c}/${TARGET_PER_SLOT}) ${done ? "✅" : ""}`.trim();
  }).join(" | ");

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-2xl mx-auto px-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">관리자 페이지</h1>
        <p className="text-sm text-gray-500 mb-8">참가자 ID 생성 및 관리</p>
        <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
          순서 현황: {slotStatusText}
        </div>
        <div className="mb-6 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          테스트 ID 빠른 매핑: t01~t06 = 조건 B 순서 6개, t07~t12 = 조건 C 순서 6개
        </div>
        <div className="mb-6 rounded-lg border border-violet-100 bg-violet-50 px-4 py-3 text-xs text-violet-800">
          메인 ID 고정 규칙: P01~P36은 6명 블록 순서 고정
          (1-2-3 → 2-1-3 → 1-3-2 → 2-3-1 → 3-1-2 → 3-2-1), 조건만 B/C 균등 배정
        </div>

        <form
          onSubmit={handleCreate}
          className="flex gap-3 mb-8"
        >
          <input
            type="text"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="새 참가자 ID (예: P001)"
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            disabled={creating}
          />
          <button
            type="submit"
            disabled={creating || !newId.trim()}
            className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            <Plus size={16} />
            생성
          </button>
        </form>

        {error && (
          <div className="mb-4 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-700">
              참가자 목록 ({participants.length})
            </span>
            <button
              onClick={fetchParticipants}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              불러오는 중...
            </div>
          ) : participants.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              등록된 참가자가 없습니다.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {participants.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between px-5 py-3.5"
                >
                  <div>
                    <span className="font-mono text-sm font-medium text-gray-900">
                      {p.participant_id}
                    </span>
                    <span className="ml-2 text-xs font-semibold text-indigo-600">
                      [{p.condition || "-"}]
                    </span>
                    <span className="ml-2 text-xs font-semibold text-emerald-600">
                      [{normalizeScenarioOrder(p.scenario_order)}]
                    </span>
                    <span className="ml-3 text-xs text-gray-400">
                      {new Date(p.created_at).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleActive(p.participant_id, p.is_active)}
                    className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                      p.is_active
                        ? "bg-green-50 text-green-700 hover:bg-green-100"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {p.is_active ? (
                      <ToggleRight size={14} />
                    ) : (
                      <ToggleLeft size={14} />
                    )}
                    {p.is_active ? "활성" : "비활성"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
