import { IAIProvider, AIParsingRequest, AIResult } from "../ai-provider.interface.ts";

export class MockAIProvider implements IAIProvider {
  public readonly name = "Mock-Local-LLM";

  async extractTenderParams(request: AIParsingRequest): Promise<AIResult> {
    return {
      content: JSON.stringify({
        projectName: "Mock 招标说明一期工程",
        grossFloorAreaValue: 120000,
        grossFloorAreaUnit: "㎡",
        durationValue: 450,
        durationUnit: "日历天",
        clientName: "模拟开发大集业主集团",
      }),
      confidence: 1.0,
      requiresHumanConfirmation: true,
      citations: [
        {
          sourceFileId: "mock-doc-001",
          sourceFileName: request.fileName,
          sourcePage: 1,
          sourceParagraph: "这里是模拟的招标文件正文，建筑体量规划约十二万平米，总工期限制450日历天。",
        }
      ],
    };
  }

  async translateTerms(text: string): Promise<string> {
    return `[Mock Translation] ${text}`;
  }
}
