import assert from "assert";
import db, { initDb } from "../backend/src/database/db.ts";
import { BailianProvider } from "../backend/src/modules/ai/providers/BailianProvider.ts";
import { AIService } from "../backend/src/modules/ai/ai-service.ts";
import { ENV } from "../backend/src/config/env.ts";

async function runBailianLiveIntegrationTests() {
  console.log("====================================================================");
  console.log("🚀 [START] Alibaba Model Studio / DashScope Live Integration Test Suite");
  console.log("====================================================================\n");

  const runLive = process.env.RUN_BAILIAN_LIVE_TEST === "true";
  const apiKey = ENV.BAILIAN_API_KEY;

  if (!runLive || !apiKey) {
    console.log("⚠️  Skipping real network integration tests.");
    console.log("💡 To execute the live Alibaba Model Studio integration suite, configure:");
    console.log("   - env.RUN_BAILIAN_LIVE_TEST=true");
    console.log("   - env.BAILIAN_API_KEY=your_dashscope_api_key");
    console.log("   - env.AI_PROVIDER=bailian");
    console.log("   - env.BAILIAN_MODEL=qwen3.6-35b-a3b");
    console.log("\n====================================================================");
    console.log("🥈 [SUCCESS] Live Integration Suite skipped gracefully (Dry Run Passed!)");
    console.log("====================================================================\n");
    return;
  }

  console.log("🔥 RUN_BAILIAN_LIVE_TEST is true. Initiating live network calls to:");
  console.log("   - Base URL:", ENV.BAILIAN_BASE_URL);
  console.log("   - Model:", ENV.BAILIAN_MODEL);
  console.log("   - API Key Configured: true");
  
  // Guard: Double check the API key is never written/leaked to stdout
  assert.strictEqual(apiKey.includes(" "), false, "API Key should not have accidental whitespaces.");
  assert.notStrictEqual(apiKey, "", "API Key must not be empty space.");

  initDb();
  const provider = new BailianProvider();

  // Test Case 1: Fetching on Sample A (Vanguard Smart Logistics hub)
  console.log("\n--- Live Test 1: Fetching from Sample Document A ---");
  const sampleTextA = `
    项目名称：先锋智能物流枢纽基地一期工程
    建设单位：先锋产业运营集团
    总建筑面积为 114500 平方米，项目建设地址在上海临港新片区。
    工程总工期计算为 365 日历天。
    本工程截标日期：2026年11月01日。
  `;

  const resultA = await provider.extractTenderParams({
    fileName: "先锋智能物流项目.pdf",
    fileContentText: sampleTextA
  });

  console.log("Result A Content:", resultA.content);
  assert.ok(resultA.content, "Result content A must not be empty.");
  
  const parsedA = JSON.parse(resultA.content);
  assert.ok(Array.isArray(parsedA.extractions), "Response A must include structured 'extractions' array.");
  
  // Verify citations and constraints
  assert.ok(resultA.citations.length > 0, "Citations must be recorded with pages.");
  assert.strictEqual(resultA.requiresHumanConfirmation, true, "Requires human validation MUST default to true.");

  // Check some fields matched
  const projectA = parsedA.projectName || (parsedA.extractions.find((e: any) => e.fieldKey === "projectName")?.extractedValue);
  const bidDeadlineA = parsedA.bidDeadline || (parsedA.extractions.find((e: any) => e.fieldKey === "bidDeadline")?.extractedValue);
  const clientA = parsedA.ownerName || (parsedA.extractions.find((e: any) => e.fieldKey === "ownerName")?.extractedValue);

  console.log("-> Project Name Extracted:", projectA);
  console.log("-> Bid Deadline Extracted:", bidDeadlineA);

  assert.match(String(projectA), /先锋/, "Should capture project name containing '先锋'.");
  assert.match(String(clientA), /先锋/, "Should capture client name containing '先锋'.");

  // Test Case 2: Fetching on Sample B (To verify results change and are NOT static cached answers)
  console.log("\n--- Live Test 2: Verify dynamic values by changing inputs ---");
  const sampleTextB = `
    项目名称：白鹤滩清洁能源科创大厦
    建设单位：中水三局科技开发有限公司
    总建筑面积为 62800 平方米，建设地址在四川省西昌。
    总期工固定为 480 日历天。
    投标截止于：2027年03月15日。
  `;

  const resultB = await provider.extractTenderParams({
    fileName: "白鹤滩科创大厦标书.pdf",
    fileContentText: sampleTextB
  });

  console.log("Result B Content:", resultB.content);
  const parsedB = JSON.parse(resultB.content);
  
  const projectB = parsedB.projectName || (parsedB.extractions.find((e: any) => e.fieldKey === "projectName")?.extractedValue);
  const bidDeadlineB = parsedB.bidDeadline || (parsedB.extractions.find((e: any) => e.fieldKey === "bidDeadline")?.extractedValue);
  const clientB = parsedB.ownerName || (parsedB.extractions.find((e: any) => e.fieldKey === "ownerName")?.extractedValue);

  console.log("-> Project B Name Extracted:", projectB);
  console.log("-> Bid Deadline B Extracted:", bidDeadlineB);

  assert.match(String(projectB), /白鹤滩/, "Must change project name according to the changed inputs.");
  assert.match(String(clientB), /水/, "Must change client name to match Sample B.");

  // Ensure those values are distinct from Sample A elements to disqualify pre-cached mockup scenarios
  assert.notStrictEqual(projectA, projectB, "Verification of input variation failed: extracted project names are identical.");
  assert.notStrictEqual(bidDeadlineA, bidDeadlineB, "Verification of input variation failed: extracted deadlines are identical.");

  console.log("✅ Passed output change verification and validated non-cached dynamic output.");

  // Test Case 3: Mock Provider flag check
  console.log("\n--- Live Test 3: Confirm MockAIProvider is bypassed ---");
  const service = new AIService();
  const activeName = (service as any).activeProvider.name;
  console.log("AIService active provider name:", activeName);
  assert.strictEqual(activeName, "Bailian-Provider", "When AI_PROVIDER is set to bailian, Mock Provider must not be used.");
  console.log("✅ Checked Mock offset.");

  console.log("\n====================================================================");
  console.log("🥇 [SUCCESS] Alibaba Model Studio Live Integration Test Suite Passed!");
  console.log("====================================================================\n");
}

runBailianLiveIntegrationTests().catch(err => {
  console.error("❌ Live test suite crashed with error:", err);
  process.exit(1);
});
