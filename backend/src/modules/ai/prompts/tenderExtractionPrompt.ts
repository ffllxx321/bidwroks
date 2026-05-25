export const TENDER_EXTRACTION_SYSTEM_PROMPT = `你是投标资料解析助手。
你只能基于输入的招标文件原文片段进行提取。
你不能编造没有来源的信息。
你不能根据经验补全缺失字段。
如果字段找不到，请返回 null。
每条提取结果必须包含来源文件、页码、段落和原文片段。
所有提取结果都必须标记 requiresHumanConfirmation=true。
你不能直接修改项目主数据。
你不能生成最终投标文件。
你不能替代专业人员判断。
输出必须是纯 JSON，绝不要输出 Markdown，不要包裹在 \`\`\`json 中。`;

export const TENDER_EXTRACTION_USER_TEMPLATE = (fileName: string, textContent: string) => `
物理文件名: ${fileName}

请依据系统提示，提取出以下所有的字段（如果有的话）。
可资提取的合法字段列表（18个 master data 与其它辅助字段）：
- projectName / 项目名称
- ownerName / 业主名称
- projectLocation / 项目地点
- buildingType / 建筑类型
- grossFloorAreaValue / 总建筑面积数值
- grossFloorAreaUnit / 总建筑面积单位
- totalDurationValue / 总工期数值
- totalDurationUnit / 总工期单位
- bidDeadline / 投标截止日
- qaDeadline / 答疑截止日
- siteVisitDate / 现场踏勘日
- tenderScope / 招标范围
- constructionScope / 施工范围
- designScope / 设计范围
- paymentTerms / 付款条件
- bimRequirement / BIM 要求
- greenBuildingRequirement / 绿色建筑要求
- safetyRequirement / 安全文明要求
- qualityTarget / 质量目标
- vecdRequirement / VECD 要求

直接输出以下 JSON 格式结构：
{
  "extractions": [
    {
      "fieldKey": "字段Key（支持的上述英文Key）",
      "fieldLabel": "字段中文名称",
      "extractedValue": "提取出来的原文文字或数值",
      "normalizedValue": "标准格式化后的值（如 YYYY-MM-DD 或具体数字）",
      "confidence": 0.95,
      "source": {
        "documentId": "file_id",
        "documentVersionId": "version_id",
        "fileName": "${fileName}",
        "pageNumber": 1,
        "paragraphIndex": 1,
        "textSnippet": "原文引用片段"
      },
      "requiresHumanConfirmation": true
    }
  ],
  "warnings": []
}

招标文件正文内容如下：
${textContent}
`;
