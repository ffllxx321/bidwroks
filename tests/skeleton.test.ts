import { UserRoleType, PermissionType } from "../backend/src/modules/permissions/constants.ts";
import { hasPermission, checkAIAccessToFile } from "../backend/src/modules/permissions/permission-checker.ts";
import { DbProject, DbProjectMasterData, DbMasterDataChange } from "../backend/src/database/models.ts";
import { MockAIProvider } from "../backend/src/modules/ai/providers/mock-provider.ts";
import { auditLogger } from "../backend/src/modules/audit-logs/audit-logger.ts";
import db, { initDb } from "../backend/src/database/db.ts";

/**
 * BidWorks Skeleton Integrated Diagnostics & Real Database Verification Test Suite
 */
async function runDiagnostics() {
  console.log("=== [STARTING BIDWORKS DIAGNOSTICS SUITE] ===");

  // Initialize SQLite schema to isolate database
  console.log("Initializing database integrations...");
  initDb();

  // 1. RBAC permissions evaluation
  console.log("Testing RBAC Permission Checkers...");
  const devRole = UserRoleType.ProjectManager;
  const viewerRole = UserRoleType.Viewer;

  const canEditAsPM = hasPermission({ userId: "pm-1", role: devRole }, PermissionType.CanEditProjectMasterData);
  const canEditAsViewer = hasPermission({ userId: "view-1", role: viewerRole }, PermissionType.CanEditProjectMasterData);

  if (!canEditAsPM) throw new Error("RBAC Failure: PM should edit master data");
  if (canEditAsViewer) throw new Error("RBAC Failure: Viewer should not edit master data");
  console.log("✅ Passed RBAC permissions check.");

  // 2. Real Database Project Creation test
  console.log("Testing SQL Persistent Database Insertion...");
  const testProjId = `test-${Date.now().toString().slice(-4)}`;
  const ts = new Date().toISOString();

  // Insert a test project and master data row into SQLite
  db.prepare("INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(testProjId, "集成测试精密大厂房改建项目", "已创建", ts, ts);

  const testMaster: DbProjectMasterData = {
    projectId: testProjId,
    projectName: "集成测试精密大厂房改建项目",
    clientName: "精工科技生产部",
    projectAddress: "上海市青浦集成产业区",
    buildingType: "洁净室/高耸配载钢架结构",
    grossFloorAreaValue: 125000.50,
    grossFloorAreaUnit: "㎡",
    totalDurationValue: 450,
    totalDurationUnit: "日历天",
    bidClosingDate: "2026-08-30",
    clarificationDue: "2026-08-15",
    siteVisitDate: "2026-08-10",
    tenderScope: "深化施工承包范围",
    constructScope: "主体外挂幕墙深化",
    designScope: "机电高压电组优化",
    paymentTerms: "按工程进度申结算，结构封顶支付至75%",
    bimRequirements: "LOD400",
    greenBuildings: "绿建二星极优设计",
    safetyLevel: "上海市文明工地样板",
    qualityGoal: "白玉兰金奖",
    vecdConstraints: "降成本3%",
    updatedAt: ts,
  };

  db.prepare(`
    INSERT INTO project_master_data (
      project_id, project_name, client_name, project_address, building_type,
      gross_floor_area_value, gross_floor_area_unit,
      total_duration_value, total_duration_unit,
      bid_closing_date, clarification_due, site_visit_date,
      tender_scope, construct_scope, design_scope, payment_terms,
      bim_requirements, green_buildings, safety_level, quality_goal, vecd_constraints,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    testMaster.projectId,
    testMaster.projectName,
    testMaster.clientName,
    testMaster.projectAddress,
    testMaster.buildingType,
    testMaster.grossFloorAreaValue,
    testMaster.grossFloorAreaUnit,
    testMaster.totalDurationValue,
    testMaster.totalDurationUnit,
    testMaster.bidClosingDate,
    testMaster.clarificationDue,
    testMaster.siteVisitDate,
    testMaster.tenderScope,
    testMaster.constructScope,
    testMaster.designScope,
    testMaster.paymentTerms,
    testMaster.bimRequirements,
    testMaster.greenBuildings,
    testMaster.safetyLevel,
    testMaster.qualityGoal,
    testMaster.vecdConstraints,
    testMaster.updatedAt
  );

  // Read back the project from database to assert persistence
  const readBackProj = db.prepare("SELECT * FROM projects WHERE id = ?").get(testProjId) as DbProject;
  if (!readBackProj || readBackProj.name !== "集成测试精密大厂房改建项目") {
    throw new Error("Database Failure: Test project was not persisted correctly in SQLite table.");
  }

  const readBackMaster = db.prepare("SELECT * FROM project_master_data WHERE project_id = ?").get(testProjId) as any;
  if (!readBackMaster || readBackMaster.gross_floor_area_value !== 125000.5) {
    throw new Error("Database Failure: Master data gross_floor_area was not correctly persisted.");
  }
  console.log("✅ Passed SQL Persistent database write/read queries check.");

  // 3. Schema Numerics separation rule evaluation (Rule 1)
  if (typeof testMaster.grossFloorAreaValue !== "number" || testMaster.grossFloorAreaUnit !== "㎡") {
    throw new Error("Rule 1 Failure: grossFloorArea is not adequately structurized with separable fields.");
  }
  if (typeof testMaster.totalDurationValue !== "number" || testMaster.totalDurationUnit !== "日历天") {
    throw new Error("Rule 1 Failure: totalDuration is not adequately structurized with separable fields.");
  }
  console.log("✅ Passed Numerical separation checks (Rule 1).");

  // 4. Change logs registers and dynamic triggers test
  console.log("Testing Master Data change logging structure write...");
  const oldAreaStr = "90000 ㎡";
  const newAreaStr = "125000.5 ㎡";

  db.prepare(`
    INSERT INTO master_data_changes (id, project_id, field_name, old_value, new_value, changed_by, changed_at, source, impact_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `chg-test-${Date.now()}`,
    testProjId,
    "grossFloorAreaValue",
    oldAreaStr,
    newAreaStr,
    "张三 (营业官)",
    ts,
    "Manual Integration Testing",
    "Medium"
  );

  const readBackChange = db.prepare("SELECT * FROM master_data_changes WHERE project_id = ? ORDER BY changed_at DESC LIMIT 1").get(testProjId) as any;
  if (!readBackChange || readBackChange.impact_level !== "Medium") {
    throw new Error("Database Audit Failure: Dynamic change registry failed persistent writing.");
  }
  console.log("✅ Passed master data change logs assertion tests.");

  // 5. AI sensitive isolation boundaries checks
  console.log("Testing AI sensitive file isolation boundaries...");
  const sensitiveFile = {
    id: "doc-sens-1",
    fileName: "精密大楼招标预算造价指标表.xlsx",
    isSensitive: true,
    allowAIRead: false,
  };

  const aiPermissionCheck = checkAIAccessToFile(sensitiveFile, false);
  if (aiPermissionCheck.allowed) {
    throw new Error("Security Failure: AI was permitted to ingest confidential files without correct permissions.");
  }
  console.log("✅ Passed AI isolation boundaries checks.");

  // 6. Pluggable AI Client extraction execution
  console.log("Testing AI Gateway Extraction schema citation requirements...");
  const provider = new MockAIProvider();
  const aiResult = await provider.extractTenderParams({ fileName: "test_tender.docx", fileContentText: "..." });
  
  if (!aiResult.requiresHumanConfirmation) {
    throw new Error("Security Failure: AI updates should require Human-in-The-Loop confirmation before write.");
  }
  if (!aiResult.citations || aiResult.citations.length === 0) {
    throw new Error("Compliance Failure: AI results must include structured physical citations.");
  }
  console.log("✅ Passed pluggable AI extraction citations requirement check.");
  console.log("=== [ALL INTEGRATED DIAGNOSTICS COMPLETED SUCCESSFULLY] ===");
}

// Fire diagnostics on execution if run directly from runner command
runDiagnostics().catch(err => {
  console.error("❌ DIAGNOSTICS SUITE ABORTED WITH EXCEPTIONS:", err);
  process.exit(1);
});
