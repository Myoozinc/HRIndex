import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { DialogueResult, Scope, HumanRight } from "../types";

// Initialize Gemini Client
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: [{ googleSearch: {} } as any] // Enable Google Search for all queries
});

const modelNoSearch = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        sources: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              title: { type: SchemaType.STRING },
              uri: { type: SchemaType.STRING },
              date: { type: SchemaType.STRING },
              reference: { type: SchemaType.STRING }
            },
            required: ["title", "uri", "reference"]
          }
        }
      },
      required: ["sources"]
    }
  }
});

// Trusted domains for legal instruments, research, and reports
const TRUSTED_DOMAINS = [
  // International organizations
  'un.org', 'ohchr.org', 'unicef.org', 'unesco.org', 'who.int', 'ilo.org',
  // NGOs
  'hrw.org', 'amnesty.org', 'icrc.org', 'hrw.org',
  // Legal databases
  'treaties.un.org', 'legal.un.org', 'icj-cij.org',
  // Academic/Research
  'scholar.google.com', 'jstor.org', 'sciencedirect.com', 'springer.com', 
  'cambridge.org', 'oxfordjournals.org', 'wiley.com', 'tandfonline.com',
  'ssrn.com', 'researchgate.net',
  // Government legal sources
  '.gov', '.edu'
];

// Helper to check if URL is from trusted source
function isTrustedSource(url: string): boolean {
  return TRUSTED_DOMAINS.some(domain => url.includes(domain));
}

// Helper to parse search results into desired format with quality filtering
async function parseSearchResults(query: string, searchContext: string, groundingUrls: any[]): Promise<DialogueResult> {
  // Filter for trusted sources only
  const trustedUrls = groundingUrls.filter(url => isTrustedSource(url.uri));
  
  const prompt = `
    Based on the following search results about: "${query}"
    
    SEARCH CONTEXT:
    ${searchContext}

    Available trusted sources:
    ${trustedUrls.map((u, i) => `[${i}] ${u.title} - ${u.uri}`).join('\n')}

    Extract key information into a JSON structure with "sources".
    Each source must have:
    - title: FULL official name of the document/treaty/report (e.g., "Universal Declaration of Human Rights (1948)" or "International Covenant on Civil and Political Rights (1966)")
    - uri: Use ONLY the URLs from the trusted sources list above
    - date: Year of publication or adoption (e.g., "1948", "1966", "2024")
    - reference: A SHORT direct quote (max 1-3 sentences) from the document. Quote the specific article number or finding.

    IMPORTANT: 
    - For legal instruments, include the FULL NAME and YEAR in the title
    - Use ONLY URLs that appear in the trusted sources list above
    - Extract actual quotes, not summaries
    - If no trusted sources found, return empty sources array

    Return in JSON format.
  `;

  const result = await modelNoSearch.generateContent(prompt);
  return JSON.parse(result.response.text());
}

export async function getScopeAnalysis(rightName: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  const query = `Find official legal instruments and treaties (UN, international law) protecting "${rightName}" in ${scope} context ${subScope ? `specifically for ${subScope}` : ''}. Include full treaty names, years, and quote specific articles. Prioritize sources from un.org, ohchr.org, treaties.un.org`;

  try {
    const result = await model.generateContent(query);
    const text = result.response.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidate = result.response.candidates?.[0] as any;
    const groundingMetadata = candidate?.groundingMetadata;
    const groundingUrls = groundingMetadata?.groundingChunks
      ?.map((c: any) => ({ title: c.web?.title || "Source", uri: c.web?.uri }))
      .filter((c: any) => c.uri) || [];

    // Parse with trusted source filtering
    const structured = await parseSearchResults(query, text, groundingUrls);
    return structured;
  } catch (error) {
    console.error("Legal search failed:", error);
    return { sources: [] };
  }
}

export async function getStatusAnalysis(rightName: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  const query = `Find recent reports (2024-2025) from Human Rights Watch, Amnesty International, UN Human Rights Council on "${rightName}" in ${subScope || 'the world'}. Include report titles, years, and quote specific findings. Use only hrw.org, amnesty.org, ohchr.org, un.org`;

  try {
    const result = await model.generateContent(query);
    const text = result.response.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidate = result.response.candidates?.[0] as any;
    const groundingMetadata = candidate?.groundingMetadata;
    const groundingUrls = groundingMetadata?.groundingChunks
      ?.map((c: any) => ({ title: c.web?.title || "Source", uri: c.web?.uri }))
      .filter((c: any) => c.uri) || [];

    const structured = await parseSearchResults(query, text, groundingUrls);
    return structured;
  } catch (error) {
    console.error("Status search failed:", error);
    return { sources: [] };
  }
}

export async function getNexusAnalysis(fromRight: string, toRight: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  const query = `Find peer-reviewed academic research connecting "${fromRight}" and "${toRight}". Include full article titles, publication years, and explain the intersection. Use only scholarly sources: JSTOR, ScienceDirect, Cambridge, Oxford, academic journals`;

  try {
    const result = await model.generateContent(query);
    const text = result.response.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidate = result.response.candidates?.[0] as any;
    const groundingMetadata = candidate?.groundingMetadata;
    const groundingUrls = groundingMetadata?.groundingChunks
      ?.map((c: any) => ({ title: c.web?.title || "Source", uri: c.web?.uri }))
      .filter((c: any) => c.uri) || [];

    const structured = await parseSearchResults(query, text, groundingUrls);
    return structured;
  } catch (error) {
    console.error("Nexus search failed:", error);
    return { sources: [] };
  }
}

export async function getSemanticRights(term: string, rights: HumanRight[]): Promise<string[]> {
  const prompt = `Given this term: "${term}", identify which of the following Human Rights IDs are most relevant.
  Rights: ${JSON.stringify(rights.map(r => ({ id: r.id, name: r.name, summary: r.summary })))}
  Return ONLY a JSON array of ID strings. Example: ["1", "5"]`;

  try {
    const result = await modelNoSearch.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (error) {
    console.error("Semantic search failed:", error);
    return [];
  }
}
