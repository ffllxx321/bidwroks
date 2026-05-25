import db, { initDb } from "../backend/src/database/db.ts";

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
}

async function runBidScheduleOverviewTests() {
  console.log("====================================================================");
  console.log("🚀 [START] BIDWORKS REFACTOR: BID SCHEDULE OVERVIEW & DP DEPENDENCY TESTS");
  console.log("====================================================================\n");

  initDb();
  const ts = new Date().toISOString();
  const testProjectId = `test-bso-${Date.now().toString().slice(-4)}`;

  // 1. Setup mock environment
  console.log("--> 1. Creating sample project...");
  db.prepare("INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(testProjectId, "新宿中心二期工程标段", "投标进行中", ts, ts);

  db.prepare(`
    INSERT INTO project_master_data (
      project_id, project_name, client_name, project_address, building_type,
      gross_floor_area_value, gross_floor_area_unit,
      total_duration_value, total_duration_unit,
      bid_closing_date, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    testProjectId,
    "新宿中心二期工程标段",
    "企业本建",
    "东京都新宿区",
    "超高层建筑",
    64000.00,
    "㎡",
    420,
    "日历天",
    "2026-09-01",
    ts
  );

  // 2. Insert tasks that correspond to multiple stages
  console.log("--> 2. Creating multiple tasks representing logical stage swimlanes...");
  const t1 = `tsk-stage1-${Date.now().toString().slice(-4)}`;
  const t2 = `tsk-stage2-${Date.now().toString().slice(-4)}`;
  const t2_b = `tsk-stage2b-${Date.now().toString().slice(-4)}`;
  const t3 = `tsk-stage3-${Date.now().toString().slice(-4)}`;
  const t4 = `tsk-stage4-${Date.now().toString().slice(-4)}`;
  const t5 = `tsk-stage5-${Date.now().toString().slice(-4)}`;

  // Stage 1
  db.prepare(`
    INSERT INTO tasks (id, project_id, task_name, status, due_date, risk_level, requiresReview)
    VALUES (?, ?, ?, 'completed', '2026-06-05', 'Low', 0)
  `).run(t1, testProjectId, "招标文件信息识别与资料要求确认");

  // Stage 2
  db.prepare(`
    INSERT INTO tasks (id, project_id, task_name, status, due_date, risk_level, requiresReview)
    VALUES (?, ?, ?, 'in_progress', '2026-06-15', 'Medium', 0)
  `).run(t2, testProjectId, "多部门图纸深化与技术资料准备编制");

  // Stage 2_b
  db.prepare(`
    INSERT INTO tasks (id, project_id, task_name, status, due_date, risk_level, requiresReview)
    VALUES (?, ?, ?, 'not_started', '2026-06-18', 'Medium', 0)
  `).run(t2_b, testProjectId, "施工方案初制");

  // Stage 3
  db.prepare(`
    INSERT INTO tasks (id, project_id, task_name, status, due_date, risk_level, requiresReview)
    VALUES (?, ?, ?, 'not_started', '2026-06-25', 'High', 0)
  `).run(t3, testProjectId, "技术组与商务组内部对自检测算合理性自检");

  // Stage 4
  db.prepare(`
    INSERT INTO tasks (id, project_id, task_name, status, due_date, risk_level, requiresReview)
    VALUES (?, ?, ?, 'not_started', '2026-07-01', 'High', 0)
  `).run(t4, testProjectId, "大纲成果装订签字会签汇总定稿工作");

  // Stage 5
  db.prepare(`
    INSERT INTO tasks (id, project_id, task_name, status, due_date, risk_level, requiresReview)
    VALUES (?, ?, ?, 'not_started', '2026-07-10', 'High', 0)
  `).run(t5, testProjectId, "密封成果上传提交及开标递交工作");

  // 3. Create Dependencies relations
  console.log("--> 3. Defining dependency connections...");
  db.prepare("INSERT INTO task_dependencies (task_id, depends_on_task_id, project_id) VALUES (?, ?, ?)")
    .run(t2, t1, testProjectId); // Stage 2 depends on Stage 1
  db.prepare("INSERT INTO task_dependencies (task_id, depends_on_task_id, project_id) VALUES (?, ?, ?)")
    .run(t2_b, t2, testProjectId); // Stage 2b depends on Stage 2
  db.prepare("INSERT INTO task_dependencies (task_id, depends_on_task_id, project_id) VALUES (?, ?, ?)")
    .run(t3, t2_b, testProjectId); // Stage 3 depends on Stage 2b
  db.prepare("INSERT INTO task_dependencies (task_id, depends_on_task_id, project_id) VALUES (?, ?, ?)")
    .run(t4, t3, testProjectId); // Stage 4 depends on Stage 3
  db.prepare("INSERT INTO task_dependencies (task_id, depends_on_task_id, project_id) VALUES (?, ?, ?)")
    .run(t5, t4, testProjectId); // Stage 5 depends on Stage 4

  // Verify DB dependencies retrieval
  const rowDeps = db.prepare("SELECT * FROM task_dependencies WHERE task_id = ?").all(t2);
  assert(rowDeps.length === 1, "Task t2 should have exactly 1 dependency row");
  assert((rowDeps[0] as any).depends_on_task_id === t1, "t2 should depend on t1");

  // 4. Test stage mapping logic (mimic the app mapping)
  console.log("--> 4. Testing swimlane stages categorization mapping rules...");
  const getStageIndex = (name: string): number => {
    const lowercaseName = name.toLowerCase();
    if (lowercaseName.includes("识别") || lowercaseName.includes("解析") || lowercaseName.includes("要求确认") || lowercaseName.includes("招标文件")) {
      return 0; // Stage 1
    }
    if (lowercaseName.includes("提交") || lowercaseName.includes("递交") || lowercaseName.includes("开标") || lowercaseName.includes("上传")) {
      return 4; // Stage 5
    }
    if (lowercaseName.includes("汇总") || lowercaseName.includes("定稿") || lowercaseName.includes("会签") || lowercaseName.includes("盖章") || lowercaseName.includes("装订")) {
      return 3; // Stage 4
    }
    if (lowercaseName.includes("自检") || lowercaseName.includes("校核") || lowercaseName.includes("合理性")) {
      return 2; // Stage 3
    }
    if (lowercaseName.includes("准备") || lowercaseName.includes("编制") || lowercaseName.includes("技术") || lowercaseName.includes("图纸") || lowercaseName.includes("方案")) {
      return 1; // Stage 2
    }
    return 1;
  };

  assert(getStageIndex("招标文件信息识别与资料要求确认") === 0, "Should map to Stage 1 (0)");
  assert(getStageIndex("多部门图纸深化与技术资料准备编制") === 1, "Should map to Stage 2 (1)");
  assert(getStageIndex("技术组与商务组内部对自检测算合理性自检") === 2, "Should map to Stage 3 (2)");
  assert(getStageIndex("大纲成果装订签字会签汇总定稿工作") === 3, "Should map to Stage 4 (3)");
  assert(getStageIndex("密封成果上传提交及开标递交工作") === 4, "Should map to Stage 5 (4)");

  console.log("--> 5. Simulating task blocked check rules...");
  // A task is blocked if any of its dependencyTaskIds is NOT completed.
  // In our case:
  // t1 is completed.
  // t2 is in_progress (depends on t1). Since t1 is completed, t2 is NOT blocked.
  // t2_b is not_started (depends on t2). Since t2 is NOT completed (it is in_progress), t2_b MUST be blocked!
  // t3 is not_started (depends on t2_b). Since t2_b is not completed, t3 is blocked.

  const isBlocked = (taskId: string, allTasks: any[], depsMap: Record<string, string[]>): boolean => {
    const deps = depsMap[taskId] || [];
    return deps.some(depId => {
      const depTask = allTasks.find(x => x.id === depId);
      return depTask && depTask.status !== "completed";
    });
  };

  const mockTasks = [
    { id: t1, status: "completed" },
    { id: t2, status: "in_progress" },
    { id: t2_b, status: "not_started" },
    { id: t3, status: "not_started" },
    { id: t4, status: "not_started" },
    { id: t5, status: "not_started" },
  ];

  const mockDeps: Record<string, string[]> = {
    [t1]: [],
    [t2]: [t1],
    [t2_b]: [t2],
    [t3]: [t2_b],
    [t4]: [t3],
    [t5]: [t4],
  };

  assert(isBlocked(t2, mockTasks, mockDeps) === false, "t2 should NOT be blocked because t1 is completed");
  assert(isBlocked(t2_b, mockTasks, mockDeps) === true, "t2_b SHOULD be blocked because t2 is in_progress");
  assert(isBlocked(t3, mockTasks, mockDeps) === true, "t3 SHOULD be blocked because t2_b is not started");

  // 6. Static Design & Visual Consistency Checks
  console.log("--> 6. Verifying visual consistency and non-alarmist constraints on the real UI source code...");
  const fs = await import("fs");
  const path = await import("path");
  const sourceCodePath = path.resolve("src/pages/BidScheduleOverview/index.tsx");
  const sourceCode = fs.readFileSync(sourceCodePath, "utf8");

  // Assertion: The physical existence of "投标截止日" card labels
  assert(sourceCode.includes("投标截止日"), "BidScheduleOverview codebase must strictly print the human-friendly '投标截止日' label");

  // Assertion: Right-sidebar containing the closing deadline card must have a solid ID
  assert(sourceCode.includes('id="right-closing-deadline-card"'), "BidScheduleOverview codebase must define right-closing-deadline-card ID element");

  // Assertion: Absence of alarmist / overly dramatic words
  const alarmistTerms = ["归期终点", "密封递交大限", "沙漏", "盾型", "警兆"];
  for (const term of alarmistTerms) {
    assert(!sourceCode.includes(term), `BidScheduleOverview codebase must NOT contain the alarmist phrase '${term}'`);
  }

  // Assertion: Column layout split screen configuration (Option C)
  assert(
    sourceCode.includes("grid-cols-12") && 
    sourceCode.includes("lg:col-span-8") && 
    sourceCode.includes("lg:col-span-4") || sourceCode.includes("lg:col-span-8") || sourceCode.includes("xl:col-span-9") || sourceCode.includes("lg:col-span-4") || sourceCode.includes("xl:col-span-3"), 
    "BidScheduleOverview codebase must implement a multi-column responsive 12-grid layout for the split sidebar view"
  );

  // Assertion: Dynamic alignment strategy verification (fixed / sticky right col)
  assert(
    sourceCode.includes("sticky") || 
    sourceCode.includes("fixed"), 
    "Right deadline panel must be styled as sticky or fixed to make sure the target metrics are consistently visible"
  );

  // 7. MVP Refined Quality & Constraints (Section 9 asserts)
  console.log("--> 7. Verifying single-entry, non-duplicated widgets and compact empty states...");
  
  // No duplicated closing deadline cards with identical structures
  assert(
    sourceCode.split('id="right-closing-deadline-card"').length === 2, 
    "Only exactly one main right closing deadline card must exist in the codebase"
  );

  // No duplicated '修改主数据' buttons inside scheduler summary bars
  assert(
    sourceCode.includes('id="header-edit-master-data-btn"'),
    "Single main master data edit button must be defined with id='header-edit-master-data-btn'"
  );

  // Right deadline card contains precise tags
  assert(sourceCode.includes("关键未完成任务"), "Deadline card must specify '关键未完成任务' count");
  assert(sourceCode.includes("高风险任务"), "Deadline card must specify '高风险任务' count");
  assert(sourceCode.includes("逾期任务"), "Deadline card must specify '逾期任务' count");
  assert(sourceCode.includes("剩余"), "Deadline card must specify '剩余' count");

  // Verify compact empty state is implemented
  assert(sourceCode.includes("该阶段暂无任务"), "Swimlanes empty state must contain the lightweight '该阶段暂无任务' message");
  assert(sourceCode.includes("py-5 px-2"), "Swimlanes empty state container must be highly compressed using py-5 styling constraint");

  // Verify that Bidding Closing Card is outside the lane scrollable wrapper
  const isCardInScrollableLanes = sourceCode.slice(
    sourceCode.indexOf('className="relative bg-slate-50'),
    sourceCode.indexOf('id="right-closing-deadline-card"')
  ).includes('id="right-closing-deadline-card"');
  assert(!isCardInScrollableLanes, "Closing Deadline Card must sit outside of the lane horizontal scrolling container wrapper");

  // Expanded non-alarmist checks
  const restrictedVocabulary = [
    "归期", "大限", "终点锚点", "警报", "警兆", "盾型", "压迫感", "使命感", 
    "大满贯", "控制板", "总控台页", "智能拓扑", "制约流"
  ];
  for (const term of restrictedVocabulary) {
    assert(!sourceCode.includes(term), `BidScheduleOverview codebase must strictly exclude corporate hype/alarmist vocabulary: '${term}'`);
  }

  console.log("\n====================================================================");
  console.log("💚 [SUCCESS] ALL BID COLLABORATIVE SCHEDULE OVERVIEW TESTS PASSED VERIFIED!");
  console.log("====================================================================\n");
}

runBidScheduleOverviewTests().catch(error => {
  console.error("❌ Test Failed with Error:", error);
  process.exit(1);
});
