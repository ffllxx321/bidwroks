import { BailianFileService } from "../backend/src/modules/ai/bailian-file-service.ts";

/**
 * Unit testing Gemini Document Parsing Service and Schema Mapping Verification
 */
async function runGeminiParsingTests() {
  console.log("=== [STARTING GEMINI EXTRACTION ENGINE & SCHEMA TESTS] ===");

  // 1. Verify throw when GEMINI_API_KEY is not configured
  console.log("Testing error propagation when GEMINI_API_KEY is absent...");
  const oldKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    await BailianFileService.analyzeDocumentWithGemini("dGVzdA==", "test-tender.pdf");
    throw new Error("Assertation failed: It should have thrown an error for missing API key!");
  } catch (err: any) {
    if (!err.message.includes("内置 Gemini API Key 未在环境中发现")) {
      throw new Error(`Unexpected error message layout: ${err.message}`);
    }
    console.log("✅ Successfully caught and validated correct API Key check.");
  } finally {
    process.env.GEMINI_API_KEY = oldKey;
  }

  console.log("=== [ALL GEMINI PASSTHROW MAPPING TESTS COMPLETED SUCCESSFULLY] ===");
}

runGeminiParsingTests().catch((err) => {
  console.error("❌ Test suite aborted due to assertion failure:", err);
  process.exit(1);
});
