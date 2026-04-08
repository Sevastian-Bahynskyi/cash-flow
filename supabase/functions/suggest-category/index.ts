import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

type Body = {
  name?: string;
  comment?: string | null;
  candidates?: { id: string; parent: string; name: string }[];
  history?: { name?: string; categoryId?: string }[];
};

type SuggestResult = {
  categoryId: string | null;
  confidence: number;
};

const json = (body: SuggestResult, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const parseResult = (text: string, candidates: { id: string }[]): SuggestResult => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        categoryId?: unknown;
        confidence?: unknown;
      };
      const categoryId =
        typeof parsed.categoryId === "string" && candidates.some((candidate) => candidate.id === parsed.categoryId)
          ? parsed.categoryId
          : null;
      const confidence =
        typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
          ? clamp(parsed.confidence)
          : 0;
      return { categoryId, confidence: categoryId ? confidence : 0 };
    } catch {
      // Fall through to regex parsing.
    }
  }

  const idMatch = text.match(/\[([0-9a-f-]{36})\]/i);
  const categoryId = idMatch?.[1] ?? null;
  if (!categoryId || !candidates.some((candidate) => candidate.id === categoryId)) {
    return { categoryId: null, confidence: 0 };
  }
  return { categoryId, confidence: 0.6 };
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ categoryId: null, confidence: 0 }, { status: 405 });
  }

  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) {
    return json({ categoryId: null, confidence: 0 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ categoryId: null, confidence: 0 }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const comment = (body.comment ?? "").trim();
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const history = Array.isArray(body.history) ? body.history : [];

  if (name.length === 0 || candidates.length === 0) {
    return json({ categoryId: null, confidence: 0 });
  }

  const candidateList = candidates
    .map((candidate, index) => `${index + 1}. ${candidate.parent} / ${candidate.name} [${candidate.id}]`)
    .join("\n");
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const historyList = history
    .map((item) => {
      const historyName = (item.name ?? "").trim();
      const categoryId = typeof item.categoryId === "string" ? item.categoryId : "";
      const match = candidateById.get(categoryId);
      if (!historyName || !match) return null;
      return `- ${historyName} -> ${match.parent} / ${match.name} [${match.id}]`;
    })
    .filter((item): item is string => Boolean(item))
    .slice(0, 12)
    .join("\n");

  const prompt = [
    "You categorize spending transactions.",
    "Pick the single best candidate category id and a confidence from 0 to 1.",
    'Respond with strict JSON only: {"categoryId":"uuid-or-null","confidence":0.0}',
    "Use high confidence only for a strong, specific merchant match.",
    `Transaction name: ${name}`,
    `Comment: ${comment || "(none)"}`,
    `Past categorized examples:\n${historyList || "(none)"}`,
    `Candidates:\n${candidateList}`,
  ].join("\n");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              'Return strict JSON only in the shape {"categoryId":"uuid-or-null","confidence":0.0}.',
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      return json({ categoryId: null, confidence: 0 });
    }

    const payload = await response.json();
    const text: string = payload?.choices?.[0]?.message?.content ?? "";
    return json(parseResult(text, candidates));
  } catch {
    return json({ categoryId: null, confidence: 0 });
  }
});
