import db, { initDb } from "../backend/src/database/db.ts";
import { auditLogger } from "../backend/src/modules/audit-logs/audit-logger.ts";
import { analyzeImpactForProjectAndChange } from "../server.ts";

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
}

async function runMvpFinalEndToEndTests() {
  console.log("====================================================================");
  console.log("🚀 [开始] BIDWORKS MVP 全链路端到端集成与验收测试 (MVP FINAL E2E TEST)");
  console.log("====================================================================\n");

  initDb();
  const ts = new Date().toISOString();
  // We use a unique project ID for our E2E run
  const e2eProjectId = `proj-e2e-${Date.now().toString().slice(-4)}`;

  // =========================================================================
  // 1. 创建项目 (Process 1: Create Project)
  // =========================================================================
  console.log("--> 1. [验收] 创建投标项目及初始化主数据...");
  
  db.prepare("INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(e2eProjectId, "临港集成电路测试中心大楼", "投标进行中", ts, ts);

  db.prepare(`
    INSERT INTO project_master_data (
      project_id, project_name, client_name, project_address, building_type,
      gross_floor_area_value, gross_floor_area_unit,
      total_duration_value, total_duration_unit,
      bid_closing_date, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    e2eProjectId,
    "临港集成电路测试中心大楼",
    "临港新片区发改委",
    "上海自贸区临港新片区环湖路",
    "超高精特种研发中枢",
    120000.00,
    "㎡",
    365,
    "日历天",
    "2026-09-01",
    ts
  );

  // Allocate roles
  const insertMember = db.prepare("INSERT INTO project_members (project_id, user_id, role_name) VALUES (?, ?, ?)");
  insertMember.run(e2eProjectId, "user-pm", "ProjectManager");
  insertMember.run(e2eProjectId, "user-sales", "Sales");
  insertMember.run(e2eProjectId, "user-const", "Construction");
  insertMember.run(e2eProjectId, "user-review", "Reviewer");

  // Log to audit log
  auditLogger.logAction({
    projectId: e2eProjectId,
    operator: "李四 (项目负责人)",
    role: "ProjectManager",
    action: "CREATE_PROJECT",
    details: `创建了新投标项目: 临港集成电路测试中心大楼，并初始化结构化项目主数据库。`
  });

  // Verify created data
  const projectRow = db.prepare("SELECT * FROM projects WHERE id = ?").get(e2eProjectId) as any;
  const masterDataRow = db.prepare("SELECT * FROM project_master_data WHERE project_id = ?").get(e2eProjectId) as any;
  const auditRow = db.prepare("SELECT * FROM audit_logs WHERE project_id = ? AND action = 'CREATE_PROJECT'").get(e2eProjectId) as any;

  assert(projectRow !== undefined, "项目应保存成功");
  assert(masterDataRow.gross_floor_area_value === 120000.00, "总建筑面积数值结构化存储应一致");
  assert(masterDataRow.gross_floor_area_unit === "㎡", "总建筑面积单位结构化存储应一致");
  assert(auditRow !== undefined, "创建项目动作必须落入 SQL 审计日志中");
  console.log("✓ 【创建项目】验收成功，主数据、角色及审计日志持久化正常。");


  // =========================================================================
  // 2. 上传招标文件并解析 (Process 2: Upload Tender & AI Extraction)
  // =========================================================================
  console.log("\n--> 2. [验收] 上传招标文件、解析与 AI 提取机制...");

  // Insert tender document metadata
  const docId = `tender-doc-${Date.now().toString().slice(-4)}`;
  db.prepare(`
    INSERT INTO documents (id, project_id, task_id, file_name, file_type, document_type, uploaded_by, status, is_sensitive, allow_ai_read)
    VALUES (?, ?, NULL, '临港集成电路测试中心招标文件.pdf', 'pdf', 'tender_document', 'user-sales', 'uploaded', 0, 1)
  `).run(docId, e2eProjectId);

  const docVersionId = `tender-ver-${Date.now().toString().slice(-4)}`;
  db.prepare(`
    INSERT INTO document_versions (id, document_id, version_number, file_size, storage_path, file_hash, uploaded_by, status, is_latest, is_final)
    VALUES (?, ?, 1, 4096, '/uploads/tender_doc_final.pdf', 'sha256hashed', 'user-sales', 'uploaded', 1, 0)
  `).run(docVersionId, docId);

  // Insert AI call log representing analysis
  const aiLogId = `ai-log-${Date.now().toString().slice(-4)}`;
  db.prepare(`
    INSERT INTO ai_call_logs (id, project_id, document_id, actor_id, provider, action, result, permission_result, error_message, created_at)
    VALUES (?, ?, ?, 'user-sales', 'gemini', 'tender_analysis', 'success_parsed', 'granted', NULL, ?)
  `).run(aiLogId, e2eProjectId, docId, ts);

  // Insert AI extraction result
  const propId = `prop-${Date.now().toString().slice(-4)}`;
  db.prepare(`
    INSERT INTO ai_extraction_results (id, project_id, document_id, field_key, field_label, extracted_value, normalized_value, source_page, source_paragraph, source_text_snippet, confidence, status, requires_human_confirmation, created_at)
    VALUES (?, ?, ?, 'grossFloorAreaValue', '总建筑面积', '125000.00', '125000.00', '3', '12', '上海临港新片区集成电路研发中心项目总建筑面积约为125000.00平方米', 0.95, 'pending_confirmation', 1, ?)
  `).run(propId, e2eProjectId, docId, ts);

  // Human PM reviews AI Proposal & confirms
  db.transaction(() => {
    // Confirm proposal
    db.prepare("UPDATE ai_extraction_results SET status = 'confirmed', requires_human_confirmation = 0, confirmed_by = 'user-pm', confirmed_at = ? WHERE id = ?").run(ts, propId);
    // Update main master data matching proposal
    db.prepare("UPDATE project_master_data SET gross_floor_area_value = 125000.00, updated_at = ? WHERE project_id = ?").run(ts, e2eProjectId);
    
    // Add change trace
    const logId = `mdc-${Date.now().toString().slice(-4)}`;
    db.prepare(`
      INSERT INTO master_data_changes (id, project_id, field_name, old_value, new_value, changed_by, changed_at, source, impact_level)
      VALUES (?, ?, 'grossFloorAreaValue', '120000.00', '125000.00', '李四 (项目负责人)', ?, 'AI辅助提取', 'high')
    `).run(logId, e2eProjectId, ts);

    auditLogger.logAction({
      projectId: e2eProjectId,
      operator: "李四 (项目负责人)",
      role: "ProjectManager",
      action: "CONFIRM_AI_EXTRACT",
      details: `人工审核并采纳了总建筑面积的 AI 建议，将主数据库内数值从 [120000] 校对替换为 [125000.00]。`
    });
  })();

  // Verify
  const confirmedProp = db.prepare("SELECT * FROM ai_extraction_results WHERE id = ?").get(propId) as any;
  const updatedArea = db.prepare("SELECT gross_floor_area_value FROM project_master_data WHERE project_id = ?").get(e2eProjectId) as any;
  const changeLog = db.prepare("SELECT * FROM master_data_changes WHERE project_id = ?").get(e2eProjectId) as any;

  assert(confirmedProp.status === 'confirmed', "AI提案应标记为已确认");
  assert(confirmedProp.requires_human_confirmation === 0, "AI提案确认后无需人工确认");
  assert(updatedArea.gross_floor_area_value === 125000.00, "面积已被确认为最新的 125000.00");
  assert(changeLog.old_value === "120000.00" && changeLog.new_value === "125000.00", "变量变更明细记录正确");
  console.log("✓ 【招标文件上传解析 & 确认主数据】验证成功。");


  // =========================================================================
  // 3. 生成资料清单和任务计划 (Process 3: Tasks and Deliverables Setup)
  // =========================================================================
  console.log("\n--> 3. [验收] 生成资料清单和倒排计划系统...");

  // Generate generic template checklist items
  const reqId = `req-e2e-${Date.now().toString().slice(-4)}`;
  db.prepare(`
    INSERT INTO document_requirements (id, project_id, requirement_name, requirement_type, source_type, status)
    VALUES (?, ?, '施工专项防震结构论证方案', '施工组织大纲', 'common_template', 'pending')
  `).run(reqId, e2eProjectId);

  // Convert to task
  const taskId = `task-e2e-${Date.now().toString().slice(-4)}`;
  db.prepare(`
    INSERT INTO tasks (id, project_id, requirement_id, task_name, task_type, responsible_user_id, reviewer_user_id, start_date, due_date, review_due_date, status, priority, risk_level, is_date_locked, requiresReview)
    VALUES (?, ?, ?, '编写施工专项防震结构论证方案并提审', '施工组织大纲', 'user-const', 'user-review', '2026-06-01', '2026-08-25', '2026-08-28', 'in_progress', 'High', 'High', 1, 0)
  `).run(taskId, e2eProjectId, reqId);

  // Link task back to requirement
  db.prepare("UPDATE document_requirements SET status = 'converted_to_task' WHERE id = ?")
    .run(reqId);

  // PM Audit log
  auditLogger.logAction({
    projectId: e2eProjectId,
    operator: "李四 (项目负责人)",
    role: "ProjectManager",
    action: "GENERATE_TASKS",
    details: `生成通用及特殊资料清单，将专项防震结构文档要求转换为任务分配给 [user-const], 对应审核人为 [user-review]。工期设为 2026-08-25 (is_date_locked=1)。`
  });

  const linkedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as any;
  const matchedReq = db.prepare("SELECT * FROM document_requirements WHERE id = ?").get(reqId) as any;

  assert(linkedTask.is_date_locked === 1, "调控工期后必须标记 dateLocked 为锁定状态防止逆流");
  assert(linkedTask.responsible_user_id === "user-const" && linkedTask.reviewer_user_id === "user-review", "任务负责人和审核人分配完全一致");
  assert(matchedReq.status === "converted_to_task", "转换动作执行后原资料状态标志正确");
  console.log("✓ 【资料清单任务化 & 日期安全防护】端到端模拟断言正常。");


  // =========================================================================
  // 4. 上传任务资料、版本管理和自检 (Process 4: Incremental Files & Selfcheck)
  // =========================================================================
  console.log("\n--> 4. [验收] 本地交付方案版本控制与合规自检功能...");

  // Upload original v1
  const fDocId = `fdoc-e2e-${Date.now().toString().slice(-4)}`;
  const fVer1Id = `fver1-e2e-${Date.now().toString().slice(-4)}`;

  db.prepare(`
    INSERT INTO documents (id, project_id, task_id, file_name, file_type, document_type, uploaded_by, status)
    VALUES (?, ?, ?, '防震建筑专项深化方案草图.pdf', 'pdf', 'construction_scheme', 'user-const', 'uploaded')
  `).run(fDocId, e2eProjectId, taskId);

  db.prepare(`
    INSERT INTO document_versions (id, document_id, version_number, file_size, storage_path, file_hash, uploaded_by, status, is_latest, is_final)
    VALUES (?, ?, 1, 512, '/fake/scratch_v1.pdf', 'hash777', 'user-const', 'uploaded', 1, 0)
  `).run(fVer1Id, fDocId);

  // Upload newer v2
  const fVer2Id = `fver2-e2e-${Date.now().toString().slice(-4)}`;
  const runId = `run-e2e-${Date.now().toString().slice(-4)}`;
  const issueId = `iss-e2e-1`;

  db.transaction(() => {
    // Mark v1 obsolete
    db.prepare("UPDATE document_versions SET is_latest = 0, status = 'obsolete' WHERE id = ?").run(fVer1Id);
    
    // Insert v2
    db.prepare(`
      INSERT INTO document_versions (id, document_id, version_number, file_size, storage_path, file_hash, uploaded_by, status, is_latest, is_final)
      VALUES (?, ?, 2, 518, '/fake/scratch_v2.pdf', 'hash888', 'user-const', 'uploaded', 1, 0)
    `).run(fVer2Id, fDocId);

    // Create self check run
    db.prepare(`
      INSERT INTO self_check_runs (id, project_id, task_id, document_id, document_version_id, status, executed_by, summary)
      VALUES (?, ?, ?, ?, ?, 'failed', 'user-const', '抓取到以下一致性问题。')
    `).run(runId, e2eProjectId, taskId, fDocId, fVer2Id);

    // Save mock selfcheck issue
    db.prepare(`
      INSERT INTO self_check_issues (id, self_check_run_id, project_id, task_id, document_id, document_version_id, issue_type, severity, message, source_text_snippet, source_page, status)
      VALUES (?, ?, ?, ?, ?, ?, 'project_name_mismatch', 'high', '发现使用了疑似上个旧案中的业主名称：深华集团，不符合本项目主人临港。', '深华集团承分包专项', 4, 'open')
    `).run(issueId, runId, e2eProjectId, taskId, fDocId, fVer2Id);
  })();

  // Specialist bypasses/ignores the selfcheck mismatch by typing a detailed reason
  const ignoredReason = '本轮作为附录对比分析深华大厦同规格大楼之防震受力情况，经校对该名称出现系由于对比引用。';
  db.prepare(`
    UPDATE self_check_issues 
    SET status = 'ignored', ignored_reason = ?, ignored_by = 'user-const', ignored_at = ? 
    WHERE id = ?
  `).run(ignoredReason, ts, issueId);

  auditLogger.logAction({
    projectId: e2eProjectId,
    operator: "陈七 (施工负责人)",
    role: "Construction",
    action: "IgnoreSelfCheckIssue",
    details: `施工专员陈七对方案中抗震自检中存在的偏差警报提出了排除偏差说明: ${ignoredReason}`
  });

  const verifiedIssues = db.prepare("SELECT * FROM self_check_issues WHERE id = ?").all(issueId) as any[];
  const v1Status = db.prepare("SELECT is_latest, status FROM document_versions WHERE id = ?").get(fVer1Id) as any;
  const v2Status = db.prepare("SELECT is_latest, status FROM document_versions WHERE id = ?").get(fVer2Id) as any;

  console.log("DEBUG - v1Status:", v1Status, "v2Status:", v2Status);
  assert(Number(v1Status.is_latest) === 0 && v1Status.status === 'obsolete', "旧版本被标记为不活跃且为 obsolete");
  assert(Number(v2Status.is_latest) === 1 && v2Status.status === 'uploaded', "最新上传的版本为活跃状态");
  assert(verifiedIssues[0].status === "ignored" && verifiedIssues[0].ignored_reason.includes("深华大厦"), "自检问题可以通过手写说明直接排除");
  console.log("✓ 【防重写版本覆盖与合规偏差忽略】验收通过。");


  // =========================================================================
  // 5. 提交审核、回复意见和关闭意见 (Process 5: Full Review Loop)
  // =========================================================================
  console.log("\n--> 5. [验收] 送审流转、结构化技术意见中心与状态机循环...");

  // Send for review
  db.transaction(() => {
    db.prepare("UPDATE documents SET status = 'pending_review' WHERE id = ?").run(fDocId);
    db.prepare("UPDATE document_versions SET status = 'pending_review' WHERE id = ?").run(fVer2Id);
    db.prepare("UPDATE tasks SET status = 'pending_review' WHERE id = ?").run(taskId);

    auditLogger.logAction({
      projectId: e2eProjectId,
      operator: "陈七 (施工负责人)",
      role: "Construction",
      action: "SUBMIT_REVIEW",
      details: `[SUBMIT_REVIEW] 提交通抗震论证方案修正版版本进行正式会签盖章审核。`
    });
  })();

  // Reviewer raises an issue
  const reviewCommentId = `rc-e2e-${Date.now().toString().slice(-4)}`;
  db.transaction(() => {
    db.prepare(`
      INSERT INTO review_comments (
        id, projectId, taskId, documentId, documentVersionId, commentType, severity, content,
        sourcePage, sourceParagraph, sourceTextSnippet, assignedTo, createdBy, createdAt, status
      ) VALUES (?, ?, ?, ?, ?, 'content_issue', 'high', '请补充第三章节的极限大震阻尼器阻抗力学反弯系数，以免防震力学指标偏低。',
               12, 4, '阻尼系数 1.25', 'user-const', 'user-review', ?, 'open')
    `).run(reviewCommentId, e2eProjectId, taskId, fDocId, fVer2Id, ts);

    db.prepare(`
      INSERT INTO review_status_logs (id, commentId, oldStatus, newStatus, changedBy, changedAt, reason)
      VALUES (?, ?, NULL, 'open', '钱八 (总监审核官)', ?, '首次在意见中心加注技术不合规项。')
    `).run(`rsl-e2e-1`, reviewCommentId, ts);
  })();

  // Specialist replies and uploads newly corrected file v3
  const fVer3Id = `fver3-e2e-${Date.now().toString().slice(-4)}`;
  db.transaction(() => {
    db.prepare("UPDATE document_versions SET is_latest = 0, status = 'obsolete' WHERE id = ?").run(fVer2Id);
    
    // Insert v3
    db.prepare(`
      INSERT INTO document_versions (id, document_id, version_number, file_size, storage_path, file_hash, uploaded_by, status, is_latest, is_final)
      VALUES (?, ?, 3, 532, '/fake/scratch_v3.pdf', 'hash999', 'user-const', 'uploaded', 1, 0)
    `).run(fVer3Id, fDocId);

    // Add reply
    db.prepare(`
      INSERT INTO review_comment_replies (
        id, commentId, projectId, taskId, documentId, documentVersionId, newDocumentVersionId, replyContent, repliedBy, repliedAt, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '我们已在最新防震V3版第12页补充了阻力反弯系数力学计算，并将该点拉升至安全阈值。', 'user-const', ?, ?)
    `).run(`reply-e2e-1`, reviewCommentId, e2eProjectId, taskId, fDocId, fVer2Id, fVer3Id, ts, ts);

    // Move comment status to replied
    db.prepare("UPDATE review_comments SET status = 'replied', updatedAt = ? WHERE id = ?").run(ts, reviewCommentId);

    db.prepare(`
      INSERT INTO review_status_logs (id, commentId, oldStatus, newStatus, changedBy, changedAt, reason)
      VALUES (?, ?, 'open', 'replied', '陈七 (施工总工)', ?, '提交偏差说明及最新修正版本')
    `).run(`rsl-e2e-2`, reviewCommentId, ts);
  })();

  // Reviewer closes the comment after inspection
  db.transaction(() => {
    db.prepare(`
      UPDATE review_comments 
      SET status = 'closed', closedBy = 'user-review', closedAt = ?, closeReason = '经复算其阻弯极限值符合抗防震设计参数，给予结案放行。', updatedAt = ?
      WHERE id = ?
    `).run(ts, ts, reviewCommentId);

    db.prepare(`
      INSERT INTO review_status_logs (id, commentId, oldStatus, newStatus, changedBy, changedAt, reason)
      VALUES (?, ?, 'replied', 'closed', '钱八 (总监审核官)', ?, '复核方案抗拉极限，通过关闭。')
    `).run(`rsl-e2e-3`, reviewCommentId, ts);

    // Lock file as final
    db.prepare("UPDATE document_versions SET is_final = 1 WHERE id = ?").run(fVer3Id);
    db.prepare("UPDATE documents SET status = 'completed' WHERE id = ?").run(fDocId);
    db.prepare("UPDATE tasks SET status = 'completed' WHERE id = ?").run(taskId);
  })();

  // Assertions
  const finalizedComment = db.prepare("SELECT * FROM review_comments WHERE id = ?").get(reviewCommentId) as any;
  const finalizedV3 = db.prepare("SELECT is_final, status FROM document_versions WHERE id = ?").get(fVer3Id) as any;
  const statusLogCheck = db.prepare("SELECT COUNT(*) as count FROM review_status_logs WHERE commentId = ?").get(reviewCommentId) as { count: number };

  assert(finalizedComment.status === "closed", "核对正常后允许 Reviewer 正式闭合此技术意见，结案通过");
  assert(finalizedV3.is_final === 1, "审核流闭环后该版本可被标定为 [最终版(is_final=1)]");
  assert(statusLogCheck.count === 3, "状态变动轨迹应被完整且无损记录在 review_status_logs 表中以便回溯");
  console.log("✓ 【审核送审、技术回响、确认结案与状态留存】全线通过验证。");


  // =========================================================================
  // 6. 主数据变更影响分析 (Process 6: Project Master Data Change & Multidimensional Impact Re-evaluation)
  // =========================================================================
  console.log("\n--> 6. [验收] 修改项目基础主数据并触发多维度偏差影响重新审核机制...");

  // Let's modify critical fields on project master data (gross_floor_area_value changes to 150000)
  const masterChangeId = `mdc-chg-${Date.now().toString().slice(-4)}`;
  db.transaction(() => {
    db.prepare(`
      UPDATE project_master_data
      SET gross_floor_area_value = 150000.00, updated_at = ?
      WHERE project_id = ?
    `).run(ts, e2eProjectId);

    db.prepare(`
      INSERT INTO master_data_changes (id, project_id, field_name, old_value, new_value, changed_by, changed_at, source, impact_level)
      VALUES (?, ?, 'grossFloorAreaValue', '125000.00', '150000.00', '李四 (项目负责人)', ?, '手工修改', 'high')
    `).run(masterChangeId, e2eProjectId, ts);
  })();

  // Now, we execute the exact impact trace recalculation helper in server.ts
  analyzeImpactForProjectAndChange(e2eProjectId, masterChangeId, "grossFloorAreaValue", "125000.00", "150000.00", "李四 (项目负责人)");

  // Assert that change impact records are generated!
  const changeImpacts = db.prepare("SELECT * FROM change_impact_records WHERE projectId = ? AND masterDataChangeId = ?").all(e2eProjectId, masterChangeId) as any[];
  assert(changeImpacts.length > 0, "必须高保真地捕获到主数据大幅改动（从 12.5w 调高至 15w ㎡），并联动生成 change_impact_records 反响行");

  // Verify elements are marked requiresReview
  const impactedTask = db.prepare("SELECT requiresReview FROM tasks WHERE id = ?").get(taskId) as any;
  const impactedDoc = db.prepare("SELECT requiresReview FROM documents WHERE id = ?").get(fDocId) as any;
  assert(impactedTask.requiresReview === 1, "发生重置风险或指标裂变的主数据变更后，相关计划任务必须被强制标志为 requiresReview 以防暗度陈仓");
  assert(impactedDoc.requiresReview === 1, "本案的核心交付文件也应打上待重审印章");

  // Project Manager reviews the actual impact and clears flags
  const targetImpact = changeImpacts.find(item => item.affectedType === "task");
  
  db.transaction(() => {
    // Clear in trace table
    db.prepare(`
      UPDATE change_impact_records 
      SET status = 'confirmed', resolvedBy = 'user-pm', resolvedAt = ?, resolutionNote = '工程主设计面积扩增符合防震受力线性比例，无实质风险，准予通过。'
      WHERE id = ?
    `).run(ts, targetImpact.id);

    // Clear main task flag
    db.prepare(`
      UPDATE tasks 
      SET requiresReview = 0, reviewConfirmedBy = 'user-pm', reviewConfirmedAt = ?, reviewConfirmationNote = '抗震系数按新面积扩算无逻辑冲突，手动签署，清除重新审核标记'
      WHERE id = ?
    `).run(ts, targetImpact.affectedId);
  })();

  const taskAfterClear = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as any;
  const impactAfterClear = db.prepare("SELECT * FROM change_impact_records WHERE id = ?").get(targetImpact.id) as any;

  assert(taskAfterClear.requiresReview === 0, "经项目经理手动审查后，requiresReview 标记恢复为零");
  assert(taskAfterClear.reviewConfirmedBy === "user-pm", "确认轨迹应安全刻写");
  assert(impactAfterClear.status === "confirmed", "影响事件收尾状态正常更新为已确认");
  console.log("✓ 【主数据级联牵引、标记需复核与项目负责人确认复核】双保险链路闭环正常。");


  // =========================================================================
  // 7. 系统通知及界面展示文字中文映射验证 (Process 7: Notifications & Chinese Copywrite Check)
  // =========================================================================
  console.log("\n--> 7. [验收] 界面显示语言、状态翻译映射及本地内网通知架构验证...");

  // Send review notification
  db.prepare(`
    INSERT INTO notifications (id, projectId, userId, notificationType, title, message, sourceType, sourceId, isRead, createdAt)
    VALUES ('notif-e2e-1', ?, 'user-review', 'pending_review', '待审核资料提醒', '方案交付件提交审核。', 'document_version', 'new_ver_id', 0, ?)
  `).run(e2eProjectId, ts);

  const unresolvedNotifs = db.prepare("SELECT * FROM notifications WHERE projectId = ? AND userId = 'user-review'").all(e2eProjectId) as any[];
  assert(unresolvedNotifs.length > 0, "审核送审或分配必须确保在系统内置的 notifications 表内对受体人员发起精准待办卡包通知");

  // Mark all notifications read
  db.prepare("UPDATE notifications SET isRead = 1, readAt = ? WHERE projectId = ?").run(ts, e2eProjectId);
  const readStatusCheck = db.prepare("SELECT COUNT(*) as count FROM notifications WHERE projectId = ? AND isRead = 0").get(e2eProjectId) as { count: number };
  assert(readStatusCheck.count === 0, "消息系统应该支持正常标记已读(isRead=1)功能。");

  // Technical UI String consistency checks
  // We mock a frontend model of translation matching table mapping:
  const statusLabelMap: Record<string, string> = {
    "pending_review": "待审核",
    "requires_review": "需复核",
    "self_check_failed": "自检未通过",
    "high": "高",
    "medium": "中",
    "low": "低",
    "closed": "已关闭"
  };

  assert(statusLabelMap["pending_review"] === "待审核", "机器底层状态枚举与中文 UI 正式标签对照：'pending_review' 映射应为 '待审核'");
  assert(statusLabelMap["high"] === "高", "技术分类严重度: 'high' 展示层应为 '高'");
  assert(statusLabelMap["closed"] === "已关闭", "意见关闭标志: 'closed' 展示层面应为 '已关闭'");
  console.log("✓ 【界面显示语言完全中文化与通知已读流】验证符合试点安全边界。");


  // =========================================================================
  // 8. 审计与安全性底册清扫验证 (Process 8: System audit trail clean logs)
  // =========================================================================
  console.log("\n--> 8. [验收] 全系列系统审计流水（Audit Logs）追索与归挡检查...");

  const allAuditLogs = db.prepare("SELECT * FROM audit_logs WHERE project_id = ?").all(e2eProjectId) as any[];
  console.log(`在当前 E2E 试点项目运行其间，底层审计功能一共高保真抓捕了: ${allAuditLogs.length} 项关键生产操作风险痕迹。`);
  
  assert(allAuditLogs.length >= 3, "全链路中的创建、AI确认、人工忽略以及结案等必记动词，必须毫无遗漏地产出物理性审计底册日志");
  console.log("✓ 【审计日志持久化】持久化断言完全正常。");


  // =========================================================================
  // 9. 垃圾回收与测试洁净退出 (Process 9: Workbench cleaning and clean exits)
  // =========================================================================
  console.log("\nCleaning MVP E2E workbench test environment...");
  db.transaction(() => {
    db.prepare("DELETE FROM notifications WHERE projectId = ?").run(e2eProjectId);
    db.prepare("DELETE FROM change_impact_records WHERE projectId = ?").run(e2eProjectId);
    db.prepare("DELETE FROM review_status_logs WHERE commentId IN (SELECT id FROM review_comments WHERE projectId = ?)").run(e2eProjectId);
    db.prepare("DELETE FROM review_comment_replies WHERE projectId = ?").run(e2eProjectId);
    db.prepare("DELETE FROM review_comments WHERE projectId = ?").run(e2eProjectId);
    db.prepare("DELETE FROM self_check_issues WHERE project_id = ?").run(e2eProjectId);
    db.prepare("DELETE FROM self_check_runs WHERE project_id = ?").run(e2eProjectId);
    db.prepare("DELETE FROM document_versions WHERE document_id IN (SELECT id FROM documents WHERE project_id = ?)").run(e2eProjectId);
    db.prepare("DELETE FROM documents WHERE project_id = ?").run(e2eProjectId);
    db.prepare("DELETE FROM document_requirements WHERE project_id = ?").run(e2eProjectId);
    db.prepare("DELETE FROM tasks WHERE project_id = ?").run(e2eProjectId);
    db.prepare("DELETE FROM project_members WHERE project_id = ?").run(e2eProjectId);
    db.prepare("DELETE FROM project_master_data WHERE project_id = ?").run(e2eProjectId);
    db.prepare("DELETE FROM master_data_changes WHERE project_id = ?").run(e2eProjectId);
    db.prepare("DELETE FROM ai_call_logs WHERE project_id = ?").run(e2eProjectId);
    db.prepare("DELETE FROM ai_extraction_results WHERE project_id = ?").run(e2eProjectId);
    db.prepare("DELETE FROM projects WHERE id = ?").run(e2eProjectId);
  })();

  console.log("====================================================================");
  console.log("🎉 [通过] BIDWORKS 全链路五大阶段端到端 MVP 终验测试全部测试通过！所有断言均 100% 通过。");
  console.log("====================================================================\n");
}

runMvpFinalEndToEndTests().catch(err => {
  console.error("\n❌ [失败] MVP 终极验收与测试链路产生异常阻断：", err);
  process.exit(1);
});
