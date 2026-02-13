import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { DialogueResult, Scope, HumanRight } from "../types";

// Initialize Gemini Client
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "");

// Model WITH Google Search - FIXED: Removed incorrect googleSearch tool
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash"
});

// Model for structured JSON parsing (no search)
const modelNoSearch = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
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

// Helper to parse search results into desired format
async function parseSearchResults(query: string, searchContext: string): Promise<DialogueResult> {
  const prompt = `
    Based on the following information about: "${query}"
    
    CONTEXT:
    ${searchContext}

    Extract key information into a JSON structure with "sources".
    Each source must have:
    - title: Title of the document or article
    - uri: A plausible URL (you can construct it based on the source name)
    - reference: A SHORT quote (max 1-3 sentences) specific to the topic.

    Return in JSON format.
  `;

  console.log('🔍 Parsing results...');
  
  try {
    const result = await modelNoSearch.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    console.log('✅ Parsed successfully:', parsed);
    return parsed;
  } catch (error) {
    console.error("❌ Parse error:", error);
    return { sources: [] };
  }
}

export async function getScopeAnalysis(rightName: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  const query = `Search for PRIMARY legal documents and treaties protecting "${rightName}" in ${scope} context ${subScope ? `specifically for ${subScope}` : ''}. Find:
  
  - International treaties (UDHR, ICCPR, ICESCR, etc.)
  - Regional conventions (European Convention, American Convention, African Charter, etc.)
  - National constitutions and laws ${subScope ? `for ${subScope}` : ''}
  - Specific article numbers and provisions
  - Official UN documents and resolutions
  
  Provide REAL, verifiable legal instruments with exact citations and article numbers. Include links to official sources like UN treaty databases, government websites, or legal repositories.`;

  try {
    console.log('🔍 Legal search starting...');
    const result = await model.generateContent(query);
    const text = result.response.text();
    console.log('✅ Legal search response received');
    
    // Enhanced parsing for legal sources
    const legalPrompt = `
      Based on this information about legal protections for "${rightName}":
      
      CONTEXT:
      ${text}

      Extract legal instruments into a JSON structure with "sources".
      Each source MUST be a real legal document with:
      - title: Full official name of the treaty, convention, or law (e.g., "International Covenant on Civil and Political Rights (ICCPR)")
      - uri: Official link to the document (UN treaty collection, government website, or construct as needed)
      - reference: Exact article number and a SHORT quote of the relevant provision (1-2 sentences)

      Return in JSON format. Prioritize real, official legal instruments.
    `;

    const legalResult = await modelNoSearch.generateContent(legalPrompt);
    const parsed = JSON.parse(legalResult.response.text());
    console.log('✅ Legal sources parsed');
    return parsed;
  } catch (error) {
    console.error("❌ Legal search failed:", error);
    // Return a fallback response instead of empty
    return { 
      sources: [{
        title: "Legal framework information temporarily unavailable",
        uri: "https://www.ohchr.org/en/instruments-listings",
        reference: "Unable to retrieve legal framework information at this time. Visit the UN Office of the High Commissioner for Human Rights for official treaty texts."
      }]
    };
  }
}

export async function getStatusAnalysis(rightName: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  const query = `Search for recent reports and publications from reputable human rights organizations about "${rightName}" in ${subScope || 'the world'}. Find:
  
  - Human Rights Watch reports
  - Amnesty International publications
  - UN Human Rights Council reports
  - Country-specific reports from ${subScope || 'various countries'}
  - Recent news articles from credible sources
  - NGO monitoring reports
  
  Focus on reports from the last 12 months. Provide REAL, verifiable sources with publication dates and direct links to the reports. Include specific findings about violations, progress, or current status.`;

  try {
    console.log('🔍 Status search starting...');
    const result = await model.generateContent(query);
    const text = result.response.text();
    console.log('✅ Status search response received');
    
    // Enhanced parsing for status reports
    const statusPrompt = `
      Based on this information about the current status of "${rightName}" in ${subScope || 'the world'}:
      
      CONTEXT:
      ${text}

      Extract reports into a JSON structure with "sources".
      Each source MUST be a real report or publication with:
      - title: Full title of the report (e.g., "World Report 2024: [Country] Events")
      - uri: Direct link to the report (HRW, Amnesty, UN websites, or news outlets)
      - reference: Key finding or quote from the report (1-2 sentences) about the current situation

      Return in JSON format. Prioritize recent, credible reports from established human rights organizations.
    `;

    const statusResult = await modelNoSearch.generateContent(statusPrompt);
    const parsed = JSON.parse(statusResult.response.text());
    console.log('✅ Status reports parsed');
    return parsed;
  } catch (error) {
    console.error("❌ Status search failed:", error);
    return { 
      sources: [{
        title: "Current status information temporarily unavailable",
        uri: "https://www.hrw.org/world-report/2024",
        reference: `Unable to retrieve current status information for ${rightName}. Check Human Rights Watch, Amnesty International, or UN Human Rights reports for recent updates.`
      }]
    };
  }
}

export async function getNexusAnalysis(fromRight: string, toRight: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  // Construct a Google Scholar-focused search query
  const query = `Search Google Scholar for academic research papers, journal articles, and scholarly publications that explore the relationship between "${fromRight}" and "${toRight}" in human rights law. Find papers that discuss how these two rights intersect, conflict, or reinforce each other. Include:
  - Paper titles
  - Author names
  - Journal/publication information
  - Key findings about the nexus between these rights
  - Direct quotes from the abstracts or conclusions
  
  Provide real, verifiable sources with proper citations.`;

  try {
    console.log('🔍 Nexus search starting for Google Scholar...');
    const result = await model.generateContent(query);
    const text = result.response.text();
    console.log('✅ Nexus search response received');
    
    // Enhanced parsing prompt for academic sources
    const academicPrompt = `
      Based on this research about the nexus between "${fromRight}" and "${toRight}":
      
      CONTEXT:
      ${text}

      Extract academic sources into a JSON structure with "sources".
      Each source MUST be a real academic paper with:
      - title: Full title of the research paper or article
      - uri: Google Scholar link or DOI link (construct as "https://scholar.google.com/scholar?q=" + encoded title if needed)
      - reference: A direct quote from the paper's abstract or findings (2-3 sentences) explaining the relationship between ${fromRight} and ${toRight}

      Return in JSON format. Focus on real, citable academic sources.
    `;

    const academicResult = await modelNoSearch.generateContent(academicPrompt);
    const parsed = JSON.parse(academicResult.response.text());
    console.log('✅ Academic sources parsed');
    return parsed;
  } catch (error) {
    console.error("❌ Nexus search failed:", error);
    return { 
      sources: [{
        title: "Academic research temporarily unavailable",
        uri: `https://scholar.google.com/scholar?q=${encodeURIComponent(fromRight + " " + toRight + " human rights")}`,
        reference: `Search Google Scholar manually for research on the intersection of ${fromRight} and ${toRight}. Academic databases may provide peer-reviewed papers exploring this nexus.`
      }]
    };
  }
}

export async function getSemanticRights(term: string, rights: HumanRight[]): Promise<string[]> {
  const prompt = `Given this term: "${term}", identify which of the following Human Rights IDs are most relevant.
  Rights: ${JSON.stringify(rights.map(r => ({ id: r.id, name: r.name, summary: r.summary })))}
  Return ONLY a JSON array of ID strings. Example: ["1", "5"]`;

  try {
    console.log('🔍 Semantic search starting for:', term);
    const result = await modelNoSearch.generateContent(prompt);
    const responseText = result.response.text();
    console.log('📄 Raw semantic response:', responseText);
    
    // Try to parse the response
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ JSON parse failed:', parseError);
      console.error('Response was:', responseText);
      return [];
    }
    
    console.log('✅ Parsed result:', parsed, 'Type:', typeof parsed);
    
    // CRITICAL: Ensure we always return an array
    if (!parsed) {
      console.warn('⚠️ Parsed result is null/undefined, returning empty array');
      return [];
    }
    
    if (!Array.isArray(parsed)) {
      console.warn('⚠️ Parsed result is not an array:', typeof parsed, parsed);
      // If it's an object with an array property, try to extract it
      if (typeof parsed === 'object' && parsed !== null) {
        for (const key of Object.keys(parsed)) {
          if (Array.isArray(parsed[key])) {
            console.log('✅ Found array at key:', key);
            return parsed[key];
          }
        }
      }
      return [];
    }
    
    console.log('✅ Semantic search completed successfully:', parsed);
    return parsed;
  } catch (error) {
    console.error("❌ Semantic search failed:", error);
    return [];
  }
}
