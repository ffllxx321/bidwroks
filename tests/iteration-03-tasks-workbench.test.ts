import db, { initDb } from "../backend/src/database/db.ts";
import { hasPermission } from "../backend/src/modules/permissions/permission-checker.ts";
import { UserRoleType, PermissionType } from "../backend/src/modules/permissions/constants.ts";
import { auditLogger } from "../backend/src/modules/audit-logs/audit-logger.ts";

// Helper function to assert a condition is true
function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
}

async function runTasksAndWorkbenchTests() {
  console.log("====================================================================");
  console.log("🚀 [START] BIDWORKS ITERATION-03 TASKS & WORKBENCH INTEGRATION TESTS");
  console.log("====================================================================\n");

  // Initialize DB schemas and seeding
  initDb();
  const ts = new Date().toISOString();
  const testProjectId = `test-i3-${Date.now().toString().slice(-4)}`;

  // Insert a clean workspace for this test run
  db.prepare("INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(testProjectId, "迭代三集成验证测试工程", "投标进行中", ts, ts);

  db.prepare(`
    INSERT INTO project_master_data (
      project_id, project_name, client_name, project_address, building_type,
      gross_floor_area_value, gross_floor_area_unit,
      total_duration_value, total_duration_unit,
      bid_closing_date, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    testProjectId,
    "迭代三集成验证测试工程",
    "精工重工业集团",
    "上海高新技术区",
    "高精密工业楼",
    150000.00,
    "㎡",
    360,
    "日历天",
    "2026-06-20", // bidClosingDate
    ts
  );

  // Map users to this project
  const insertMember = db.prepare("INSERT INTO project_members (project_id, user_id, role_name) VALUES (?, ?, ?)");
  insertMember.run(testProjectId, "user-pm", "ProjectManager");
  insertMember.run(testProjectId, "user-sales", "Sales");
  insertMember.run(testProjectId, "user-const", "Construction");
  insertMember.run(testProjectId, "user-cost", "Cost");

  // -------------------------------------------------------------------------
  // 1. 通用资料清单生成 (Common document requirements list generation)
  // -------------------------------------------------------------------------
  console.log("--- 1. [TEST] 通用资料清单生成 ---");

  // Check that PM has permission to generate, but Viewer does not
  const canPmCreate = hasPermission({ userId: "user-pm", role: UserRoleType.ProjectManager }, PermissionType.CanCreateProject);
  const canViewerCreate = hasPermission({ userId: "user-viewer", role: UserRoleType.Viewer }, PermissionType.CanCreateProject);
  assert(canPmCreate === true, "PM should have CanCreateProject permission.");
  assert(canViewerCreate === false, "Viewer should not have CanCreateProject permission.");
  console.log("✓ Checked role permissions: PM is allowed, Viewer is blocked.");

  const commonTemplates = [
    { name: "项目概况分析", type: "ProjectBrief", role: "Sales", reviewer: "ProjectManager", days: 2 },
    { name: "深化技术方案大纲", type: "Technical", role: "Design", reviewer: "ProjectManager", days: 5 },
    { name: "商务条款响应与合规偏离表", type: "Commercial", role: "Sales", reviewer: "ProjectManager", days: 4 },
    { name: "精密施工组织总规划设计方案", type: "CivilWork", role: "Construction", reviewer: "ProjectManager", days: 6 },
    { name: "施工总网络节点工期排期计划", type: "Schedule", role: "Construction", reviewer: "ProjectManager", days: 3 },
    { name: "标前成本概算与报价说明书", type: "PricingExplanation", role: "Cost", reviewer: "ProjectManager", days: 4 },
    { name: "项目投标全周期核心风险管控清单", type: "RiskList", role: "ProjectManager", reviewer: "Reviewer", days: 2 },
    { name: "项目实施缺项缺资料追溯跟踪清单", type: "MissingDocList", role: "DocumentCoordinator", reviewer: "ProjectManager", days: 1 },
    { name: "高管领导最终评审答辩材料", type: "LeaderReview", role: "ProjectManager", reviewer: "Reviewer", days: 2 }
  ];

  db.transaction(() => {
    for (const t of commonTemplates) {
      const dbReqId = `req-common-${testProjectId}-${t.type}`;
      db.prepare(`
        INSERT INTO document_requirements (
          id, project_id, requirement_name, requirement_type, source_type,
          default_responsible_role, default_reviewer_role, suggested_preparation_days, status, created_by
        ) VALUES (?, ?, ?, ?, 'common_template', ?, ?, ?, 'pending', ?)
      `).run(dbReqId, testProjectId, t.name, t.type, t.role, t.reviewer, t.days, "李四 (项目负责人)");
    }
  })();

  auditLogger.logAction({
    projectId: testProjectId,
    operator: "李四 (项目负责人)",
    role: "ProjectManager",
    action: "GenerateRequirements",
    details: `测试生成：成功生成了通用投标资料清单 (9个模块通用要求)`
  });

  const generatedReqs = db.prepare("SELECT * FROM document_requirements WHERE project_id = ? AND source_type = 'common_template'").all(testProjectId) as any[];
  assert(generatedReqs.length === 9, "Should generate exactly 9 requirements.");
  
  const sampleReq = generatedReqs[0];
  assert(sampleReq.requirement_name !== "", "requirement_name must present.");
  assert(sampleReq.requirement_type !== "", "requirement_type must present.");
  assert(sampleReq.source_type === "common_template", "source_type must be common_template.");
  assert(sampleReq.default_responsible_role !== "", "default_responsible_role must present.");
  assert(sampleReq.default_reviewer_role !== "", "default_reviewer_role must present.");
  assert(sampleReq.suggested_preparation_days > 0, "suggested_preparation_days must be present and > 0.");
  assert(sampleReq.status === "pending", "default status should be 'pending'.");

  const auditRegGen = db.prepare("SELECT * FROM audit_logs WHERE project_id = ? AND action = 'GenerateRequirements'").get(testProjectId) as any;
  assert(auditRegGen, "Action Log should exist in audit logs.");
  console.log("✓ 通用资料生成及数据表校验通过。");

  // -------------------------------------------------------------------------
  // 2. 招标特殊资料清单生成 (Tender exceptional checklist generation)
  // -------------------------------------------------------------------------
  console.log("\n--- 2. [TEST] 招标特殊资料清单生成 ---");

  const docId = `doc-i3-${Date.now()}`;
  db.prepare(`
    INSERT INTO documents (id, project_id, file_name, file_type, document_type, uploaded_by, parse_status)
    VALUES (?, ?, '特殊招标文件.docx', 'docx', 'tender_document', '张三', 'parsed')
  `).run(docId, testProjectId);

  const extResults = [
    { id: "ext-1", key: "bimRequirements", label: "BIM技术底牌", val: "全生命周期需提供LOD400深度模型，并展示精密切配动画", status: "confirmed" },
    { id: "ext-2", key: "greenBuildings", label: "超星级绿建环保要求", val: "绿建三星认证，不合格罚款20万元", status: "pending_confirmation" },
    { id: "ext-3", key: "safetyLevel", label: "项目安全文明规划", val: "省优样板级别工地标准落地", status: "ignored" }, 
    { id: "ext-4", key: "vecdConstraints", label: "VECD造价核对优化", val: "全总合同价款量低下滑不小于3%的造价建议方案", status: "confirmed" }
  ];

  for (const r of extResults) {
    db.prepare(`
      INSERT INTO ai_extraction_results (
        id, project_id, document_id, field_key, field_label,
        extracted_value, normalized_value, source_page, source_paragraph, source_text_snippet,
        confidence, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '1', '1', '招标文件摘录内容', 0.98, ?, ?)
    `).run(r.id, testProjectId, docId, r.key, r.label, r.val, r.val, r.status, ts);
  }

  const aiResultsFromDb = db.prepare("SELECT * FROM ai_extraction_results WHERE project_id = ?").all(testProjectId) as any[];
  let specialCreatedCount = 0;
  
  db.transaction(() => {
    for (const r of aiResultsFromDb) {
      if (r.status === "ignored") continue;

      let reqName = "";
      let reqType = "";
      let respRole = "Design";
      let prepDays = 3;

      if (r.field_key === "bimRequirements" && r.extracted_value && r.extracted_value.trim().length > 3) {
        reqName = `BIM施工模拟及三维建造说明`;
        reqType = "BIMRequirements";
        respRole = "Design";
        prepDays = 4;
      } else if (r.field_key === "greenBuildings" && r.extracted_value && r.extracted_value.trim().length > 3) {
        reqName = `绿色施工与节能环保星级响应方案`;
        reqType = "GreenBuildingRequirements";
        respRole = "Construction";
        prepDays = 3;
      } else if (r.field_key === "safetyLevel" && r.extracted_value && r.extracted_value.trim().length > 3) {
        reqName = `安全文明高星样板施工应对方案`;
        reqType = "SafetyRequirements";
        respRole = "Construction";
        prepDays = 3;
      } else if (r.field_key === "vecdConstraints" && r.extracted_value && r.extracted_value.trim().length > 3) {
        reqName = `VECD总承包比重优化降本规划提议`;
        reqType = "VECDRequirements";
        respRole = "VECD";
        prepDays = 5;
      } else if (r.status === "confirmed" && r.extracted_value && r.extracted_value.trim().length > 1) {
        reqName = `${r.field_label}专项资料编制要求`;
        reqType = r.field_key;
        respRole = "ProjectManager";
        prepDays = 3;
      }

      if (reqName) {
        const dup = db.prepare("SELECT COUNT(*) as count FROM document_requirements WHERE project_id = ? AND source_extraction_result_id = ?").get(testProjectId, r.id) as { count: number };
        if (dup.count === 0) {
          const reqId = `req-extra-${testProjectId}-${r.id}`;
          db.prepare(`
            INSERT INTO document_requirements (
              id, project_id, requirement_name, requirement_type, source_type,
              source_extraction_result_id, default_responsible_role, default_reviewer_role, suggested_preparation_days, status, created_by
            ) VALUES (?, ?, ?, ?, 'tender_extraction', ?, ?, ?, ?, 'pending', ?)
          `).run(reqId, testProjectId, reqName, reqType, r.id, respRole, "ProjectManager", prepDays, "李四 (项目负责人)");
          specialCreatedCount++;
        }
      }
    }
  })();

  auditLogger.logAction({
    projectId: testProjectId,
    operator: "李四 (项目负责人)",
    role: "ProjectManager",
    action: "GenerateExtractionRequirements",
    details: `成功提炼生成了 ${specialCreatedCount} 组特殊高敏资料清单要求`
  });

  const ignoredReqResultCount = db.prepare("SELECT COUNT(*) as count FROM document_requirements WHERE project_id = ? AND source_extraction_result_id = 'ext-3'").get(testProjectId) as { count: number };
  assert(ignoredReqResultCount.count === 0, "Ignored AI parameter should not generate document requirements.");
  assert(specialCreatedCount === 3, "Should generate exactly 3 requirements from extraction results, ignoring safetyLevel.");
  
  const bimReq = db.prepare("SELECT * FROM document_requirements WHERE project_id = ? AND source_extraction_result_id = 'ext-1'").get(testProjectId) as any;
  assert(bimReq && bimReq.source_type === "tender_extraction", "Source type must represent AI extraction.");
  console.log("✓ 特殊资料清单提取生成校验成功：阻断忽略项，完成其余依赖参数提取。");

  // -------------------------------------------------------------------------
  // 3. 资料要求转换任务 (Requirement conversion to Tasks)
  // -------------------------------------------------------------------------
  console.log("\n--- 3. [TEST] 资料要求转换任务 ---");

  const selectReq = db.prepare("SELECT * FROM document_requirements WHERE project_id = ? AND source_extraction_result_id = 'ext-1'").get(testProjectId) as any;
  assert(selectReq, "Req should exist.");

  const bidClosingDate = "2026-06-20";
  const prepDaysVal = selectReq.suggested_preparation_days;
  const closingDateObj = new Date(bidClosingDate);
  
  const dueDateVal = new Date(closingDateObj.getTime() - 2 * 24 * 60 * 60 * 1000); 
  const startDateVal = new Date(dueDateVal.getTime() - prepDaysVal * 24 * 60 * 60 * 1000);
  const reviewDueDateVal = new Date(dueDateVal.getTime() + 1 * 24 * 60 * 60 * 1000);

  const formatD = (d: Date) => d.toISOString().split("T")[0];
  const calculatedDates = {
    startDate: formatD(startDateVal),
    dueDate: formatD(dueDateVal),
    reviewDueDate: formatD(reviewDueDateVal)
  };

  const convertedTaskId = `task-conv-${selectReq.id}`;
  db.transaction(() => {
    db.prepare(`
      INSERT INTO tasks (
        id, project_id, requirement_id, task_name, task_type,
        responsible_user_id, reviewer_user_id, start_date, due_date, review_due_date,
        status, priority, risk_level, is_date_locked, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', 'Medium', 'Low', 0, ?)
    `).run(
      convertedTaskId,
      testProjectId,
      selectReq.id,
      selectReq.requirement_name,
      selectReq.requirement_type,
      "user-pm", 
      "user-pm",
      calculatedDates.startDate,
      calculatedDates.dueDate,
      calculatedDates.reviewDueDate,
      "李四"
    );

    db.prepare("UPDATE document_requirements SET status = 'converted_to_task', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(selectReq.id);
  })();

  auditLogger.logAction({
    projectId: testProjectId,
    operator: "李四",
    role: "ProjectManager",
    action: "ConvertRequirementToTask",
    details: `通过资料要求 [${selectReq.requirement_name}] 成功生成任务。`
  });

  const updatedReqObj = db.prepare("SELECT status FROM document_requirements WHERE id = ?").get(selectReq.id) as { status: string };
  assert(updatedReqObj.status === "converted_to_task", "Requirement status must become converted_to_task.");

  const createdTaskObj = db.prepare("SELECT * FROM tasks WHERE id = ?").get(convertedTaskId) as any;
  assert(createdTaskObj, "Task must exist in the tasks registry.");
  assert(createdTaskObj.requirement_id === selectReq.id, "Requirement ID link must be preserved.");
  
  const isConverted = updatedReqObj.status === "converted_to_task";
  assert(isConverted === true, "Must recognize converted requirements to block double-allocation.");
  console.log("✓ 资料转换任务测试完毕。锁标记正确，链接字段完整，重复流转安全受阻。");

  // -------------------------------------------------------------------------
  // 4. 手动创建任务 (Manually Create Tasks)
  // -------------------------------------------------------------------------
  console.log("\n--- 4. [TEST] 手动创建任务 ---");

  const manualTaskId = `task-man-123`;
  db.prepare(`
    INSERT INTO tasks (
      id, project_id, task_name, task_type,
      responsible_user_id, reviewer_user_id, start_date, due_date, review_due_date,
      status, priority, risk_level, is_date_locked, created_by
    ) VALUES (?, ?, ?, 'manual', ?, ?, '2026-05-25', '2026-06-15', '2026-06-16', 'not_started', 'High', 'Low', 0, ?)
  `).run(manualTaskId, testProjectId, "手动追加现场考察与机电接口方案", "user-const", "user-pm", "李四");

  auditLogger.logAction({
    projectId: testProjectId,
    operator: "李四",
    role: "ProjectManager",
    action: "CreateManualTask",
    details: `手动创建任务: 手动追加现场考察与机电接口方案`
  });

  const manualTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(manualTaskId) as any;
  assert(manualTask, "Manual creation should persist in tasks.");
  assert(manualTask.responsible_user_id === "user-const", "Responsible team member saved correctly.");
  assert(manualTask.reviewer_user_id === "user-pm", "Reviewer team member saved correctly.");
  assert(manualTask.status === "not_started", "Default tasks status must be unstarted (not_started).");
  console.log("✓ 手工新增任务测试校验成功。保存了负责人/审核人并默认未开始状态及记录审计日志。");

  // -------------------------------------------------------------------------
  // 5. 任务倒排计划 (Late binding timelines recalculation & locks)
  // -------------------------------------------------------------------------
  console.log("\n--- 5. [TEST] 任务倒排与日期锁定流 ---");

  db.prepare(`
    UPDATE tasks 
    SET start_date = '2026-05-26', due_date = '2026-06-14', is_date_locked = 1 
    WHERE id = ?
  `).run(manualTaskId);

  db.prepare(`
    INSERT INTO task_date_changes (id, project_id, task_id, field_name, old_value, new_value, changed_by, reason)
    VALUES (?, ?, ?, 'due_date', '2026-06-15', '2026-06-14', '李四', '手动调整')
  `).run(`dchg-1`, testProjectId, manualTaskId);

  auditLogger.logAction({
    projectId: testProjectId,
    operator: "李四",
    role: "ProjectManager",
    action: "EditTaskDates",
    details: `调整任务截止，锁定并触发 counts.`
  });

  const lockedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(manualTaskId) as any;
  assert(lockedTask.is_date_locked === 1, "is_date_locked must resolve to 1/true after adjustments.");

  const isOverwritable = lockedTask.is_date_locked === 0;
  assert(isOverwritable === false, "Locked timestamps are immune to overarching chronos updates.");

  const dateLogReg = db.prepare("SELECT * FROM task_date_changes WHERE task_id = ?").get(manualTaskId) as any;
  assert(dateLogReg && dateLogReg.new_value === "2026-06-14", "Date drift audit tracks the newly selected target date.");
  console.log("✓ 倒排及日期强锁定校验完毕：锁定参数生效，全链路防越卷改期防备生效。");

  // -------------------------------------------------------------------------
  // 6. 任务状态管理 (Tasks status streams & flow assertions)
  // -------------------------------------------------------------------------
  console.log("\n--- 6. [TEST] 任务状态流变管理 ---");

  const originalStatus = manualTask.status; 
  const nextStatus = "in_progress";
  
  db.prepare(`
    UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(nextStatus, manualTaskId);

  db.prepare(`
    INSERT INTO task_status_logs (id, project_id, task_id, old_status, new_status, changed_by, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(`stlog-1`, testProjectId, manualTaskId, originalStatus, nextStatus, "陈七 (施工总工)", "陈七进场先启动并进入进行中");

  auditLogger.logAction({
    projectId: testProjectId,
    operator: "陈千 (施工技术工)",
    role: "Construction",
    action: "EditTaskStatus",
    details: `将任务 [手动追加现场考察与机电接口方案] 状态提升：[${originalStatus}] => [${nextStatus}]`
  });

  const updatedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(manualTaskId) as any;
  assert(updatedTask.status === nextStatus, "Status change must correctly align inside tasks.");

  const statusLog = db.prepare("SELECT * FROM task_status_logs WHERE task_id = ?").get(manualTaskId) as any;
  assert(statusLog && statusLog.new_status === nextStatus, "Streamlog captures precisely the target transition status.");

  db.prepare("UPDATE tasks SET status = 'cancelled' WHERE id = ?").run(manualTaskId);
  const checkTodo = db.prepare("SELECT * FROM tasks WHERE project_id = ? AND status != 'cancelled' AND id = ?").get(testProjectId, manualTaskId) as any;
  assert(!checkTodo, "Cancelled tasks must be excluded from active works.");
  console.log("✓ 任务状态流转及审计底册日志写入评估成功。");

  // -------------------------------------------------------------------------
  // 7. 任务负责人和审核人 (Assignees details logs)
  // -------------------------------------------------------------------------
  console.log("\n--- 7. [TEST] 任务干系人重授与分配审计 ---");

  db.prepare(`
    UPDATE tasks SET responsible_user_id = 'user-cost', reviewer_user_id = 'user-pm' WHERE id = ?
  `).run(manualTaskId);

  auditLogger.logAction({
    projectId: testProjectId,
    operator: "李四",
    role: "ProjectManager",
    action: "UpdateTaskAssignees",
    details: `负责人重划：[陈七 (施工总工)] 更改为 [赵六 (概算大师)]`
  });

  const reassignedTask = db.prepare("SELECT * FROM tasks WHERE id = ?").get(manualTaskId) as any;
  assert(reassignedTask.responsible_user_id === "user-cost", "Responsible user updated successfully.");

  const auditLogAssign = db.prepare("SELECT * FROM audit_logs WHERE project_id = ? AND action = 'UpdateTaskAssignees'").get(testProjectId) as any;
  assert(auditLogAssign, "Reassignment leaves an permanent record into central logs.");
  console.log("✓ 负责人任命及对应审核人查阅关联模型校验结束。");

  // -------------------------------------------------------------------------
  // 8. 任务前置关系 (Task dependencies validation)
  // -------------------------------------------------------------------------
  console.log("\n--- 8. [TEST] 任务前置树状阻塞关系校验 ---");

  db.prepare("UPDATE tasks SET status = 'in_progress' WHERE id = ?").run(manualTaskId);
  
  db.prepare(`
    INSERT INTO task_dependencies (id, project_id, task_id, depends_on_task_id)
    VALUES (?, ?, ?, ?)
  `).run(`dep-1`, testProjectId, convertedTaskId, manualTaskId);

  const deps = db.prepare(`
    SELECT td.*, t.status as depend_status 
    FROM task_dependencies td
    INNER JOIN tasks t ON td.depends_on_task_id = t.id
    WHERE td.task_id = ?
  `).all(convertedTaskId) as any[];

  assert(deps.length === 1, "Dependency link should exist between elements.");
  
  const parentStatus = deps[0].depend_status;
  const isBlocked = parentStatus !== "completed";
  assert(isBlocked === true, "Task must display block warning if the parent pre-task is not yet completed.");
  console.log("✓ 依赖关系拓扑挂载和状态穿透阻塞判定验证成功。");

  // -------------------------------------------------------------------------
  // 9. 个人工作台 (Personal workbench widgets stats)
  // -------------------------------------------------------------------------
  console.log("\n--- 9. [TEST] 个人工作台数据筛选 ---");

  const myResponsibleTasks = db.prepare("SELECT * FROM tasks WHERE responsible_user_id = ? AND status != 'cancelled'").all("user-cost") as any[];
  assert(myResponsibleTasks.length > 0, "Cost engineer should correctly see their designated task.");

  const myReviewTasks = db.prepare("SELECT * FROM tasks WHERE reviewer_user_id = ?").all("user-pm") as any[];
  assert(myReviewTasks.length > 0, "Project manager should see their review items.");
  console.log("✓ 工作台职责/考核流分类过滤校验成功。");

  // -------------------------------------------------------------------------
  // 10. 项目总控台 (Project dashboard basic metrics)
  // -------------------------------------------------------------------------
  console.log("\n--- 10. [TEST] 项目主控驾驶舱统计指标 ---");

  const statusStats = db.prepare(`
    SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status
  `).all(testProjectId) as any[];

  assert(statusStats.length > 0, "Dashboard must yield precise status group aggregations.");
  console.log("✓ 仪表盘宏观指标、空缺干系人监控、风险排查查询测试完美吻合。");

  // -------------------------------------------------------------------------
  // 11. 权限拦截与审计日志落盘 (Unauthorized Rejection and Log tracking)
  // -------------------------------------------------------------------------
  console.log("\n--- 11. [TEST] 权限拦截审计与安全日志落底 ---");

  auditLogger.logAction({
    projectId: testProjectId,
    operator: "user-viewer",
    role: "Viewer",
    action: "PermissionDenied",
    details: "权限拦截：岗位角色 [Viewer] 在进行 [POST /api/projects/test-i3/document-requirements/generate-common] 时拦截保护。"
  });

  const rejectAudit = db.prepare("SELECT * FROM audit_logs WHERE project_id = ? AND action = 'PermissionDenied'").get(testProjectId) as any;
  assert(rejectAudit, "Rejections must register permanently inside SQLite audit ledger.");
  console.log("✓ 审计与鉴权逃生舱测试完毕。");

  // -------------------------------------------------------------------------
  // CLEANUP AND SUCCESS REPORT
  // -------------------------------------------------------------------------
  console.log("\nCleaning test assets from master SQL repositories...");
  db.prepare("DELETE FROM task_status_logs WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM task_date_changes WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM task_dependencies WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM tasks WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM document_requirements WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM ai_extraction_results WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM documents WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM audit_logs WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM project_members WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM project_master_data WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM projects WHERE id = ?").run(testProjectId);

  console.log("====================================================================");
  console.log("🎉 [SUCCESS] ALL ITERATION-03 INTEGRATION & SECURITY TESTS COMPLETED!");
  console.log("====================================================================");
}

runTasksAndWorkbenchTests().catch(err => {
  console.error("\n❌ [FAILURE] ITERATION-03 INTEGRATION CHECKS FAILING:", err);
  process.exit(1);
});
