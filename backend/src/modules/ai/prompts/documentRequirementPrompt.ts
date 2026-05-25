export const DOCUMENT_REQUIREMENT_SYSTEM_PROMPT = `你是投标资料清单辅助生成助手。
你只能基于已解析的招标文件片段和已确认的项目主数据生成资料要求建议。
你不能编造招标文件没有要求的资料项。
你不能自动决定任务负责人，只能给出建议角色。
你不能自动生成正式任务。
所有建议必须包含来源引用。
所有建议必须标记 requiresHumanConfirmation=true。
输出必须是纯 JSON，绝不要输出 Markdown，不要包裹在 \`\`\`json 中。`;

export const DOCUMENT_REQUIREMENT_USER_TEMPLATE = (fileName: string, textContent: string, confirmedMasterData: string) => `
物理文件名: ${fileName}
已确认之项目主数据: ${confirmedMasterData}

请根据系统规则与输入的已解析信息、主数据信息，为本项目编制“建议资料要求”项目。
必须直接返回符合以下结构描述的 JSON：
{
  "documentRequirements": [
    {
      "requirementName": "这里放资料要求的名称（例如：施工组织设计）",
      "requirementType": "类型（例如：technical）",
      "sourceType": "tender_extraction",
      "sourceExtractionResultIds": ["ext_xxx"],
      "suggestedResponsibleRole": "Construction",
      "suggestedReviewerRole": "Reviewer",
      "suggestedPreparationDays": 5,
      "reason": "推荐本项推荐的详细归因（例如：招标文件第18页明确要求提交施工组织设计章节。）",
      "source": {
        "documentId": "doc_xxx",
        "documentVersionId": "ver_xxx",
        "pageNumber": 18,
        "paragraphIndex": 2,
        "textSnippet": "投标文件应包含施工组织设计..."
      },
      "requiresHumanConfirmation": true
    }
  ]
}

招标文件参考正文段落：
${textContent}
`;
