import { DialogueResult, Scope, HumanRight } from "../types";

const TAVILY_API_KEY = import.meta.env.VITE_TAVILY_API_KEY || "";
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || "";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TAVILY_URL = "https://api.tavily.com/search";

// openrouter/free automatically picks an available free model on every request
// No need to hardcode model names that can go stale or hit rate limits
const FORMAT_MODEL = "openrouter/free";

// --- Core helpers ---

async function tavilySearch(query: string, domains?: string[]): Promise<string> {
  const body: Record<string, unknown> = {
    query,
    search_depth: "advanced",
    max_results: 5,
    include_raw_content: false,
    include_answer: false,
  };

  if (domains && domains.length > 0) {
    body.include_domains = domains;
  }

  const response = await fetch(TAVILY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TAVILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Tavily error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();

  // Format results into a clean context string for the LLM
  const results = data.results as Array<{
    title: string;
    url: string;
    content: string;
  }>;

  if (!results || results.length === 0) {
    throw new Error("Tavily returned no results for this query.");
  }

  return results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nContent: ${r.content}`)
    .join("\n\n");
}

async function formatWithLLM(prompt: string, retries = 3): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hrindex.vercel.app",
        "X-Title": "HR Index",
      },
      body: JSON.stringify({
        model: FORMAT_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 3000,
      }),
    });

    const responseText = await response.text();

    if (response.status === 429) {
      let waitSeconds = 15;
      try {
        const errData = JSON.parse(responseText);
        waitSeconds = errData?.error?.metadata?.retry_after_seconds ?? 15;
      } catch { /* use default */ }
      console.warn(`⚠️ Rate limited, waiting ${waitSeconds}s (attempt ${attempt}/${retries})...`);
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      continue;
    }

    if (!response.ok) {
      console.error("❌ OpenRouter error:", response.status, responseText);
      throw new Error(`OpenRouter ${response.status}: ${responseText}`);
    }

    try {
      const data = JSON.parse(responseText);
      return data.choices?.[0]?.message?.content ?? "{}";
    } catch {
      throw new Error("OpenRouter returned invalid JSON: " + responseText.slice(0, 200));
    }
  }

  throw new Error("OpenRouter rate limited after " + retries + " retries. Please try again in a moment.");
}

function extractJSON(text: string): string {
  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Find the first { or [ and last } or ] to extract raw JSON
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  
  if (firstBrace === -1 && firstBracket === -1) return text;
  
  let start: number;
  let endChar: string;
  
  if (firstBrace === -1) { start = firstBracket; endChar = "]"; }
  else if (firstBracket === -1) { start = firstBrace; endChar = "}"; }
  else if (firstBrace < firstBracket) { start = firstBrace; endChar = "}"; }
  else { start = firstBracket; endChar = "]"; }
  
  const end = text.lastIndexOf(endChar);
  if (end === -1) return text;
  
  return text.slice(start, end + 1);
}

function parseJSON(text: string): DialogueResult {
  try {
    const cleaned = extractJSON(text);
    const parsed = JSON.parse(cleaned);

    // Handle direct array response
    if (Array.isArray(parsed)) {
      return { sources: parsed };
    }

    // Handle wrapped responses: {sources:[...]}, {data:[...]}, {results:[...]}, etc.
    if (parsed && typeof parsed === "object") {
      for (const key of ["sources", "data", "results", "items"]) {
        if (Array.isArray(parsed[key])) {
          return { sources: parsed[key] };
        }
      }
      // Single object returned instead of array — wrap it
      if (parsed.title && parsed.uri) {
        return { sources: [parsed] };
      }
    }

    console.warn("⚠️ Unexpected JSON shape from LLM:", JSON.stringify(parsed).slice(0, 200));
    return { sources: [] };
  } catch (e) {
    console.error("❌ JSON parse failed:", e, "Raw text:", text?.slice(0, 200));
    return { sources: [] };
  }
}

// --- Exported functions ---

export async function getScopeAnalysis(
  rightName: string,
  scope: Scope,
  subScope: string
): Promise<DialogueResult> {
  try {
    console.log("🔍 Legal search: fetching from OHCHR and UN sources...");

    const searchQuery = `"${rightName}" international treaty convention article text site:ohchr.org OR site:un.org OR site:refworld.org`;

    const webContent = await tavilySearch(searchQuery, [
      "ohchr.org",
      "un.org",
      "refworld.org",
      "treaties.un.org",
    ]);

    console.log("✅ Tavily returned legal content");

    const formatPrompt = `You are extracting treaty information from real web search results. Use ONLY information from the sources below — do not invent or add anything.

SEARCH RESULTS (from OHCHR, UN, and Refworld):
${webContent}

Task: Extract information about legal protections for "${rightName}" and return a JSON object with a "sources" array.

Each source MUST:
- Come from the search results above (real URL, real title)
- Have "title": full official treaty/document name with year if available
- Have "uri": exact URL from the search results
- Have "reference": the specific article number and its exact quoted text as found in the search results

Return ONLY valid JSON, no markdown. Example:
{"sources": [{"title": "International Covenant on Civil and Political Rights (1966)", "uri": "https://www.ohchr.org/...", "reference": "Article 9: Everyone has the right to liberty and security of person."}]}

Return 3–5 sources. Only use URLs that appeared in the search results.`;

    const formatted = await formatWithLLM(formatPrompt);
    const parsed = parseJSON(formatted);
    console.log("✅ Legal sources parsed:", parsed?.sources?.length ?? 0);
    return parsed;
  } catch (error) {
    console.error("❌ Legal search failed:", error instanceof Error ? error.message : String(error));
    return {
      sources: [
        {
          title: "Legal framework information temporarily unavailable",
          uri: "https://www.ohchr.org/en/instruments-listings",
          reference:
            "Unable to retrieve legal framework information at this time. Visit the UN Office of the High Commissioner for Human Rights for official treaty texts.",
        },
      ],
    };
  }
}

export async function getStatusAnalysis(
  rightName: string,
  scope: Scope,
  subScope: string
): Promise<DialogueResult> {
  const region = subScope || "globally";

  try {
    console.log(`🔍 Status search: fetching HRW/Amnesty reports for ${rightName} in ${region}...`);

    const searchQuery = `"${rightName}" ${region} report 2024 2025 human rights`;

    const webContent = await tavilySearch(searchQuery, [
      "hrw.org",
      "amnesty.org",
      "ohchr.org",
      "un.org",
    ]);

    console.log("✅ Tavily returned status content");

    const formatPrompt = `You are extracting human rights report information from real web search results. Use ONLY what is in the sources below — do not invent quotes or reports.

SEARCH RESULTS (from HRW, Amnesty International, OHCHR, UN):
${webContent}

Task: Extract reports about "${rightName}" in "${region}" and return a JSON object with a "sources" array.

Each source MUST:
- Come from the search results above (real URL, real title)
- Have "title": exact title of the report as found in the results
- Have "uri": exact URL from the search results
- Have "reference": a direct excerpt or quote from the content field of the search result, followed by the organization name and year

Return ONLY valid JSON, no markdown. Example:
{"sources": [{"title": "World Report 2024: Mexico", "uri": "https://www.hrw.org/...", "reference": "\"Security forces continue to commit enforced disappearances...\" — Human Rights Watch, 2024"}]}

Return 3–5 sources. Only use URLs that appeared in the search results.`;

    const formatted = await formatWithLLM(formatPrompt);
    const parsed = parseJSON(formatted);
    console.log("✅ Status reports parsed:", parsed?.sources?.length ?? 0);
    return parsed;
  } catch (error) {
    console.error("❌ Status search failed:", error instanceof Error ? error.message : String(error));
    return {
      sources: [
        {
          title: "Current status information temporarily unavailable",
          uri: "https://www.hrw.org/world-report/2024",
          reference: `Unable to retrieve current status for ${rightName}. Check Human Rights Watch and Amnesty International for recent reports.`,
        },
      ],
    };
  }
}

export async function getNexusAnalysis(
  fromRight: string,
  toRight: string,
  scope: Scope,
  subScope: string
): Promise<DialogueResult> {
  try {
    console.log(`🔍 Nexus search: fetching scholarship on ${fromRight} ↔ ${toRight}...`);

    const searchQuery = `"${fromRight}" "${toRight}" interconnected human rights law`;

    const webContent = await tavilySearch(searchQuery, [
      "ohchr.org",
      "scholar.google.com",
      "jstor.org",
      "academic.oup.com",
      "cambridge.org",
      "hrw.org",
      "amnesty.org",
    ]);

    console.log("✅ Tavily returned nexus content");

    const formatPrompt = `You are extracting scholarly and legal analysis from real web search results. Use ONLY what is in the sources below.

SEARCH RESULTS:
${webContent}

Task: Extract perspectives on how "${fromRight}" and "${toRight}" are interconnected, and return a JSON object with a "sources" array.

Each source MUST:
- Come from the search results above (real URL, real title)
- Have "title": title of the article or document as found in the results
- Have "uri": exact URL from the search results
- Have "reference": 2–3 sentences from the content field explaining the connection between both rights

Return ONLY valid JSON, no markdown. Example:
{"sources": [{"title": "The Indivisibility of Human Rights", "uri": "https://...", "reference": "The right to life and the right to an adequate standard of living are deeply intertwined..."}]}

Return 3–5 sources. Only use URLs that appeared in the search results.`;

    const formatted = await formatWithLLM(formatPrompt);
    const parsed = parseJSON(formatted);
    console.log("✅ Nexus perspectives parsed:", parsed?.sources?.length ?? 0);
    return parsed;
  } catch (error) {
    console.error("❌ Nexus search failed:", error instanceof Error ? error.message : String(error));
    return {
      sources: [
        {
          title: "Scholarly perspectives temporarily unavailable",
          uri: `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${fromRight}" "${toRight}" human rights`)}`,
          reference: `Explore how ${fromRight} and ${toRight} are interconnected via the search link above.`,
        },
      ],
    };
  }
}

export async function getSemanticRights(
  term: string,
  rights: HumanRight[]
): Promise<string[]> {
  // Semantic matching is purely structural — no web search needed, LLM is appropriate here
  const prompt = `Given the search term: "${term}", identify which of the following human rights are most relevant.

Rights list:
${JSON.stringify(rights.map((r) => ({ id: r.id, name: r.name, summary: r.summary })))}

Return ONLY a JSON object with an "ids" array of matching ID strings. Example: {"ids": ["1", "5"]}
Match by conceptual relevance, not just keyword. Return 1–5 most relevant IDs.`;

  try {
    console.log("🔍 Semantic matching for:", term);
    const response = await formatWithLLM(prompt);
    
    let parsed: unknown;
    try {
      parsed = JSON.parse(response);
    } catch {
      console.warn("⚠️ Semantic response not valid JSON:", response?.slice(0, 100));
      return [];
    }

    if (!parsed || typeof parsed !== "object") return [];
    if (Array.isArray(parsed)) return parsed as string[];

    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.ids)) return obj.ids as string[];

    // Fallback: find any array in the response
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) return obj[key] as string[];
    }

    return [];
  } catch (error) {
    console.error("❌ Semantic search failed:", error instanceof Error ? error.message : String(error));
    return [];
  }
}
