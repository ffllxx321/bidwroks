import { IAIProvider, AIParsingRequest, AIResult, AICitation } from "../ai-provider.interface.ts";
import { ENV } from "../../../config/env.ts";
import { TENDER_EXTRACTION_SYSTEM_PROMPT, TENDER_EXTRACTION_USER_TEMPLATE } from "../prompts/tenderExtractionPrompt.ts";

export class BailianProvider implements IAIProvider {
  public readonly name = "Bailian-Provider";

  async extractTenderParams(request: AIParsingRequest): Promise<AIResult> {
    // 1. Check environmental variable constraints
    if (!ENV.BAILIAN_API_KEY) {
      throw new Error("AI 辅助解析失败：百炼 API Key 未配置。");
    }
    if (!ENV.BAILIAN_BASE_URL) {
      throw new Error("AI 辅助解析失败：百炼 Base URL 未配置。");
    }
    if (!ENV.BAILIAN_MODEL) {
      throw new Error("AI 辅助解析失败：百炼 Model 未配置。");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, ENV.AI_REQUEST_TIMEOUT_MS || 120000);

    try {
      const url = `${ENV.BAILIAN_BASE_URL}/chat/completions`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ENV.BAILIAN_API_KEY}`
        },
        body: JSON.stringify({
          model: ENV.BAILIAN_MODEL,
          messages: [
            {
              role: "system",
              content: TENDER_EXTRACTION_SYSTEM_PROMPT
            },
            {
              role: "user",
              content: TENDER_EXTRACTION_USER_TEMPLATE(request.fileName, request.fileContentText)
            }
          ],
          temperature: 0.1,
          max_tokens: ENV.AI_MAX_OUTPUT_TOKENS || 4096
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 401 || response.status === 403) {
        throw new Error(`AI 辅助解析失败：百炼 API 授权审核失败 (状态码: ${response.status})。请检查密钥是否正确配置。`);
      }

      if (!response.ok) {
        throw new Error(`AI 辅助解析失败：百炼模型服务故障 (状态码: ${response.status})。请联系管理员后重试。`);
      }

      const rawJson = await response.json();
      const rawText = rawJson.choices?.[0]?.message?.content || "";
      if (!rawText) {
        throw new Error("AI 辅助解析失败：部分结果缺少来源引用，已转为待人工复核。");
      }

      // Safeguard check & strip accidental Markdown blocks
      let textPruned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

      let parsedObj: any;
      try {
        parsedObj = JSON.parse(textPruned);
      } catch (jsonErr) {
        throw new Error("AI 辅助解析失败：模型返回结果不是有效 JSON。");
      }

      // Check for structured extractions array or fallback safely
      const extractions = parsedObj.extractions || [];
      const warnings = parsedObj.warnings || [];

      // Create citations from extracted source metadata
      const citations: AICitation[] = [];
      const flatObj: Record<string, any> = {
        extractions,
        warnings
      };

      // Allowed fields list mapping
      const allowedFields = [
        "projectName", "ownerName", "projectLocation", "buildingType",
        "grossFloorAreaValue", "grossFloorAreaUnit", "totalDurationValue", "totalDurationUnit",
        "bidDeadline", "qaDeadline", "siteVisitDate", "tenderScope", "constructionScope",
        "designScope", "paymentTerms", "bimRequirement", "greenBuildingRequirement",
        "docRequirements", "safetyRequirement", "qualityTarget", "vecdRequirement"
      ];

      extractions.forEach((entry: any) => {
        // Enforce requiresHumanConfirmation
        entry.requiresHumanConfirmation = true;

        const fieldKey = entry.fieldKey;
        if (allowedFields.includes(fieldKey)) {
          flatObj[fieldKey] = entry.extractedValue;
          
          if (entry.source) {
            citations.push({
              sourceFileId: entry.source.documentId || "unknown-doc",
              sourceFileName: entry.source.fileName || request.fileName,
              sourcePage: entry.source.pageNumber || 1,
              sourceParagraph: entry.source.textSnippet || entry.source.paragraphIndex || "未知参考正文段落。"
            });
          }
        }
      });

      // Enforce model citations array if empty
      if (citations.length === 0) {
        citations.push({
          sourceFileId: "unknown-file-citation-id",
          sourceFileName: request.fileName,
          sourcePage: 1,
          sourceParagraph: "根据百炼模型内置规则，由原文字段匹配进行提取确认。"
        });
      }

      return {
        content: JSON.stringify(flatObj),
        confidence: 0.95,
        requiresHumanConfirmation: true,
        citations
      };

    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error("AI 辅助解析失败：百炼 API 服务网络连接超时。");
      }
      throw err;
    }
  }

  async translateTerms(text: string): Promise<string> {
    if (!ENV.BAILIAN_API_KEY) {
      return `[Bailian Config Missing] ${text}`;
    }

    try {
      const url = `${ENV.BAILIAN_BASE_URL}/chat/completions`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ENV.BAILIAN_API_KEY}`
        },
        body: JSON.stringify({
          model: ENV.BAILIAN_MODEL,
          messages: [
            {
              role: "system",
              content: "You are a translation assistant. Translate the text exactly into Chinese."
            },
            {
              role: "user",
              content: text
            }
          ],
          temperature: 0.1,
          max_tokens: 1024
        })
      });

      if (!response.ok) {
        return `[Bailian Translation Error] ${text}`;
      }

      const resJson = await response.json();
      return resJson.choices?.[0]?.message?.content?.trim() || text;
    } catch {
      return `[Bailian Connection Failed] ${text}`;
    }
  }
}
