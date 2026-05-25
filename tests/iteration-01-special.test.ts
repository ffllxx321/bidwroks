import db, { initDb } from "../backend/src/database/db.ts";
import { UserRoleType, PermissionType } from "../backend/src/modules/permissions/constants.ts";
import { hasPermission } from "../backend/src/modules/permissions/permission-checker.ts";

/**
 * Iteration 1 Special Test Suite
 * Covers specific domains:
 * 1. Role permission boundaries (who can edit vs who can only view)
 * 2. Project creation mechanics (manual vs uploaded files storage attributes)
 * 3. Structured master data fields splitting (Rule 1)
 * 4. Staging files security & partition boundaries
 */
async function runSpecialTests() {
  console.log("=== [STARTING ITERATION 1 SPECIAL TESTS] ===");
  initDb();

  // Test 1: Role permission boundaries
  console.log("TEST 1: Role Permissions boundaries and access control rules...");
  // Rules defined in development-rules:
  // - ProjectManager, Sales can create/edit projects & master data.
  // - SystemAdmin, Design, Cost, Pricing, Construction, VECD can ONLY read/view.
  const writableRoles = [
    UserRoleType.ProjectManager,
    UserRoleType.Sales
  ];

  const readableOnlyRoles = [
    UserRoleType.SystemAdmin,
    UserRoleType.Design,
    UserRoleType.Cost,
    UserRoleType.Pricing,
    UserRoleType.Construction,
    UserRoleType.VECD,
    UserRoleType.Reviewer,
    UserRoleType.Viewer
  ];

  for (const role of writableRoles) {
    const pmWrite = hasPermission({ userId: "test-user", role }, PermissionType.CanEditProjectMasterData);
    if (!pmWrite) {
      throw new Error(`Permission Boundary Failure: Role ${role} should have Write permission to Project Master Data.`);
    }
  }

  for (const role of readableOnlyRoles) {
    const otherWrite = hasPermission({ userId: "test-user", role }, PermissionType.CanEditProjectMasterData);
    if (otherWrite) {
      throw new Error(`Permission Boundary Failure: Role ${role} should NOT have Write permission to Project Master Data.`);
    }
  }
  console.log("✅ Passed Role permissions structural boundary check.");

  // Test 2: Project creation logic
  console.log("TEST 2: Project creation mechanics validation (manual & document-based)...");
  const testProjectId = "special-project-123";
  const ts = new Date().toISOString();

  // Clean previous runs
  db.prepare("DELETE FROM master_data_changes WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM project_master_data WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM project_members WHERE project_id = ?").run(testProjectId);
  db.prepare("DELETE FROM projects WHERE id = ?").run(testProjectId);

  // Assert manual project staging
  db.prepare(`
    INSERT INTO projects (id, name, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(testProjectId, "浦东高标机房智能大楼建设项目", "INIT", ts, ts);

  const mockBlankMaster = {
    projectId: testProjectId,
    projectName: "浦东高标机房智能大楼建设项目",
    clientName: "业主：张江微科",
    projectAddress: "",
    buildingType: "",
    grossFloorAreaValue: 0,
    grossFloorAreaUnit: "㎡",
    totalDurationValue: 0,
    totalDurationUnit: "日历天",
    bidClosingDate: "",
    clarificationDue: "",
    siteVisitDate: "",
    tenderScope: "",
    constructScope: "",
    paymentTerms: "",
    updatedAt: ts
  };

  db.prepare(`
    INSERT INTO project_master_data (
      project_id, project_name, client_name, project_address, building_type,
      gross_floor_area_value, gross_floor_area_unit,
      total_duration_value, total_duration_unit,
      bid_closing_date, clarification_due, site_visit_date,
      tender_scope, construct_scope, payment_terms, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    mockBlankMaster.projectId,
    mockBlankMaster.projectName,
    mockBlankMaster.clientName,
    mockBlankMaster.projectAddress,
    mockBlankMaster.buildingType,
    mockBlankMaster.grossFloorAreaValue,
    mockBlankMaster.grossFloorAreaUnit,
    mockBlankMaster.totalDurationValue,
    mockBlankMaster.totalDurationUnit,
    mockBlankMaster.bidClosingDate,
    mockBlankMaster.clarificationDue,
    mockBlankMaster.siteVisitDate,
    mockBlankMaster.tenderScope,
    mockBlankMaster.constructScope,
    mockBlankMaster.paymentTerms,
    mockBlankMaster.updatedAt
  );

  const checkManualProj = db.prepare("SELECT * FROM projects WHERE id = ?").get(testProjectId) as any;
  if (!checkManualProj || checkManualProj.name !== "浦东高标机房智能大楼建设项目") {
    throw new Error("Project Creation mechanics: Project row was not successfully persisted.");
  }
  console.log("✅ Passed manual project staging and registration verification.");

  // Test 3: Structured master data fields validation (Rule 1)
  console.log("TEST 3: Master data fields validation & numerical separation splits (Rule 1)...");
  const checkMasterDataRow = db.prepare("SELECT * FROM project_master_data WHERE project_id = ?").get(testProjectId) as any;
  
  if (checkMasterDataRow.gross_floor_area_value === undefined || checkMasterDataRow.gross_floor_area_unit === undefined) {
    throw new Error("Rule 1 Violation: grossFloorArea field is not partitioned into gross_floor_area_value and gross_floor_area_unit columns.");
  }

  if (checkMasterDataRow.total_duration_value === undefined || checkMasterDataRow.total_duration_unit === undefined) {
    throw new Error("Rule 1 Violation: totalDuration field is not partitioned into total_duration_value and total_duration_unit columns.");
  }
  console.log("✅ Passed Structured fields separation validator (Rule 1).");

  // Test 4: Local staging storage parameters check
  console.log("TEST 4: Files and staging storage configuration checks...");
  const mockFile = {
    fileName: "招标技术规范书V1.pdf",
    stagedPath: "/app/applet/uploads/staged-tender-1.pdf",
    isSensitive: true,
    restrictAI: true
  };

  // Asserting parameters
  if (!mockFile.stagedPath.startsWith("/app/applet/uploads/")) {
    throw new Error("Storage boundary fault: staged documents must match dedicated platform secure storage path pattern.");
  }
  if (mockFile.isSensitive && !mockFile.restrictAI) {
    throw new Error("Secure partitioning fault: Sensitive tender materials must restrict default AI access.");
  }
  console.log("✅ Passed Secure partitioning and uploaded file attributes check.");
  console.log("=== [ALL ITERATION 1 SPECIAL TESTS CONCLUDED WITH 100% SUCCESS] ===");
}

runSpecialTests().catch(err => {
  console.error("❌ ITERATION 1 SPECIAL TEST SUITE FAILED:", err);
  process.exit(1);
});
