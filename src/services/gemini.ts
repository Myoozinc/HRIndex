import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { DialogueResult, Scope, HumanRight } from "../types";

// Initialize Gemini Client
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "");

// Model for general content generation
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite"
});

// Model for structured JSON parsing
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
    
    const legalPrompt = `
      Based on this information about legal protections for "${rightName}":
      
      CONTEXT:
      ${text}

      Extract legal instruments into a JSON structure with "sources".
      Each source MUST be a real legal document with:
      - title: Full official name of the treaty, convention, or law
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
  const queryText = `You are a human rights researcher. Find SPECIFIC, REAL reports from human rights organizations about ${rightName} in ${subScope || 'the world'}.

Requirements: Find 3-4 actual published reports from Human Rights Watch, Amnesty International, UN Human Rights Council, or similar credible organizations. Focus on reports from the last 12-18 months if possible. Each report must have a specific title and publication date.

Return the actual reports you find with their exact titles, organizations, and publication dates.`;

  try {
    console.log('🔍 Status search starting...');
    const result = await model.generateContent(queryText);
    const text = result.response.text();
    console.log('✅ Status search response received');
    
    const statusPrompt = `You found these reports about ${rightName} in ${subScope || 'the world'}:
      
CONTEXT:
${text}

Create a JSON structure with sources array. For each report found, use this MANDATORY FORMAT:

{
  "title": "EXACT report title as published",
  "uri": "Direct URL to the report on the organization website",
  "reference": "DIRECT QUOTE from the report in quotation marks (1-2 sentences) about the topic, followed by - Organization Name, Month Year"
}

CRITICAL RULES:
1. Title must be SPECIFIC and REAL
2. URI must be direct link to actual report
3. Reference MUST contain a DIRECT QUOTE in quotation marks
4. DO NOT write summaries, only direct quotes from reports

Return 3-4 sources with real reports and direct quotes.`;

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
  const queryText = `You are a legal research assistant. Find SPECIFIC, REAL academic papers from Google Scholar that analyze both ${fromRight} AND ${toRight} together in human rights context.

Requirements: Find 3-4 actual published papers. Each paper must have a specific title, author names, publication year, and journal name. Papers must directly discuss BOTH rights and their relationship.

Search Google Scholar for papers about the intersection of these two rights.

Return the actual papers you find with their exact titles, authors, and where they were published.`;

  try {
    console.log('🔍 Nexus search starting for Google Scholar...');
    const result = await model.generateContent(queryText);
    const text = result.response.text();
    console.log('✅ Nexus search response received');
    
    const academicPrompt = `You found these papers about ${fromRight} and ${toRight}:
      
CONTEXT:
${text}

Create a JSON structure with sources array. For each paper found, use this MANDATORY FORMAT:

{
  "title": "EXACT paper title as published",
  "uri": "https://scholar.google.com/scholar?q=EXACT+TITLE+WITH+PLUS+SIGNS",
  "reference": "DIRECT QUOTE from the paper abstract or introduction in quotation marks (1-2 sentences) that discusses both rights, followed by - Author names, Year, Journal Name"
}

CRITICAL RULES:
1. Title must be SPECIFIC and REAL
2. URI must be Google Scholar search link with exact paper title
3. Reference MUST contain a DIRECT QUOTE in quotation marks
4. DO NOT write summaries, only direct quotes from papers

Return 3-4 sources with real papers and direct quotes.`;

    const academicResult = await modelNoSearch.generateContent(academicPrompt);
    const parsed = JSON.parse(academicResult.response.text());
    console.log('✅ Academic sources parsed');
    return parsed;
  } catch (error) {
    console.error("❌ Nexus search failed:", error);
    return { 
      sources: [{
        title: "Academic research temporarily unavailable",
        uri: `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${fromRight}" AND "${toRight}" human rights`)}`,
        reference: `Search Google Scholar manually for peer-reviewed papers analyzing both ${fromRight} and ${toRight}. Use quotation marks around each term for precise results.`
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
    
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ JSON parse failed:', parseError);
      console.error('Response was:', responseText);
      return [];
    }
    
    console.log('✅ Parsed result:', parsed, 'Type:', typeof parsed);
    
    if (!parsed) {
      console.warn('⚠️ Parsed result is null/undefined, returning empty array');
      return [];
    }
    
    if (!Array.isArray(parsed)) {
      console.warn('⚠️ Parsed result is not an array:', typeof parsed, parsed);
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
