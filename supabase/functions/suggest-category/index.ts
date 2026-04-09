import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

declare const console: {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
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

type ErrorBody = SuggestResult & {
  error?: string;
};

type GroqResponsePayload = {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
};

const json = (body: SuggestResult, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const errorJson = (message: string, status: number): Response =>
  new Response(JSON.stringify({ categoryId: null, confidence: 0, error: message } satisfies ErrorBody), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const invokeGroq = async ({
  key,
  prompt,
}: {
  key: string;
  prompt: string;
}): Promise<{ text: string | null; degraded: boolean }> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timeoutMs = attempt === 0 ? 3500 : 5000;

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
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        console.error("[suggest-category] Groq request failed.", {
          attempt: attempt + 1,
          status: response.status,
          statusText: response.statusText,
          body: responseText.slice(0, 400),
        });

        if (attempt === 0 && response.status >= 500) {
          await wait(120);
          continue;
        }

        return { text: null, degraded: true };
      }

      const payload = (await response.json()) as GroqResponsePayload;
      return {
        text: payload?.choices?.[0]?.message?.content ?? "",
        degraded: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[suggest-category] Unexpected Groq error.", {
        attempt: attempt + 1,
        message,
      });

      if (attempt === 0) {
        await wait(120);
        continue;
      }
    }
  }

  return { text: null, degraded: true };
};

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !authHeader) {
    console.warn("[suggest-category] Missing auth configuration or Authorization header.");
    return errorJson("Unauthorized", 401);
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authHeader,
      apikey: anonKey,
    },
  }).catch(() => null);
  if (!authResponse?.ok) {
    console.warn("[suggest-category] Auth validation failed.", {
      status: authResponse?.status ?? null,
    });
    return errorJson("Unauthorized", 401);
  }

  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) {
    console.error("[suggest-category] GROQ_API_KEY is missing.");
    return errorJson("AI provider is not configured", 503);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    console.warn("[suggest-category] Invalid JSON body.");
    return json({ categoryId: null, confidence: 0 }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const comment = (body.comment ?? "").trim();
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const history = Array.isArray(body.history) ? body.history : [];

  if (name.length === 0 || candidates.length === 0) {
    console.warn("[suggest-category] Missing required input.", {
      hasName: name.length > 0,
      candidateCount: candidates.length,
    });
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
    "Use the transaction name as a primary clue, not only the history examples.",
    "Infer common merchant intent when it is obvious, for example supermarkets, groceries, transport, rent, or restaurants.",
    `Transaction name: ${name}`,
    `Comment: ${comment || "(none)"}`,
    `Past categorized examples:\n${historyList || "(none)"}`,
    `Candidates:\n${candidateList}`,
  ].join("\n");

  try {
    console.info("[suggest-category] Invoking Groq.", {
      candidateCount: candidates.length,
      historyCount: history.length,
      hasComment: comment.length > 0,
      nameLength: name.length,
    });
    const { text, degraded } = await invokeGroq({ key, prompt });
    if (degraded || text === null) {
      console.warn("[suggest-category] Falling back to empty suggestion after provider failure.");
      return json({ categoryId: null, confidence: 0 });
    }

    console.info("[suggest-category] Groq returned a response.", {
      hasContent: text.length > 0,
    });
    return json(parseResult(text, candidates));
  } catch (error) {
    console.error("[suggest-category] Unexpected Groq error.", error);
    return errorJson("AI provider request failed", 502);
  }
});
