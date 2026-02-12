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
              year: { type: SchemaType.STRING },
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

// Trusted domains for legal instruments, research, and reports
const TRUSTED_DOMAINS = {
  legal: [
    // International
    'un.org', 'ohchr.org', 'unicef.org', 'unesco.org', 'who.int', 'ilo.org',
    'treaties.un.org', 'legal.un.org', 'icj-cij.org',
    // Regional bodies
    'echr.coe.int', // European Court of Human Rights
    'coe.int', // Council of Europe
    'achpr.org', // African Commission on Human and Peoples' Rights
    'african-court.org', // African Court
    'corteidh.or.cr', // Inter-American Court of Human Rights
    'oas.org', // Organization of American States
    'iachr.org', // Inter-American Commission
    'asean.org', // ASEAN
    'europarl.europa.eu', // European Parliament
    'europa.eu', // European Union
    'refworld.org', // UNHCR Refworld (has regional instruments)
    // National governments
    '.gov', '.gob', '.gc.ca', '.gov.uk', '.gov.au', // Government sites
    'legislation.gov.uk', // UK legislation
    'legifrance.gouv.fr', // French legislation
    'gesetze-im-internet.de', // German legislation
    'constitution.org', // Constitutional documents
    'constituteproject.org', // Constitutions database
  ],
  ngo: [
    'hrw.org', 'amnesty.org', 'icrc.org', 'humanrightsfirst.org',
    'article19.org', 'fidh.org', 'civilliberties.org'
  ],
  academic: [
    'scholar.google.com',
    'researchgate.net',
    'academia.edu',
    'ssrn.com',
    'arxiv.org',
    '.edu',
    '.gov',
    'philpapers.org',
    'semanticscholar.org',
    'europepmc.org',
    'ncbi.nlm.nih.gov',
    'openaccess',
    '/pdf',
  ]
};

// Helper to check if URL is from trusted source
function isTrustedSource(url: string, type: 'legal' | 'ngo' | 'academic'): boolean {
  return TRUSTED_DOMAINS[type].some(domain => url.toLowerCase().includes(domain.toLowerCase()));
}

// Verify URL is likely to be accessible
function isLikelyAccessible(url: string, sourceType: 'legal' | 'ngo' | 'academic'): boolean {
  if (sourceType === 'legal' || sourceType === 'ngo') {
    return true;
  }
  
  const goodPatterns = [
    'scholar.google.com',
    'researchgate.net',
    'academia.edu',
    'ssrn.com',
    'arxiv.org',
    '.edu',
    '/pdf',
    'openaccess',
    'philpapers.org',
    'semanticscholar.org',
    'europepmc.org',
    'ncbi.nlm.nih.gov/pmc'
  ];
  
  const badPatterns = [
    'jstor.org',
    'springer.com',
    'sciencedirect.com',
    'tandfonline.com',
    'wiley.com',
    'cambridge.org/core/journals',
    'oxfordjournals.org',
    '/abstract',
    '/citation',
  ];
  
  const isGood = goodPatterns.some(pattern => url.toLowerCase().includes(pattern));
  const isBad = badPatterns.some(pattern => url.toLowerCase().includes(pattern));
  
  return isGood && !isBad;
}

// Helper to parse search results
async function parseSearchResults(query: string, searchContext: string, groundingUrls: any[], sourceType: 'legal' | 'ngo' | 'academic'): Promise<DialogueResult> {
  let trustedUrls;
  
  if (sourceType === 'legal') {
    // For legal sources, be more permissive - just check basic trust
    trustedUrls = groundingUrls.filter(url => isTrustedSource(url.uri, sourceType));
  } else {
    // For academic/NGO, apply both filters
    trustedUrls = groundingUrls.filter(url => 
      isTrustedSource(url.uri, sourceType) && isLikelyAccessible(url.uri, sourceType)
    );
  }
  
  if (trustedUrls.length === 0) {
    console.warn("No trusted/accessible sources found in grounding results");
    console.log("Available URLs:", groundingUrls.map(u => u.uri)); // Debug logging
    return { sources: [] };
  }

  const prompt = `
    Based on the following search results about: "${query}"
    
    SEARCH CONTEXT:
    ${searchContext}

    Available verified sources (ONLY reference these by index, DO NOT invent sources):
    ${trustedUrls.map((u, i) => `[${i}] ${u.title}\n    URL: ${u.uri}`).join('\n\n')}

    CRITICAL RULES:
    1. ONLY use sources that appear in the list above
    2. Reference sources by their index number [0, 1, 2, etc.]
    3. DO NOT create, invent, or modify any URLs
    4. If a source isn't in the list, don't include it
    5. Better to return fewer sources than to hallucinate
    6. Each source MUST have been found in the search results

    For each source you reference:
    - urlIndex: The exact index from the list above
    - title: Enhanced with full official name and year if available
    - year: Publication year (or "N/A")
    - reference: Direct quote or specific finding (max 2 sentences)

    Return JSON with "analysis" (brief summary) and "sourceMatches" array.
  `;

  try {
    const result = await modelNoSearch.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    
    const sources = parsed.sourceMatches
      .filter((match: any) => {
        const index = match.urlIndex;
        const isValid = Number.isInteger(index) && index >= 0 && index < trustedUrls.length;
        if (!isValid) {
          console.warn(`Invalid urlIndex ${index}, skipping source`);
        }
        return isValid;
      })
      .map((match: any) => ({
        title: match.title,
        uri: trustedUrls[match.urlIndex].uri,
        date: match.year || "N/A",
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
      return `Search for INTERNATIONAL legal instruments protecting "${rightName}".
      
      Focus on:
      - UN treaties and conventions (treaties.un.org, ohchr.org)
      - International Covenant on Civil and Political Rights (ICCPR)
      - International Covenant on Economic, Social and Cultural Rights (ICESCR)
      - Universal Declaration of Human Rights (UDHR)
      - Convention on the Rights of the Child (CRC)
      - Convention on the Elimination of All Forms of Discrimination Against Women (CEDAW)
      - Other UN human rights treaties
      
      Include full official names with adoption years and specific article numbers.`;

    case 'regional':
      let regionalInstructions = `Search for REGIONAL legal instruments protecting "${rightName}"`;
      
      if (subScope) {
        const region = subScope.toLowerCase();
        if (region.includes('europe') || region.includes('european')) {
          regionalInstructions += ` in Europe.
          
          Focus on:
          - European Convention on Human Rights (ECHR) - echr.coe.int
          - EU Charter of Fundamental Rights - europa.eu
          - Council of Europe conventions - coe.int
          - European Court of Human Rights case law
          
          Include article numbers and case citations.`;
        } else if (region.includes('africa') || region.includes('african')) {
          regionalInstructions += ` in Africa.
          
          Focus on:
          - African Charter on Human and Peoples' Rights - achpr.org
          - African Court decisions - african-court.org
          - Protocol on the Rights of Women in Africa
          - African Children's Charter
          
          Include article numbers and relevant decisions.`;
        } else if (region.includes('america') || region.includes('inter-american')) {
          regionalInstructions += ` in the Americas.
          
          Focus on:
          - American Convention on Human Rights - corteidh.or.cr
          - Inter-American Court decisions - iachr.org
          - American Declaration of the Rights and Duties of Man
          - Additional Protocols
          
          Include article numbers and case law.`;
        } else if (region.includes('asia') || region.includes('asean')) {
          regionalInstructions += ` in Asia.
          
          Focus on:
          - ASEAN Human Rights Declaration - asean.org
          - Regional mechanisms and frameworks
          - Specialized conventions
          
          Include relevant provisions and mechanisms.`;
        } else {
          regionalInstructions += `.
          
          Look for regional human rights systems including:
          - European (ECHR, EU Charter)
          - African (African Charter)
          - Inter-American (American Convention)
          - ASEAN (ASEAN Declaration)
          
          Include specific regional instruments and article numbers.`;
        }
      } else {
        regionalInstructions += `.
        
        Search across all regional systems:
        - European Convention on Human Rights (echr.coe.int)
        - African Charter on Human and Peoples' Rights (achpr.org)
        - American Convention on Human Rights (corteidh.or.cr)
        - ASEAN Human Rights Declaration (asean.org)
        
        Include article numbers and relevant provisions.`;
      }
      
      return regionalInstructions;

    case 'national':
      if (subScope) {
        return `Search for NATIONAL laws and constitutional provisions protecting "${rightName}" in ${subScope}.
        
        Focus on:
        - National constitution (constituteproject.org, constitution.org)
        - Domestic legislation (.gov, .gob, legislation sites)
        - Bill of Rights or equivalent
        - Specific statutes and laws
        - Supreme Court or Constitutional Court decisions
        
        Use official government sources (.gov, .gob, .gc.ca, .gov.uk, etc.)
        Include constitutional article numbers and statute names with years.`;
      } else {
        return `Search for examples of NATIONAL laws protecting "${rightName}" across different countries.
        
        Focus on:
        - Constitutional provisions (constituteproject.org)
        - National legislation from various countries
        - Comparative constitutional law
        - Model national laws
        
        Include specific country examples with constitutional articles and statute names.`;
      }

    default:
      return `Search for legal instruments protecting "${rightName}" at ${scope} level ${subScope ? `in ${subScope}` : ''}.
      
      Include full official names, years, and specific article numbers or provisions.`;
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
          text: `Search for recent reports (2024-2025) on "${rightName}" in ${subScope || 'the world'}.
          
          ONLY use sources from these domains:
          - hrw.org (Human Rights Watch)
          - amnesty.org (Amnesty International)
          - ohchr.org (UN Human Rights)
          
          Find:
          - Recent published reports with dates
          - Country-specific assessments
          - Key findings about violations or progress
          - Statistical data
          
          Include direct quotes from the reports.`
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
          text: `Use Google Scholar to search for peer-reviewed academic research on the intersection between "${fromRight}" and "${toRight}".
          
          Search query to use: "${fromRight}" AND "${toRight}" human rights intersection
          
          PRIORITY SOURCES (in order):
          1. Google Scholar results (scholar.google.com)
          2. Open access repositories (.edu, ResearchGate, Academia.edu)
          3. SSRN and arXiv preprints
          4. Government research papers (.gov)
          5. PubMed Central open access (ncbi.nlm.nih.gov/pmc)
          
          CRITICAL - DO NOT USE:
          - Paywalled journals (JSTOR, Springer, ScienceDirect, Wiley, Taylor & Francis)
          - Abstract-only pages
          - Citation-only pages
          
          Find:
          - Peer-reviewed journal articles
          - Academic papers with full text access
          - Working papers and preprints
          - Theses and dissertations
          - Government research publications
          
          For each paper, include:
          - Full title with year
          - Author(s) if available
          - How the two rights intersect or interact
          - Key findings or arguments
          
          Focus on papers that explicitly discuss both rights together.`
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
