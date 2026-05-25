import db, { initDb } from "../backend/src/database/db.ts";
import { auditLogger } from "../backend/src/modules/audit-logs/audit-logger.ts";
import { analyzeImpactForProjectAndChange } from "../server.ts";

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
}

async function runReviewAndChangeImpactTests() {
  console.log("====================================================================");
  console.log("🚀 [START] BIDWORKS ITERATION-05 REVIEW & CHANGE IMPACT INTEGRATION TESTS");
  console.log("====================================================================\n");

  initDb();
  const ts = new Date().toISOString();
  const testProjectId = `test-i5-${Date.now().toString().slice(-4)}`;

  // 1. Provision Test Environment
  console.log("--> 1. Provisioning Test Project & Master Data Environment...");
  db.prepare("INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(testProjectId, "云杉数字中心标段", "投标进行中", ts, ts);

  db.prepare(`
    INSERT INTO project_master_data (
      project_id, project_name, client_name, project_address, building_type,
      gross_floor_area_value, gross_floor_area_unit,
      total_duration_value, total_duration_unit,
      bid_closing_date, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    testProjectId,
    "云杉数字中心标段",
    "绿云科技集团",
    "四川高新技术核心区",
    "大型节能机房大楼",
    75000.00,
    "㎡",
    350,
    "日历天",
    "2026-07-15",
    ts
  );

  // Map users to project
  const insertMember = db.prepare("INSERT INTO project_members (project_id, user_id, role_name) VALUES (?, ?, ?)");
  insertMember.run(testProjectId, "user-pm", "ProjectManager");
  insertMember.run(testProjectId, "user-const", "Construction");
  insertMember.run(testProjectId, "user-review", "Reviewer");

  // Create a linked task
  const testTaskId = `tsk-i5-${Date.now().toString().slice(-4)}`;
  db.prepare(`
    INSERT INTO tasks (id, project_id, task_name, status, risk_level, requiresReview)
    VALUES (?, ?, ?, 'in_progress', 'Medium', 0)
  `).run(testTaskId, testProjectId, "编制施工大纲交付件");

  // Create a document and a document version
  const testDocId = `doc-i5-${Date.now().toString().slice(-4)}`;
  const testVersionId = `ver-i5-${Date.now().toString().slice(-4)}`;

  db.prepare(`
    INSERT INTO documents (id, project_id, task_id, file_name, file_type, document_type, uploaded_by, status, requiresReview)
    VALUES (?, ?, ?, ?, 'pdf', 'construction_scheme', 'user-const', 'uploaded', 0)
  `).run(testDocId, testProjectId, testTaskId, "技术施工方案大纲.pdf");

  db.prepare(`
    INSERT INTO document_versions (id, document_id, version_number, file_size, storage_path, file_hash, uploaded_by, status, is_latest, is_final, requiresReview)
    VALUES (?, ?, 1, 1024, '/fake/path.pdf', 'hash123', 'user-const', 'uploaded', 1, 0, 0)
  `).run(testVersionId, testDocId);

  console.log("✓ Test environment provisioned successfully.");

  // -------------------------------------------------------------------------
  // 2. Submit Document Version for Review
  // -------------------------------------------------------------------------
  console.log("\n--> 2. [TEST] Submitting File & Task for Review Workflow...");
  
  // Simulated POST logic inside db transaction
  db.transaction(() => {
    db.prepare("UPDATE documents SET status = 'pending_review', updated_at = ? WHERE id = ?").run(ts, testDocId);
    db.prepare("UPDATE document_versions SET status = 'pending_review' WHERE id = ?").run(testVersionId);
    db.prepare("UPDATE tasks SET status = 'pending_review', reviewer_user_id = ?, updated_at = ? WHERE id = ?")
      .run("user-review", ts, testTaskId);

    // Insert reviewer notification
    db.prepare(`
      INSERT INTO notifications (id, projectId, userId, notificationType, title, message, sourceType, sourceId, isRead, createdAt)
      VALUES (?, ?, 'user-review', 'pending_review', '待审核资料提醒', '方案交付件提交审核。', 'document_version', ?, 0, ?)
    `).run(`notif-test-${testVersionId}`, testProjectId, testVersionId, ts);

    auditLogger.logAction({
      projectId: testProjectId,
      operator: "陈七 (施工负责人)",
      role: "Construction",
      action: "SUBMIT_REVIEW",
      details: `[SUBMIT_REVIEW] 资料编制人提交施工大纲交付件，进入待审核。`
    });
  })();

  // Verify status mutations
  const updatedDoc = db.prepare("SELECT * FROM documents WHERE id = ?").get(testDocId) as any;
  const updatedVersion = db.prepare("SELECT * FROM document_versions WHERE id = ?").get(testVersionId) as any;
  const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(testTaskId) as any;
  const insertedNotif = db.prepare("SELECT * FROM notifications WHERE id = ?").get(`notif-test-${testVersionId}`) as any;

  assert(updatedDoc.status === "pending_review", "Document status should be pending_review");
  assert(updatedVersion.status === "pending_review", "Document version status should be pending_review");
  assert(updatedTask.status === "pending_review", "Task status should be pending_review");
  assert(updatedTask.reviewer_user_id === "user-review", "Task reviewer should be user-review");
  assert(insertedNotif !== undefined, "Reviewer notification should be generated");
  assert(insertedNotif.isRead === 0, "Initial notification should be unread");

  console.log("✓ Submitting review passes all assertions successfully.");

  // -------------------------------------------------------------------------
  // 3. Create Structured Review Comment
  // -------------------------------------------------------------------------
  console.log("\n--> 3. [TEST] Creating Custom Structured Review Comment by Reviewer...");
  const commentId = `rc-test-${Date.now().toString().slice(-4)}`;
  
  db.transaction(() => {
    db.prepare(`
      INSERT INTO review_comments (
        id, projectId, taskId, documentId, documentVersionId, commentType, severity, content,
        sourcePage, sourceParagraph, sourceTextSnippet, assignedTo, createdBy, createdAt, status, updatedAt
      ) VALUES (?, ?, ?, ?, ?, 'content_issue', 'high', '第七页的深基坑加固强度参数计算不符合当地建筑防震设计规范，请调整。',
               7, 3, '强度参数 320MPa', 'user-const', 'user-review', ?, 'open', ?)
    `).run(commentId, testProjectId, testTaskId, testDocId, testVersionId, ts, ts);

    // Insert status logs
    db.prepare(`
      INSERT INTO review_status_logs (id, commentId, oldStatus, newStatus, changedBy, changedAt, reason)
      VALUES (?, ?, NULL, 'open', '钱八 (审核人)', ?, '新建意见')
    `).run(`rsl-test-1-${commentId}`, commentId, ts);

    // Send Repair notification to assignee user-const
    db.prepare(`
      INSERT INTO notifications (id, projectId, userId, notificationType, title, message, sourceType, sourceId, isRead, createdAt)
      VALUES (?, ?, ?, 'review_comment_assigned', '待处理审核意见通知', '存在待整改意见。', 'review_comment', ?, 0, ?)
    `).run(`notif-test-rc-${commentId}`, testProjectId, "user-const", commentId, ts);
  })();

  const rcRow = db.prepare("SELECT * FROM review_comments WHERE id = ?").get(commentId) as any;
  const logRow = db.prepare("SELECT * FROM review_status_logs WHERE commentId = ?").get(commentId) as any;
  assert(rcRow !== undefined, "Review comment row should exist in database");
  assert(rcRow.status === "open", "Comment status must be open");
  assert(rcRow.severity === "high", "Comment severity must be high");
  assert(rcRow.sourcePage === 7, "Comment page should be captured");
  assert(logRow.newStatus === "open", "Log row new status must match open");

  console.log("✓ Creating structured comments successfully passes assertions.");

  // -------------------------------------------------------------------------
  // 4. Replying to Review Comment
  // -------------------------------------------------------------------------
  console.log("\n--> 4. [TEST] Replying to Review Comment with Revision Response...");
  const replyId = `rep-test-${Date.now().toString().slice(-4)}`;
  const newRevisedVersionId = `ver-i5-rev-${Date.now().toString().slice(-4)}`;

  db.transaction(() => {
    // Simulate uploading revised document version
    db.prepare(`
      INSERT INTO document_versions (id, document_id, version_number, file_size, storage_path, file_hash, uploaded_by, status, is_latest, is_final, requiresReview)
      VALUES (?, ?, 2, 1024, '/fake/path_v2.pdf', 'hash456', 'user-const', 'uploaded', 1, 0, 0)
    `).run(newRevisedVersionId, testDocId);

    // Mark old version non-latest
    db.prepare("UPDATE document_versions SET is_latest = 0 WHERE id = ?").run(testVersionId);

    // Insert modified reply
    db.prepare(`
      INSERT INTO review_comment_replies (
        id, commentId, projectId, taskId, documentId, documentVersionId, newDocumentVersionId, replyContent, repliedBy, repliedAt, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '我们已经重新合规了工程深基坑防震计算，把刚度偏差修正和冗余系数加高了20%，重新计算见第7页。', 'user-const', ?, ?)
    `).run(replyId, commentId, testProjectId, testTaskId, testDocId, testVersionId, newRevisedVersionId, ts, ts);

    // Change comment status
    db.prepare("UPDATE review_comments SET status = 'replied', updatedAt = ? WHERE id = ?").run(ts, commentId);

    // Record status log
    db.prepare(`
      INSERT INTO review_status_logs (id, commentId, oldStatus, newStatus, changedBy, changedAt, reason)
      VALUES (?, ?, 'open', 'replied', '陈七 (施工负责人)', ?, '回复审核意见且提交新资料版。')
    `).run(`rsl-reply-${commentId}`, commentId, ts);
  })();

  const updatedComment = db.prepare("SELECT * FROM review_comments WHERE id = ?").get(commentId) as any;
  const replyRow = db.prepare("SELECT * FROM review_comment_replies WHERE id = ?").get(replyId) as any;
  assert(updatedComment.status === "replied", "Review comment status should advance to replied");
  assert(replyRow !== undefined, "Reply row should be created");
  assert(replyRow.newDocumentVersionId === newRevisedVersionId, "New revised version ID should match perfectly");

  console.log("✓ Replying and uploading incremental versions passes assertions.");

  // -------------------------------------------------------------------------
  // 5. Close Review Comment (Reviewer confirming revision is correct)
  // -------------------------------------------------------------------------
  console.log("\n--> 5. [TEST] Reviewer Closing the Resolved Review Comment...");

  db.transaction(() => {
    db.prepare(`
      UPDATE review_comments 
      SET status = 'closed', closedBy = 'user-review', closedAt = ?, closeReason = '修缮计算完全通过标准防震强度，核对无误关闭。', updatedAt = ?
      WHERE id = ?
    `).run(ts, ts, commentId);

    db.prepare(`
      INSERT INTO review_status_logs (id, commentId, oldStatus, newStatus, changedBy, changedAt, reason)
      VALUES (?, ?, 'replied', 'closed', '钱八 (审核组领导)', ?, '复核无误关闭意见说明。')
    `).run(`rsl-close-${commentId}`, commentId, ts);

    // Also mark tasks completed since all comments closed
    db.prepare("UPDATE tasks SET status = 'completed', updated_at = ? WHERE id = ?").run(ts, testTaskId);
    db.prepare("UPDATE documents SET status = 'completed', updated_at = ? WHERE id = ?").run(ts, testDocId);
  })();

  const closedComment = db.prepare("SELECT * FROM review_comments WHERE id = ?").get(commentId) as any;
  const finalTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(testTaskId) as any;
  assert(closedComment.status === "closed", "Comment status must move to closed");
  assert(closedComment.closedBy === "user-review", "Closed user should be user-review");
  assert(finalTask.status === "completed", "Task status should move to completed upon successful close.");

  console.log("✓ Closing comments successfully passes validation.");

  // -------------------------------------------------------------------------
  // 6. Project Master Data Information Change & Multi-dimensional Self-checking Impact
  // -------------------------------------------------------------------------
  console.log("\n--> 6. [TEST] Simulating Master Data Information Changes & Impact Processing...");
  // Now, greenBuildingRequirement changes from "环保一级" to "白金级环保强制指标" (grossFloorAreaValue / paymentTerms change)
  const changeId = `chg-test-${Date.now().toString().slice(-4)}`;

  db.transaction(() => {
    db.prepare(`
      UPDATE project_master_data
      SET gross_floor_area_value = 85000.00, updated_at = ?
      WHERE project_id = ?
    `).run(ts, testProjectId);

    db.prepare(`
      INSERT INTO master_data_changes (id, project_id, field_name, old_value, new_value, changed_by, changed_at, source, impact_level)
      VALUES (?, ?, 'grossFloorAreaValue', '75000.00', '85000.00', '李四 (项目负责人)', ?, '手工修改', 'high')
    `).run(changeId, testProjectId, ts);
  })();

  // Trigger impact analysis manually
  console.log("Executing analyzeImpactForProjectAndChange helper test...");
  analyzeImpactForProjectAndChange(testProjectId, changeId, "grossFloorAreaValue", "75000.00", "85000.00", "李四 (项目负责人)");

  // Validate that change_impact_records are written!
  const impactRecords = db.prepare("SELECT * FROM change_impact_records WHERE projectId = ? AND masterDataChangeId = ?").all(testProjectId, changeId) as any[];
  assert(impactRecords.length > 0, "At least one change impact record should be generated during analysis");
  
  // Check tasks with requiresReview are logged
  const reCheckTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(testTaskId) as any;
  const reCheckDoc = db.prepare("SELECT * FROM documents WHERE id = ?").get(testDocId) as any;
  assert(reCheckTask.requiresReview === 1, "Task should now be flagged with requiresReview due to master data change impact");
  assert(reCheckDoc.requiresReview === 1, "Document should be flagged with requiresReview due to master data change impact");

  console.log("✓ Information Change Impact analysis properly flags targets.");

  // -------------------------------------------------------------------------
  // 7. PM Confirm Review (Clears locking and requirement flags with clear resolution notes)
  // -------------------------------------------------------------------------
  console.log("\n--> 7. [TEST] PM Confirming the Change Impact & Clearing flags...");
  const firstImpact = impactRecords.find(r => r.affectedType === "task");
  assert(firstImpact !== undefined, "An impact record for the task should exist");

  db.transaction(() => {
    db.prepare(`
      UPDATE change_impact_records 
      SET status = 'confirmed', resolvedBy = 'user-pm', resolvedAt = ?, resolutionNote = '针对建筑面积增加的抗变核对无误，不影响概算编制工序。'
      WHERE id = ?
    `).run(ts, firstImpact.id);

    db.prepare(`
      UPDATE tasks 
      SET requiresReview = 0, reviewConfirmedBy = 'user-pm', reviewConfirmedAt = ?, reviewConfirmationNote = '复核无误结案'
      WHERE id = ?
    `).run(ts, firstImpact.affectedId);
  })();

  const clearedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(testTaskId) as any;
  const resolvedImpact = db.prepare("SELECT * FROM change_impact_records WHERE id = ?").get(firstImpact.id) as any;
  assert(clearedTask.requiresReview === 0, "Task requiresReview flag should be cleared once PM confirms review");
  assert(clearedTask.reviewConfirmedBy === "user-pm", "Task should record PM as confirmer");
  assert(resolvedImpact.status === "confirmed", "Impact record status should be confirmed");

  console.log("✓ Confirming change impact and unlocking entities passes all assertions.");

  // -------------------------------------------------------------------------
  // 8. Cleaning up the testing suite
  // -------------------------------------------------------------------------
  console.log("\nCleaning iteration-05 test workbench data...");
  db.prepare("DELETE FROM notifications WHERE projectId = ?").run(testProjectId);
  db.prepare("DELETE FROM change_impact_records WHERE projectId = ?").run(testProjectId);
  db.prepare("DELETE FROM review_status_logs WHERE commentId IN (SELECT id FROM review_comments WHERE projectId = ?)").run(testProjectId);
  db.prepare("DELETE FROM review_comment_replies WHERE projectId = ?").run(testProjectId);
  db.prepare("DELETE FROM review_comments WHERE projectId = ?").run(testProjectId);
  db.prepare("DELETE FROM document_versions WHERE document_id = ?").run(testDocId);
  db.prepare("DELETE FROM documents WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM tasks WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM project_members WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM project_master_data WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM master_data_changes WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM projects WHERE id = ?").run(testProjectId);

  console.log("====================================================================");
  console.log("🎉 [SUCCESS] ALL ITERATION-05 REVIEW & CHANGE IMPACT TESTS PASSED!");
  console.log("====================================================================\n");
}

runReviewAndChangeImpactTests().catch(err => {
  console.error("\n❌ [FAILURE] ITERATION-05 REVIEW & CHANGE IMPACT TESTING REJECTED:", err);
  process.exit(1);
});
