"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [participantId, setParticipantId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!participantId.trim()) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: participantId.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "로그인에 실패했습니다.");
        return;
      }

      if (typeof window !== "undefined") {
        sessionStorage.removeItem("experimentStateV1");
        sessionStorage.removeItem("scenarioLogs");
      }

      router.push("/experiment");
    } catch {
      setError("서버에 연결할 수 없습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md px-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Moral Mirror
          </h1>
          <p className="text-gray-500 text-sm">
            AI 윤리 교육 연구 프로토타입
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8"
        >
          <label
            htmlFor="participantId"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            참가자 ID
          </label>
          <input
            id="participantId"
            type="text"
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
            placeholder="예: P01"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
            disabled={loading}
            autoFocus
          />

          {error && (
            <div className="mt-3 flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !participantId.trim()}
            className="mt-6 w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-3 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            ) : (
              <LogIn size={16} />
            )}
            {loading ? "확인 중..." : "입장하기"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          관리자로부터 부여받은 참가자 ID를 입력하세요
        </p>
      </div>
    </div>
  );
}
