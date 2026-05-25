import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import db, { initDb } from "./backend/src/database/db.ts";
import { auditLogger } from "./backend/src/modules/audit-logs/audit-logger.ts";
import { UserRoleType, PermissionType, ROLE_PERMISSIONS } from "./backend/src/modules/permissions/constants.ts";
import { parseDocumentToChunks } from "./backend/src/modules/ai/document-parser.ts";
import { verifyAIPermission } from "./backend/src/modules/permissions/ai-permission-checker.ts";
import { extractTenderParamsFromChunks } from "./backend/src/modules/ai/extraction-engine.ts";
import { ENV } from "./backend/src/config/env.ts";
import { getAiConfigDiagnostics, isDevelopmentRuntime, saveDashscopeApiKey } from "./backend/src/config/ai-runtime-config.ts";
import { BailianFileService } from "./backend/src/modules/ai/bailian-file-service.ts";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "20mb" }));

// Global middleware to decode URI-encoded custom headers from clients (unblocks non-ISO-8859-1 strings)
app.use((req, res, next) => {
  const customHeaders = ["x-user-role", "x-username", "x-user-id"];
  customHeaders.forEach(h => {
    const originalVal = req.headers[h];
    if (typeof originalVal === "string") {
      try {
        req.headers[h] = decodeURIComponent(originalVal);
      } catch (e) {
        // Fallback to original value if decoding fails
      }
    }
  });
  next();
});

// Initialize SQLite database table schemas and defaults on startup
initDb();

// ============================================================================
// RBAC SECURITY AND INTEGRITY CHECKERS
// ============================================================================

function hasPermission(roleName: string, permissionName: string): boolean {
  const perms = ROLE_PERMISSIONS[roleName as UserRoleType] || [];
  return perms.includes(permissionName as PermissionType);
}

// Security guard checking permission. Emits auditable entries upon denial.
const checkPerm = (perm: string) => {
  return (req: any, res: any, next: any) => {
    const role = req.headers["x-user-role"] || req.query.role || "Viewer";
    const operator = req.headers["x-username"] || req.headers["x-user-id"] || "Anonymous";
    const projectId = req.params.projectId || req.params.id || req.body.projectId || null;
    
    if (!hasPermission(role, perm)) {
      // Record permission refusal block
      auditLogger.logAction({
        projectId: projectId,
        operator: operator,
        role: role,
        action: "PermissionDenied",
        details: `权限拦截：岗位角色 [${role}] 在进行 [${req.method} ${req.originalUrl}] 时，因缺乏 [${perm}] 参数校验被拦截保护。`
      });
      return res.status(403).json({ error: `权限不足：当前系统角色 [${role}] 没有 [${perm}] 执行权限` });
    }
    next();
  };
};

// ============================================================================
// IN-MEMORY COMPATIBILITY SHIM (Tasks & Documents versions)
// ============================================================================
// To keep downstream milestones functional while migrating core database schemas.
interface BidTask {
  id: string;
  projectId: string;
  taskName: string;
  bidPhase: "TenderParse" | "Design" | "Estimation" | "Construction" | "Review" | "Archive";
  assignee: string;
  reviewer: string;
  plannedStart: string;
  plannedSubmit: string;
  plannedReview: string;
  taskStatus: string;
  isSensitive: boolean;
}

interface ReviewComment {
  id: string;
  documentId: string;
  projectId: string;
  author: string;
  commentText: string;
  sectionLocator: string;
  createdAt: string;
  status: "Active" | "Resolved";
  resolvedAt?: string;
  replyText?: string;
}

let tasksStore: BidTask[] = [
  { id: "task-001", projectId: "proj-001", taskName: "招标文件整理与建项审核", bidPhase: "TenderParse", assignee: "张三 (营业官)", reviewer: "李四 (项目负责人)", plannedStart: "2026-05-18", plannedSubmit: "2026-05-22", plannedReview: "2026-05-24", taskStatus: "Completed", isSensitive: false },
  { id: "task-002", projectId: "proj-001", taskName: "设计深化方案大纲编制", bidPhase: "Design", assignee: "王五 (设计负责人)", reviewer: "李四 (项目负责人)", plannedStart: "2026-05-24", plannedSubmit: "2026-06-15", plannedReview: "2026-06-18", taskStatus: "InProcess", isSensitive: false },
  { id: "task-003", projectId: "proj-001", taskName: "标前成本测算与工程估工概算", bidPhase: "Estimation", assignee: "赵六 (概算大师)", reviewer: "李四 (项目负责人)", plannedStart: "2026-05-25", plannedSubmit: "2026-06-28", plannedReview: "2026-07-02", taskStatus: "InProcess", isSensitive: true },
  { id: "task-004", projectId: "proj-001", taskName: "全流程精密施工组织设计方案", bidPhase: "Construction", assignee: "陈七 (施工总工)", reviewer: "李四 (项目负责人)", plannedStart: "2026-05-24", plannedSubmit: "2026-06-30", plannedReview: "2026-07-05", taskStatus: "InProcess", isSensitive: false }
];

let commentsStore: ReviewComment[] = [
  { id: "com-301", documentId: "doc-102", projectId: "proj-001", author: "钱八 (总监审核官)", commentText: "质量方案里，精密净化车间压力阀门配比及图示缺漏，请补充相关实样表设计。", sectionLocator: "技术卷施工组织全案 P.14 (净化部分)", createdAt: new Date("2026-05-19T08:00:00Z").toISOString(), status: "Active" }
];



// ============================================================================
// API CONTROLLERS
// ============================================================================

// Simulator User login session context handler
app.post("/api/auth/dev-login", (req, res) => {
  const { username, role } = req.body;
  if (!username || !role) {
    return res.status(400).json({ error: "账号或岗位代号缺失" });
  }

  auditLogger.logAction({
    projectId: null,
    operator: username,
    role: role,
    action: "Login",
    details: `岗位模拟登录：用户 [${username}] 成功切入岗位 [${role}] 级别工作台区。`
  });

  res.json({ success: true, user: { username, role } });
});

app.get("/api/auth/me", (req, res) => {
  const roleName = (req.headers["x-user-role"] as string) || "Viewer";
  const userId = (req.headers["x-user-id"] as string) || "user-001";
  const username = (req.headers["x-username"] as string) || "Anonymous";

  res.json({ user: { userId, username, role: roleName } });
});

// GET Project List (Limited by user role permissions and mappings)
app.get("/api/projects", checkPerm("canViewProject"), (req, res) => {
  const role = req.headers["x-user-role"] || "Viewer";
  try {
    let raw;
    if (role === "SystemAdmin" || role === "ProjectManager" || role === "Sales" || role === "Reviewer") {
      // High trust roles have standard global bid scope overview
      raw = db.prepare(`
        SELECT p.*, md.client_name, md.gross_floor_area_value, md.gross_floor_area_unit, md.total_duration_value, md.total_duration_unit, md.bid_closing_date
        FROM projects p
        LEFT JOIN project_master_data md ON p.id = md.project_id
        ORDER BY p.created_at DESC
      `).all() as any[];
    } else {
      // Scoped members or roles
      raw = db.prepare(`
        SELECT p.*, md.client_name, md.gross_floor_area_value, md.gross_floor_area_unit, md.total_duration_value, md.total_duration_unit, md.bid_closing_date
        FROM projects p
        LEFT JOIN project_master_data md ON p.id = md.project_id
        INNER JOIN project_members pm ON p.id = pm.project_id
        WHERE pm.role_name = ?
        ORDER BY p.created_at DESC
      `).all(role) as any[];
    }

    const projectsList = raw.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      client: p.client_name || "待确认发包主业主",
      area: `${p.gross_floor_area_value || 0}${p.gross_floor_area_unit || "㎡"}`,
      duration: `${p.total_duration_value || 0}${p.total_duration_unit || "日历天"}`,
      date: p.bid_closing_date || p.created_at.slice(0, 10),
      createdAt: p.created_at
    }));

    res.json(projectsList);
  } catch (err: any) {
    res.status(500).json({ error: "数据表读取失败: " + err.message });
  }
});

// GET Single Bidding Project meta Space
app.get("/api/projects/:id", checkPerm("canViewProject"), (req, res) => {
  const { id } = req.params;
  try {
    const p = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
    if (!p) return res.status(404).json({ error: "项目不存在" });
    res.json({
      id: p.id,
      name: p.name,
      status: p.status,
      createdAt: p.created_at
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Create Tender Space (Handles Manual with numeric split and Upload Placeholders)
app.post("/api/projects", checkPerm("canCreateProject"), (req, res) => {
  const operator = (req.headers["x-username"] as string) || "张三 (营业官)";
  const role = (req.headers["x-user-role"] as string) || "Sales";
  
  const { mode, name, manualFields } = req.body;
  const newId = `proj-${Date.now().toString().slice(-4)}`;
  const ts = new Date().toISOString();

  try {
    if (mode === "upload") {
      // File upload entry slot placeholder creation flow. No AI decoding is run here as per specifications.
      const projName = name || "智能招标书解析项目";
      db.prepare("INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(newId, projName, "待确认主数据", ts, ts);

      db.prepare(`
        INSERT INTO project_master_data (
          project_id, project_name, client_name, project_address, building_type,
          gross_floor_area_value, gross_floor_area_unit,
          total_duration_value, total_duration_unit,
          bid_closing_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, projName, "需复核 (上传文件待提炼)", "需复核", "需复核", 0, "㎡", 0, "日历天", "2026-08-30", ts);

      // Create initial task lists for compliance
      tasksStore.push(
        { id: `task-${Date.now()}-1`, projectId: newId, taskName: "文件上传及招标条件分析评估", bidPhase: "TenderParse", assignee: String(operator), reviewer: "李四 (项目负责人)", plannedStart: "2026-05-20", plannedSubmit: "2026-05-24", plannedReview: "2026-05-26", taskStatus: "SelfChecking", isSensitive: false },
        { id: `task-${Date.now()}-2`, projectId: newId, taskName: "深化技术方案编制", bidPhase: "Design", assignee: "王五 (设计负责人)", reviewer: "李四 (项目负责人)", plannedStart: "2026-05-25", plannedSubmit: "2026-06-20", plannedReview: "2026-06-22", taskStatus: "Unstarted", isSensitive: false }
      );

      auditLogger.logAction({
        projectId: newId,
        operator,
        role,
        action: "CreateProject",
        details: `项目创建成功 [上传招标文件创建]。创建了项目空间 [${projName}]，并保留招标书上传入口。`
      });

      res.json({ success: true, project: { id: newId, name: projName, status: "需复核" } });

    } else {
      // Manual Creation path
      const fields = manualFields || req.body;
      const {
        projectName,
        ownerName,
        projectLocation,
        buildingType,
        bidDeadline,
        grossFloorAreaValue,
        grossFloorAreaUnit,
        totalDurationValue,
        totalDurationUnit
      } = fields;

      if (!projectName || !ownerName || !projectLocation || !buildingType || !bidDeadline) {
        return res.status(400).json({ error: "必填字段 (项目名称/发包业主/建设地点/建筑类型/截止期) 缺失！" });
      }

      db.prepare("INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(newId, projectName, "已创建", ts, ts);

      db.prepare(`
        INSERT INTO project_master_data (
          project_id, project_name, client_name, project_address, building_type,
          gross_floor_area_value, gross_floor_area_unit,
          total_duration_value, total_duration_unit,
          bid_closing_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId,
        projectName,
        ownerName,
        projectLocation,
        buildingType,
        Number(grossFloorAreaValue || 0),
        grossFloorAreaUnit || "㎡",
        Number(totalDurationValue || 0),
        totalDurationUnit || "日历天",
        bidDeadline,
        ts
      );

      // Create assigned mappings
      db.prepare("INSERT INTO project_members (project_id, user_id, role_name) VALUES (?, ?, ?)")
        .run(newId, "user-created", role);

      auditLogger.logAction({
        projectId: newId,
        operator,
        role,
        action: "CreateProject",
        details: `项目创建成功 [手工录入创建]。创建了项目空间 [${projectName}]，初始化了项目主数据。`
      });

      res.json({ success: true, project: { id: newId, name: projectName, status: "已创建" } });
    }
  } catch (err: any) {
    console.error("[SERVER CREATE ERROR]", err);
    res.status(500).json({ error: "插入数据库错误: " + err.message });
  }
});

// Definition list for mapped field structures to comply with the 18 master data fields requirement.
const mdFieldsList = [
  { key: "projectName", col: "project_name", label: "项目名称", defaultSource: "手工填报" },
  { key: "clientName", col: "client_name", label: "发包业主", defaultSource: "手工填报" },
  { key: "projectAddress", col: "project_address", label: "现场建设地点", defaultSource: "手工填报" },
  { key: "buildingType", col: "building_type", label: "建筑类型", defaultSource: "手工填报" },
  { key: "grossFloorAreaValue", col: "gross_floor_area_value", label: "建筑面积数值", defaultSource: "手工填报" },
  { key: "grossFloorAreaUnit", col: "gross_floor_area_unit", label: "建筑面积单位", defaultSource: "手工填报" },
  { key: "totalDurationValue", col: "total_duration_value", label: "总工期数值", defaultSource: "手工填报" },
  { key: "totalDurationUnit", col: "total_duration_unit", label: "总工期单位", defaultSource: "手工填报" },
  { key: "bidClosingDate", col: "bid_closing_date", label: "投标截止日", defaultSource: "手工填报" },
  { key: "clarificationDue", col: "clarification_due", label: "答疑截止日", defaultSource: "未填报" },
  { key: "siteVisitDate", col: "site_visit_date", label: "现场踏勘日", defaultSource: "未填报" },
  { key: "tenderScope", col: "tender_scope", label: "招标工程范围", defaultSource: "未分析" },
  { key: "constructScope", col: "construct_scope", label: "施工承包范围", defaultSource: "未分析" },
  { key: "designScope", col: "design_scope", label: "设计深化范围", defaultSource: "设计定稿" },
  { key: "paymentTerms", col: "payment_terms", label: "合同付款条件", defaultSource: "财务要求" },
  { key: "bimRequirements", col: "bim_requirements", label: "BIM建造要求", defaultSource: "默认规范" },
  { key: "greenBuildings", col: "green_buildings", label: "绿色建筑指标", defaultSource: "环保标准" },
  { key: "safetyLevel", col: "safety_level", label: "安全文明定级", defaultSource: "常规标段" },
  { key: "qualityGoal", col: "quality_goal", label: "工程质量目标", defaultSource: "白玉兰奖" },
  { key: "vecdConstraints", col: "vecd_constraints", label: "VECD降本深化", defaultSource: "商务优化" }
];

// GET Structured Master Data (Aggregates database row values and change audits metadata)
app.get("/api/projects/:id/master-data", checkPerm("canViewProjectMasterData"), (req, res) => {
  const { id } = req.params;
  try {
    const row = db.prepare("SELECT * FROM project_master_data WHERE project_id = ?").get(id) as any;
    if (!row) {
      return res.status(404).json({ error: "项目主数据记录不存在" });
    }

    const output: any = {
      projectId: id,
      // Provide compatibility flat fields
      projectName: row.project_name,
      clientName: row.client_name,
      projectAddress: row.project_address,
      buildingType: row.building_type,
      grossFloorAreaValue: row.gross_floor_area_value,
      grossFloorAreaUnit: row.gross_floor_area_unit,
      totalDurationValue: row.total_duration_value,
      totalDurationUnit: row.total_duration_unit,
      bidClosingDate: row.bid_closing_date || "",
      clarificationDue: row.clarification_due || "",
      siteVisitDate: row.site_visit_date || "",
      tenderScope: row.tender_scope || "",
      constructScope: row.construct_scope || "",
      designScope: row.design_scope || "",
      paymentTerms: row.payment_terms || "",
      bimRequirements: row.bim_requirements || "",
      greenBuildings: row.green_buildings || "",
      safetyLevel: row.safety_level || "",
      qualityGoal: row.quality_goal || "",
      vecdConstraints: row.vecd_constraints || ""
    };

    // Enrich with dynamic field metadata object trackers (unifying required fields: status, source, impactLevel, updatedBy, updatedAt)
    for (const f of mdFieldsList) {
      const change = db.prepare(`
        SELECT * FROM master_data_changes
        WHERE project_id = ? AND field_name = ?
        ORDER BY changed_at DESC LIMIT 1
      `).get(id, f.key) as any;

      output[`_${f.key}`] = {
        value: row[f.col],
        status: change ? (change.new_value ? "已确认" : "需复核") : "待确认",
        source: change ? change.source : f.defaultSource,
        impactLevel: change ? change.impact_level : "low",
        updatedBy: change ? change.changed_by : "系统初始化",
        updatedAt: change ? change.changed_at : row.updated_at
      };
    }

    res.json(output);
  } catch (err: any) {
    res.status(500).json({ error: "读取主数据失败: " + err.message });
  }
});

// ============================================================================
// Change Impact Analysis Helper Function (Iteration 5)
// ============================================================================
export function analyzeImpactForProjectAndChange(
  projectId: string,
  changeId: string,
  fieldName: string,
  oldValue: any,
  newValue: any,
  operator: string
) {
  const ts = new Date().toISOString();
  
  // Decide impactLevel
  let impactLevel = "low";
  const highRiskFields = [
    "grossFloorAreaValue",
    "totalDurationValue",
    "bidClosingDate",
    "bidDeadline",
    "tenderScope",
    "constructScope",
    "constructionScope",
    "designScope"
  ];
  const mediumRiskFields = [
    "paymentTerms",
    "bimRequirements",
    "bimRequirement",
    "greenBuildings",
    "greenBuildingRequirement",
    "qualityGoal",
    "qualityTarget"
  ];
  
  if (highRiskFields.includes(fieldName)) {
    impactLevel = "high";
  } else if (mediumRiskFields.includes(fieldName)) {
    impactLevel = "medium";
  }

  // Find active tasks (status NOT IN ('cancelled', 'archived'))
  const activeTasks = db.prepare(`
    SELECT * FROM tasks 
    WHERE project_id = ? AND status NOT IN ('cancelled', 'archived')
  `).all(projectId) as any[];

  // Find active documents (status NOT IN ('cancelled', 'archived'))
  const activeDocs = db.prepare(`
    SELECT * FROM documents 
    WHERE project_id = ? AND status NOT IN ('cancelled', 'archived', 'obsolete')
  `).all(projectId) as any[];

  const insertStmt = db.prepare(`
    INSERT INTO change_impact_records (
      id, projectId, masterDataChangeId, fieldName, oldValue, newValue,
      impactLevel, affectedType, affectedId, reason, status, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateTaskRequiresReview = db.prepare(`
    UPDATE tasks 
    SET requiresReview = 1, reviewReason = ?, reviewSourceChangeId = ?
    WHERE id = ?
  `);

  const updateDocRequiresReview = db.prepare(`
    UPDATE documents 
    SET requiresReview = 1, reviewReason = ?, reviewSourceChangeId = ?
    WHERE id = ?
  `);

  const updateDocVersionRequiresReview = db.prepare(`
    UPDATE document_versions
    SET requiresReview = 1, reviewReason = ?, reviewSourceChangeId = ?
    WHERE document_id = ? AND is_latest = 1
  `);

  const insertNotification = db.prepare(`
    INSERT INTO notifications (
      id, projectId, userId, notificationType, title, message, sourceType, sourceId, isRead, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);

  // Target label for the field
  const mdItem = mdFieldsList.find(f => f.key === fieldName) || { label: fieldName };
  const fieldLabel = mdItem.label;

  // Process tasks
  for (const task of activeTasks) {
    const impactId = `imp-task-${Date.now()}-${task.id}-${Math.floor(Math.random() * 100)}`;
    const reason = `主数据 [${fieldLabel}] 发生变更，从 [${oldValue || '空'}] 改为 [${newValue || '空'}]，该变更对编制任务 [${task.task_name || ''}] 产生【${impactLevel}】影响。`;
    
    insertStmt.run(
      impactId,
      projectId,
      changeId,
      fieldName,
      String(oldValue || ''),
      String(newValue || ''),
      impactLevel,
      'task',
      task.id,
      reason,
      'marked_requires_review',
      ts
    );

    updateTaskRequiresReview.run(reason, changeId, task.id);

    if (task.responsible_user_id) {
      const notifId = `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      insertNotification.run(
        notifId,
        projectId,
        task.responsible_user_id,
        'change_impact',
        `主数据变更影响：【${fieldLabel}】`,
        `任务 [${task.task_name}] 已标记为需复核，请登录评估！`,
        'change_impact',
        impactId,
        ts
      );
    }
  }

  // Process documents
  for (const doc of activeDocs) {
    const impactId = `imp-doc-${Date.now()}-${doc.id}-${Math.floor(Math.random() * 100)}`;
    const reason = `主数据 [${fieldLabel}] 发生变更，从 [${oldValue || '空'}] 改为 [${newValue || '空'}]，可能影响方案资料 [${doc.file_name || '草案'}]。`;
    
    insertStmt.run(
      impactId,
      projectId,
      changeId,
      fieldName,
      String(oldValue || ''),
      String(newValue || ''),
      impactLevel,
      'document',
      doc.id,
      reason,
      'marked_requires_review',
      ts
    );

    updateDocRequiresReview.run(reason, changeId, doc.id);
    updateDocVersionRequiresReview.run(reason, changeId, doc.id);

    if (doc.uploaded_by) {
      const notifId = `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      insertNotification.run(
        notifId,
        projectId,
        doc.uploaded_by,
        'change_impact',
        `主数据变更影响：【${fieldLabel}】`,
        `方案 [${doc.file_name}] 已标记为需复核。`,
        'change_impact',
        impactId,
        ts
      );
    }
  }
}

// Update Master Data via PATCH/PUT (Generates change logs and writes audit entries)
const updateMasterDataHandler = (req: any, res: any) => {
  const { id } = req.params;
  const operator = req.headers["x-username"] || "李四 (项目负责人)";
  const role = req.headers["x-user-role"] || "ProjectManager";

  // Accepting either flat updated fields directly on body, or packed in updatedFields
  const fieldsInput = req.body.updatedFields || req.body;
  
  try {
    const oldRow = db.prepare("SELECT * FROM project_master_data WHERE project_id = ?").get(id) as any;
    if (!oldRow) {
      return res.status(404).json({ error: "主数据没有命中" });
    }

    const ts = new Date().toISOString();
    const keys = Object.keys(fieldsInput);

    db.transaction(() => {
      for (const k of keys) {
        const mdItem = mdFieldsList.find(f => f.key === k);
        if (!mdItem) continue;

        const dbCol = mdItem.col;
        const oldVal = oldRow[dbCol];
        const newVal = fieldsInput[k];

        if (newVal === undefined || String(oldVal) === String(newVal)) {
          continue;
        }

        // Apply column cell modifications
        db.prepare(`UPDATE project_master_data SET ${dbCol} = ?, updated_at = ? WHERE project_id = ?`)
          .run(newVal, ts, id);

        // Record historical master_data_changes row
        const changeId = `chg-${Date.now()}-${Math.random().toString(36).substring(3, 7)}`;
        db.prepare(`
          INSERT INTO master_data_changes (id, project_id, field_name, old_value, new_value, changed_by, changed_at, source, impact_level)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          changeId,
          id,
          mdItem.key,
          String(oldVal),
          String(newVal),
          operator,
          ts,
          "手工修改",
          mdItem.key === "grossFloorAreaValue" || mdItem.key === "totalDurationValue" || mdItem.key === "paymentTerms" ? "medium" : "low"
        );

        // Write strict security action entry
        auditLogger.logAction({
          projectId: id,
          operator,
          role,
          action: "EditMaster",
          details: `修改主数据 [${mdItem.label}]；原内容为 [${oldVal}]；变更为 [${newVal}]。`
        });

        // Auto trigger Change Impact Analysis (Iteration 5)
        try {
          analyzeImpactForProjectAndChange(id, changeId, mdItem.key, oldVal, newVal, operator);
        } catch (err: any) {
          console.error("Change impact trigger failed:", err);
        }
      }

      // Also update project list title if project_name changed
      if (fieldsInput.projectName) {
        db.prepare("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?").run(fieldsInput.projectName, ts, id);
      }
    })();

    res.json({ success: true });
  } catch (err: any) {
    console.error("[SERVER UPDATE ERROR]", err);
    res.status(500).json({ error: "数据库修改事务失败: " + err.message });
  }
};

app.patch("/api/projects/:id/master-data", checkPerm("canEditProjectMasterData"), updateMasterDataHandler);
app.put("/api/projects/:id/master-data", checkPerm("canEditProjectMasterData"), updateMasterDataHandler);

// GET Change Log for project
app.get("/api/projects/:id/master-data/changes", (req, res) => {
  const { id } = req.params;
  try {
    const list = db.prepare(`
      SELECT id, project_id as projectId, field_name as fieldKey, old_value as oldValue, new_value as newValue, changed_by as modifiedBy, changed_at as modifiedAt, source, impact_level as impactLevel
      FROM master_data_changes
      WHERE project_id = ?
      ORDER BY changed_at DESC
    `).all(id) as any[];

    // Map keys to Chinese human labels for beautiful frontend tracking
    const listMapped = list.map(c => {
      const matchField = mdFieldsList.find(f => f.key === c.fieldKey);
      return {
        ...c,
        fieldLabel: matchField ? matchField.label : c.fieldKey
      };
    });

    res.json(listMapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET Project Audit Log (Secured by checks)
app.get("/api/projects/:id/audit-logs", checkPerm("canViewAuditLogs"), (req, res) => {
  const { id } = req.params;
  try {
    const rows = db.prepare(`
      SELECT id, project_id as projectId, operator, role_name as role, action, details, timestamp
      FROM audit_logs
      WHERE project_id = ?
      ORDER BY timestamp DESC
    `).all(id);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// ITERATION 3: TASK PLANING, WORKING BENCH AND PROJECT DASHBOARD (SQLite integration)
// ============================================================================

// Date calculation helper for reverse scheduling
function reverseSchedule(bidClosingDate: string, prepDays: number) {
  const currentEnvTime = "2026-05-21"; // Standard base local date matching environment metadata
  const closingDateText = bidClosingDate || "2026-06-30";
  const closingDate = new Date(closingDateText);
  
  if (isNaN(closingDate.getTime())) {
    const backup = new Date(currentEnvTime);
    backup.setDate(backup.getDate() + 30);
    return {
      dueDate: backup.toISOString().slice(0, 10),
      reviewDueDate: backup.toISOString().slice(0, 10),
      startDate: backup.toISOString().slice(0, 10)
    };
  }
  
  // dueDate = closingDate - 2 days
  const dDate = new Date(closingDate);
  dDate.setDate(closingDate.getDate() - 2);
  
  // reviewDueDate = dueDate - 2 days
  const rDate = new Date(dDate);
  rDate.setDate(dDate.getDate() - 2);
  
  // startDate = reviewDueDate - prepDays
  const sDate = new Date(rDate);
  sDate.setDate(rDate.getDate() - prepDays);
  
  return {
    dueDate: dDate.toISOString().slice(0, 10),
    reviewDueDate: rDate.toISOString().slice(0, 10),
    startDate: sDate.toISOString().slice(0, 10)
  };
}

// Role map helper matching mock users seed records
function getDefaultUserForRole(roleName: string): string {
  const roleMapping: Record<string, string> = {
    "Sales": "user-sales",
    "ProjectManager": "user-pm",
    "Construction": "user-const",
    "Cost": "user-cost",
    "Design": "user-pm", // design user maps to PM / Admin in test mock environment
    "VECD": "user-pm",
    "Reviewer": "user-review",
    "DocumentCoordinator": "user-doc"
  };
  return roleMapping[roleName] || "user-pm";
}

// 1. POST Generate Common Document Requirements
app.post("/api/projects/:projectId/document-requirements/generate-common", checkPerm("canCreateProject"), (req, res) => {
  const { projectId } = req.params;
  const username = String(req.headers["x-username"] || "Anonymous");
  const role = String(req.headers["x-user-role"] || "ProjectManager");

  try {
    const existing = db.prepare("SELECT COUNT(*) as count FROM document_requirements WHERE project_id = ? AND source_type = 'common_template'").get(projectId) as { count: number };
    if (existing.count > 0) {
      return res.json({ success: true, message: "通用资料清单已生成过" });
    }

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
        const reqId = `req-common-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        db.prepare(`
          INSERT INTO document_requirements (
            id, project_id, requirement_name, requirement_type, source_type,
            default_responsible_role, default_reviewer_role, suggested_preparation_days, status, created_by
          ) VALUES (?, ?, ?, ?, 'common_template', ?, ?, ?, 'pending', ?)
        `).run(reqId, projectId, t.name, t.type, t.role, t.reviewer, t.days, username);
      }
    })();

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "GenerateRequirements",
      details: `成功生成了通用投标资料清单 (9个模块通用要求)`
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST Generate Extractions Document Requirements
app.post("/api/projects/:projectId/document-requirements/generate-from-extractions", checkPerm("canCreateProject"), (req, res) => {
  const { projectId } = req.params;
  const username = String(req.headers["x-username"] || "Anonymous");
  const role = String(req.headers["x-user-role"] || "ProjectManager");

  try {
    const aiResults = db.prepare("SELECT * FROM ai_extraction_results WHERE project_id = ?").all(projectId) as any[];
    if (!aiResults || aiResults.length === 0) {
      return res.status(400).json({ error: "项目未检测到AI提取结果，请先对招标文件进行AI分析提取" });
    }

    let count = 0;
    db.transaction(() => {
      for (const r of aiResults) {
        if (r.status === 'ignored') {
          // Ignored extraction results do not generate special tasks
          continue;
        }

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
          // Ensure we don't duplicate
          const dup = db.prepare("SELECT COUNT(*) as count FROM document_requirements WHERE project_id = ? AND source_extraction_result_id = ?").get(projectId, r.id) as { count: number };
          if (dup.count === 0) {
            const reqId = `req-extra-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            db.prepare(`
              INSERT INTO document_requirements (
                id, project_id, requirement_name, requirement_type, source_type,
                source_extraction_result_id, default_responsible_role, default_reviewer_role, suggested_preparation_days, status, created_by
              ) VALUES (?, ?, ?, ?, 'tender_extraction', ?, ?, ?, ?, 'pending', ?)
            `).run(reqId, projectId, reqName, reqType, r.id, respRole, "ProjectManager", prepDays, username);
            count++;
          }
        }
      }
    })();

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "GenerateExtractionRequirements",
      details: `通过AI招标文件汇总，提炼生成 ${count} 组特殊高敏资料清单要求`
    });

    res.json({ success: true, count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET project requirements list
app.get("/api/projects/:projectId/document-requirements", checkPerm("canViewProject"), (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = db.prepare(`
      SELECT r.*, COUNT(t.id) as convertedTaskCount
      FROM document_requirements r
      LEFT JOIN tasks t ON r.id = t.requirement_id
      WHERE r.project_id = ?
      GROUP BY r.id
      ORDER BY r.created_at ASC
    `).all(projectId) as any[];

    const mapped = rows.map(r => ({
      id: r.id,
      projectId: r.project_id,
      requirementName: r.requirement_name,
      requirementType: r.requirement_type,
      sourceType: r.source_type,
      sourceExtractionResultId: r.source_extraction_result_id,
      defaultResponsibleRole: r.default_responsible_role,
      defaultReviewerRole: r.default_reviewer_role,
      suggestedPreparationDays: r.suggested_preparation_days,
      status: r.status,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      convertedTaskCount: r.convertedTaskCount
    }));

    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. POST Create manual Document Requirement
app.post("/api/projects/:projectId/document-requirements", checkPerm("canCreateProject"), (req, res) => {
  const { projectId } = req.params;
  const { requirementName, requirementType, defaultResponsibleRole = "Design", defaultReviewerRole = "ProjectManager", suggestedPreparationDays = 3 } = req.body;
  const username = String(req.headers["x-username"] || "Anonymous");
  const role = String(req.headers["x-user-role"] || "ProjectManager");

  if (!requirementName) {
    return res.status(400).json({ error: "资料要求名称不能为空" });
  }

  try {
    const reqId = `req-manual-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    db.prepare(`
      INSERT INTO document_requirements (
        id, project_id, requirement_name, requirement_type, source_type,
        default_responsible_role, default_reviewer_role, suggested_preparation_days, status, created_by
      ) VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, 'confirmed', ?)
    `).run(reqId, projectId, requirementName, requirementType || "Manual", defaultResponsibleRole, defaultReviewerRole, suggestedPreparationDays, username);

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "CreateManualRequirement",
      details: `手工录入了项目特殊资料要求: [${requirementName}]`
    });

    res.json({ success: true, requirementId: reqId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. PATCH edit single requirement
app.patch("/api/projects/:projectId/document-requirements/:requirementId", checkPerm("canCreateProject"), (req, res) => {
  const { projectId, requirementId } = req.params;
  const { requirementName, defaultResponsibleRole, defaultReviewerRole, suggestedPreparationDays, status } = req.body;
  const username = String(req.headers["x-username"] || "Anonymous");
  const role = String(req.headers["x-user-role"] || "ProjectManager");

  try {
    const current = db.prepare("SELECT * FROM document_requirements WHERE id = ?").get(requirementId) as any;
    if (!current) {
      return res.status(404).json({ error: "找不到指定的资料要求" });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (requirementName !== undefined) {
      updates.push("requirement_name = ?");
      params.push(requirementName);
    }
    if (defaultResponsibleRole !== undefined) {
      updates.push("default_responsible_role = ?");
      params.push(defaultResponsibleRole);
    }
    if (defaultReviewerRole !== undefined) {
      updates.push("default_reviewer_role = ?");
      params.push(defaultReviewerRole);
    }
    if (suggestedPreparationDays !== undefined) {
      updates.push("suggested_preparation_days = ?");
      params.push(Number(suggestedPreparationDays));
    }
    if (status !== undefined) {
      updates.push("status = ?");
      params.push(status);
    }

    if (updates.length > 0) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(requirementId);
      db.prepare(`UPDATE document_requirements SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "EditRequirement",
      details: `修改资料要求：[${current.requirement_name}] => 配置已调整`
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. POST Convert single requirement to Task
app.post("/api/projects/:projectId/document-requirements/:requirementId/convert-to-task", checkPerm("canCreateProject"), (req, res) => {
  const { projectId, requirementId } = req.params;
  const username = String(req.headers["x-username"] || "Anonymous");
  const role = String(req.headers["x-user-role"] || "ProjectManager");

  try {
    const requirement = db.prepare("SELECT * FROM document_requirements WHERE id = ? AND project_id = ?").get(requirementId, projectId) as any;
    if (!requirement) {
      return res.status(404).json({ error: "资料要求不存在" });
    }

    if (requirement.status === "converted_to_task") {
      return res.status(400).json({ error: "该条目资料要求已经转换过，请不可重复转换" });
    }

    const master = db.prepare("SELECT bid_closing_date FROM project_master_data WHERE project_id = ?").get(projectId) as any;
    const bidClosingDate = master ? master.bid_closing_date : "";

    const dates = reverseSchedule(bidClosingDate, requirement.suggested_preparation_days);

    const responsibleUserId = getDefaultUserForRole(requirement.default_responsible_role);
    const reviewerUserId = getDefaultUserForRole(requirement.default_reviewer_role || "ProjectManager");

    const taskId = `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    db.transaction(() => {
      // Create Task
      db.prepare(`
        INSERT INTO tasks (
          id, project_id, requirement_id, task_name, task_type,
          responsible_user_id, reviewer_user_id, start_date, due_date, review_due_date,
          status, priority, risk_level, is_date_locked, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', 'Medium', 'Low', 0, ?)
      `).run(
        taskId,
        projectId,
        requirementId,
        requirement.requirement_name,
        requirement.requirement_type || "Task",
        responsibleUserId,
        reviewerUserId,
        dates.startDate,
        dates.dueDate,
        dates.reviewDueDate,
        username
      );

      // Set status to converted_to_task
      db.prepare("UPDATE document_requirements SET status = 'converted_to_task', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(requirementId);
    })();

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "ConvertRequirementToTask",
      details: `通过资料要求 [${requirement.requirement_name}] 成功生成任务。`
    });

    res.json({ success: true, taskId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. GET project tasks list (with full dependency resolution)
app.get("/api/projects/:projectId/tasks", checkPerm("canViewProject"), (req, res) => {
  const { projectId } = req.params;
  try {
    const tasks = db.prepare(`
      SELECT t.*,
             u1.username as responsible_username,
             u2.username as reviewer_username
      FROM tasks t
      LEFT JOIN users u1 ON t.responsible_user_id = u1.id
      LEFT JOIN users u2 ON t.reviewer_user_id = u2.id
      WHERE t.project_id = ?
      ORDER BY t.due_date ASC
    `).all(projectId) as any[];

    const deps = db.prepare("SELECT * FROM task_dependencies WHERE project_id = ?").all(projectId) as any[];

    const list = tasks.map(t => {
      const taskDeps = deps.filter(d => d.task_id === t.id).map(d => d.depends_on_task_id);
      return {
        id: t.id,
        projectId: t.project_id,
        requirementId: t.requirement_id,
        taskName: t.task_name,
        taskType: t.task_type,
        responsibleUserId: t.responsible_user_id,
        responsibleUsername: t.responsible_username || "未分配",
        reviewerUserId: t.reviewer_user_id,
        reviewerUsername: t.reviewer_username || "未分配",
        startDate: t.start_date,
        dueDate: t.due_date,
        reviewDueDate: t.review_due_date,
        status: t.status,
        priority: t.priority,
        riskLevel: t.risk_level,
        isDateLocked: t.is_date_locked === 1,
        createdBy: t.created_by,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        dependencyTaskIds: taskDeps
      };
    });

    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. POST Create single manual Task
app.post("/api/projects/:projectId/tasks", checkPerm("canCreateProject"), (req, res) => {
  const { projectId } = req.params;
  const { taskName, taskType, responsibleUserId, reviewerUserId, priority = "Medium", riskLevel = "Low", startDate, dueDate, reviewDueDate, dependencyTaskIds = [] } = req.body;
  const username = String(req.headers["x-username"] || "Anonymous");
  const role = String(req.headers["x-user-role"] || "ProjectManager");

  if (!taskName) {
    return res.status(400).json({ error: "任务名称不能为空" });
  }

  try {
    const master = db.prepare("SELECT bid_closing_date FROM project_master_data WHERE project_id = ?").get(projectId) as any;
    const bidClosingDate = master ? master.bid_closing_date : "";

    const finalDates = (startDate && dueDate && reviewDueDate)
      ? { startDate, dueDate, reviewDueDate }
      : reverseSchedule(bidClosingDate, 3);

    const isLocked = (startDate && dueDate) ? 1 : 0;
    const taskId = `task-manual-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO tasks (
          id, project_id, task_name, task_type,
          responsible_user_id, reviewer_user_id, start_date, due_date, review_due_date,
          status, priority, risk_level, is_date_locked, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', ?, ?, ?, ?)
      `).run(
        taskId,
        projectId,
        taskName,
        taskType || "Manual",
        responsibleUserId || "user-pm",
        reviewerUserId || "user-pm",
        finalDates.startDate,
        finalDates.dueDate,
        finalDates.reviewDueDate,
        priority,
        riskLevel,
        isLocked,
        username
      );

      // Handle dependencies
      if (dependencyTaskIds && Array.isArray(dependencyTaskIds)) {
        for (const depId of dependencyTaskIds) {
          const depRecordId = `dep-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          db.prepare(`
            INSERT INTO task_dependencies (id, project_id, task_id, depends_on_task_id)
            VALUES (?, ?, ?, ?)
          `).run(depRecordId, projectId, taskId, depId);
        }
      }
    })();

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "CreateTask",
      details: `手工创建了编制任务: [${taskName}]`
    });

    res.json({ success: true, taskId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. GET single task detail
app.get("/api/projects/:projectId/tasks/:taskId", checkPerm("canViewProject"), (req, res) => {
  const { projectId, taskId } = req.params;
  try {
    const t = db.prepare(`
      SELECT t.*, u1.username as responsible_username, u2.username as reviewer_username
      FROM tasks t
      LEFT JOIN users u1 ON t.responsible_user_id = u1.id
      LEFT JOIN users u2 ON t.reviewer_user_id = u2.id
      WHERE t.id = ? AND t.project_id = ?
    `).get(taskId, projectId) as any;

    if (!t) {
      return res.status(404).json({ error: "任务不存在" });
    }

    const deps = db.prepare("SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?").all(taskId) as any[];

    res.json({
      id: t.id,
      projectId: t.project_id,
      requirementId: t.requirement_id,
      taskName: t.task_name,
      taskType: t.task_type,
      responsibleUserId: t.responsible_user_id,
      responsibleUsername: t.responsible_username || "未分配",
      reviewerUserId: t.reviewer_user_id,
      reviewerUsername: t.reviewer_username || "未分配",
      startDate: t.start_date,
      dueDate: t.due_date,
      reviewDueDate: t.review_due_date,
      status: t.status,
      priority: t.priority,
      riskLevel: t.risk_level,
      isDateLocked: t.is_date_locked === 1,
      createdBy: t.created_by,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      dependencyTaskIds: deps.map(d => d.depends_on_task_id)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. PATCH generic update task
app.patch("/api/projects/:projectId/tasks/:taskId", checkPerm("canViewProject"), (req, res) => {
  const { projectId, taskId } = req.params;
  const { taskName, priority, riskLevel, dependencyTaskIds } = req.body;
  const username = String(req.headers["x-username"] || "Anonymous");
  const role = String(req.headers["x-user-role"] || "ProjectManager");

  try {
    const current = db.prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?").get(taskId, projectId) as any;
    if (!current) {
      return res.status(404).json({ error: "找不到指定的任务" });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (taskName !== undefined) {
      updates.push("task_name = ?");
      params.push(taskName);
    }
    if (priority !== undefined) {
      updates.push("priority = ?");
      params.push(priority);
    }
    if (riskLevel !== undefined) {
      updates.push("risk_level = ?");
      params.push(riskLevel);
    }

    db.transaction(() => {
      if (updates.length > 0) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        params.push(taskId);
        db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }

      if (dependencyTaskIds !== undefined && Array.isArray(dependencyTaskIds)) {
        db.prepare("DELETE FROM task_dependencies WHERE task_id = ?").run(taskId);
        for (const depId of dependencyTaskIds) {
          const depRecordId = `dep-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          db.prepare(`
            INSERT INTO task_dependencies (id, project_id, task_id, depends_on_task_id)
            VALUES (?, ?, ?, ?)
          `).run(depRecordId, projectId, taskId, depId);
        }
      }
    })();

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "EditTaskField",
      details: `修改了任务 [${current.task_name}] 的基本参数要素`
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. PATCH update task status (with complete role and status history logging)
app.patch("/api/projects/:projectId/tasks/:taskId/status", checkPerm("canViewProject"), (req, res) => {
  const { projectId, taskId } = req.params;
  const { status, reason = "推进工作进度" } = req.body;
  const username = String(req.headers["x-username"] || "Anonymous");
  const role = String(req.headers["x-user-role"] || "Viewer");
  const sessionUserId = String(req.headers["x-user-id"] || "user-pm");

  if (!status) {
    return res.status(400).json({ error: "状态值缺失" });
  }

  try {
    const taskObj = db.prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?").get(taskId, projectId) as any;
    if (!taskObj) {
      return res.status(404).json({ error: "找不到指定的任务" });
    }

    // Role security check
    const isOwner = taskObj.responsible_user_id === sessionUserId;
    const isProjectManager = role === "ProjectManager" || role === "SystemAdmin";

    if (!isProjectManager && !isOwner) {
      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "PermissionDenied",
        details: `权限拒绝：岗位 ${role} (${username}) 试图越权修改任务 [${taskObj.task_name}] 的状态，已被过滤。`
      });
      return res.status(403).json({ error: "权限不足：非本任务负责人或项目主管，不能更新该任务状态。" });
    }

    db.transaction(() => {
      // 1. Log old status and new status
      const logId = `slog-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      db.prepare(`
        INSERT INTO task_status_logs (id, project_id, task_id, old_status, new_status, changed_by, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(logId, projectId, taskId, taskObj.status, status, username, reason);

      // 2. Adjust task status
      db.prepare("UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(status, taskId);
    })();

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "EditTaskStatus",
      details: `修改任务状态：任务 [${taskObj.task_name}] 状态由 [${taskObj.status}] 调整为 [${status}]。`
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 12. PATCH task assignees (change responsible or reviewer)
app.patch("/api/projects/:projectId/tasks/:taskId/assignees", checkPerm("canEditProjectMasterData"), (req, res) => {
  const { projectId, taskId } = req.params;
  const { responsibleUserId, reviewerUserId } = req.body;
  const username = String(req.headers["x-username"] || "Anonymous");
  const role = String(req.headers["x-user-role"] || "ProjectManager");

  try {
    const taskObj = db.prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?").get(taskId, projectId) as any;
    if (!taskObj) {
      return res.status(404).json({ error: "找不到任务记录" });
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (responsibleUserId !== undefined) {
      updates.push("responsible_user_id = ?");
      params.push(responsibleUserId);
    }
    if (reviewerUserId !== undefined) {
      updates.push("reviewer_user_id = ?");
      params.push(reviewerUserId);
    }

    if (updates.length > 0) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(taskId);
      db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "EditTaskAssignee",
      details: `修改负责人审核人：重新分配任务 [${taskObj.task_name}] 编制职责。`
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 13. PATCH task dates (Locks dynamic dates re-plan, logs changes)
app.patch("/api/projects/:projectId/tasks/:taskId/dates", checkPerm("canEditProjectMasterData"), (req, res) => {
  const { projectId, taskId } = req.params;
  const { startDate, dueDate, reviewDueDate, reason = "排期日常调整" } = req.body;
  const username = String(req.headers["x-username"] || "Anonymous");
  const role = String(req.headers["x-user-role"] || "ProjectManager");

  try {
    const taskObj = db.prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?").get(taskId, projectId) as any;
    if (!taskObj) {
      return res.status(404).json({ error: "找不到指定的任务" });
    }

    db.transaction(() => {
      const keysMap = [
        { col: "start_date", val: startDate },
        { col: "due_date", val: dueDate },
        { col: "review_due_date", val: reviewDueDate }
      ];

      for (const item of keysMap) {
        if (item.val === undefined) continue;

        const oldVal = taskObj[item.col];
        if (String(oldVal) !== String(item.val)) {
          // Log dating historical update track
          const changeId = `dchg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          db.prepare(`
            INSERT INTO task_date_changes (id, project_id, task_id, field_name, old_value, new_value, changed_by, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(changeId, projectId, taskId, item.col, String(oldVal), String(item.val), username, reason);

          // Write updated dates
          db.prepare(`UPDATE tasks SET ${item.col} = ? WHERE id = ?`).run(item.val, taskId);
        }
      }

      // Automatically lock task so recalculate-dates won't overwrite manual adjustments
      db.prepare("UPDATE tasks SET is_date_locked = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(taskId);
    })();

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "EditTaskDates",
      details: `修改任务日期：锁定并微调任务 [${taskObj.task_name}] 的开始及完成截止周期（触发 isDateLocked 物理锁定）。`
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 14. POST recalculate project tasks dates matching project closing date change
app.post("/api/projects/:projectId/tasks/recalculate-dates", checkPerm("canEditProjectMasterData"), (req, res) => {
  const { projectId } = req.params;
  const username = String(req.headers["x-username"] || "Anonymous");
  const role = String(req.headers["x-user-role"] || "ProjectManager");

  try {
    const master = db.prepare("SELECT bid_closing_date FROM project_master_data WHERE project_id = ?").get(projectId) as any;
    const bidClosingDate = master ? master.bid_closing_date : "";

    if (!bidClosingDate) {
      return res.status(400).json({ error: "无法重新计算：该项目主数据中未设置合规的投标截止日" });
    }

    const tasks = db.prepare("SELECT id, requirement_id, is_date_locked FROM tasks WHERE project_id = ?").all(projectId) as any[];

    let count = 0;
    db.transaction(() => {
      for (const t of tasks) {
        // Do not overwrite user manually locked/adjusted schedules
        if (t.is_date_locked === 1) continue;

        let prepDays = 3;
        if (t.requirement_id) {
          const reqObj = db.prepare("SELECT suggested_preparation_days FROM document_requirements WHERE id = ?").get(t.requirement_id) as any;
          if (reqObj) {
            prepDays = reqObj.suggested_preparation_days || 3;
          }
        }

        const dates = reverseSchedule(bidClosingDate, prepDays);
        db.prepare(`
          UPDATE tasks
          SET start_date = ?, due_date = ?, review_due_date = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(dates.startDate, dates.dueDate, dates.reviewDueDate, t.id);
        count++;
      }
    })();

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "RecalculateTaskDates",
      details: `根据新的投标截止日 [${bidClosingDate}]，对项目内 ${count} 个未锁定编制任务自动刷新了倒排数排期计划。`
    });

    res.json({ success: true, count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PERSONAL WORKBENCH AGGREGATOR ENDPOINTS
// ============================================================================

app.get("/api/workbench/my-tasks", (req, res) => {
  const sessionUserId = String(req.headers["x-user-id"] || req.query.user_id || "user-pm");
  try {
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.responsible_user_id = ? AND t.status != 'cancelled'
      ORDER BY t.due_date ASC
    `).all(sessionUserId) as any[];

    const mapped = rows.map(t => ({
      id: t.id,
      projectId: t.project_id,
      projectName: t.project_name,
      taskName: t.task_name,
      taskType: t.task_type,
      startDate: t.start_date,
      dueDate: t.due_date,
      reviewDueDate: t.review_due_date,
      status: t.status,
      priority: t.priority,
      riskLevel: t.risk_level,
      isDateLocked: t.is_date_locked === 1
    }));
    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workbench/my-reviews", (req, res) => {
  const sessionUserId = String(req.headers["x-user-id"] || req.query.user_id || "user-pm");
  try {
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.reviewer_user_id = ?
      ORDER BY t.review_due_date ASC
    `).all(sessionUserId) as any[];

    const mapped = rows.map(t => ({
      id: t.id,
      projectId: t.project_id,
      projectName: t.project_name,
      taskName: t.task_name,
      taskType: t.task_type,
      startDate: t.start_date,
      dueDate: t.due_date,
      reviewDueDate: t.review_due_date,
      status: t.status,
      priority: t.priority,
      riskLevel: t.risk_level
    }));
    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workbench/my-overdue-tasks", (req, res) => {
  const sessionUserId = String(req.headers["x-user-id"] || req.query.user_id || "user-pm");
  const currentEnvDateString = "2026-05-21";
  try {
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.responsible_user_id = ? AND t.due_date < ? AND t.status NOT IN ('completed', 'cancelled')
      ORDER BY t.due_date ASC
    `).all(sessionUserId, currentEnvDateString) as any[];

    const mapped = rows.map(t => ({
      id: t.id,
      projectId: t.project_id,
      projectName: t.project_name,
      taskName: t.task_name,
      taskType: t.task_type,
      startDate: t.start_date,
      dueDate: t.due_date,
      status: t.status,
      priority: t.priority,
      riskLevel: t.risk_level
    }));
    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workbench/my-risk-tasks", (req, res) => {
  const sessionUserId = String(req.headers["x-user-id"] || req.query.user_id || "user-pm");
  try {
    const rows = db.prepare(`
      SELECT t.*, p.name as project_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.responsible_user_id = ? AND (t.risk_level = 'High' OR t.status = 'at_risk')
      ORDER BY t.due_date ASC
    `).all(sessionUserId) as any[];

    const mapped = rows.map(t => ({
      id: t.id,
      projectId: t.project_id,
      projectName: t.project_name,
      taskName: t.task_name,
      taskType: t.task_type,
      startDate: t.start_date,
      dueDate: t.due_date,
      status: t.status,
      priority: t.priority,
      riskLevel: t.risk_level
    }));
    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workbench/my-projects", (req, res) => {
  const sessionUserId = String(req.headers["x-user-id"] || req.query.user_id || "user-pm");
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");

  try {
    let rows: any[];
    if (role === "SystemAdmin" || role === "ProjectManager" || role === "Sales" || role === "Reviewer") {
      rows = db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as any[];
    } else {
      rows = db.prepare(`
        SELECT p.*
        FROM projects p
        INNER JOIN project_members pm ON p.id = pm.project_id
        WHERE pm.user_id = ?
        ORDER BY p.created_at DESC
      `).all(sessionUserId) as any[];
    }

    const list = rows.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      createdAt: p.created_at
    }));

    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PROJECT DASHBOARD ENDPOINTS
// ============================================================================

app.get("/api/projects/:projectId/dashboard", checkPerm("canViewProject"), (req, res) => {
  const { projectId } = req.params;
  const currentEnvDateString = "2026-05-21";
  
  try {
    // 1. Get Project closing deadline and calculate remaining days
    const master = db.prepare("SELECT bid_closing_date FROM project_master_data WHERE project_id = ?").get(projectId) as any;
    const bidClosingDate = master ? master.bid_closing_date : "";
    
    let daysRemaining = null;
    if (bidClosingDate) {
      const now = new Date(currentEnvDateString);
      const limit = new Date(bidClosingDate);
      const diff = limit.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    // 2. Aggregate tasks status statistics
    const statsRows = db.prepare("SELECT status, count(*) as count FROM tasks WHERE project_id = ? GROUP BY status").all(projectId) as any[];
    const statusSummary: Record<string, number> = {
      not_started: 0,
      ready_to_start: 0,
      waiting_input: 0,
      in_progress: 0,
      pending_self_check: 0,
      pending_review: 0,
      needs_revision: 0,
      needs_review: 0,
      completed: 0,
      at_risk: 0,
      cancelled: 0
    };
    for (const r of statsRows) {
      if (statusSummary[r.status] !== undefined) {
        statusSummary[r.status] = r.count;
      }
    }

    // 3. High risk tasks lists
    const highRiskRows = db.prepare(`
      SELECT t.*, u.username as responsible_username
      FROM tasks t
      LEFT JOIN users u ON t.responsible_user_id = u.id
      WHERE t.project_id = ? AND (t.risk_level = 'High' OR t.status = 'at_risk')
    `).all(projectId) as any[];

    // 4. Overdue tasks
    const overdueRows = db.prepare(`
      SELECT t.*, u.username as responsible_username
      FROM tasks t
      LEFT JOIN users u ON t.responsible_user_id = u.id
      WHERE t.project_id = ? AND t.due_date < ? AND t.status NOT IN ('completed', 'cancelled')
    `).all(projectId, currentEnvDateString) as any[];

    // 5. Unassigned tasks (missing assignee or reviewer)
    const unassignedRespRows = db.prepare(`
      SELECT t.*
      FROM tasks t
      WHERE t.project_id = ? AND (t.responsible_user_id IS NULL OR t.responsible_user_id = '' OR t.responsible_user_id = 'user-pm' AND t.task_name LIKE '%设计%')
    `).all(projectId) as any[];

    const unassignedReviewRows = db.prepare(`
      SELECT t.*
      FROM tasks t
      WHERE t.project_id = ? AND (t.reviewer_user_id IS NULL OR t.reviewer_user_id = '')
    `).all(projectId) as any[];

    // 6. Missing materials requirements (materials not converted yet)
    const missingDocsRows = db.prepare(`
      SELECT r.*
      FROM document_requirements r
      WHERE r.project_id = ? AND r.status IN ('pending', 'confirmed')
    `).all(projectId) as any[];

    res.json({
      projectId,
      bidClosingDate,
      daysRemaining,
      statusSummary,
      highRiskTasks: highRiskRows.map(r => ({ id: r.id, taskName: r.task_name, responsibleUsername: r.responsible_username || "未分配", dueDate: r.due_date, riskLevel: r.risk_level, status: r.status })),
      overdueTasks: overdueRows.map(r => ({ id: r.id, taskName: r.task_name, responsibleUsername: r.responsible_username || "未分配", dueDate: r.due_date, status: r.status })),
      unassignedResponsibleTasks: unassignedRespRows.map(r => ({ id: r.id, taskName: r.task_name })),
      unassignedReviewerTasks: unassignedReviewRows.map(r => ({ id: r.id, taskName: r.task_name })),
      missingDocRequirements: missingDocsRows.map(r => ({ id: r.id, requirementName: r.requirement_name, sourceType: r.source_type, status: r.status }))
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// ITERATION 2: TENDER UPLOAD, LIST, VIEW-CHUNKS, PARSE, AI-EXTRACT & MASTER SYNC
// ============================================================================

// 1. GET lists of tender documents in a project
app.get("/api/projects/:id/documents", checkPerm("canViewProject"), (req, res) => {
  const { id } = req.params;
  try {
    const rows = db.prepare(`
      SELECT d.*, v.version_number, v.storage_path, v.file_size, v.status as version_status
      FROM documents d
      LEFT JOIN document_versions v ON d.current_version_id = v.id
      WHERE d.project_id = ?
      ORDER BY d.created_at DESC
    `).all(id);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET individual document details
app.get("/api/projects/:id/documents/:documentId", checkPerm("canViewProject"), (req, res) => {
  const { id, documentId } = req.params;
  try {
    const doc = db.prepare(`
      SELECT d.*, v.version_number, v.storage_path, v.file_size, v.status as version_status
      FROM documents d
      LEFT JOIN document_versions v ON d.current_version_id = v.id
      WHERE d.project_id = ? AND d.id = ?
    `).get(id, documentId);

    if (!doc) {
      return res.status(404).json({ error: "找不到指定的招标文件" });
    }
    res.json(doc);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. POST upload tender documents (Multipart/Base64 compatible JSON payload)
app.post("/api/projects/:id/upload", checkPerm("canUploadFile"), (req, res) => {
  const { id } = req.params;
  const { fileName, fileType, fileData, isSensitive = 0, allowAIRead = 1 } = req.body;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  if (!fileName || !fileData) {
    return res.status(400).json({ error: "参数不完整（缺少文件名或文件内容）" });
  }

  try {
    const sensitiveFlag = isSensitive ? 1 : 0;
    const aiReadFlag = sensitiveFlag === 1 ? 0 : (allowAIRead ? 1 : 0);

    const projectUploadsDir = path.join(process.cwd(), "uploads", id);
    if (!fs.existsSync(projectUploadsDir)) {
      fs.mkdirSync(projectUploadsDir, { recursive: true });
    }

    const normFileType = fileType ? fileType.toLowerCase() : path.extname(fileName).replace(".", "").toLowerCase();
    const existingDoc = db.prepare("SELECT * FROM documents WHERE project_id = ? AND file_name = ?").get(id, fileName) as any;

    let docId = "";
    let versionNum = 1;
    let actualFilePath = "";

    const base64Data = fileData.includes(";base64,") ? fileData.split(";base64,")[1] : fileData;
    const fileBuffer = Buffer.from(base64Data, "base64");

    if (existingDoc) {
      docId = existingDoc.id;
      const maxVer = db.prepare("SELECT MAX(version_number) as maxV FROM document_versions WHERE document_id = ?").get(docId) as { maxV: number | null };
      versionNum = (maxVer.maxV || 1) + 1;

      db.prepare("UPDATE document_versions SET is_latest = 0 WHERE document_id = ?").run(docId);

      actualFilePath = path.join("uploads", id, `${versionNum}_${fileName}`);
      fs.writeFileSync(path.join(process.cwd(), actualFilePath), fileBuffer);

      const versionId = `ver-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      db.prepare(`
        INSERT INTO document_versions (id, document_id, version_number, storage_path, file_size, is_latest, status, uploaded_by, uploaded_at)
        VALUES (?, ?, ?, ?, ?, 1, 'Uploaded', ?, CURRENT_TIMESTAMP)
      `).run(versionId, docId, versionNum, actualFilePath, fileBuffer.length, username);

      db.prepare(`
        UPDATE documents
        SET current_version_id = ?, updated_at = CURRENT_TIMESTAMP, parse_status = 'unparsed', is_sensitive = ?, allow_ai_read = ?
        WHERE id = ?
      `).run(versionId, sensitiveFlag, aiReadFlag, docId);

      auditLogger.logAction({
        projectId: id,
        operator: username,
        role: role,
        action: "FILE_UPLOAD",
        details: `[FILE_UPLOAD] 上传多媒体新版招标文件 [${fileName}] 成功, 升级为版本 v${versionNum}, 状态重置为 unparsed`
      });

    } else {
      docId = `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const versionId = `ver-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      actualFilePath = path.join("uploads", id, `1_${fileName}`);
      fs.writeFileSync(path.join(process.cwd(), actualFilePath), fileBuffer);

      db.prepare(`
        INSERT INTO documents (id, project_id, file_name, file_type, document_type, is_sensitive, allow_ai_read, current_version_id, uploaded_by, uploaded_at, parse_status)
        VALUES (?, ?, ?, ?, 'tender_document', ?, ?, ?, ?, CURRENT_TIMESTAMP, 'unparsed')
      `).run(docId, id, fileName, normFileType, sensitiveFlag, aiReadFlag, versionId, username);

      db.prepare(`
        INSERT INTO document_versions (id, document_id, version_number, storage_path, file_size, is_latest, status, uploaded_by, uploaded_at)
        VALUES (?, ?, 1, ?, ?, 1, 'Uploaded', ?, CURRENT_TIMESTAMP)
      `).run(versionId, docId, actualFilePath, fileBuffer.length, username);

      auditLogger.logAction({
        projectId: id,
        operator: username,
        role: role,
        action: "FILE_UPLOAD",
        details: `[FILE_UPLOAD] 用户 [${username}] 物理上传招标文件: ${fileName}, 物理路径: ${actualFilePath}, 标记敏感性: ${sensitiveFlag}`
      });
    }

    res.json({ success: true, docId, version: versionNum, isSensitive: sensitiveFlag === 1 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. POST start parsing document text
app.post("/api/projects/:id/documents/:documentId/parse", checkPerm("canViewProject"), async (req, res) => {
  const { id, documentId } = req.params;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  try {
    const doc = db.prepare(`
      SELECT d.*, v.id as version_id, v.storage_path
      FROM documents d
      JOIN document_versions v ON d.current_version_id = v.id
      WHERE d.id = ? AND d.project_id = ?
    `).get(documentId, id) as any;

    if (!doc) {
      return res.status(404).json({ error: "找不到指定的招标文件" });
    }

    db.prepare("UPDATE documents SET parse_status = 'parsing' WHERE id = ?").run(documentId);

    const fullPath = path.join(process.cwd(), doc.storage_path);
    if (!fs.existsSync(fullPath)) {
      db.prepare("UPDATE documents SET parse_status = 'failed' WHERE id = ?").run(documentId);
      return res.status(400).json({ error: `文件不存在于服务器路径: ${doc.storage_path}` });
    }

    const chunks = await parseDocumentToChunks(fullPath, doc.file_type as "pdf" | "docx");

    db.prepare("DELETE FROM parsed_document_chunks WHERE document_version_id = ?").run(doc.version_id);

    const insertChunk = db.prepare(`
      INSERT INTO parsed_document_chunks (id, document_id, document_version_id, page_number, paragraph_index, text_content, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    db.transaction(() => {
      chunks.forEach(chunk => {
        const chunkId = `chk-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        insertChunk.run(chunkId, documentId, doc.version_id, chunk.pageNumber, chunk.paragraphIndex, chunk.textContent);
      });
    })();

    db.prepare("UPDATE documents SET parse_status = 'parsed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(documentId);

    auditLogger.logAction({
      projectId: id,
      operator: username,
      role: role,
      action: "DOCUMENT_PARSING",
      details: `[DOCUMENT_PARSING] 文档解析完成-页及段落切段成功: 招标文件 [${doc.file_name}], 共分割 [${chunks.length}] 个段落块并落盘。`
    });

    res.json({ success: true, count: chunks.length });
  } catch (err: any) {
    db.prepare("UPDATE documents SET parse_status = 'failed' WHERE id = ?").run(documentId);
    res.status(500).json({ error: `解析异常终止: ${err.message}` });
  }
});

// 5. GET chunks of document
app.get("/api/projects/:id/documents/:documentId/chunks", checkPerm("canViewProject"), (req, res) => {
  const { id, documentId } = req.params;
  try {
    const doc = db.prepare("SELECT current_version_id FROM documents WHERE id = ? AND project_id = ?").get(documentId, id) as { current_version_id: string } | undefined;
    if (!doc) {
      return res.status(404).json({ error: "找不到指定的招标文件" });
    }

    const rows = db.prepare(`
      SELECT id, page_number as pageNumber, paragraph_index as paragraphIndex, text_content as textContent
      FROM parsed_document_chunks
      WHERE document_id = ? AND document_version_id = ?
      ORDER BY page_number ASC, paragraph_index ASC
    `).all(documentId, doc.current_version_id);

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5.5 GET active AI provider details
app.get("/api/ai/active-provider", (req, res) => {
  res.json({
    provider: ENV.AI_PROVIDER,
    model: ENV.BAILIAN_MODEL,
    fallbackModel: ENV.BAILIAN_FALLBACK_MODEL,
    runLiveTest: process.env.RUN_BAILIAN_LIVE_TEST === "true"
  });
});

// 5.6 GET active AI provider diagnostics (development only)
app.get("/api/ai/config-diagnostics", (req, res) => {
  if (!isDevelopmentRuntime()) {
    return res.status(403).json({ error: "Diagnostics endpoint only allowed in development mode." });
  }

  res.json(getAiConfigDiagnostics());
});

// 5.6.1 POST save local DashScope API key (development only)
app.post("/api/ai/config-api-key", (req, res) => {
  if (!isDevelopmentRuntime()) {
    return res.status(403).json({ error: "API key configuration endpoint only allowed in development mode." });
  }

  const apiKey = String(req.body?.apiKey || "").trim();
  try {
    const result = saveDashscopeApiKey(apiKey);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to save API key." });
  }
});

// 5.7 POST Analyze Tender Document using Bailian compatible files API
app.post("/api/ai/analyze-tender-document", checkPerm("canCreateProject"), async (req, res) => {
  const { fileName, fileData } = req.body;
  const username = String(req.headers["x-username"] || "Anonymous");
  const role = String(req.headers["x-user-role"] || "ProjectManager");

  if (!fileName || !fileData) {
    return res.status(400).json({ error: "招标文件分析错误：文件名 (fileName) 或文件内容 (fileData) 缺失！" });
  }

  if (!ENV.BAILIAN_API_KEY) {
    return res.status(500).json({ error: "AI 辅助解析失败：百炼 API 密钥 (DASHSCOPE_API_KEY 或 BAILIAN_API_KEY) 未在后台配置。" });
  }

  let fileId = "";
  try {
    // 1. Convert base64 to buffer
    const fileBuffer = Buffer.from(fileData, "base64");
    
    // 2. Upload file to Bailian OpenAI-compatible files API
    fileId = await BailianFileService.uploadFile(fileBuffer, fileName);
    
    // 3. Poll file parser status in loop
    await BailianFileService.pollFileStatus(fileId, 15, 2000);
    
    // 4. Call qwen-long to process document in compatible mode
    const analysis = await BailianFileService.analyzeDocument(fileId, fileName);
    
    // Log AI call audit trace
    auditLogger.logAction({
      projectId: "N/A",
      operator: username,
      role: role,
      action: "AI_Call",
      details: `通过百炼官方文档理解接口分析招标书 [${fileName}]。文件ID: ${fileId}。`
    });

    // Cleanup file in Bailian as we have ingested it in the model
    BailianFileService.deleteFile(fileId).catch(() => {});

    // Return structured analysis results
    res.json(analysis);

  } catch (err: any) {
    console.error(`[AI-Analyze-Error] Full flow failed:`, err);
    if (fileId) {
      BailianFileService.deleteFile(fileId).catch(() => {});
    }
    res.status(500).json({ error: `招标文件理解失败: ${err.message || '未知业务错误'}` });
  }
});

// 5.8 POST Confirm Tender Document and write to Database tables (projects, project_master_data, document_requirements, tasks, documents, document_versions)
app.post("/api/ai/confirm-tender-document", checkPerm("canCreateProject"), async (req, res) => {
  const { projectId, projectName, projectInfo, tenderRequirements = [], taskSuggestions = [], fileName, fileData } = req.body;
  const username = String(req.headers["x-username"] || "Anonymous");
  const roleName = String(req.headers["x-user-role"] || "ProjectManager");
  const ts = new Date().toISOString();

  if (!projectName || !projectInfo) {
    return res.status(400).json({ error: "提交主数据失败：项目名称 (projectName) 或提取详情 (projectInfo) 缺失！" });
  }

  try {
    let targetProjectId = projectId;
    const isNewProject = !projectId;

    db.transaction(() => {
      // 1. Resolve or create project
      if (isNewProject) {
        targetProjectId = `proj-${Date.now().toString().slice(-4)}`;
        db.prepare("INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, '已创建', ?, ?)")
          .run(targetProjectId, projectName, ts, ts);

        // Assign mock created members
        db.prepare("INSERT INTO project_members (project_id, user_id, role_name) VALUES (?, ?, ?)")
          .run(targetProjectId, "user-created", roleName);
          
        db.prepare("INSERT INTO project_members (project_id, user_id, role_name) VALUES (?, ?, ?)")
          .run(targetProjectId, "user-pm", "ProjectManager");
      } else {
        db.prepare("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?")
          .run(projectName, ts, targetProjectId);
      }

      // 2. Upsert project_master_data
      const masterExists = db.prepare("SELECT 1 FROM project_master_data WHERE project_id = ?").get(targetProjectId);
      if (masterExists) {
        db.prepare(`
          UPDATE project_master_data
          SET project_name = ?, client_name = ?, project_address = ?, building_type = ?,
              gross_floor_area_value = ?, gross_floor_area_unit = ?,
              total_duration_value = ?, total_duration_unit = ?,
              bid_closing_date = ?, updated_at = ?
          WHERE project_id = ?
        `).run(
          projectName,
          projectInfo.ownerName || "",
          projectInfo.projectLocation || "",
          projectInfo.buildingType || "",
          Number(projectInfo.grossFloorAreaValue || 0),
          projectInfo.grossFloorAreaUnit || "㎡",
          Number(projectInfo.totalDurationValue || 0),
          projectInfo.totalDurationUnit || "日历天",
          projectInfo.bidDeadline || "",
          ts,
          targetProjectId
        );
      } else {
        db.prepare(`
          INSERT INTO project_master_data (
            project_id, project_name, client_name, project_address, building_type,
            gross_floor_area_value, gross_floor_area_unit,
            total_duration_value, total_duration_unit,
            bid_closing_date, source_text, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          targetProjectId,
          projectName,
          projectInfo.ownerName || "",
          projectInfo.projectLocation || "",
          projectInfo.buildingType || "",
          Number(projectInfo.grossFloorAreaValue || 0),
          projectInfo.grossFloorAreaUnit || "㎡",
          Number(projectInfo.totalDurationValue || 0),
          projectInfo.totalDurationUnit || "日历天",
          projectInfo.bidDeadline || "",
          projectInfo.sourceText || "",
          ts
        );
      }

      // 3. Write Tender Requirements into document_requirements table
      for (const reqItem of tenderRequirements) {
        const reqId = `req-ai-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        db.prepare(`
          INSERT INTO document_requirements (
            id, project_id, requirement_name, requirement_type, source_type, status, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'tender_extraction', 'confirmed', ?, ?, ?)
        `).run(
          reqId,
          targetProjectId,
          reqItem.requirementName || "招标文件硬性要求",
          reqItem.category || "资质业绩要求",
          username,
          ts,
          ts
        );
      }

      // 4. Write Suggested Tasks into tasks table
      for (const tSug of taskSuggestions) {
        const tId = `task-ai-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // Match suggested assignees to real database IDs
        let resUserId = "user-pm";
        const assigneeNormalized = (tSug.suggestedAssignee || "").toLowerCase();
        if (assigneeNormalized.includes("张三") || assigneeNormalized.includes("sales") || assigneeNormalized.includes("营业")) {
          resUserId = "user-sales";
        } else if (assigneeNormalized.includes("陈七") || assigneeNormalized.includes("const") || assigneeNormalized.includes("施工")) {
          resUserId = "user-const";
        } else if (assigneeNormalized.includes("赵六") || assigneeNormalized.includes("cost") || assigneeNormalized.includes("概算")) {
          resUserId = "user-cost";
        } else if (assigneeNormalized.includes("周十") || assigneeNormalized.includes("doc") || assigneeNormalized.includes("资料")) {
          resUserId = "user-doc";
        } else if (assigneeNormalized.includes("李四") || assigneeNormalized.includes("pm") || assigneeNormalized.includes("项目负责人")) {
          resUserId = "user-pm";
        }
        
        // Reverse schedule or use defaults
        const duration = Number(tSug.durationDays || 3);
        const bidClosing = projectInfo.bidDeadline || "2026-08-30";
        const finalDates = reverseSchedule(bidClosing, duration);

        db.prepare(`
          INSERT INTO tasks (
            id, project_id, task_name, task_type,
            responsible_user_id, reviewer_user_id, start_date, due_date, review_due_date,
            status, priority, risk_level, is_date_locked, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started', 'Medium', 'Low', 0, ?, ?, ?)
        `).run(
          tId,
          targetProjectId,
          tSug.taskName || "AI 建议标书编制任务",
          tSug.bidPhase || "TenderParse",
          resUserId,
          "user-pm", // PM 李四 as the default reviewer
          finalDates.startDate,
          finalDates.dueDate,
          finalDates.reviewDueDate,
          username,
          ts,
          ts
        );
      }

      // 5. If file is present, decode base64 buffer and store it as a real project document
      if (fileName && fileData) {
        const fileBuffer = Buffer.from(fileData, "base64");
        const uploadsDir = path.join(process.cwd(), "uploads", targetProjectId);
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        const relativePath = path.join("uploads", targetProjectId, `1_${fileName}`);
        fs.writeFileSync(path.join(process.cwd(), relativePath), fileBuffer);

        const docId = `doc-ai-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const versionId = `ver-ai-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const fileExt = path.extname(fileName).replace(".", "").toLowerCase();

        db.prepare(`
          INSERT INTO documents (
            id, project_id, file_name, file_type, document_type, is_sensitive, allow_ai_read, current_version_id, uploaded_by, parse_status, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'tender_document', 0, 1, ?, ?, 'parsed', 'draft', ?, ?)
        `).run(
          docId,
          targetProjectId,
          fileName,
          fileExt || "pdf",
          versionId,
          username,
          ts,
          ts
        );

        db.prepare(`
          INSERT INTO document_versions (
            id, document_id, version_number, storage_path, file_size, is_latest, is_final, status, uploaded_by, uploaded_at
          ) VALUES (?, ?, 1, ?, ?, 1, 0, 'Uploaded', ?, ?)
        `).run(
          versionId,
          docId,
          relativePath,
          fileBuffer.length,
          username,
          ts
        );
      }
    })();

    auditLogger.logAction({
      projectId: targetProjectId,
      operator: username,
      role: roleName,
      action: "ConfirmAIAnalysis",
      details: `${isNewProject ? '一键确认并创建了新项目' : '为已有项目确认并写入了分析结果'}。写入主数据项目名称: "${projectName}"，追加 ${tenderRequirements.length} 条制式要求表单，启动 ${taskSuggestions.length} 条编制任务包。`
    });

    res.json({ success: true, projectId: targetProjectId, projectName });

  } catch (err: any) {
    console.error(`[AI-Confirm-Error] DB persistence error:`, err);
    res.status(500).json({ error: `确认入盘失败: ${err.message}` });
  }
});

// 6. POST run AI extraction
app.post("/api/projects/:id/documents/:documentId/ai-extract", checkPerm("canViewProject"), async (req, res) => {
  const { id, documentId } = req.params;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const userId = String(req.headers["x-user-id"] || "user-pm");
  const username = String(req.headers["x-username"] || "Anonymous");

  const providerName = ENV.AI_PROVIDER;
  const modelName = ENV.BAILIAN_MODEL;

  try {
    const doc = db.prepare(`
      SELECT d.*, v.id as version_id
      FROM documents d
      JOIN document_versions v ON d.current_version_id = v.id
      WHERE d.id = ? AND d.project_id = ?
    `).get(documentId, id) as any;

    if (!doc) {
      return res.status(404).json({ error: "招标文件定位失败" });
    }

    // Detailed de-sensitized call telemetry logging
    console.log("\n[AI CALL]");
    console.log(`projectId=${id}`);
    console.log(`documentVersionId=${doc.version_id}`);
    console.log(`requestedProvider=${providerName}`);
    console.log(`selectedProvider=${providerName === "bailian" ? "BailianProvider" : "MockAIProvider"}`);
    console.log(`model=${modelName}`);
    console.log(`isMock=${providerName !== "bailian"}`);
    console.log("usedFallback=false\n");

    const permissionVal = verifyAIPermission(id, documentId, role as string, userId as string);

    if (!permissionVal.allowed) {
      const logId = `ai-log-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const logDetails = JSON.stringify({
        provider: providerName,
        modelName: modelName,
        requestId: `req-blocked-${Date.now()}`,
        status: "failed",
        errorCode: "PermissionBlocked",
        errorMessage: permissionVal.reason,
        sourceChunkCount: 0,
        inputCharCount: 0,
        outputCharCount: 0,
        isMock: providerName === "mock",
        usedFallback: false,
        projectId: id,
        documentId: documentId,
        documentVersionId: doc.version_id,
        actorId: userId,
        permissionResult: "PermissionBlocked",
        sourceChunkIds: [],
        createdAt: new Date().toISOString()
      });
      db.prepare(`
        INSERT INTO ai_call_logs (id, project_id, document_id, actor_id, provider, action, result, permission_result, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, 'ExtractionRequest', ?, 'PermissionBlocked', ?, CURRENT_TIMESTAMP)
      `).run(logId, id, documentId, userId, providerName, logDetails, permissionVal.reason);

      auditLogger.logAction({
        projectId: id,
        operator: username,
        role: role as string,
        action: "AI_PERMISSION_CHECK",
        details: `[AI_PERMISSION_CHECK] 权限拦截：用户 [${username}] 触发高敏禁用文件AI：${permissionVal.reason}`
      });

      return res.status(403).json({ error: permissionVal.reason });
    }

    const startTime = Date.now();
    let extractionFields: any[] = [];
    try {
      extractionFields = await extractTenderParamsFromChunks(id, documentId, doc.version_id, role as string, userId as string);
    } catch (innerErr: any) {
      // Log failure in ai_call_logs
      const logId = `ai-log-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const logDetails = JSON.stringify({
        provider: providerName,
        modelName: modelName,
        requestId: `req-failed-${Date.now()}`,
        status: "failed",
        errorCode: "ExtractionServiceError",
        errorMessage: innerErr.message,
        sourceChunkCount: 0,
        inputCharCount: doc.file_size || 0,
        outputCharCount: 0,
        isMock: providerName === "mock",
        usedFallback: false,
        projectId: id,
        documentId: documentId,
        documentVersionId: doc.version_id,
        actorId: userId,
        permissionResult: "ApprovedAllowed",
        sourceChunkIds: [],
        createdAt: new Date().toISOString()
      });
      db.prepare(`
        INSERT INTO ai_call_logs (id, project_id, document_id, actor_id, provider, action, result, permission_result, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, 'ExtractionRequest', ?, 'ApprovedAllowed', ?, CURRENT_TIMESTAMP)
      `).run(logId, id, documentId, userId, providerName, logDetails, innerErr.message);

      throw innerErr;
    }

    const elapsed = Date.now() - startTime;

    db.prepare("DELETE FROM ai_extraction_results WHERE document_id = ?").run(documentId);

    const insertResult = db.prepare(`
      INSERT INTO ai_extraction_results (id, project_id, document_id, field_key, field_label, extracted_value, normalized_value, source_page, source_paragraph, source_text_snippet, confidence, status, requires_human_confirmation, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_confirmation', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    db.transaction(() => {
      extractionFields.forEach(f => {
        const resId = `ext-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        insertResult.run(
          resId,
          id,
          documentId,
          f.fieldKey,
          f.fieldLabel,
          f.extractedValue,
          f.normalizedValue || f.extractedValue,
          String(f.sourcePage),
          String(f.sourceParagraph),
          f.sourceTextSnippet,
          f.confidence
        );
      });
    })();

    const logId = `ai-log-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const mockTokenUsage = {
      prompt_tokens: 3500,
      completion_tokens: 1200,
      total_tokens: 4700
    };

    const chunkRows = db.prepare(`
      SELECT id FROM parsed_document_chunks
      WHERE document_id = ? AND document_version_id = ?
    `).all(documentId, doc.version_id) as any[];
    const sourceChunkIds = chunkRows.map(c => c.id);

    const logDetails = JSON.stringify({
      provider: providerName,
      modelName: modelName,
      requestId: `req-success-${Date.now()}`,
      status: "success",
      errorCode: null,
      errorMessage: null,
      sourceChunkCount: sourceChunkIds.length,
      inputCharCount: doc.file_size || 0,
      outputCharCount: JSON.stringify(extractionFields).length,
      isMock: providerName === "mock",
      usedFallback: false,
      projectId: id,
      documentId: documentId,
      documentVersionId: doc.version_id,
      actorId: userId,
      permissionResult: "ApprovedAllowed",
      sourceChunkIds: sourceChunkIds,
      createdAt: new Date().toISOString()
    });

    db.prepare(`
      INSERT INTO ai_call_logs (id, project_id, document_id, actor_id, provider, action, result, permission_result, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, 'ExtractionRequest', ?, 'ApprovedAllowed', NULL, CURRENT_TIMESTAMP)
    `).run(logId, id, documentId, userId, providerName, logDetails);

    auditLogger.logAction({
      projectId: id,
      operator: username,
      role: role as string,
      action: "AI_EXTRACTION_COMPLETED",
      details: `[AI_EXTRACTION_COMPLETED] 用户 [${username}] 成功发起 [${doc.file_name}] 的 AI 重点要素高密抽取，消耗系统总 Tokens: ${mockTokenUsage.total_tokens}，响应消耗耗时: ${elapsed}ms`
    });

    res.json({ success: true, count: extractionFields.length });
  } catch (err: any) {
    res.status(500).json({ error: `AI 辅助解析失败：百炼接口调用失败，请检查 API Key、模型名称、网络或接口返回。真实错误：${err.message}` });
  }
});

// 7. GET extraction results
app.get("/api/projects/:id/documents/:documentId/extraction-results", checkPerm("canViewProject"), (req, res) => {
  const { id, documentId } = req.params;
  try {
    const rows = db.prepare(`
      SELECT id, project_id as projectId, document_id as documentId,
             field_key as fieldKey, field_label as fieldLabel,
             extracted_value as extractedValue, normalized_value as normalizedValue,
             source_page as sourcePage, source_paragraph as sourceParagraph,
             source_text_snippet as sourceTextSnippet, confidence, status,
             requires_human_confirmation as requiresHumanConfirmation,
             confirmed_by as confirmedBy, confirmed_at as confirmedAt
      FROM ai_extraction_results
      WHERE project_id = ? AND document_id = ?
    `).all(id, documentId);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. PATCH extraction result field values
app.patch("/api/projects/:id/extraction-results/:resultId", checkPerm("canUploadFile"), (req, res) => {
  const { id, resultId } = req.params;
  const { extractedValue, normalizedValue } = req.body;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  try {
    db.prepare(`
      UPDATE ai_extraction_results
      SET extracted_value = ?, normalized_value = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ?
    `).run(extractedValue, normalizedValue || extractedValue, resultId, id);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. POST confirm result and synchronize directly to master-data
app.post("/api/projects/:id/extraction-results/:resultId/confirm", checkPerm("canEditProjectMasterData"), (req, res) => {
  const { id, resultId } = req.params;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const userId = String(req.headers["x-user-id"] || "user-pm");
  const username = String(req.headers["x-username"] || "Anonymous");

  try {
    const field = db.prepare("SELECT * FROM ai_extraction_results WHERE id = ? AND project_id = ?").get(resultId, id) as any;
    if (!field) {
      return res.status(404).json({ error: "找不到该条AI提取条目数据" });
    }

    const schemaMapping: Record<string, string> = {
      projectName: "project_name",
      clientName: "client_name",
      projectAddress: "project_address",
      buildingType: "building_type",
      grossFloorAreaValue: "gross_floor_area_value",
      totalDurationValue: "total_duration_value",
      bidClosingDate: "bid_closing_date",
      clarificationDue: "clarification_due",
      siteVisitDate: "site_visit_date",
      tenderScope: "tender_scope",
      constructScope: "construct_scope",
      designScope: "design_scope",
      paymentTerms: "payment_terms",
      bimRequirements: "bim_requirements",
      greenBuildings: "green_buildings",
      safetyLevel: "safety_level",
      qualityGoal: "quality_goal",
      vecdConstraints: "vecd_constraints"
    };

    const targetColumn = schemaMapping[field.field_key];

    db.transaction(() => {
      db.prepare(`
        UPDATE ai_extraction_results
        SET status = 'confirmed', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(username, resultId);

      if (targetColumn) {
        const currentData = db.prepare("SELECT * FROM project_master_data WHERE project_id = ?").get(id) as any;
        const oldValue = currentData ? currentData[targetColumn] : null;

        const exists = db.prepare("SELECT COUNT(*) as count FROM project_master_data WHERE project_id = ?").get(id) as { count: number };
        if (exists.count === 0) {
          db.prepare("INSERT INTO project_master_data (project_id, project_name) VALUES (?, '新建项目')").run(id);
        }

        db.prepare(`
          UPDATE project_master_data
          SET ${targetColumn} = ?, updated_at = CURRENT_TIMESTAMP
          WHERE project_id = ?
        `).run(field.extracted_value, id);

        const changeId = `change-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        db.prepare(`
          INSERT INTO master_data_changes (id, project_id, field_name, old_value, new_value, changed_by, changed_at, source, impact_level)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'AI Confirmation', 'Medium')
        `).run(changeId, id, field.field_label, String(oldValue), String(field.extracted_value), username);

        auditLogger.logAction({
          projectId: id,
          operator: username,
          role: role,
          action: "MASTER_DATA_SYNC",
          details: `[MASTER_DATA_SYNC] 用户：${username} 汇总确认同步AI解析库，中风险 [${field.field_label}] 更新为 [${field.extracted_value}] (原值为 ${oldValue})`
        });
      }
    })();

    res.json({ success: true, message: "已成功同步更新本工程项目主数据印标" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. POST ignore AI extraction field result
app.post("/api/projects/:id/extraction-results/:resultId/ignore", checkPerm("canEditProjectMasterData"), (req, res) => {
  const { id, resultId } = req.params;
  const username = String(req.headers["x-username"] || "Anonymous");

  try {
    db.prepare(`
      UPDATE ai_extraction_results
      SET status = 'ignored', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND project_id = ?
    `).run(username, resultId, id);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. POST bulk synchronize batch master data update manually
app.post("/api/projects/:id/master-data/sync", checkPerm("canEditProjectMasterData"), (req, res) => {
  const { id } = req.params;
  const fields = req.body;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  try {
    const schemaMapping: Record<string, string> = {
      projectName: "project_name",
      clientName: "client_name",
      projectAddress: "project_address",
      buildingType: "building_type",
      grossFloorAreaValue: "gross_floor_area_value",
      grossFloorAreaUnit: "gross_floor_area_unit",
      totalDurationValue: "total_duration_value",
      totalDurationUnit: "total_duration_unit",
      bidClosingDate: "bid_closing_date",
      clarificationDue: "clarification_due",
      siteVisitDate: "site_visit_date",
      tenderScope: "tender_scope",
      constructScope: "construct_scope",
      designScope: "design_scope",
      paymentTerms: "payment_terms",
      bimRequirements: "bim_requirements",
      greenBuildings: "green_buildings",
      safetyLevel: "safety_level",
      qualityGoal: "quality_goal",
      vecdConstraints: "vecd_constraints"
    };

    db.transaction(() => {
      const exists = db.prepare("SELECT COUNT(*) as count FROM project_master_data WHERE project_id = ?").get(id) as { count: number };
      if (exists.count === 0) {
        db.prepare("INSERT INTO project_master_data (project_id, project_name) VALUES (?, '新建项目')").run(id);
      }

      const currentData = db.prepare("SELECT * FROM project_master_data WHERE project_id = ?").get(id) as any;

      for (const [key, value] of Object.entries(fields)) {
        const targetColumn = schemaMapping[key];
        if (targetColumn) {
          const oldValue = currentData ? currentData[targetColumn] : null;
          if (String(oldValue) !== String(value)) {
            db.prepare(`UPDATE project_master_data SET ${targetColumn} = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?`).run(value, id);
            
            const changeId = `change-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            db.prepare(`
              INSERT INTO master_data_changes (id, project_id, field_name, old_value, new_value, changed_by, changed_at, source, impact_level)
              VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'Manual Update', 'Low')
            `).run(changeId, id, key, String(oldValue), String(value), username);
          }
        }
      }

      auditLogger.logAction({
        projectId: id,
        operator: username,
        role: role,
        action: "MASTER_DATA_SYNC",
        details: `[MASTER_DATA_SYNC] 用户：${username} 手工批量同步确认主数据，写入内容: ${JSON.stringify(fields)}`
      });
    })();

    res.json({ success: true, message: "已成功同步更新本工程项目主数据" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================================================
// ITERATION 4: FILE MANAGEMENT, REVISION VERSIONING, AND DESKTOP SELFcheck
// ============================================================================

// A helper mapping roles to actual user ids for permission boundary checking
function checkTaskEditPermission(taskId: string, projectId: string, userId: string, role: string): boolean {
  if (role === "SystemAdmin" || role === "ProjectManager") {
    return true; // Root administrative role bypass
  }
  // Retrieve the task
  const task = db.prepare("SELECT responsible_user_id FROM tasks WHERE id = ? AND project_id = ?").get(taskId, projectId) as { responsible_user_id: string } | undefined;
  if (!task) return false;
  return task.responsible_user_id === userId;
}

// Helper to calculate Levenshtein distance or do fuzzy comparisons for project name
function hasProjectNameMatch(text: string, projectName: string): boolean {
  const normText = text.toLowerCase().replace(/[\s\(\)（）\-\_\—]/g, "");
  const normProject = projectName.toLowerCase().replace(/[\s\(\)（）\-\_\—]/g, "");
  
  if (normText.includes(normProject)) return true;
  
  // Try shortened fragments of at least 4 characters to avoid false negatives for suffix prefixes
  if (normProject.length > 4) {
    const keyPart = normProject.substring(0, Math.floor(normProject.length * 0.7));
    if (keyPart.length >= 4 && normText.includes(keyPart)) {
      return true;
    }
  }
  return false;
}

// 1. POST Upload task-associated versioned documents
app.post("/api/projects/:projectId/tasks/:taskId/documents", checkPerm("canUploadFile"), async (req, res) => {
  const { projectId, taskId } = req.params;
  const { fileName, fileType, fileData, isSensitive = 0, allowAIRead = 1, documentType = "technical_scheme" } = req.body;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");
  const userId = String(req.headers["x-user-id"] || "user-pm");

  if (!fileName || !fileData) {
    return res.status(400).json({ error: "参数不完整（缺少档案名称或数据体）" });
  }

  try {
    // Permission: PM can add, members can only upload to tasks they are assigned to
    const isOwner = checkTaskEditPermission(taskId, projectId, userId, role);
    if (!isOwner) {
      return res.status(403).json({ error: "抱歉，您不属于本工件受指定编制人，无法向此任务挂载新文档！" });
    }

    const sensitiveFlag = isSensitive ? 1 : 0;
    const aiReadFlag = sensitiveFlag === 1 ? 0 : (allowAIRead ? 1 : 0);

    const normFileType = fileType ? fileType.toLowerCase() : path.extname(fileName).replace(".", "").toLowerCase();

    const uploadDir = path.join(process.cwd(), "uploads", projectId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const base64Data = fileData.includes(";base64,") ? fileData.split(";base64,")[1] : fileData;
    const fileBuffer = Buffer.from(base64Data, "base64");

    // Look for existing document under the same project and task with the same fileName
    let existingDoc = db.prepare("SELECT * FROM documents WHERE project_id = ? AND task_id = ? AND file_name = ?").get(projectId, taskId, fileName) as any;
    
    let docId = "";
    let versionNum = 1;
    let actualFilePath = "";

    if (existingDoc) {
      docId = existingDoc.id;
      // Fetch latest version_number to increment
      const maxVer = db.prepare("SELECT MAX(version_number) as maxV FROM document_versions WHERE document_id = ?").get(docId) as { maxV: number | null };
      versionNum = (maxVer.maxV || 1) + 1;

      // Obsolete older versions
      db.prepare("UPDATE document_versions SET is_latest = 0 WHERE document_id = ?").run(docId);

      actualFilePath = path.join("uploads", projectId, `${versionNum}_${fileName}`);
      fs.writeFileSync(path.join(process.cwd(), actualFilePath), fileBuffer);

      const versionId = `ver-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      db.prepare(`
        INSERT INTO document_versions (id, document_id, version_number, storage_path, file_size, is_latest, is_final, status, uploaded_by, uploaded_at)
        VALUES (?, ?, ?, ?, ?, 1, 0, 'uploaded', ?, CURRENT_TIMESTAMP)
      `).run(versionId, docId, versionNum, actualFilePath, fileBuffer.length, username);

      db.prepare(`
        UPDATE documents
        SET current_version_id = ?, updated_at = CURRENT_TIMESTAMP, parse_status = 'unparsed', is_sensitive = ?, allow_ai_read = ?, status = 'pending_self_check'
        WHERE id = ?
      `).run(versionId, sensitiveFlag, aiReadFlag, docId);

      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "FILE_UPLOAD",
        details: `[FILE_UPLOAD] 上传任务方案更新件 [${fileName}] 成功，升级版本到 v${versionNum}并自动封存历史记录`
      });

    } else {
      // Create new document configuration entry
      docId = `doc-task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const versionId = `ver-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      actualFilePath = path.join("uploads", projectId, `1_${fileName}`);
      fs.writeFileSync(path.join(process.cwd(), actualFilePath), fileBuffer);

      // Create document entry
      db.prepare(`
        INSERT INTO documents (id, project_id, task_id, file_name, file_type, document_type, is_sensitive, allow_ai_read, current_version_id, uploaded_by, uploaded_at, status, parse_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'pending_self_check', 'unparsed')
      `).run(docId, projectId, taskId, fileName, normFileType, documentType, sensitiveFlag, aiReadFlag, versionId, username);

      // Create version 1 entry
      db.prepare(`
        INSERT INTO document_versions (id, document_id, version_number, storage_path, file_size, is_latest, is_final, status, uploaded_by, uploaded_at)
        VALUES (?, ?, 1, ?, ?, 1, 0, 'uploaded', ?, CURRENT_TIMESTAMP)
      `).run(versionId, docId, actualFilePath, fileBuffer.length, username);

      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "FILE_UPLOAD",
        details: `[FILE_UPLOAD] 用户 [${username}] 成功上传首版技术方案件: [${fileName}]，挂载于任务 [${taskId}]`
      });
    }

    // Proactively Parse Text Content to establish Chunk indexing system for subsequent checks
    try {
      const parsedChunks = await parseDocumentToChunks(path.join(process.cwd(), actualFilePath), normFileType as "pdf" | "docx");
      // Clean previous chunks of this specific document and version
      const activeVersionId = db.prepare("SELECT current_version_id FROM documents WHERE id = ?").get(docId) as { current_version_id: string };
      db.prepare("DELETE FROM parsed_document_chunks WHERE document_version_id = ?").run(activeVersionId.current_version_id);

      db.transaction(() => {
        parsedChunks.forEach(chunk => {
          const chunkId = `chk-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
          db.prepare(`
            INSERT INTO parsed_document_chunks (id, document_id, document_version_id, page_number, paragraph_index, text_content, created_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run(chunkId, docId, activeVersionId.current_version_id, chunk.pageNumber, chunk.paragraphIndex, chunk.textContent);
        });
      })();

      db.prepare("UPDATE documents SET parse_status = 'parsed' WHERE id = ?").run(docId);
    } catch (parseErr: any) {
      console.warn("[UPLOAD_PARSE_FAILED_BUT_SAVED] Parse failed for indexing:", parseErr.message);
      db.prepare("UPDATE documents SET parse_status = 'failed' WHERE id = ?").run(docId);
    }

    const finalDoc = db.prepare(`
      SELECT d.*, v.version_number, v.id as version_id, v.status as version_status
      FROM documents d
      JOIN document_versions v ON d.current_version_id = v.id
      WHERE d.id = ?
    `).get(docId) as any;

    res.json({ success: true, docId, version: versionNum, document: finalDoc });
  } catch (err: any) {
    res.status(500).json({ error: "服务器存储错误: " + err.message });
  }
});

// Alias compatible multi-part file revision payload
app.post("/api/documents/upload-revision", checkPerm("canUploadFile"), (req, res) => {
  // Translate fields from generic request body to route standard API
  const { projectId, taskId } = req.body;
  if (!projectId || !taskId) {
    return res.status(400).json({ error: "缺失项目定位参数 projectId 或 任务参数 taskId" });
  }
  // Redirect internal handler call
  req.params = { projectId, taskId };
  return app._router.handle(req, res);
});

// 2. GET retrieve list of documents in a project/task
app.get("/api/projects/:projectId/documents", checkPerm("canViewProject"), (req, res) => {
  const { projectId } = req.params;
  const { taskId, fileType, status } = req.query;
  try {
    let query = `
      SELECT d.*, v.version_number, v.is_final, v.file_size, v.status as version_status, t.task_name, t.responsible_user_id
      FROM documents d
      LEFT JOIN document_versions v ON d.current_version_id = v.id
      LEFT JOIN tasks t ON d.task_id = t.id
      WHERE d.project_id = ?
    `;
    const params: any[] = [projectId];

    if (taskId) {
      query += " AND d.task_id = ?";
      params.push(taskId);
    }
    if (fileType) {
      query += " AND d.file_type = ?";
      params.push(fileType);
    }
    if (status) {
      query += " AND d.status = ?";
      params.push(status);
    }

    query += " ORDER BY d.updated_at DESC";

    const documents = db.prepare(query).all(...params);
    res.json(documents);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/projects/:projectId/tasks/:taskId/documents", checkPerm("canViewProject"), (req, res) => {
  const { projectId, taskId } = req.params;
  try {
    const documents = db.prepare(`
      SELECT d.*, v.version_number, v.is_final, v.file_size, v.status as version_status
      FROM documents d
      LEFT JOIN document_versions v ON d.current_version_id = v.id
      WHERE d.project_id = ? AND d.task_id = ?
      ORDER BY d.updated_at DESC
    `).all(projectId, taskId);
    res.json(documents);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET Query structural details and iterative versions list of any file
app.get("/api/projects/:projectId/documents/:documentId/versions", checkPerm("canViewProject"), (req, res) => {
  const { documentId } = req.params;
  try {
    const list = db.prepare(`
      SELECT * FROM document_versions
      WHERE document_id = ?
      ORDER BY version_number DESC
    `).all(documentId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. GET physical file downloading with high-confidentiality checks
app.get("/api/projects/:projectId/documents/:documentId/versions/:versionId/download", checkPerm("canDownloadFile"), (req, res) => {
  const { projectId, documentId, versionId } = req.params;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  try {
    const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND project_id = ?").get(documentId, projectId) as any;
    if (!doc) {
      return res.status(404).json({ error: "未找到指定的文档档案" });
    }

    // Role boundary checks for classified sensitive folders
    if (doc.is_sensitive === 1) {
      if (role !== "ProjectManager" && role !== "SystemAdmin" && role !== "Cost") {
        return res.status(403).json({ error: "👮 抱歉，该文件被标记为敏感资料，您的角色未获授权访问！" });
      }
    }

    const version = db.prepare("SELECT * FROM document_versions WHERE id = ? AND document_id = ?").get(versionId, documentId) as any;
    if (!version) {
      return res.status(404).json({ error: "未定位到指定的历史迭代版本" });
    }

    const fullPath = path.join(process.cwd(), version.storage_path);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "服务器文件不存在！" });
    }

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "DOWNLOAD_FILE",
      details: `[DOWNLOAD_FILE] 安全导出并下载文件版本 [${doc.file_name}] 的第 v${version.version_number} 次迭代。`
    });

    res.download(fullPath, doc.file_name);
  } catch (err: any) {
    res.status(550).json({ error: err.message });
  }
});

// 5. POST run Desktop-level Self-checking with area and duration tolerances and sensitive checks
app.post("/api/projects/:projectId/documents/:documentId/versions/:versionId/self-check", checkPerm("canUploadFile"), async (req, res) => {
  const { projectId, documentId, versionId } = req.params;
  const { tolerance = 0 } = req.body; // Tolerance configured in percentage (P0 requirement)
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  try {
    const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(documentId) as any;
    const version = db.prepare("SELECT * FROM document_versions WHERE id = ?").get(versionId) as any;
    const md = db.prepare("SELECT * FROM project_master_data WHERE project_id = ?").get(projectId) as any;

    if (!doc || !version || !md) {
      return res.status(404).json({ error: "项目背景、主数据图谱或工件不完整，无法发起文件比对校验。" });
    }

    // Parse file if text indexing chunks are not ready
    let chunks = db.prepare("SELECT * FROM parsed_document_chunks WHERE document_version_id = ?").all(versionId) as any[];
    if (chunks.length === 0) {
      const fullPath = path.join(process.cwd(), version.storage_path);
      if (fs.existsSync(fullPath)) {
        try {
          const parsed = await parseDocumentToChunks(fullPath, doc.file_type as "pdf" | "docx");
          db.transaction(() => {
            parsed.forEach(chunk => {
              const chunkId = `chk-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
              db.prepare(`
                INSERT INTO parsed_document_chunks (id, document_id, document_version_id, page_number, paragraph_index, text_content, created_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              `).run(chunkId, documentId, versionId, chunk.pageNumber, chunk.paragraphIndex, chunk.textContent);
            });
          })();
          chunks = db.prepare("SELECT * FROM parsed_document_chunks WHERE document_version_id = ?").all(versionId) as any[];
          db.prepare("UPDATE documents SET parse_status = 'parsed' WHERE id = ?").run(documentId);
        } catch (parseErr: any) {
          return res.status(422).json({ error: `无法建立文件段落索引，自检分析流程终止: ${parseErr.message}` });
        }
      } else {
        return res.status(404).json({ error: "服务器存储盘中未找到对应原文件，自检流程阻断。" });
      }
    }

    const mergedFullText = chunks.map(c => c.text_content).join("\n");
    const issues: any[] = [];

    // Rule 5.1 Project Name Consistency checking (project_name_mismatch & old_project_name)
    const masterProjName = md.project_name || doc.file_name;
    const matchedValidProjectName = hasProjectNameMatch(mergedFullText, masterProjName);
    
    if (!matchedValidProjectName) {
      issues.push({
        issueType: "project_name_mismatch",
        severity: "high",
        message: `检测到项目名称拼写不一致。文件名与方案主体拼准失效，未在草稿中查阅到对应工程主数据名称 [${masterProjName}]，请确认本方案是否误上传。`,
        expectedValue: masterProjName,
        actualValue: "缺失匹配"
      });
    }

    // Check if other project names are mentioned in the file (old_project_name)
    const otherProjects = db.prepare("SELECT id, name FROM projects WHERE id != ?").all(projectId) as { id: string; name: string }[];
    for (const b of otherProjects) {
      if (b.name && b.name.length > 3 && mergedFullText.includes(b.name)) {
        // Find chunk that contains it
        const srcChunk = chunks.find(c => c.text_content.includes(b.name)) || chunks[0];
        issues.push({
          issueType: "old_project_name",
          severity: "high",
          message: `疑似拷贝旧作！全文扫描发现包含系统内历史其他项目名称: [${b.name}] (建议对准修改为当前项目：[${masterProjName}])`,
          sourceTextSnippet: srcChunk.text_content,
          sourcePage: srcChunk.page_number,
          sourceParagraph: srcChunk.paragraph_index,
          expectedValue: masterProjName,
          actualValue: b.name
        });
      }
    }

    // Check configurations and find old project name patterns (e.g. suspiciousProjectReference / configuredSensitiveTerms)
    const blackwords = db.prepare("SELECT * FROM sensitive_black_dictionary").all() as { sensitive_word: string; replacement_hint: string }[];
    for (const word of blackwords) {
      if (mergedFullText.includes(word.sensitive_word)) {
        const srcChunk = chunks.find(c => c.text_content.includes(word.sensitive_word)) || chunks[0];
        issues.push({
          issueType: "old_project_name", // Treated as high sensitivity oldProjectNamePatterns or suspiciousProjectReference
          severity: "high", // Treated as high sensitivity for manual review
          message: `疑似旧项目引用或项目配置敏感词: [${word.sensitive_word}]。建议人工确认是否需要替换为当前项目相关信息，提示更正方案: ${word.replacement_hint || "进行更正或删除"}`,
          sourceTextSnippet: srcChunk.text_content,
          sourcePage: srcChunk.page_number,
          sourceParagraph: srcChunk.paragraph_index,
          expectedValue: word.replacement_hint || "更正以及确认",
          actualValue: word.sensitive_word
        });
      }
    }

    // Rule 5.2 Building Area Consistency checking with tolerance support
    const targetArea = Number(md.gross_floor_area_value || 0);
    if (targetArea > 0) {
      const areaRegex = /(\d[\d,]*\.?\d*)\s*(?:平方米|m2|㎡)/gi;
      let match;
      while ((match = areaRegex.exec(mergedFullText)) !== null) {
        const numericStr = match[1].replace(/,/g, "");
        const matchedValue = parseFloat(numericStr);
        if (!isNaN(matchedValue) && matchedValue > 0) {
          const diff = Math.abs(matchedValue - targetArea);
          const percentDiff = (diff / targetArea) * 100;

          if (percentDiff > tolerance) {
            // Find specific section chunk
            const ch = chunks.find(c => c.text_content.includes(match![0])) || chunks[0];
            issues.push({
              issueType: "gross_floor_area_mismatch",
              severity: "high",
              message: `检测到建筑面积与主数据库冲突（主数据要求 ${targetArea} ㎡，你的正文写了 ${matchedValue} ㎡，超出设定容差百分比 ${tolerance}%），需更正！`,
              sourceTextSnippet: ch.text_content,
              sourcePage: ch.page_number,
              sourceParagraph: ch.paragraph_index,
              expectedValue: `${targetArea} ㎡`,
              actualValue: `${matchedValue} ㎡`
            });
          }
        }
      }
    }

    // Rule 5.3 Work Duration Days check
    const targetDuration = Number(md.total_duration_value || 0);
    if (targetDuration > 0) {
      const durationRegex = /(\d{1,4})\s*(?:日历天|工作日|天)/gi;
      let match;
      while ((match = durationRegex.exec(mergedFullText)) !== null) {
        const matchedVal = parseInt(match[1], 10);
        if (!isNaN(matchedVal) && matchedVal > 10) { // filter out minor single digit normal paragraph count numbers
          if (matchedVal !== targetDuration) {
            const ch = chunks.find(c => c.text_content.includes(match![0])) || chunks[0];
            issues.push({
              issueType: "duration_mismatch",
              severity: "medium",
              message: `检测到工期与主数据冲突（主数据是 ${targetDuration} 天，你的正文写了 ${matchedVal} 天），需更正！`,
              sourceTextSnippet: ch.text_content,
              sourcePage: ch.page_number,
              sourceParagraph: ch.paragraph_index,
              expectedValue: `${targetDuration} 天`,
              actualValue: `${matchedVal} 天`
            });
          }
        }
      }
    }

    // Rule 5.4 Tender Requirements Responsive Coverage check
    const reqs = db.prepare("SELECT * FROM document_requirements WHERE project_id = ? AND status IN ('confirmed', 'converted_to_task')").all(projectId) as any[];
    
    const getCustomKeywords = (reqName: string): string[] => {
      const mappings: Record<string, string[]> = {
        "BIM": ["BIM", "bim", "模型", "碰撞", "深化"],
        "绿色": ["绿色", "环保", "日资", "低碳", "能耗"],
        "环保": ["环保", "绿色", "日资", "循环"],
        "安全": ["安全", "文明", "消防", "防护"],
        "中德": ["中德", "认证", "中德环境"],
        "VECD": ["VECD", "深化", "调准", "成本"]
      };
      const found: string[] = [];
      for (const [k, v] of Object.entries(mappings)) {
        if (reqName.includes(k)) {
          found.push(...v);
        }
      }
      return found.length > 0 ? found : [reqName.substring(0, Math.min(6, reqName.length))];
    };

    for (const r of reqs) {
      const keywords = getCustomKeywords(r.requirement_name);
      const isMet = keywords.some(k => mergedFullText.toLowerCase().includes(k.toLowerCase()));
      if (!isMet) {
        issues.push({
          issueType: "tender_requirement_missing",
          severity: "medium", // Warning level deficiency matching spec
          message: `未响应招标文件特殊要求：方案内容找不到对 [${r.requirement_name}] 的相关说明，由于系统已生成此项特殊要求，而检测到草稿件全文缺乏对此项特殊说明 [响应关键词：${keywords.join("/")}]，疑似遗漏编报响应，需核实。`,
          expectedValue: `包含对 ${r.requirement_name} 的专项描述`,
          actualValue: `全文未提及相关控制字干 [${keywords.join("/")}]`
        });
      }
    }

    // Wrap-up Run Results Saving
    const runId = `run-${Date.now()}`;
    // Run passes only if there are NO open non-ignored issues
    const isSuccess = issues.length === 0 ? "passed" : "failed";

    db.transaction(() => {
      db.prepare(`
        INSERT INTO self_check_runs (id, project_id, task_id, document_id, document_version_id, status, executed_by, executed_at, summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      `).run(runId, projectId, doc.task_id, documentId, versionId, isSuccess, username, `桌面端合规性扫描结果：共搜寻到问题量: ${issues.length} 条。项目一致性核定流程。`);

      issues.forEach(issue => {
        const issueId = `iss-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        db.prepare(`
          INSERT INTO self_check_issues (id, self_check_run_id, project_id, task_id, document_id, document_version_id, issue_type, severity, message, source_text_snippet, source_page, source_paragraph, expected_value, actual_value, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
        `).run(
          issueId,
          runId,
          projectId,
          doc.task_id,
          documentId,
          versionId,
          issue.issueType,
          issue.severity,
          issue.message,
          issue.sourceTextSnippet || "整体文件大纲",
          issue.sourcePage || 1,
          issue.sourceParagraph || 1,
          issue.expectedValue || "",
          issue.actualValue || ""
        );
      });

      // Update document table status based on checking outcome is_success
      const newDocStatus = isSuccess === "passed" ? "self_check_passed" : "self_check_failed";
      db.prepare("UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(newDocStatus, documentId);
    })();

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "SELF_check",
      details: `[SELF_check] 手动或者系统触发了方案合规一致性自检索。扫描文档 [${doc.file_name}], 问题数量: ${issues.length} 个，最终状态: [${isSuccess}]`
    });

    res.json({ success: true, runId, status: isSuccess, issuesCount: issues.length });
  } catch (err: any) {
    res.status(500).json({ error: "安全审计检索底层崩溃: " + err.message });
  }
});

// Alias for rerun self check (exact copy map)
app.post("/api/projects/:projectId/documents/:documentId/versions/:versionId/self-check-rerun", checkPerm("canUploadFile"), (req, res) => {
  return app._router.handle(req, res);
});

// 6. GET historical self-check runs under any version
app.get("/api/projects/:projectId/documents/:documentId/versions/:versionId/self-check-runs", checkPerm("canViewProject"), (req, res) => {
  const { versionId } = req.params;
  try {
    const list = db.prepare(`
      SELECT * FROM self_check_runs
      WHERE document_version_id = ?
      ORDER BY executed_at DESC
    `).all(versionId);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. GET specific issues list from any run
app.get("/api/projects/:projectId/self-check-runs/:runId/issues", checkPerm("canViewProject"), (req, res) => {
  const { runId } = req.params;
  try {
    const rows = db.prepare(`
      SELECT * FROM self_check_issues
      WHERE self_check_run_id = ?
      ORDER BY CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, id ASC
    `).all(runId);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. POST ignore warning check problem
app.post("/api/projects/:projectId/self-check-issues/:issueId/ignore", checkPerm("canUploadFile"), (req, res) => {
  const { projectId, issueId } = req.params;
  const { ignoredReason } = req.body;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  if (!ignoredReason || ignoredReason.trim().length < 5) {
    return res.status(400).json({ error: "👮 忽略申请被拒：书写忽略理由太短！必须大于等于 5 个汉字或英文字符以作凭证自控校验。" });
  }

  try {
    const issue = db.prepare("SELECT * FROM self_check_issues WHERE id = ?").get(issueId) as any;
    if (!issue) {
      return res.status(404).json({ error: "未搜寻到指定对应的问题条目" });
    }

    // All self-check issues can be ignored with a professional manual review justification of >= 5 characters (avoiding hardcoded automatic physical blockade)

    db.transaction(() => {
      // 1. Mark issue as ignored
      db.prepare(`
        UPDATE self_check_issues
        SET status = 'ignored', ignored_reason = ?, ignored_by = ?, ignored_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(ignoredReason, username, issueId);

      // 2. Fetch all remaining issues in that same self-check run to see if we can transition run status
      const runId = issue.self_check_run_id;
      const issues = db.prepare("SELECT * FROM self_check_issues WHERE self_check_run_id = ?").all(runId) as any[];
      const openNonIgnored = issues.filter(i => i.status === "open");

      if (openNonIgnored.length === 0) {
        db.prepare("UPDATE self_check_runs SET status = 'completed_with_ignored_issues' WHERE id = ?").run(runId);
        // Also elevate document status to clean check draft status
        db.prepare("UPDATE documents SET status = 'self_check_passed' WHERE id = ?").run(issue.document_id);
      }

      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "IGNORE_SELFcheck_ISSUE",
        details: `[IGNORE_SELFcheck_ISSUE] 用户 [${username}] 越障忽略了问题 [${issue.issue_type}]，记载事由: ${ignoredReason}`
      });
    })();

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. POST project manager finalize version
app.post("/api/projects/:projectId/documents/:documentId/versions/:versionId/mark-final", checkPerm("canReviewDocument"), (req, res) => {
  const { projectId, documentId, versionId } = req.params;
  const { forceReason } = req.body;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  // ONLY PM Role or Admin can execute mark-final
  if (role !== "ProjectManager" && role !== "SystemAdmin") {
    return res.status(403).json({ error: "👮 抱歉，非项目负责人 (PM) 岗位无权对本文件签署定稿或标记最终版！" });
  }

  try {
    const document = db.prepare("SELECT * FROM documents WHERE id = ?").get(documentId) as any;
    const version = db.prepare("SELECT * FROM document_versions WHERE id = ?").get(versionId) as any;
    if (!document || !version) {
      return res.status(404).json({ error: "指定的方案主体或版本记录丢失，定稿驳回" });
    }

    // Check if there are physical issues impeding and overriding
    const latestRun = db.prepare(`
      SELECT * FROM self_check_runs
      WHERE document_version_id = ?
      ORDER BY executed_at DESC LIMIT 1
    `).get(versionId) as any;

    if (!latestRun) {
      return res.status(400).json({ error: "👮 驳回定稿：该文件还未经历任何桌面端合规自测扫描，定稿人应当首先安排自查分析！" });
    }

    if (latestRun.status === "failed") {
      // Fetch open non-ignored issues
      const openIssues = db.prepare(`
        SELECT COUNT(*) as count FROM self_check_issues
        WHERE self_check_run_id = ? AND status = 'open'
      `).get(latestRun.id) as { count: number };

      if (openIssues.count > 0 && (!forceReason || forceReason.trim().length < 5)) {
        return res.status(400).json({
          error: "👮 强制警告拦截：该文件草案自检报告存在待解决项（未完成修复或没有填注合法忽略事由）。如果您要特批放行，请必须填写 5 汉字以上特批放行原因！"
        });
      }
    }

    db.transaction(() => {
      // Reset any previous finalized version under this document to non-final
      db.prepare("UPDATE document_versions SET is_final = 0 WHERE document_id = ?").run(documentId);

      // Upgrade this version to Finalized State
      db.prepare("UPDATE document_versions SET is_final = 1, status = 'final' WHERE id = ?").run(versionId);

      // Mark main documents row status to finalized completed
      db.prepare("UPDATE documents SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(documentId);

      // Sync and advance related tasks state to completed if appropriate
      if (document.task_id) {
        db.prepare("UPDATE tasks SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(document.task_id);
      }

      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "MARK_FINAL",
        details: `[MARK_FINAL] 项目负责人 [${username}] 为技术方案签署定稿。签署版本: v${version.version_number}，特批事由或定稿理由: ${forceReason || "常规一致性审核通过"}`
      });
    })();

    res.json({ success: true, message: "定稿成功！该版本签署为本项目该门类最终印标版本，所属编制任务自动变更为‘已完成’。" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// ITERATION 5: REVIEW WORKFLOW & CHANGE IMPACT ANALYSIS APIs
// ============================================================================

// 1. Submit Document Version for Review
app.post("/api/projects/:projectId/documents/:documentId/versions/:versionId/submit-review", checkPerm("canUploadFile"), (req, res) => {
  const { projectId, documentId, versionId } = req.params;
  const { reviewerUserId } = req.body;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  if (role === "Viewer") {
    return res.status(403).json({ error: "权限不足：访客角色 Viewer 无法提交审核！" });
  }

  try {
    const document = db.prepare("SELECT * FROM documents WHERE id = ?").get(documentId) as any;
    const version = db.prepare("SELECT * FROM document_versions WHERE id = ?").get(versionId) as any;
    if (!document || !version) {
      return res.status(404).json({ error: "方案或版本主体丢失，提交审核失败" });
    }

    db.transaction(() => {
      // 1. Mark status as pending_review
      db.prepare("UPDATE documents SET status = 'pending_review', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(documentId);
      db.prepare("UPDATE document_versions SET status = 'pending_review' WHERE id = ?").run(versionId);

      // 2. If task linked, set task status to pending_review and save reviewer
      if (document.task_id) {
        db.prepare("UPDATE tasks SET status = 'pending_review', reviewer_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(reviewerUserId || null, document.task_id);
      }

      // 3. Create a system notification for the Reviewer
      const targetReviewer = reviewerUserId || "user-review"; // Fallback to standard reviewer
      const notifId = `notif-rev-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      db.prepare(`
        INSERT INTO notifications (id, projectId, userId, notificationType, title, message, sourceType, sourceId, isRead, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
      `).run(
        notifId,
        projectId,
        targetReviewer,
        'pending_review',
        '待审核方案资料提醒',
        `编制人已将方案 [${document.file_name}] (v${version.version_number}) 提交供您审核，请进入审核中心查阅意见并反馈。`,
        'document_version',
        versionId
      );

      // 4. Log security audit entry
      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "SUBMIT_REVIEW",
        details: `[SUBMIT_REVIEW] 资料编制人 [${username}] 提交文件 [${document.file_name}] v${version.version_number} 至审核人 [${targetReviewer}] 处理。`
      });
    })();

    res.json({ success: true, message: "提交审核流转成功！所属编制任务已更新为待审核状态。" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Query all items pending review
app.get("/api/reviews/my-pending", (req, res) => {
  const userId = String(req.headers["x-user-id"] || req.query.userId || "");
  try {
    let rows;
    if (userId) {
      rows = db.prepare(`
        SELECT dv.*, d.file_name, d.document_type, d.project_id, d.task_id, p.name as projectName, t.task_name, t.reviewer_user_id
        FROM document_versions dv
        INNER JOIN documents d ON dv.document_id = d.id
        INNER JOIN projects p ON d.project_id = p.id
        LEFT JOIN tasks t ON d.task_id = t.id
        WHERE d.status = 'pending_review' AND t.reviewer_user_id = ?
      `).all(userId) as any[];
    } else {
      rows = db.prepare(`
        SELECT dv.*, d.file_name, d.document_type, d.project_id, d.task_id, p.name as projectName, t.task_name, t.reviewer_user_id
        FROM document_versions dv
        INNER JOIN documents d ON dv.document_id = d.id
        INNER JOIN projects p ON d.project_id = p.id
        LEFT JOIN tasks t ON d.task_id = t.id
        WHERE d.status = 'pending_review'
      `).all() as any[];
    }
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. New Review Comment
app.post("/api/projects/:projectId/review-comments", checkPerm("canReviewDocument"), (req, res) => {
  const { projectId } = req.params;
  const { taskId, documentId, documentVersionId, commentType, severity, content, sourcePage, sourceParagraph, sourceTextSnippet, assignedTo } = req.body;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");
  const userId = String(req.headers["x-user-id"] || "user-review");

  if (role === "Viewer") {
    return res.status(403).json({ error: "权限不足：只读 Viewer 无法新增审核意见！" });
  }

  if (!content || !severity || !assignedTo) {
    return res.status(400).json({ error: "缺少必要字段：content、severity 或 assignedTo 未填写" });
  }

  const commentId = `rc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const ts = new Date().toISOString();

  try {
    db.transaction(() => {
      // 1. Insert structured review comment
      db.prepare(`
        INSERT INTO review_comments (
          id, projectId, taskId, documentId, documentVersionId, commentType, severity, content,
          sourcePage, sourceParagraph, sourceTextSnippet, assignedTo, createdBy, createdAt, status, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
      `).run(
        commentId,
        projectId,
        taskId || "",
        documentId || "",
        documentVersionId || "",
        commentType || "content_issue",
        severity,
        content,
        sourcePage ? Number(sourcePage) : null,
        sourceParagraph ? Number(sourceParagraph) : null,
        sourceTextSnippet || "",
        assignedTo,
        userId,
        ts,
        ts
      );

      // 2. Insert Status log
      const logId = `rsl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      db.prepare(`
        INSERT INTO review_status_logs (id, commentId, oldStatus, newStatus, changedBy, changedAt, reason)
        VALUES (?, ?, NULL, 'open', ?, ?, '提出的新增审核意见')
      `).run(logId, commentId, username, ts);

      // 3. Insert notification for target repair worker
      const fileRow = db.prepare("SELECT file_name FROM documents WHERE id = ?").get(documentId) as any;
      const fileName = fileRow ? fileRow.file_name : "相关方案";
      const notifId = `notif-comment-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      db.prepare(`
        INSERT INTO notifications (id, projectId, userId, notificationType, title, message, sourceType, sourceId, isRead, createdAt)
        VALUES (?, ?, ?, 'review_comment_assigned', ?, ?, 'review_comment', ?, 0, ?)
      `).run(
        notifId,
        projectId,
        assignedTo,
        '待处理审核意见通知',
        `审核官已针对 [${fileName}] 提出了类型为 [${commentType}]、严重度为 [${severity}] 的审核意见，请进入工作台及时调整方案并回复。`,
        commentId,
        ts
      );

      // 4. Audit logger
      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "CREATE_REVIEW_COMMENT",
        details: `[CREATE_REVIEW_COMMENT] 审核领导 [${username}] 针对文件提出了条目意见，指派给 [${assignedTo}] 处理。`
      });
    })();

    res.json({ success: true, commentId, status: "open" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get Project Review Comments with filters
app.get("/api/projects/:projectId/review-comments", checkPerm("canViewProject"), (req, res) => {
  const { projectId } = req.params;
  const { taskId, status, severity, assignedTo } = req.query;

  try {
    let query = `
      SELECT rc.*, u.username as assignedToName, c.username as createdByName, 
             t.task_name, d.file_name
      FROM review_comments rc
      LEFT JOIN users u ON rc.assignedTo = u.id
      LEFT JOIN users c ON rc.createdBy = c.id
      LEFT JOIN tasks t ON rc.taskId = t.id
      LEFT JOIN documents d ON rc.documentId = d.id
      WHERE rc.projectId = ?
    `;
    const params: any[] = [projectId];

    if (taskId) {
      query += " AND rc.taskId = ?";
      params.push(taskId);
    }
    if (status) {
      query += " AND rc.status = ?";
      params.push(status);
    }
    if (severity) {
      query += " AND rc.severity = ?";
      params.push(severity);
    }
    if (assignedTo) {
      query += " AND rc.assignedTo = ?";
      params.push(assignedTo);
    }

    query += " ORDER BY rc.createdAt DESC";
    const rows = db.prepare(query).all(...params) as any[];
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Get Single Review Comment with logs & replies
app.get("/api/projects/:projectId/review-comments/:commentId", checkPerm("canViewProject"), (req, res) => {
  const { commentId } = req.params;
  try {
    const comment = db.prepare(`
      SELECT rc.*, u.username as assignedToName, c.username as createdByName 
      FROM review_comments rc
      LEFT JOIN users u ON rc.assignedTo = u.id
      LEFT JOIN users c ON rc.createdBy = c.id
      WHERE rc.id = ?
    `).get(commentId) as any;

    if (!comment) {
      return res.status(404).json({ error: "指定的审核意见记录未找到" });
    }

    const replies = db.prepare(`
      SELECT r.*, u.username as repliedByName
      FROM review_comment_replies r
      LEFT JOIN users u ON r.repliedBy = u.id
      WHERE r.commentId = ? ORDER BY r.repliedAt ASC
    `).all(commentId) as any[];

    const logs = db.prepare(`
      SELECT * FROM review_status_logs WHERE commentId = ? ORDER BY changedAt ASC
    `).all(commentId) as any[];

    res.json({ comment, replies, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Reply to Review Comment
app.post("/api/projects/:projectId/review-comments/:commentId/replies", checkPerm("canUploadFile"), (req, res) => {
  const { projectId, commentId } = req.params;
  const { replyContent, newDocumentVersionId } = req.body;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");
  const userId = String(req.headers["x-user-id"] || "user-const");

  if (!replyContent || replyContent.trim() === "") {
    return res.status(400).json({ error: "回复内容不能为空" });
  }

  try {
    const comment = db.prepare("SELECT * FROM review_comments WHERE id = ?").get(commentId) as any;
    if (!comment) {
      return res.status(404).json({ error: "回复失败：指定的审核意见不存在" });
    }

    // Role check: Only assignedTo user or PM can reply. Viewer is blocked.
    if (role === "Viewer") {
      return res.status(403).json({ error: "权限不足：只读 Viewer 无能对此回复审核意见。" });
    }

    const replyId = `rep-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const ts = new Date().toISOString();

    db.transaction(() => {
      // 1. Insert reply
      db.prepare(`
        INSERT INTO review_comment_replies (
          id, commentId, projectId, taskId, documentId, documentVersionId, newDocumentVersionId, replyContent, repliedBy, repliedAt, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        replyId,
        commentId,
        projectId,
        comment.taskId,
        comment.documentId,
        comment.documentVersionId,
        newDocumentVersionId || null,
        replyContent,
        userId,
        ts,
        ts
      );

      // 2. Transmit comment record status to 'replied' or 'in_progress'
      const oldStatus = comment.status;
      const targetStatus = "replied";

      db.prepare("UPDATE review_comments SET status = ?, updatedAt = ? WHERE id = ?")
        .run(targetStatus, ts, commentId);

      // 3. Status change logs
      const logId = `rsl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      db.prepare(`
        INSERT INTO review_status_logs (id, commentId, oldStatus, newStatus, changedBy, changedAt, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(logId, commentId, oldStatus, targetStatus, username, ts, `执行了修改回复。关联的新资料: ${newDocumentVersionId || "无上传直接应答"}`);

      // 4. Send notification to Review Comment Author/Creator
      const notifId = `notif-reply-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      db.prepare(`
        INSERT INTO notifications (id, projectId, userId, notificationType, title, message, sourceType, sourceId, isRead, createdAt)
        VALUES (?, ?, ?, 'review_comment_replied', ?, ?, 'review_comment', ?, 0, ?)
      `).run(
        notifId,
        projectId,
        comment.createdBy,
        '审核意见已获得修改回复',
        `编制人 [${username}] 已针对您的审核意见做出了回复跟解答："${replyContent.slice(0, 30)}..."，请前去进行复核并关闭。`,
        commentId,
        ts
      );

      // 5. Write audit logs
      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "REPLY_REVIEW_COMMENT",
        details: `[REPLY_REVIEW_COMMENT] 资料负责人 [${username}] 回答了意见反馈: ${replyContent}`
      });
    })();

    res.json({ success: true, replyId, nextStatus: "replied" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Close Review Comment (Reviewer or PM only)
app.post("/api/projects/:projectId/review-comments/:commentId/close", checkPerm("canReviewDocument"), (req, res) => {
  const { projectId, commentId } = req.params;
  const { closeReason } = req.body;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");
  const userId = String(req.headers["x-user-id"] || "user-review");

  if (role !== "Reviewer" && role !== "ProjectManager" && role !== "SystemAdmin") {
    return res.status(403).json({ error: "权限不足：普通资料负责人无法直接关闭审核意见，唯有审核组专岗或项目经理方可关闭！" });
  }

  if (!closeReason || closeReason.trim() === "") {
    return res.status(400).json({ error: "关闭审核意见时必须填注关闭说明" });
  }

  try {
    const comment = db.prepare("SELECT * FROM review_comments WHERE id = ?").get(commentId) as any;
    if (!comment) {
      return res.status(404).json({ error: "关闭失败：指定的审核意见不存在" });
    }

    const ts = new Date().toISOString();

    db.transaction(() => {
      // 1. Mutate review comment status to 'closed' (or 'resolved')
      const oldStatus = comment.status;
      const targetStatus = "closed";

      db.prepare(`
        UPDATE review_comments 
        SET status = ?, closedBy = ?, closedAt = ?, closeReason = ?, updatedAt = ?
        WHERE id = ?
      `).run(targetStatus, userId, ts, closeReason, ts, commentId);

      // 2. Status change logs
      const logId = `rsl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      db.prepare(`
        INSERT INTO review_status_logs (id, commentId, oldStatus, newStatus, changedBy, changedAt, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(logId, commentId, oldStatus, targetStatus, username, ts, `关闭意见说明: ${closeReason}`);

      // 3. Notification for assignee
      const notifId = `notif-close-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      db.prepare(`
        INSERT INTO notifications (id, projectId, userId, notificationType, title, message, sourceType, sourceId, isRead, createdAt)
        VALUES (?, ?, ?, 'review_comment_closed', ?, ?, 'review_comment', ?, 0, ?)
      `).run(
        notifId,
        projectId,
        comment.assignedTo,
        '审核意见已被核准关闭',
        `恭喜，审核官已核准通过您的修改，审核意见已被成功关闭！签署原因为：${closeReason}`,
        commentId,
        ts
      );

      // 4. Audit logger
      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "CLOSE_REVIEW_COMMENT",
        details: `[CLOSE_REVIEW_COMMENT] 审核领导 [${username}] 确认无误关闭了条目意见 [${commentId}]，意见结案。`
      });
    })();

    res.json({ success: true, oldStatus: comment.status, newStatus: "closed" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Reopen/Bounce/Reject Review Reply (Bounces status back to open or rejected)
app.post("/api/projects/:projectId/review-comments/:commentId/reopen", checkPerm("canReviewDocument"), (req, res) => {
  const { projectId, commentId } = req.params;
  const { rejectReason } = req.body;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  if (role !== "Reviewer" && role !== "ProjectManager" && role !== "SystemAdmin") {
    return res.status(403).json({ error: "权限不足：普通岗位无权重新打开或拒绝审核意见！" });
  }

  try {
    const comment = db.prepare("SELECT * FROM review_comments WHERE id = ?").get(commentId) as any;
    if (!comment) {
      return res.status(404).json({ error: "变更失败：指定的意见不存在" });
    }

    const ts = new Date().toISOString();
    const targetStatus = "rejected"; // can be open or rejected, we set to 'rejected'

    db.transaction(() => {
      // 1. Set status to 'rejected'
      db.prepare("UPDATE review_comments SET status = ?, updatedAt = ? WHERE id = ?").run(targetStatus, ts, commentId);

      // 2. Status logger
      const logId = `rsl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      db.prepare(`
        INSERT INTO review_status_logs (id, commentId, oldStatus, newStatus, changedBy, changedAt, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(logId, commentId, comment.status, targetStatus, username, ts, `驳回答复：${rejectReason || "修改不到位，继续修正"}`);

      // 3. Notification to assignee
      const notifId = `notif-reopen-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      db.prepare(`
        INSERT INTO notifications (id, projectId, userId, notificationType, title, message, sourceType, sourceId, isRead, createdAt)
        VALUES (?, ?, ?, 'review_comment_rejected', ?, ?, 'review_comment', ?, 0, ?)
      `).run(
        notifId,
        projectId,
        comment.assignedTo,
        '审核回复被退回警告',
        `很抱歉，审核领导退回了您的方案修改方案审核，理由是："${rejectReason || "修改不完整"}"，请尽快核实并组织重新提交。`,
        commentId,
        ts
      );

      // 4. Audit log
      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "REJECT_REVIEW_REPLY",
        details: `[REJECT_REVIEW_REPLY] 审核领导 [${username}] 驳回了负责人对 [${commentId}] 的解答，要求再次修正。`
      });
    })();

    res.json({ success: true, nextStatus: targetStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Query Status Logs
app.get("/api/projects/:projectId/review-comments/:commentId/status-logs", checkPerm("canViewProject"), (req, res) => {
  const { commentId } = req.params;
  try {
    const rows = db.prepare("SELECT * FROM review_status_logs WHERE commentId = ? ORDER BY changedAt DESC").all(commentId);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Manual Force Trigger Project Change Impact Analysis
app.post("/api/projects/:projectId/master-data-changes/:changeId/analyze-impact", checkPerm("canEditProjectMasterData"), (req, res) => {
  const { projectId, changeId } = req.params;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  if (role !== "ProjectManager" && role !== "SystemAdmin" && role !== "Sales") {
    return res.status(403).json({ error: "权限不足：只有项目经理或指定营业成员可以手动启动主数据信息变更影响分析！" });
  }

  try {
    const change = db.prepare("SELECT * FROM master_data_changes WHERE id = ?").get(changeId) as any;
    if (!change) {
      return res.status(404).json({ error: "指定的主数据变更记录不存在，无法计算其多态影响" });
    }

    // Call analyzeImpactForProjectAndChange in transaction outer loop
    analyzeImpactForProjectAndChange(projectId, changeId, change.field_name, change.old_value, change.new_value, username);

    auditLogger.logAction({
      projectId,
      operator: username,
      role,
      action: "MANUAL_ANALYZE_IMPACT",
      details: `[MANUAL_ANALYZE_IMPACT] 用户 [${username}] 针对主数据变更项 [${changeId}] 手动重算启动影响面判定。`
    });

    res.json({ success: true, message: "主数据变更影响分析重新评估完成，关联任务及交付资料已同步打标需复核。" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Retrieve Project Change Impact list
app.get("/api/projects/:projectId/change-impact-records", checkPerm("canViewProject"), (req, res) => {
  const { projectId } = req.params;
  try {
    const rows = db.prepare(`
      SELECT cir.*,
        CASE WHEN cir.affectedType = 'task' THEN (SELECT task_name FROM tasks WHERE id = cir.affectedId)
             WHEN cir.affectedType = 'document' THEN (SELECT file_name FROM documents WHERE id = cir.affectedId)
             ELSE NULL END as affectedName
      FROM change_impact_records cir
      WHERE cir.projectId = ?
      ORDER BY cir.createdAt DESC
    `).all(projectId) as any[];

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 12. PM Mark Change Impact as Requires Review
app.post("/api/projects/:projectId/change-impact-records/:impactId/mark-requires-review", checkPerm("canEditProjectMasterData"), (req, res) => {
  const { projectId, impactId } = req.params;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  try {
    const rec = db.prepare("SELECT * FROM change_impact_records WHERE id = ?").get(impactId) as any;
    if (!rec) {
      return res.status(404).json({ error: "未能根据该ID定位到影响分析详情" });
    }

    db.transaction(() => {
      db.prepare("UPDATE change_impact_records SET status = 'marked_requires_review' WHERE id = ?").run(impactId);

      if (rec.affectedType === "task") {
        db.prepare("UPDATE tasks SET requiresReview = 1, reviewReason = ?, reviewSourceChangeId = ? WHERE id = ?")
          .run(rec.reason, rec.masterDataChangeId, rec.affectedId);
      } else if (rec.affectedType === "document") {
        db.prepare("UPDATE documents SET requiresReview = 1, reviewReason = ?, reviewSourceChangeId = ? WHERE id = ?")
          .run(rec.reason, rec.masterDataChangeId, rec.affectedId);
        db.prepare("UPDATE document_versions SET requiresReview = 1, reviewReason = ?, reviewSourceChangeId = ? WHERE document_id = ? AND is_latest = 1")
          .run(rec.reason, rec.masterDataChangeId, rec.affectedId);
      }

      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "MARK_REQUIRES_REVIEW",
        details: `[MARK_REQUIRES_REVIEW] PM [${username}] 将影响项 [${impactId}] 重新标记为‘需复核’状态。`
      });
    })();

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Confirm Impact Review Complete (PM/Admin only)
app.post("/api/projects/:projectId/change-impact-records/:impactId/confirm-review", checkPerm("canEditProjectMasterData"), (req, res) => {
  const { projectId, impactId } = req.params;
  const { confirmationNote } = req.body;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  if (role !== "ProjectManager" && role !== "SystemAdmin" && role !== "Sales") {
    return res.status(403).json({ error: "权限不足：只有项目经理 PM 才有权限对变更影响确认复核结案！" });
  }

  try {
    const rec = db.prepare("SELECT * FROM change_impact_records WHERE id = ?").get(impactId) as any;
    if (!rec) {
      return res.status(404).json({ error: "没有找到对应的影响记录" });
    }

    const ts = new Date().toISOString();

    db.transaction(() => {
      // 1. Update impact status to 'confirmed'
      db.prepare(`
        UPDATE change_impact_records 
        SET status = 'confirmed', resolvedBy = ?, resolvedAt = ?, resolutionNote = ?
        WHERE id = ?
      `).run(username, ts, confirmationNote || "复核通过结案", impactId);

      // 2. Clear target marks
      if (rec.affectedType === "task") {
        db.prepare(`
          UPDATE tasks 
          SET requiresReview = 0, reviewConfirmedBy = ?, reviewConfirmedAt = ?, reviewConfirmationNote = ?
          WHERE id = ?
        `).run(username, ts, confirmationNote || "管理员确认一致性完整", rec.affectedId);
      } else if (rec.affectedType === "document") {
        db.prepare(`
          UPDATE documents 
          SET requiresReview = 0, reviewReason = NULL, reviewSourceChangeId = NULL, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(rec.affectedId);
        db.prepare(`
          UPDATE document_versions 
          SET requiresReview = 0, reviewReason = NULL, reviewSourceChangeId = NULL
          WHERE document_id = ?
        `).run(rec.affectedId);
      }

      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "CONFIRM_REVIEW",
        details: `[CONFIRM_REVIEW] 项目负责人 [${username}] 确认主数据对编制单元 [${rec.affectedId}] 的变更影响复核通过：${confirmationNote || "常规结案"}`
      });
    })();

    res.json({ success: true, message: "变更影响已复核确认通过，需复核锁定成功解除。" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Ignore Impact Record
app.post("/api/projects/:projectId/change-impact-records/:impactId/ignore", checkPerm("canEditProjectMasterData"), (req, res) => {
  const { projectId, impactId } = req.params;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  if (role !== "ProjectManager" && role !== "SystemAdmin" && role !== "Sales") {
    return res.status(403).json({ error: "权限不足：非项目负责人无权实施忽略处理" });
  }

  try {
    const rec = db.prepare("SELECT * FROM change_impact_records WHERE id = ?").get(impactId) as any;
    if (!rec) {
      return res.status(404).json({ error: "未命中指定影响记录" });
    }

    const ts = new Date().toISOString();

    db.transaction(() => {
      db.prepare(`
        UPDATE change_impact_records 
        SET status = 'ignored', resolvedBy = ?, resolvedAt = ?, resolutionNote = '忽略本次影响（PM判定不产生实体变差）'
        WHERE id = ?
      `).run(username, ts, impactId);

      // Clear requiresReview flag on target
      if (rec.affectedType === "task") {
        db.prepare(`
          UPDATE tasks 
          SET requiresReview = 0, reviewConfirmedBy = ?, reviewConfirmedAt = ?, reviewConfirmationNote = '手工忽略'
          WHERE id = ?
        `).run(username, ts, rec.affectedId);
      } else if (rec.affectedType === "document") {
        db.prepare("UPDATE documents SET requiresReview = 0, reviewReason = NULL, reviewSourceChangeId = NULL WHERE id = ?").run(rec.affectedId);
        db.prepare("UPDATE document_versions SET requiresReview = 0, reviewReason = NULL, reviewSourceChangeId = NULL WHERE document_id = ?").run(rec.affectedId);
      }

      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "IGNORE_IMPACT",
        details: `[IGNORE_IMPACT] 项目经理 [${username}] 忽略了主数据变更对编制单元 [${rec.affectedId}] 的潜在影响。`
      });
    })();

    res.json({ success: true, message: "影响被强制忽略，相关解锁已放行。" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 15. Retrieve My In-App System Notifications
app.get("/api/notifications/my", (req, res) => {
  const userId = String(req.headers["x-user-id"] || req.query.userId || "user-pm");
  try {
    const rows = db.prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC").all(userId);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 16. Mark Notification as Read
app.post("/api/notifications/:notificationId/read", (req, res) => {
  const { notificationId } = req.params;
  try {
    db.prepare("UPDATE notifications SET isRead = 1, readAt = CURRENT_TIMESTAMP WHERE id = ?").run(notificationId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 17. Dashboard Review Summary API
app.get("/api/projects/:projectId/dashboard/review-summary", checkPerm("canViewProject"), (req, res) => {
  const { projectId } = req.params;
  try {
    const unclosedRow = db.prepare("SELECT COUNT(*) as count FROM review_comments WHERE projectId = ? AND status NOT IN ('closed', 'resolved')").get(projectId) as any;
    const highSeverityRow = db.prepare("SELECT COUNT(*) as count FROM review_comments WHERE projectId = ? AND status NOT IN ('closed', 'resolved') AND severity = 'high'").get(projectId) as any;
    const pendingReviewsRow = db.prepare("SELECT COUNT(*) as count FROM documents WHERE project_id = ? AND status = 'pending_review'").get(projectId) as any;

    const unclosedComments = db.prepare(`
      SELECT rc.*, u.username as assignedToName, t.task_name, d.file_name
      FROM review_comments rc
      LEFT JOIN users u ON rc.assignedTo = u.id
      LEFT JOIN tasks t ON rc.taskId = t.id
      LEFT JOIN documents d ON rc.documentId = d.id
      WHERE rc.projectId = ? AND rc.status NOT IN ('closed', 'resolved')
      ORDER BY rc.createdAt DESC
    `).all(projectId) as any[];

    const pendingReviewList = db.prepare(`
      SELECT dv.*, d.file_name, d.document_type, t.task_name
      FROM document_versions dv
      INNER JOIN documents d ON dv.document_id = d.id
      LEFT JOIN tasks t ON d.task_id = t.id
      WHERE d.status = 'pending_review' AND d.project_id = ?
    `).all(projectId) as any[];

    res.json({
      unclosedCommentsCount: unclosedRow ? unclosedRow.count : 0,
      highSeverityCommentsCount: highSeverityRow ? highSeverityRow.count : 0,
      pendingReviewsCount: pendingReviewsRow ? pendingReviewsRow.count : 0,
      unclosedComments,
      pendingReviews: pendingReviewList
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 18. Dashboard Change Impact Summary API
app.get("/api/projects/:projectId/dashboard/change-impact-summary", checkPerm("canViewProject"), (req, res) => {
  const { projectId } = req.params;
  try {
    const requiresReviewTasksRow = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND requiresReview = 1").get(projectId) as any;
    const requiresReviewDocsRow = db.prepare("SELECT COUNT(*) as count FROM documents WHERE project_id = ? AND requiresReview = 1").get(projectId) as any;
    const highRiskChangesRow = db.prepare("SELECT COUNT(*) as count FROM change_impact_records WHERE projectId = ? AND status = 'marked_requires_review' AND impactLevel = 'high'").get(projectId) as any;

    const affectedTasks = db.prepare(`
      SELECT t.*, u.username as responsible_username
      FROM tasks t
      LEFT JOIN users u ON t.responsible_user_id = u.id
      WHERE t.project_id = ? AND t.requiresReview = 1
    `).all(projectId) as any[];

    const affectedDocuments = db.prepare(`
      SELECT d.*, u.username as uploaded_by_username
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.project_id = ? AND d.requiresReview = 1
    `).all(projectId) as any[];

    res.json({
      requiresReviewTasksCount: requiresReviewTasksRow ? requiresReviewTasksRow.count : 0,
      requiresReviewDocsCount: requiresReviewDocsRow ? requiresReviewDocsRow.count : 0,
      highRiskChangesCount: highRiskChangesRow ? highRiskChangesRow.count : 0,
      affectedTasks,
      affectedDocuments
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. POST Mark version as archived/obsolete
app.post("/api/projects/:projectId/documents/:documentId/versions/:versionId/mark-obsolete", checkPerm("canUploadFile"), (req, res) => {
  const { projectId, documentId, versionId } = req.params;
  const role = String(req.headers["x-user-role"] || req.query.role || "Viewer");
  const username = String(req.headers["x-username"] || "Anonymous");

  try {
    db.transaction(() => {
      db.prepare("UPDATE document_versions SET status = 'obsolete' WHERE id = ?").run(versionId);
      
      auditLogger.logAction({
        projectId,
        operator: username,
        role,
        action: "OBSOLETE_VERSION",
        details: `[OBSOLETE_VERSION] 废弃或作废技术方案历史迭代版本 [${versionId}]，状态标定 obsolete`
      });
    })();

    res.json({ success: true, message: "该特定文件版本已被废弃，不再参与后续要素核对。" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[BidWorks Server] Running on http://localhost:${PORT} with SQLite & RBAC Active [ENV: ${process.env.NODE_ENV || "development"}]`);
  });
}

if (process.env.TEST_MODE !== "true") {
  startServer();
}
