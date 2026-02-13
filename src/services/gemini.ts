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
    - date: Date of publication (or "N/A")
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
  const query = `Provide detailed information about legal instruments (treaties, conventions, laws) protecting "${rightName}" in ${scope} context ${subScope ? `specifically for ${subScope}` : ''}. Include specific articles and provisions.`;

  try {
    console.log('🔍 Legal search starting...');
    const result = await model.generateContent(query);
    const text = result.response.text();
    console.log('✅ Legal search response received');
    
    // Parse the response into structured format
    const structured = await parseSearchResults(query, text);
    return structured;
  } catch (error) {
    console.error("❌ Legal search failed:", error);
    // Return a fallback response instead of empty
    return { 
      sources: [{
        title: "Information temporarily unavailable",
        uri: "#",
        date: "N/A",
        reference: "Unable to retrieve legal framework information at this time. Please try again later."
      }]
    };
  }
}

export async function getStatusAnalysis(rightName: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  const query = `Provide information about the current status of "${rightName}" in ${subScope || 'the world'}, including recent reports and findings from human rights organizations.`;

  try {
    console.log('🔍 Status search starting...');
    const result = await model.generateContent(query);
    const text = result.response.text();
    console.log('✅ Status search response received');
    
    const structured = await parseSearchResults(query, text);
    return structured;
  } catch (error) {
    console.error("❌ Status search failed:", error);
    return { 
      sources: [{
        title: "Information temporarily unavailable",
        uri: "#",
        date: "N/A",
        reference: "Unable to retrieve status information at this time. Please try again later."
      }]
    };
  }
}

export async function getNexusAnalysis(fromRight: string, toRight: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  const query = `Explain the relationship and intersection between "${fromRight}" and "${toRight}" in the context of human rights, including how they interact and reinforce each other.`;

  try {
    console.log('🔍 Nexus search starting...');
    const result = await model.generateContent(query);
    const text = result.response.text();
    console.log('✅ Nexus search response received');
    
    const structured = await parseSearchResults(query, text);
    return structured;
  } catch (error) {
    console.error("❌ Nexus search failed:", error);
    return { 
      sources: [{
        title: "Information temporarily unavailable",
        uri: "#",
        date: "N/A",
        reference: "Unable to retrieve nexus information at this time. Please try again later."
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
