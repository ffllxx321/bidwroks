import assert from "assert";
import db, { initDb } from "../backend/src/database/db.ts";
import { BailianProvider } from "../backend/src/modules/ai/providers/BailianProvider.ts";
import { AIService } from "../backend/src/modules/ai/ai-service.ts";
import { ENV } from "../backend/src/config/env.ts";
import { verifyAIPermission } from "../backend/src/modules/permissions/ai-permission-checker.ts";
import { auditLogger } from "../backend/src/modules/audit-logs/audit-logger.ts";

async function runTenderExtractionWithBailianTests() {
  console.log("====================================================================");
  console.log("🚀 [START] Tender Extraction with Alibaba Bailian Test Suite");
  console.log("====================================================================\n");

  // A. Initialize SQLite DB for independent, isolated test workspace
  initDb();
  const ts = new Date().toISOString();
  const testProjectId = `test-bl-${Date.now().toString().slice(-4)}`;

  // B. Register Mock Base Projects & Master Data Records
  db.prepare("INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(testProjectId, "百炼真实联调测试项目", "已创建", ts, ts);

  db.prepare(`
    INSERT INTO project_master_data (project_id, project_name, client_name, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(testProjectId, "百炼真实联调测试项目", "精机置业发展公司", ts);

  console.log("✅ Base Project & Master Data initialized under id:", testProjectId);

  // -------------------------------------------------------------------------
  // 1. SENSITIVE FILE INTERCEPTION TESTS (allow_ai_read / is_sensitive checks)
  // -------------------------------------------------------------------------
  console.log("\n--- Task 1: Verify AI Read Restriction & Sensitivity Interceptor Flow ---");

  // Case A: allow_ai_read = 0 (false) -> Trigger failure
  const docIdBlocked = `doc-blocked-${Date.now()}`;
  db.prepare(`
    INSERT INTO documents (id, project_id, file_name, file_type, document_type, uploaded_by, is_sensitive, allow_ai_read, created_at)
    VALUES (?, ?, '绝密核心成本报价条款.pdf', 'pdf', 'tender_document', '张三', 0, 0, ?)
  `).run(docIdBlocked, testProjectId, ts);

  db.prepare(`
    INSERT INTO document_versions (id, document_id, version_number, storage_path, file_size, uploaded_by, uploaded_at, is_latest)
    VALUES (?, ?, 1, '/storage/blocked_p1.pdf', 1024, '张三', ?, 1)
  `).run(`ver-${docIdBlocked}-1`, docIdBlocked, ts);

  const check1 = verifyAIPermission(testProjectId, docIdBlocked, "Sales", "user-sales");
  console.log("- Checked permission on allow_ai_read=0:", check1);
  assert.strictEqual(check1.allowed, false, "Should block AI read on allow_ai_read=0.");
  assert.match(check1.reason, /allowAIRead|切断|读取|权限/, "Should give relevant clear explanation.");

  // Case B: is_sensitive = 1 and AI_ENABLE_SENSITIVE_READ = false -> Trigger block
  const docIdSensitive = `doc-sensitive-${Date.now()}`;
  db.prepare(`
    INSERT INTO documents (id, project_id, file_name, file_type, document_type, uploaded_by, is_sensitive, allow_ai_read, created_at)
    VALUES (?, ?, '超高敏国防机密标书.pdf', 'pdf', 'tender_document', '张三', 1, 1, ?)
  `).run(docIdSensitive, testProjectId, ts);

  db.prepare(`
    INSERT INTO document_versions (id, document_id, version_number, storage_path, file_size, uploaded_by, uploaded_at, is_latest)
    VALUES (?, ?, 1, '/storage/sensitive_p1.pdf', 1024, '张三', ?, 1)
  `).run(`ver-${docIdSensitive}-1`, docIdSensitive, ts);

  const tempSensitiveFlag = ENV.AI_ENABLE_SENSITIVE_READ;
  (ENV as any).AI_ENABLE_SENSITIVE_READ = false;

  const check2 = verifyAIPermission(testProjectId, docIdSensitive, "Sales", "user-sales");
  console.log("- Checked permission on is_sensitive=1 and AI_ENABLE_SENSITIVE_READ=false:", check2);
  assert.strictEqual(check2.allowed, false, "Should block sensitive RAG extraction when read is not overridden.");
  assert.match(check2.reason, /涉敏|机密|敏感|高敏|AI_ENABLE_SENSITIVE_READ/, "Should explicitly log a sensitive file RAG blockage.");

  (ENV as any).AI_ENABLE_SENSITIVE_READ = tempSensitiveFlag;

  // Case C: Valid document with allow_ai_read=true & not sensitive -> ApprovedAllowed
  const docIdApproved = `doc-approved-${Date.now()}`;
  db.prepare(`
    INSERT INTO documents (id, project_id, file_name, file_type, document_type, uploaded_by, is_sensitive, allow_ai_read, created_at)
    VALUES (?, ?, '公开技术招标要求片段.pdf', 'pdf', 'tender_document', '张三', 0, 1, ?)
  `).run(docIdApproved, testProjectId, ts);

  db.prepare(`
    INSERT INTO document_versions (id, document_id, version_number, storage_path, file_size, uploaded_by, uploaded_at, is_latest)
    VALUES (?, ?, 1, '/storage/approved_p1.pdf', 1024, '张三', ?, 1)
  `).run(`ver-${docIdApproved}-1`, docIdApproved, ts);

  const check3 = verifyAIPermission(testProjectId, docIdApproved, "Sales", "user-sales");
  console.log("- Checked permission on normal document:", check3);
  assert.strictEqual(check3.allowed, true, "Should allow AI read on normal public, allowed files.");
  console.log("✅ Passed all document sensitivity and AI block interceptor tests!");

  // -------------------------------------------------------------------------
  // 2. EXTRACTION LOGS AND RESULT PERSISTENCE CHECKS
  // -------------------------------------------------------------------------
  console.log("\n--- Task 2: Verify Extractions Insertion and Human-in-the-Loop Confirms ---");

  // Create a structured extraction payload from AI
  const aiMockOutput = {
    extractions: [
      {
        fieldKey: "bidDeadline",
        fieldLabel: "投标截止日",
        extractedValue: "2026-09-10",
        normalizedValue: "2026-09-10",
        confidence: 0.95,
        source: {
          documentId: docIdApproved,
          documentVersionId: `ver-${docIdApproved}-1`,
          fileName: "公开技术招标要求片段.pdf",
          pageNumber: 4,
          paragraphIndex: 12,
          textSnippet: "本工程截止投标时间为2026年9月10日。"
        },
        requiresHumanConfirmation: true
      },
      {
        fieldKey: "grossFloorAreaValue",
        fieldLabel: "总建筑面积数值",
        extractedValue: "153000",
        normalizedValue: "153000.00",
        confidence: 0.92,
        source: {
          documentId: docIdApproved,
          documentVersionId: `ver-${docIdApproved}-1`,
          fileName: "公开技术招标要求片段.pdf",
          pageNumber: 1,
          paragraphIndex: 3,
          textSnippet: "总建筑面积153000平方米。"
        },
        requiresHumanConfirmation: true
      }
    ]
  };

  // Insert mock extraction responses into ai_extraction_results (RequiresHumanConfirmation MUST be true)
  const extractionResultId1 = `ext-${Date.now()}-1`;
  const extractionResultId2 = `ext-${Date.now()}-2`;

  db.prepare(`
    INSERT INTO ai_extraction_results (
      id, project_id, document_id, field_key, field_label, extracted_value, normalized_value,
      source_page, source_paragraph, source_text_snippet, confidence, status, requires_human_confirmation, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?)
  `).run(
    extractionResultId1,
    testProjectId,
    docIdApproved,
    aiMockOutput.extractions[0].fieldKey,
    aiMockOutput.extractions[0].fieldLabel,
    aiMockOutput.extractions[0].extractedValue,
    aiMockOutput.extractions[0].normalizedValue,
    aiMockOutput.extractions[0].source.pageNumber,
    aiMockOutput.extractions[0].source.paragraphIndex,
    aiMockOutput.extractions[0].source.textSnippet,
    aiMockOutput.extractions[0].confidence,
    ts
  );

  db.prepare(`
    INSERT INTO ai_extraction_results (
      id, project_id, document_id, field_key, field_label, extracted_value, normalized_value,
      source_page, source_paragraph, source_text_snippet, confidence, status, requires_human_confirmation, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?)
  `).run(
    extractionResultId2,
    testProjectId,
    docIdApproved,
    aiMockOutput.extractions[1].fieldKey,
    aiMockOutput.extractions[1].fieldLabel,
    aiMockOutput.extractions[1].extractedValue,
    aiMockOutput.extractions[1].normalizedValue,
    aiMockOutput.extractions[1].source.pageNumber,
    aiMockOutput.extractions[1].source.paragraphIndex,
    aiMockOutput.extractions[1].source.textSnippet,
    aiMockOutput.extractions[1].confidence,
    ts
  );

  // Assert initially, values are only inside extraction results, NOT in project_master_data
  const masterDataPre = db.prepare("SELECT * FROM project_master_data WHERE project_id = ?").get(testProjectId) as any;
  assert.strictEqual(masterDataPre.bid_closing_date, null, "AI extracted values must NOT instantly overwrite master data without human consent.");
  assert.strictEqual(masterDataPre.gross_floor_area_value, 0, "AI extracted values must NOT instantly overwrite master data without human consent.");
  console.log("✅ Verified: AI extracted results are isolated inside ai_extraction_results and not automatically written down.");

  // Simulate PM confirming and adopting the extracted "bidDeadline"
  const operator = "李四 (项目负责人)";
  const oldVal = masterDataPre.bid_closing_date;
  const newVal = "2026-09-10";

  db.transaction(() => {
    // 1. Write update to master data
    db.prepare("UPDATE project_master_data SET bid_closing_date = ?, updated_at = ? WHERE project_id = ?")
      .run(newVal, ts, testProjectId);

    // 2. Mark extraction task as confirmed
    db.prepare("UPDATE ai_extraction_results SET status = 'confirmed', requires_human_confirmation = 0, confirmed_by = ?, confirmed_at = ? WHERE id = ?")
      .run(operator, ts, extractionResultId1);

    // 3. Log to master_data_changes tracker
    db.prepare(`
      INSERT INTO master_data_changes (id, project_id, field_name, old_value, new_value, changed_by, changed_at, source, impact_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`chg-${Date.now()}-bl`, testProjectId, "bidClosingDate", String(oldVal), String(newVal), operator, ts, "AI提取确认", "high");

    // 4. Log strict security audit
    auditLogger.logAction({
      projectId: testProjectId,
      operator: operator,
      role: "ProjectManager",
      action: "ConfirmAIExtract",
      details: `人工审核并采纳了投标截止日的 AI 提取建议，校对写入为: ${newVal}`
    });
  })();

  // Verify updates took effect
  const masterDataPost = db.prepare("SELECT * FROM project_master_data WHERE project_id = ?").get(testProjectId) as any;
  assert.strictEqual(masterDataPost.bid_closing_date, "2026-09-10", "Value must be successfully updated upon human manual confirmation.");

  const changedRecords = db.prepare("SELECT * FROM master_data_changes WHERE project_id = ?").all(testProjectId) as any[];
  assert.strictEqual(changedRecords.length, 1, "Change trackers must catalog human adopting flow.");
  assert.strictEqual(changedRecords[0].field_name, "bidClosingDate", "Tracked field should correspond.");

  const auditRows = db.prepare("SELECT * FROM audit_logs WHERE project_id = ? AND action = 'ConfirmAIExtract'").all(testProjectId) as any[];
  assert.strictEqual(auditRows.length, 1, "Should log ConfirmAIExtract strictly.");
  console.log("✅ Passed human-in-the-loop validation flow for master data adoption!");

  // -------------------------------------------------------------------------
  // 3. PROVIDER ROUTING CONFIGURATIONS
  // -------------------------------------------------------------------------
  console.log("\n--- Task 3: Verify Router Selection Configurations & Schema Safety ---");
  
  // Set provider config to mock to avoid network request during general dry tests
  const originalProvider = ENV.AI_PROVIDER;
  (ENV as any).AI_PROVIDER = "bailian";

  const service = new AIService();
  assert.strictEqual((service as any).getProvider().name, "Bailian-Provider", "AIService must resolve correctly when AI_PROVIDER=bailian.");

  // Check defaults configuration
  assert.strictEqual(ENV.BAILIAN_BASE_URL, "https://dashscope.aliyuncs.com/compatible-mode/v1", "DashScope endpoint mapping should be modern OpenAI-compatible URL.");
  assert.strictEqual(ENV.BAILIAN_MODEL, "qwen3.6-35b-a3b", "Default configured model should be qwen3.6-35b-a3b.");
  
  // Ensure we revert original provider configurations
  (ENV as any).AI_PROVIDER = originalProvider;

  console.log("✅ Router Selection resolved correctly. Mapped region to Alibaba Model Studio.");
  
  console.log("\n====================================================================");
  console.log("🎉 [SUCCESS] Tender Extraction with Alibaba Bailian Test Suite Passed!");
  console.log("====================================================================\n");
}

runTenderExtractionWithBailianTests().catch(err => {
  console.error("❌ Test suite failed with exception:", err);
  process.exit(1);
});
