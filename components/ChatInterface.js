"use client";

import { useState, useRef, useEffect } from "react";
import { Send, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

function splitIntoReadableLines(text) {
  return String(text || "")
    .split(/\n|(?<=[.!?])\s+|(?<=다\.)\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasMarkdownSyntax(text) {
  const value = String(text || "");
  return /(^|\n)\s*([*-] |\d+\. |```|>|#{1,6}\s)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`/.test(
    value
  );
}

function normalizeEscapedMarkdown(text) {
  const value = String(text ?? "");
  // 모델이 \*\*강조\*\* 같이 이스케이프해서 보내는 경우를 보정
  return value.replace(/\\([`*_~[\]()#+\-!>])/g, "$1");
}

function buildBubbleItems(messages, condition, phase) {
  const isBaseline = condition === "C";
  return messages.flatMap((msg, msgIdx) => {
    const normalizedContent =
      isBaseline && msg.role === "assistant"
        ? normalizeEscapedMarkdown(msg.content)
        : msg.content;

    if (msg.role !== "assistant") {
      return [
        {
          key: `m-${msgIdx}`,
          role: msg.role,
          content: normalizedContent,
        },
      ];
    }

    if (isBaseline) {
      return [
        {
          key: `m-${msgIdx}`,
          role: msg.role,
          content: normalizedContent,
        },
      ];
    }

    // Phase 2는 조건 B 포함 토론 가독성을 위해 Markdown이 섞여도 문장 분할을 유지한다.
    if (phase !== "phase2" && hasMarkdownSyntax(msg.content)) {
      return [
        {
          key: `m-${msgIdx}`,
          role: msg.role,
          content: normalizedContent,
        },
      ];
    }

    const lines = splitIntoReadableLines(normalizedContent);
    if (lines.length === 0) {
      return [
        {
          key: `m-${msgIdx}-0`,
          role: msg.role,
          content: normalizedContent,
        },
      ];
    }

    return lines.map((line, lineIdx) => ({
      key: `m-${msgIdx}-${lineIdx}`,
      role: msg.role,
      content: line,
    }));
  });
}

export default function ChatInterface({
  messages,
  onSendMessage,
  isLoading,
  phase = "phase1",
  condition = "A",
  placeholder = "메시지를 입력하세요...",
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!isLoading) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isLoading]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    setError("");
    const userMessage = input.trim();
    setInput("");

    try {
      await onSendMessage(userMessage);
    } catch {
      setError("응답을 받지 못했습니다. 다시 시도해주세요.");
    }
  }

  function handleInputKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-4 min-h-0">
        {buildBubbleItems(messages, condition, phase).map((item, idx, items) => {
          return (
            <div
              key={item.key}
              className={`flex ${
                item.role === "user"
                  ? "justify-end"
                  : "justify-start items-start"
              }`}
            >
              <div
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  item.role === "user"
                    ? "max-w-[80%] bg-gray-900 text-white rounded-br-md"
                    : "max-w-[80%] bg-gray-100 text-gray-800 rounded-bl-md"
                }`}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  components={{
                    p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                    ul: ({ ...props }) => <ul className="mb-2 list-disc pl-5 last:mb-0" {...props} />,
                    ol: ({ ...props }) => <ol className="mb-2 list-decimal pl-5 last:mb-0" {...props} />,
                    li: ({ ...props }) => <li className="mb-1 last:mb-0" {...props} />,
                    pre: ({ ...props }) => (
                      <pre
                        className={`mb-2 overflow-x-auto rounded-md p-2 text-xs ${
                          item.role === "user" ? "bg-gray-800" : "bg-gray-200"
                        }`}
                        {...props}
                      />
                    ),
                    code: ({ inline, className, children, ...props }) =>
                      inline ? (
                        <code
                          className={`rounded px-1 py-0.5 text-xs ${
                            item.role === "user" ? "bg-gray-800" : "bg-gray-200"
                          }`}
                          {...props}
                        >
                          {children}
                        </code>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      ),
                    a: ({ ...props }) => (
                      <a
                        className={`underline ${
                          item.role === "user" ? "text-gray-200" : "text-blue-700"
                        }`}
                        target="_blank"
                        rel="noreferrer"
                        {...props}
                      />
                    ),
                  }}
                >
                  {String(item.content ?? "")}
                </ReactMarkdown>
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex items-center gap-1 text-gray-500">
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.2s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.1s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-xs px-2 py-2">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 pt-3 border-t border-gray-100">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          autoFocus
          rows={3}
          className="flex-1 min-h-[84px] max-h-[160px] resize-none overflow-y-auto px-4 py-2.5 border border-gray-200 rounded-lg text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-xl bg-blue-600 p-3 text-white hover:bg-blue-500 disabled:opacity-30 transition-colors"
        >
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}
