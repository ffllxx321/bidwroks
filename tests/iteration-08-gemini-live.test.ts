import { BailianFileService } from "../backend/src/modules/ai/bailian-file-service.ts";
import * as dotenv from "dotenv";
dotenv.config();

async function testGeminiLive() {
  console.log("=== [STARTING GEMINI LIVE DIAGNOSTICS] ===");
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("GEMINI_API_KEY exists:", !!apiKey);
  if (!apiKey) {
    console.error("No valid GEMINI_API_KEY found to run live test.");
    return;
  }

  // Create a realistic sample of tender text base64 encoded as if it was extracted
  const sampleText = "招标文件：项目正式名称为 2026年浦东新区新世代产业园项目BIM设计。发包业主/建设单位：上海浦东高科技园区开发有限公司。建设地点/地址：上海市浦东新区张江高科路88号。建筑大类：办公研发楼及数据中心，总建筑面积为 25000 平方米。总工期指标要求：合同工期为 180日历天。工程质量标准：确保达到合格工程标准。最高限价预算：约 1500 万元。投标截止日期：2026-08-30 10:00:00。";
  const dummyBase64 = Buffer.from(sampleText).toString("base64");

  try {
    const result = await BailianFileService.analyzeDocumentWithGemini(dummyBase64, "bim-design-tender.txt");
    console.log("=== Gemini Analysis Result Mapped successfully! ===");
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("Failed to parse or map document via Gemini:", err);
  }
}

testGeminiLive();
