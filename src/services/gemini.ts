import { DialogueResult, Scope, HumanRight } from "../types";

const TAVILY_API_KEY = import.meta.env.VITE_TAVILY_API_KEY || "";
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || "";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TAVILY_URL = "https://api.tavily.com/search";

// Ordered fallback chain — models known to handle legal/HR content without safety blocks
const FORMAT_MODELS = [
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-4-scout:free",
  "google/gemma-3-27b-it:free",
];

// --- Core helpers ---

async function tavilySearch(query: string, domains?: string[]): Promise<string> {
  const body: Record<string, unknown> = {
    query,
    search_depth: "advanced",
    max_results: 7,
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

  const results = data.results as Array<{
    title: string;
    url: string;
    content: string;
  }>;

  if (!results || results.length === 0) {
    throw new Error("Tavily returned no results for this query.");
  }

  // 500 chars per result — enough to extract article numbers, provisions, and specific findings
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nContent: ${r.content.slice(0, 500)}`)
    .join("\n\n");
}

async function formatWithLLM(prompt: string): Promise<string> {
  for (const model of FORMAT_MODELS) {
    console.log(`🤖 Trying model: ${model}`);
    try {
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
          max_tokens: 4000,
        }),
      });

      const responseText = await response.text();

      if (response.status === 429) {
        console.warn(`⚠️ ${model} rate limited, trying next...`);
        continue;
      }

      if (!response.ok) {
        console.error(`❌ ${model} error ${response.status}:`, responseText);
        continue;
      }

      const data = JSON.parse(responseText);
      const text = data.choices?.[0]?.message?.content ?? "";

      if (!text || text.startsWith("User Safety") || text.startsWith("I cannot") || text.startsWith("I'm sorry")) {
        console.warn(`⚠️ ${model} returned safety block, trying next...`);
        continue;
      }

      console.log(`✅ Got response from ${model}`);
      return text;

    } catch (err) {
      console.warn(`⚠️ ${model} threw error, trying next:`, err);
      continue;
    }
  }

  throw new Error("All models failed or were rate limited. Please try again.");
}

function extractJSON(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

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

    if (Array.isArray(parsed)) {
      return { sources: parsed };
    }

    if (parsed && typeof parsed === "object") {
      for (const key of ["sources", "data", "results", "items"]) {
        if (Array.isArray(parsed[key])) {
          return { sources: parsed[key] };
        }
      }
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

    // Broad query — don't quote the right name, cast a wider net
    const searchQuery = `${rightName} international treaty convention articles provisions ${subScope || ""}`;

    const webContent = await tavilySearch(searchQuery, [
      "ohchr.org",
      "un.org",
      "refworld.org",
      "treaties.un.org",
      "ihl-databases.icrc.org",
    ]);

    console.log("✅ Tavily returned legal content");

    const formatPrompt = `You are a human rights legal analyst extracting treaty framework information from real web search results. Use ONLY information from the sources below — do not invent anything.

SEARCH RESULTS (from OHCHR, UN, Refworld, ICRC):
${webContent}

Task: Extract every distinct legal instrument that protects "${rightName}"${subScope ? ` in the context of ${subScope}` : ""} and return a JSON object with a "sources" array.

Each source MUST have:
- "title": full official name of the treaty, convention, protocol, or instrument WITH year — e.g. "International Covenant on Civil and Political Rights (1966)"
- "uri": exact URL from the search results above
- "reference": the SPECIFIC article number AND sub-article if applicable, followed by a brief quoted phrase from that provision — e.g. "Art. 19(2): Everyone shall have the right to freedom of expression" or "Art. 7(a)(i): Equal remuneration for work of equal value"

Priority: More sources is better than longer descriptions. Capture every distinct instrument mentioned.
Format references as: "Art. X(Y): [key phrase from that provision]"
If the snippet mentions multiple articles, create a separate source entry for each distinct article.

Return ONLY valid JSON, no markdown, no explanation:
{"sources": [{"title": "...", "uri": "...", "reference": "Art. X: ..."}]}`;

    const formatted = await formatWithLLM(formatPrompt);
    const parsed = parseJSON(formatted);
    console.log("✅ Legal sources parsed:", parsed?.sources?.length ?? 0);
    return parsed;
  } catch (error) {
    console.error("❌ Legal search failed:", error instanceof Error ? error.message : String(error));
    return {
      sources: [{
        title: "Legal framework information temporarily unavailable",
        uri: "https://www.ohchr.org/en/instruments-listings",
        reference: "Visit the UN Office of the High Commissioner for Human Rights for official treaty texts.",
      }],
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

    const searchQuery = `${rightName} violations ${region} 2024 2025 human rights report findings`;

    const webContent = await tavilySearch(searchQuery, [
      "hrw.org",
      "amnesty.org",
      "ohchr.org",
      "un.org",
      "icj.org",
    ]);

    console.log("✅ Tavily returned status content");

    const formatPrompt = `You are a human rights researcher extracting specific findings from real monitoring reports. Use ONLY what is in the sources below — do not invent quotes or findings.

SEARCH RESULTS (from HRW, Amnesty International, OHCHR, UN, ICJ):
${webContent}

Task: Extract specific documented findings about the status of "${rightName}" in "${region}" and return a JSON object with a "sources" array.

Each source MUST have:
- "title": exact report title with organization and year — e.g. "World Report 2024: Events of 2023 (Human Rights Watch)"
- "uri": exact URL from the search results above
- "reference": a specific finding with its context — include section name, country chapter, or finding number if visible — e.g. "Chapter: Mexico — 'Security forces committed at least 43 documented cases of enforced disappearance in 2023'" or "Finding §47: Authorities failed to investigate..."

Priority: More specific findings across more sources is better than one long quote. If a source covers multiple countries or findings relevant to "${rightName}", create a separate entry per finding.
Keep each reference to 1–2 sentences maximum but make them pinpoint specific.

Return ONLY valid JSON, no markdown, no explanation:
{"sources": [{"title": "...", "uri": "...", "reference": "..."}]}`;

    const formatted = await formatWithLLM(formatPrompt);
    const parsed = parseJSON(formatted);
    console.log("✅ Status reports parsed:", parsed?.sources?.length ?? 0);
    return parsed;
  } catch (error) {
    console.error("❌ Status search failed:", error instanceof Error ? error.message : String(error));
    return {
      sources: [{
        title: "Current status information temporarily unavailable",
        uri: "https://www.hrw.org/world-report/2024",
        reference: `Check Human Rights Watch and Amnesty International for recent reports on ${rightName}.`,
      }],
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

    const searchQuery = `${fromRight} ${toRight} interdependence indivisibility human rights law principle`;

    const webContent = await tavilySearch(searchQuery, [
      "ohchr.org",
      "un.org",
      "jstor.org",
      "academic.oup.com",
      "cambridge.org",
      "hrw.org",
      "amnesty.org",
      "refworld.org",
    ]);

    console.log("✅ Tavily returned nexus content");

    const formatPrompt = `You are a human rights legal scholar extracting specific doctrinal connections from real sources. Use ONLY what is in the sources below.

SEARCH RESULTS:
${webContent}

Task: Extract specific legal principles, doctrines, or findings that establish how "${fromRight}" and "${toRight}" are interconnected, and return a JSON object with a "sources" array.

Each source MUST have:
- "title": exact document or article title with author/organization and year if available
- "uri": exact URL from the search results above
- "reference": the SPECIFIC principle, doctrine, or legal connection being established — cite the exact legal instrument, case name, resolution number, or scholarly argument — e.g. "Vienna Declaration (1993) §5: Human rights are indivisible and interdependent — violations of ${fromRight} directly undermine ${toRight} through..." or "General Comment No. 31 (CCPR): The Covenant establishes..."

Priority: Specific legal instruments, case law, UN resolutions, and general comments over general statements. If a source mentions multiple connecting principles, create a separate entry for each.

Return ONLY valid JSON, no markdown, no explanation:
{"sources": [{"title": "...", "uri": "...", "reference": "..."}]}`;

    const formatted = await formatWithLLM(formatPrompt);
    const parsed = parseJSON(formatted);
    console.log("✅ Nexus perspectives parsed:", parsed?.sources?.length ?? 0);
    return parsed;
  } catch (error) {
    console.error("❌ Nexus search failed:", error instanceof Error ? error.message : String(error));
    return {
      sources: [{
        title: "Scholarly perspectives temporarily unavailable",
        uri: `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${fromRight}" "${toRight}" human rights`)}`,
        reference: `Explore how ${fromRight} and ${toRight} are interconnected via the search link above.`,
      }],
    };
  }
}

export async function getSemanticRights(
  term: string,
  rights: HumanRight[]
): Promise<string[]> {
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

    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) return obj[key] as string[];
    }

    return [];
  } catch (error) {
    console.error("❌ Semantic search failed:", error instanceof Error ? error.message : String(error));
    return [];
  }
}
