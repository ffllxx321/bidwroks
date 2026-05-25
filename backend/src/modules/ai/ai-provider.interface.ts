export interface AICitation {
  sourceFileId: string;
  sourceFileName: string;
  sourcePage: number;
  sourceParagraph: string;
}

export interface AIResult {
  content: string; // The primary generated answer or structured params JSON
  confidence: number; // Decimal score from 0.0 to 1.0 representing reliability
  requiresHumanConfirmation: boolean; // Flag to enforce Human-in-the-Loop review before master-data updates
  citations: AICitation[]; // Specific citations representing physical citations
}

export interface AIParsingRequest {
  fileName: string;
  fileContentText: string;
  promptGuideline?: string;
}

export interface IAIProvider {
  name: string;
  extractTenderParams(request: AIParsingRequest): Promise<AIResult>;
  translateTerms(text: string): Promise<string>;
}
