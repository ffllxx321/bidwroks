import db, { initDb } from "../backend/src/database/db.ts";
import { BailianProvider } from "../backend/src/modules/ai/providers/BailianProvider.ts";
import { AIService } from "../backend/src/modules/ai/ai-service.ts";
import { ENV } from "../backend/src/config/env.ts";

async function runBailianTests() {
  console.log("====================================================================");
  console.log("🚀 [START] ALIBABA Model Studio / DashScope (Bailian) API Test Suite");
  console.log("====================================================================\n");

  initDb();

  // Test 1: Instantiation of BailianProvider
  console.log("--- Test 1: Instantiation ---");
  const provider = new BailianProvider();
  if (provider.name !== "Bailian-Provider") {
    throw new Error(`Expected provider name 'Bailian-Provider', but got ${provider.name}.`);
  }
  console.log("✅ BailianProvider instantiated successfully with name:", provider.name);

  // Test 2: Error bounds check without credentials
  console.log("\n--- Test 2: Error Bounds Check (Missing API Key) ---");
  const originalApiKey = ENV.BAILIAN_API_KEY;
  
  // Explicitly strip API key to test failure modes
  (ENV as any).BAILIAN_API_KEY = "";
  try {
    await provider.extractTenderParams({
      fileName: "测试招标文件.pdf",
      fileContentText: "项目总建筑面积达到九万平方米。"
    });
    throw new Error("Failure: Expected extraction to throw an error when API key is missing, but it succeeded.");
  } catch (err: any) {
    if (err.message.includes("API Key 未配置")) {
      console.log("✅ Successfully caught missing API key configuration rejection:", err.message);
    } else {
      throw new Error(`Unexpected error message during missing API Key test: ${err.message}`);
    }
  }
  // Restore original key
  (ENV as any).BAILIAN_API_KEY = originalApiKey;

  // Test 3: Provider Registration Router and AIService mapping
  console.log("\n--- Test 3: AIService Dynamic Provider Registration Mapping ---");
  const originalProviderStr = ENV.AI_PROVIDER;
  (ENV as any).AI_PROVIDER = "bailian";

  const aiService = new AIService();
  // We can check dynamic getProvider() if name matches
  if ((aiService as any).getProvider().name !== "Bailian-Provider") {
    throw new Error(`AIService did not select Bailian-Provider when AI_PROVIDER=bailian. Got: ${(aiService as any).getProvider().name}`);
  }
  console.log("✅ AIService resolved active provider correctly: Bailian-Provider");
  
  // Restore original provider configuration
  (ENV as any).AI_PROVIDER = originalProviderStr;

  // Test 4: Live / Integration testing hook
  console.log("\n--- Test 4: Conditional Live Integration Check ---");
  const runLive = process.env.RUN_BAILIAN_LIVE_TEST === "true";
  if (runLive && originalApiKey) {
    console.log("🔥 RUN_BAILIAN_LIVE_TEST is true and BAILIAN_API_KEY is defined. Triggering LIVE call to Alibaba DashScope...");
    try {
      const result = await provider.extractTenderParams({
        fileName: "五仙山智能装备谷项目.pdf",
        fileContentText: "项目名称为五仙山智能装备谷工程，业主单位为精机置业发展公司，总建筑面积153000平方米，总工期500日历天，截止投标时间为2026年9月10日。"
      });

      console.log("Live Response content received:", result.content);
      console.log("Requires human validation flag:", result.requiresHumanConfirmation);
      console.log("Citations quantity:", result.citations.length);

      const parsed = JSON.parse(result.content);
      if (!parsed.extractions || !Array.isArray(parsed.extractions)) {
        throw new Error("Live Response is missing the structured 'extractions' array.");
      }
      if (result.requiresHumanConfirmation !== true) {
        throw new Error("Live requirement check failure: requiresHumanConfirmation MUST default to true.");
      }
      console.log(`✅ Live integration call passed. Confidence: ${result.confidence}`);
    } catch (liveErr: any) {
      console.error("❌ Live integration call failed:", liveErr.message);
      throw liveErr;
    }
  } else {
    console.log("⏭️ Skipping real network call. Set RUN_BAILIAN_LIVE_TEST=true and supply BAILIAN_API_KEY to test real live connectivity.");
  }

  console.log("\n====================================================================");
  console.log("🥇 [SUCCESS] ALIBABA Model Studio / DashScope (Bailian) Tests Passed!");
  console.log("====================================================================\n");
}

runBailianTests().catch(err => {
  console.error("❌ Test suite failed with exception:", err);
  process.exit(1);
});
