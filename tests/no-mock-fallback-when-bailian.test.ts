import assert from "assert";
import db, { initDb } from "../backend/src/database/db.ts";
import { extractTenderParamsFromChunks } from "../backend/src/modules/ai/extraction-engine.ts";
import { ENV } from "../backend/src/config/env.ts";

async function runNoMockFallbackTests() {
  console.log("====================================================================");
  console.log("🚀 [START] No Mock Fallback when AI_PROVIDER=bailian Test Suite");
  console.log("====================================================================\n");

  // 1. Initialize SQLite Database workspace
  initDb();
  const ts = new Date().toISOString();
  const testProjectId = `test-no-fb-${Date.now().toString().slice(-4)}`;
  const testDocId = `doc-no-fb-${Date.now().toString().slice(-4)}`;
  const testVersionId = `ver-no-fb-${Date.now().toString().slice(-4)}`;

  // Seed project, document, document_versions, and chunks
  db.prepare("INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(testProjectId, "安全无回退机制测试项目", "已创建", ts, ts);

  db.prepare(`
    INSERT INTO documents (id, project_id, file_name, file_type, document_type, uploaded_by, is_sensitive, allow_ai_read, created_at)
    VALUES (?, ?, '无回退安全性测试文件.pdf', 'pdf', 'tender_document', 'SystemTest', 0, 1, ?)
  `).run(testDocId, testProjectId, ts);

  db.prepare(`
    INSERT INTO document_versions (id, document_id, version_number, storage_path, file_size, uploaded_by, uploaded_at, is_latest)
    VALUES (?, ?, 1, '/storage/no-fallback-test.pdf', 54321, 'SystemTest', ?, 1)
  `).run(testVersionId, testDocId, ts);

  db.prepare(`
    INSERT INTO parsed_document_chunks (id, document_id, document_version_id, page_number, paragraph_index, text_content, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(`chunk-1-${testDocId}`, testDocId, testVersionId, 1, 1, "本工程总投资大约2000万元，地处高新区香花桥路。建设工期为500日历天。");

  // 2. Mock and spy on fetch to verify various failure states
  const originalFetch = global.fetch;
  const originalAiProvider = process.env.AI_PROVIDER;
  const originalBailianKey = process.env.BAILIAN_API_KEY;

  try {
    // FORCE BAILIAN MODE
    process.env.AI_PROVIDER = "bailian";
    (ENV as any).AI_PROVIDER = "bailian";

    // Scenario 1: API Key is missing/empty -> Must instantly fail with explicit key check message
    process.env.BAILIAN_API_KEY = "";
    (ENV as any).BAILIAN_API_KEY = "";

    console.log("--- TEST CASE 1: Empty API Key Block Check ---");
    let caughtErr1: any = null;
    try {
      await extractTenderParamsFromChunks(testProjectId, testDocId, testVersionId, "ProjectManager", "test-user");
    } catch (err: any) {
      caughtErr1 = err;
    }

    assert.ok(caughtErr1, "Should have thrown an exception on missing API Key in Bailian mode.");
    assert.match(caughtErr1.message, /AI 辅助解析失败：百炼接口调用失败/, "Error message must match structural expectation.");
    assert.match(caughtErr1.message, /API Key 未配置/, "Error detail should explain the empty key situation.");
    console.log("✅ Case 1 passed: Blocked with a genuine validation error without falling back to mock outputs.");

    // Scenario 2: Network error / Timeout -> Reject completely
    process.env.BAILIAN_API_KEY = "dummy-fake-key-value-for-network-test";
    (ENV as any).BAILIAN_API_KEY = "dummy-fake-key-value-for-network-test";

    // Intercept with physical failed response
    global.fetch = (() => {
      throw new Error("ECONNREFUSED - aliyuncs connection refused.");
    }) as any;

    console.log("\n--- TEST CASE 2: Network Timeout / Refused Check ---");
    let caughtErr2: any = null;
    try {
      await extractTenderParamsFromChunks(testProjectId, testDocId, testVersionId, "ProjectManager", "test-user");
    } catch (err: any) {
      caughtErr2 = err;
    }

    assert.ok(caughtErr2, "Should reject connection.");
    assert.match(caughtErr2.message, /AI 辅助解析失败：百炼接口调用失败/, "Outer message should guide failure accurately.");
    assert.match(caughtErr2.message, /connection refused/, "Underlying network issue should be attached as evidence.");
    console.log("✅ Case 2 passed: Refused call thrown safely without returning fabricated template rows.");

    // Scenario 3: API returns non-JSON or Malformed structures -> Reject
    global.fetch = (() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          choices: [
            {
              message: {
                content: "Internal Studio Error or Rate Limit, please retry later!" // not valid JSON
              }
            }
          ]
        })
      });
    }) as any;

    console.log("\n--- TEST CASE 3: Model Malformed Garbage Response Check ---");
    let caughtErr3: any = null;
    try {
      await extractTenderParamsFromChunks(testProjectId, testDocId, testVersionId, "ProjectManager", "test-user");
    } catch (err: any) {
      caughtErr3 = err;
    }

    assert.ok(caughtErr3, "Should fail when JSON parsing fails.");
    assert.match(caughtErr3.message, /AI 辅助解析失败/, "Must bubble correctly.");
    console.log("✅ Case 3 passed: Malformed responses caught safely with real system failures.");

  } finally {
    // Restore environment
    global.fetch = originalFetch;
    process.env.AI_PROVIDER = originalAiProvider;
    process.env.BAILIAN_API_KEY = originalBailianKey;
    (ENV as any).AI_PROVIDER = originalAiProvider;
    (ENV as any).BAILIAN_API_KEY = originalBailianKey;
  }

  console.log("\n====================================================================");
  console.log("🎉 [SUCCESS] No Mock Fallback when AI_PROVIDER=bailian Suite Completed!");
  console.log("====================================================================\n");
}

runNoMockFallbackTests().catch(err => {
  console.error("❌ Test suite failed with exception:", err);
  process.exit(1);
});
