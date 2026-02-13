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
        analysis: { type: SchemaType.STRING },
        sourceMatches: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              urlIndex: { type: SchemaType.NUMBER },
              title: { type: SchemaType.STRING },
              reference: { type: SchemaType.STRING }
            },
            required: ["urlIndex", "title", "reference"]
          }
        }
      },
      required: ["analysis", "sourceMatches"]
    }
  }
});

// Simple filtering - remove obviously bad sources
const EXCLUDED_DOMAINS = [
  'wikipedia.org',
  'wiki',
  'jstor.org',
  'springer.com/article',
  'sciencedirect.com/science/article',
  'tandfonline.com/doi/abs',
  'wiley.com/doi/abs',
  '/abstract',
  '/citation'
];

function shouldExclude(url: string): boolean {
  return EXCLUDED_DOMAINS.some(pattern => url.toLowerCase().includes(pattern));
}

// Helper to parse search results
async function parseSearchResults(query: string, searchContext: string, groundingUrls: any[], sourceType: 'legal' | 'ngo' | 'academic'): Promise<DialogueResult> {
  // Filter out excluded domains
  const filteredUrls = groundingUrls.filter(url => !shouldExclude(url.uri));
  
  if (filteredUrls.length === 0) {
    console.warn("No sources available after filtering");
    return { sources: [] };
  }

  const prompt = `
    Based on the following search results about: "${query}"
    
    SEARCH CONTEXT:
    ${searchContext}

    Available sources (ONLY reference these by index, DO NOT invent sources):
    ${filteredUrls.map((u, i) => `[${i}] ${u.title}\n    URL: ${u.uri}`).join('\n\n')}

    CRITICAL RULES:
    1. ONLY use sources that appear in the list above
    2. Reference sources by their index number [0, 1, 2, etc.]
    3. DO NOT create, invent, or modify any URLs
    4. Prioritize official/primary sources over secondary sources
    5. If multiple sources point to the same instrument/article, choose the most official one
    6. Better to return fewer high-quality sources than many duplicates
    7. Each source MUST have been found in the search results

    For each source you reference:
    - urlIndex: The exact index from the list above
    - title: Full official name (include year in title if it's part of the official name)
    - reference: Direct quote or specific finding (max 2 sentences)

    Return JSON with "analysis" (brief summary) and "sourceMatches" array.
  `;

  try {
    const result = await modelNoSearch.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    
    const sources = parsed.sourceMatches
      .filter((match: any) => {
        const index = match.urlIndex;
        const isValid = Number.isInteger(index) && index >= 0 && index < filteredUrls.length;
        if (!isValid) {
          console.warn(`Invalid urlIndex ${index}, skipping source`);
        }
        return isValid;
      })
      .map((match: any) => ({
        title: match.title,
        uri: filteredUrls[match.urlIndex].uri,
        reference: match.reference
      }));

    return { sources };
  } catch (error) {
    console.error("Parse error:", error);
    return { sources: [] };
  }
}

// Helper to build scope-specific search instructions
function getScopeSearchInstructions(scope: Scope, subScope: string, rightName: string): string {
  switch (scope.toLowerCase()) {
    case 'international':
      return `Search for OFFICIAL INTERNATIONAL legal instruments protecting "${rightName}".
      
      REQUIRED: Search ONLY official sources from international organizations:
      - United Nations official sites (un.org, ohchr.org, treaties.un.org)
      - Specialized UN agencies (unicef.org, unesco.org, who.int, ilo.org)
      - International courts (icj-cij.org)
      
      DO NOT USE:
      - Wikipedia or encyclopedias
      - Secondary sources or summaries
      - Educational websites
      - News articles
      
      Find PRIMARY legal texts (both foundational and recent instruments):
      - International Covenant on Civil and Political Rights (ICCPR) - 1966
      - International Covenant on Economic, Social and Cultural Rights (ICESCR) - 1966
      - Universal Declaration of Human Rights (UDHR) - 1948
      - Convention on the Rights of the Child (CRC) - 1989
      - Convention on the Elimination of All Forms of Discrimination Against Women (CEDAW) - 1976
      - Other relevant UN treaties (include both classic instruments and recent ones)
      
      Include: Full official treaty names with their adoption years, and specific article numbers that protect this right.`;

    case 'regional':
      let regionalInstructions = `Search for OFFICIAL REGIONAL legal instruments protecting "${rightName}"`;
      
      if (subScope) {
        const region = subScope.toLowerCase();
        if (region.includes('europe') || region.includes('european')) {
          regionalInstructions += ` in Europe.
          
          REQUIRED: Official sources only:
          - European Court of Human Rights (echr.coe.int)
          - Council of Europe (coe.int)
          - European Union official sites (europa.eu, europarl.europa.eu)
          
          DO NOT USE: Wikipedia, news sites, educational summaries
          
          Find PRIMARY texts:
          - European Convention on Human Rights (ECHR)
          - EU Charter of Fundamental Rights
          - Council of Europe conventions
          - ECHR case law
          
          Include: Article numbers, case citations, official document references.`;
        } else if (region.includes('africa') || region.includes('african')) {
          regionalInstructions += ` in Africa.
          
          REQUIRED: Official sources only:
          - African Commission on Human and Peoples' Rights (achpr.org)
          - African Court (african-court.org)
          
          DO NOT USE: Wikipedia, news sites, educational summaries
          
          Find PRIMARY texts:
          - African Charter on Human and Peoples' Rights
          - Protocol on the Rights of Women in Africa
          - African Court decisions
          
          Include: Article numbers, case names, official references.`;
        } else if (region.includes('america') || region.includes('inter-american')) {
          regionalInstructions += ` in the Americas.
          
          REQUIRED: Official sources only:
          - Inter-American Court of Human Rights (corteidh.or.cr)
          - Inter-American Commission (iachr.org)
          - Organization of American States (oas.org)
          
          DO NOT USE: Wikipedia, news sites, educational summaries
          
          Find PRIMARY texts:
          - American Convention on Human Rights
          - Inter-American Court decisions
          - OAS declarations and protocols
          
          Include: Article numbers, case citations, official references.`;
        } else {
          regionalInstructions += ` in ${subScope}.
          
          REQUIRED: Official sources from regional organizations only
          DO NOT USE: Wikipedia, news sites, educational summaries
          
          Find PRIMARY legal texts from official regional human rights bodies.
          Include: Article numbers and official document references.`;
        }
      } else {
        regionalInstructions += `.
        
        REQUIRED: Official sources from regional organizations:
        - European Court of Human Rights (echr.coe.int)
        - African Commission/Court (achpr.org, african-court.org)
        - Inter-American Court (corteidh.or.cr)
        - ASEAN official sites (asean.org)
        
        DO NOT USE: Wikipedia, news sites, educational summaries
        
        Find PRIMARY texts from official regional systems.
        Include: Article numbers and official references.`;
      }
      
      return regionalInstructions;

    case 'national':
      if (subScope) {
        return `Search for OFFICIAL NATIONAL legal documents protecting "${rightName}" in ${subScope}.
        
        REQUIRED: Official government sources only:
        - National government websites (.gov, .gob, .gc.ca, .gov.uk, .gov.au, etc.)
        - Official legislation databases (legislation.gov.uk, legifrance.gouv.fr, etc.)
        - Constitutional databases (constituteproject.org, constitution.org)
        - Supreme/Constitutional Court official sites
        
        DO NOT USE: Wikipedia, news articles, blogs, educational summaries
        
        Find PRIMARY legal texts:
        - National constitution (specific articles)
        - Domestic legislation and statutes
        - Bill of Rights provisions
        - Supreme Court/Constitutional Court decisions
        
        Include: Constitutional article numbers, statute names with years, case citations.`;
      } else {
        return `Search for examples of OFFICIAL NATIONAL legal documents protecting "${rightName}".
        
        REQUIRED: Official sources:
        - National government websites (.gov domains)
        - Constitutional databases (constituteproject.org)
        - Official legislation sites
        
        DO NOT USE: Wikipedia, news articles, educational summaries
        
        Find PRIMARY texts from various countries:
        - Constitutional provisions with article numbers
        - National legislation with statute names
        
        Include: Specific countries, article numbers, statute names with years.`;
      }

    default:
      return `Search for OFFICIAL legal instruments protecting "${rightName}" at ${scope} level ${subScope ? `in ${subScope}` : ''}.
      
      REQUIRED: Official sources from governments or international/regional organizations only
      DO NOT USE: Wikipedia, news sites, educational summaries
      
      Include: Full official names, years, article numbers or provisions.`;
  }
}

export async function getScopeAnalysis(rightName: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  try {
    const searchInstructions = getScopeSearchInstructions(scope, subScope, rightName);
    
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{
          text: searchInstructions
        }]
      }]
    });
    
    const text = result.response.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidate = result.response.candidates?.[0] as any;
    const groundingMetadata = candidate?.groundingMetadata;
    const groundingUrls = groundingMetadata?.groundingChunks
      ?.map((c: any) => ({ title: c.web?.title || "Source", uri: c.web?.uri }))
      .filter((c: any) => c.uri) || [];

    return await parseSearchResults(
      `${scope} legal instruments for ${rightName} ${subScope ? `in ${subScope}` : ''}`,
      text,
      groundingUrls,
      'legal'
    );
  } catch (error) {
    console.error("Legal search failed:", error);
    return { sources: [] };
  }
}

export async function getStatusAnalysis(rightName: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  try {
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{
          text: `Search for the MOST RECENT OFFICIAL reports on "${rightName}" ${subScope ? `in ${subScope}` : 'globally'}.
          
          CRITICAL: Find ONLY the latest reports from 2024-2025. Do not include older reports unless no recent ones exist.
          
          REQUIRED: Official sources from established human rights organizations:
          - Human Rights Watch (hrw.org) - latest annual reports, country reports
          - Amnesty International (amnesty.org) - latest annual reports, research
          - UN Human Rights Office (ohchr.org) - latest official reports, country visits
          - International Committee of the Red Cross (icrc.org)
          - UN specialized agencies (UNICEF, UNESCO, WHO, ILO)
          
          DO NOT USE:
          - Wikipedia or encyclopedias
          - News articles or opinion pieces
          - Blogs or personal websites
          - Secondary summaries
          - Reports older than 2023 (unless addressing historical context)
          
          Find the LATEST PRIMARY research and reports:
          - 2024-2025 annual reports (highest priority)
          - Recent country-specific assessments
          - Latest thematic reports
          - Most current official findings and recommendations
          - Recent statistical data from primary sources
          
          Avoid duplicates - if multiple sources cover the same report, choose the official organization's version.
          
          Include: Report titles WITH publication dates/years in the title, specific findings with direct quotes or data.
          IMPORTANT: Make sure dates are visible in titles (e.g., "2024 World Report", "Annual Report 2025").`
        }]
      }]
    });
    
    const text = result.response.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidate = result.response.candidates?.[0] as any;
    const groundingMetadata = candidate?.groundingMetadata;
    const groundingUrls = groundingMetadata?.groundingChunks
      ?.map((c: any) => ({ title: c.web?.title || "Source", uri: c.web?.uri }))
      .filter((c: any) => c.uri) || [];

    return await parseSearchResults(
      `status reports on ${rightName}`,
      text,
      groundingUrls,
      'ngo'
    );
  } catch (error) {
    console.error("Status search failed:", error);
    return { sources: [] };
  }
}

export async function getNexusAnalysis(fromRight: string, toRight: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  try {
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{
          text: `Search for PEER-REVIEWED academic research on the relationship between "${fromRight}" and "${toRight}" in human rights.
          
          Search query: "${fromRight}" AND "${toRight}" human rights intersection
          
          TEMPORAL PRIORITY: Find either:
          1. Highly influential/landmark research (highly cited, seminal works) - any year
          2. Recent studies (2020-2025) showing current scholarship
          
          Prefer papers that are EITHER frequently cited OR recently published, not mediocre old papers.
          
          REQUIRED: Academic sources with full-text access:
          - Google Scholar open access papers
          - University institutional repositories (.edu domains)
          - ResearchGate full papers (researchgate.net)
          - Academia.edu full papers (academia.edu)
          - SSRN working papers (ssrn.com)
          - arXiv preprints (arxiv.org)
          - Government research publications (.gov)
          - PubMed Central open access (ncbi.nlm.nih.gov/pmc)
          - PhD dissertations and theses
          
          DO NOT USE:
          - Wikipedia or encyclopedias
          - Paywalled journals (JSTOR, Springer, ScienceDirect, Wiley, Taylor & Francis)
          - Abstract-only pages
          - Citation-only pages
          - News articles or blogs
          
          Find PEER-REVIEWED or SCHOLARLY work:
          - Journal articles (open access)
          - Working papers and preprints
          - PhD dissertations
          - Academic books (if available)
          - Conference papers
          
          Avoid duplicates - if the same paper appears on multiple sites, choose the most official/primary version (e.g., author's institutional repository over ResearchGate).
          
          For each paper include in the title:
          - Full title WITH publication year in parentheses (e.g., "Title of Paper (2023)")
          - Author(s) if easily visible
          
          In the reference field:
          - How the two rights specifically intersect or interact
          - Key findings or theoretical arguments
          - Journal name (if applicable)`
        }]
      }]
    });
    
    const text = result.response.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidate = result.response.candidates?.[0] as any;
    const groundingMetadata = candidate?.groundingMetadata;
    const groundingUrls = groundingMetadata?.groundingChunks
      ?.map((c: any) => ({ title: c.web?.title || "Source", uri: c.web?.uri }))
      .filter((c: any) => c.uri) || [];

    return await parseSearchResults(
      `nexus between ${fromRight} and ${toRight}`,
      text,
      groundingUrls,
      'academic'
    );
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
