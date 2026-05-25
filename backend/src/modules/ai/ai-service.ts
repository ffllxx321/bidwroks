import { IAIProvider, AIParsingRequest, AIResult } from "./ai-provider.interface.ts";
import { MiniMaxProvider } from "./providers/minimax-provider.ts";
import { MockAIProvider } from "./providers/mock-provider.ts";
import { GeminiProvider } from "./providers/gemini-provider.ts";
import { BailianProvider } from "./providers/BailianProvider.ts";
import { ENV } from "../../config/env.ts";

export class AIService {
  private getProvider(): IAIProvider {
    const selected = (ENV.AI_PROVIDER || "bailian").toLowerCase();
    if (selected === "bailian") {
      return new BailianProvider();
    } else if (selected === "minimax" || selected === "minimax-m2.7") {
      return new MiniMaxProvider(ENV.MINIMAX_API_KEY || "");
    } else if (selected === "gemini" || selected === "gemini-pro") {
      return new GeminiProvider(process.env.GEMINI_API_KEY || "");
    } else {
      return new MockAIProvider();
    }
  }

  /**
   * Primary entrypoint for parsing bids/tenders into structured schemas.
   */
  async parseTender(request: AIParsingRequest): Promise<AIResult> {
    const provider = this.getProvider();
    console.log(`[AI-GATEWAY] Routing extraction request for file: ${request.fileName} to: ${provider.name}`);
    return provider.extractTenderParams(request);
  }

  /**
   * Unified interface for utility translations or summarization.
   */
  async translate(text: string): Promise<string> {
    const provider = this.getProvider();
    return provider.translateTerms(text);
  }
}

// Export single singleton instance
export const aiGateway = new AIService();
