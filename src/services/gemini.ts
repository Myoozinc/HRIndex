import { DialogueResult, Scope, HumanRight } from "../types";

const TAVILY_API_KEY = import.meta.env.VITE_TAVILY_API_KEY || "";
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || "";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TAVILY_URL = "https://api.tavily.com/search";

// Free model on OpenRouter — only used for formatting, not content generation
// Using multiple fallbacks in case one is rate limited
const FORMAT_MODELS = [
  "mistralai/mistral-7b-instruct:free",
  "google/gemma-3-12b-it:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

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

  return results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nContent: ${r.content}`)
    .join("\n\n");
}

async function formatWithLLM(prompt: string): Promise<string> {
  console.log("🤖 Calling OpenRouter, key present:", !!OPENROUTER_API_KEY);

  for (let i = 0; i < FORMAT_MODELS.length; i++) {
    const model = FORMAT_MODELS[i];
    console.log(`🔄 Trying model ${i + 1}/${FORMAT_MODELS.length}: ${model}`);

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://hrindex.vercel.app",
        "X-Title": "HR Index",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    const responseText = await response.text();

    if (response.status === 429) {
      console.warn(`⚠️ Model ${model} rate limited, trying next...`);
      continue;
    }

    if (!response.ok) {
      console.error("❌ OpenRouter HTTP error:", response.status, responseText);
      throw new Error(`OpenRouter ${response.status}: ${responseText}`);
    }

    console.log(`✅ OpenRouter response received from ${model}`);

    try {
      const data = JSON.parse(responseText);
      return data.choices?.[0]?.message?.content ?? "{}";
    } catch {
      console.error("❌ OpenRouter response not valid JSON:", responseText);
      throw new Error("OpenRouter returned invalid JSON");
    }
  }

  throw new Error("All OpenRouter models are rate limited. Please try again in a moment.");
}

function parseJSON(text: string): DialogueResult {
  try {
    return JSON.parse(text);
  } catch {
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
    console.log("✅ Legal sources parsed:", parsed.sources.length);
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

Return 3–4 sources. Only use URLs that appeared in the search results.`;

    const formatted = await formatWithLLM(formatPrompt);
    const parsed = parseJSON(formatted);
    console.log("✅ Status reports parsed:", parsed.sources.length);
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

Return 3–4 sources. Only use URLs that appeared in the search results.`;

    const formatted = await formatWithLLM(formatPrompt);
    const parsed = parseJSON(formatted);
    console.log("✅ Nexus perspectives parsed:", parsed.sources.length);
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
    const parsed = JSON.parse(response);

    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.ids)) return parsed.ids;
    if (Array.isArray(parsed?.sources)) return [];

    // Fallback: find any array in the response
    for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }

    return [];
  } catch (error) {
    console.error("❌ Semantic search failed:", error instanceof Error ? error.message : String(error));
    return [];
  }
}
