import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function normalizeResponseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const outputItems = Array.isArray(response?.output) ? response.output : [];
  const text = outputItems
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .map((part) => {
      if (typeof part?.text === "string") return part.text;
      if (typeof part?.content === "string") return part.content;
      return "";
    })
    .join("")
    .trim();

  return text;
}

export async function POST(req) {
  try {
    const { systemPrompt, messages, maxOutputTokens } = await req.json();

    const requestBody = {
      model: "gpt-5.5",
      reasoning: { effort: "low" },
      instructions: systemPrompt,
      input: messages,
    };
    if (typeof maxOutputTokens === "number" && maxOutputTokens > 0) {
      requestBody.max_output_tokens = maxOutputTokens;
    }

    const response = await client.responses.create(requestBody);

    const content = normalizeResponseText(response);
    if (!content) {
      console.warn("OpenAI returned empty response shape:", response);
      return Response.json({
        content: "응답이 비어 있어 다시 생성해주세요.",
      });
    }

    return Response.json({
      content,
    });
  } catch (error) {
    console.error("OpenAI API error:", error);
    return Response.json(
      { error: "AI 응답을 생성하는 데 실패했습니다. 다시 시도해주세요." },
      { status: 500 }
    );
  }
}
