import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { DialogueResult, Scope, HumanRight } from "../types";

// Initialize Gemini Client
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "");

// Use the same model for everything to avoid 404 errors
const model = genAI.getGenerativeModel({
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

// Separate model for semantic search (returns plain array)
const semanticModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite",
  generationConfig: {
    responseMimeType: "application/json"
  }
});

export async function getScopeAnalysis(rightName: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  const prompt = `Provide detailed information about legal instruments (treaties, conventions, laws) protecting "${rightName}" in ${scope} context ${subScope ? `specifically for ${subScope}` : ''}. Include specific articles and provisions.
  
  Return a JSON object with "sources" array. Each source must have:
  - title: Title of the document or treaty
  - uri: A URL (construct a plausible one based on the source)
  - reference: A SHORT quote or summary (max 2 sentences)`;

  try {
    console.log('🔍 Legal search starting...');
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('✅ Legal search response received:', text);
    
    const parsed = JSON.parse(text);
    return parsed;
  } catch (error) {
    console.error("❌ Legal search failed:", error);
    return { 
      sources: [{
        title: "Information temporarily unavailable",
        uri: "#",
        reference: "Unable to retrieve legal framework information at this time. Please try again later."
      }]
    };
  }
}

export async function getStatusAnalysis(rightName: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  const prompt = `Provide information about the current status of "${rightName}" in ${subScope || 'the world'}, including recent reports and findings from human rights organizations.
  
  Return a JSON object with "sources" array. Each source must have:
  - title: Title of the report or article
  - uri: A URL (construct a plausible one)
  - reference: A SHORT quote or finding (max 2 sentences)`;

  try {
    console.log('🔍 Status search starting...');
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('✅ Status search response received:', text);
    
    const parsed = JSON.parse(text);
    return parsed;
  } catch (error) {
    console.error("❌ Status search failed:", error);
    return { 
      sources: [{
        title: "Information temporarily unavailable",
        uri: "#",
        reference: "Unable to retrieve status information at this time. Please try again later."
      }]
    };
  }
}

export async function getNexusAnalysis(fromRight: string, toRight: string, scope: Scope, subScope: string): Promise<DialogueResult> {
  const prompt = `Explain the relationship and intersection between "${fromRight}" and "${toRight}" in the context of human rights, including how they interact and reinforce each other.
  
  Return a JSON object with "sources" array. Each source must have:
  - title: Title of relevant research or documentation
  - uri: A URL (construct a plausible one)
  - reference: A SHORT explanation of the connection (max 2 sentences)`;

  try {
    console.log('🔍 Nexus search starting...');
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log('✅ Nexus search response received:', text);
    
    const parsed = JSON.parse(text);
    return parsed;
  } catch (error) {
    console.error("❌ Nexus search failed:", error);
    return { 
      sources: [{
        title: "Information temporarily unavailable",
        uri: "#",
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
    const result = await semanticModel.generateContent(prompt);
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
    
    // Check if it's already an array first
    if (Array.isArray(parsed)) {
      console.log('✅ Semantic search completed successfully:', parsed);
      return parsed;
    }
    
    // If it's an object with an array property, try to extract it
    if (typeof parsed === 'object' && parsed !== null) {
      console.warn('⚠️ Parsed result is not an array, searching for array in object:', typeof parsed, parsed);
      const keys = Object.keys(parsed);
      for (const key of keys) {
        if (Array.isArray(parsed[key])) {
          console.log('✅ Found array at key:', key);
          return parsed[key];
        }
      }
    }
    
    console.warn('⚠️ No array found, returning empty array');
    return [];
  } catch (error) {
    console.error("❌ Semantic search failed:", error);
    return [];
  }
}
