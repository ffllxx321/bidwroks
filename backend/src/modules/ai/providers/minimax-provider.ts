import { IAIProvider, AIParsingRequest, AIResult } from "../ai-provider.interface.ts";

export class MiniMaxProvider implements IAIProvider {
  public readonly name = "MiniMax-M2.7";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async extractTenderParams(request: AIParsingRequest): Promise<AIResult> {
    if (!this.apiKey) {
      console.warn("MiniMax Key is missing. Returning high fidelity fallback simulation parameters.");
      return this.generateMockBackup(request);
    }

    try {
      // Stub integration calling MiniMax API (mock response for skeleton phase)
      // Real API POST request to MiniMax can be performed here once credentials are saved
      return {
        content: JSON.stringify({
          projectName: "精密二期厂区总发包工程",
          grossFloorAreaValue: 90000,
          grossFloorAreaUnit: "㎡",
          durationValue: 400,
          durationUnit: "日历天",
          clientName: "智能精电有限会社",
        }),
        confidence: 0.94,
        requiresHumanConfirmation: true,
        citations: [
          {
            sourceFileId: "doc-102",
            sourceFileName: request.fileName,
            sourcePage: 4,
            sourceParagraph: "拟建基地总占地总建筑面积约为九万平方米，本期工天400天",
          }
        ],
      };
    } catch (err) {
      console.error("MiniMax compilation failed. Triggering backup.", err);
      return this.generateMockBackup(request);
    }
  }

  async translateTerms(text: string): Promise<string> {
    return `[MiniMax Translated] ${text}`;
  }

  private generateMockBackup(request: AIParsingRequest): AIResult {
    return {
      content: JSON.stringify({
        projectName: "上海青浦智能硬件研发基地项目",
        grossFloorAreaValue: 85000,
        grossFloorAreaUnit: "㎡",
        durationValue: 380,
        durationUnit: "日历天",
        clientName: "某知名微电子科技有限公司",
      }),
      confidence: 0.88,
      requiresHumanConfirmation: true,
      citations: [
        {
          sourceFileId: "doc-sample-99",
          sourceFileName: request.fileName,
          sourcePage: 2,
          sourceParagraph: "拟计划将该园区基地扩建，地上可承托的总建筑体量合八万五千平方米左右。",
        }
      ],
    };
  }
}
