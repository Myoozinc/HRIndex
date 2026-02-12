
export type Scope = 'International' | 'Regional' | 'National';
export type SearchMode = 'Framework' | 'Status';

export interface HumanRight {
  id: string;
  name: string;
  category: string;
  summary?: string;
}

export interface LegalInstrument {
  title: string;
  uri: string;
  date?: string;
  reference?: string;
}

export interface CanvasItem {
  id: string;
  rightId: string;
  name: string;
  summary?: string;
  x: number;
  y: number;
  analysis?: string; // Stored as JSON string of DialogueResult
  analysisType?: 'treaty' | 'status' | 'nexus';
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
  analysis?: string; // Stored as JSON string of DialogueResult
}

export interface DialogueResult {
  sources: LegalInstrument[];
  // Grounding URLs extracted from Google Search tool metadata to comply with API rules
  groundingUrls?: { title?: string; uri?: string }[];
}
