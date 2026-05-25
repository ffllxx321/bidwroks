import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import pg from "pg";

if (process.argv.some(arg => arg.includes("test"))) {
  process.env.TEST_MODE = "true";
}

const appEnv = process.env.APP_ENV || "development";
const databaseUrl = process.env.DATABASE_URL || "";
const isPostgres = databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://");

// Determine database tiering strategy
if (appEnv === "pilot" || appEnv === "production") {
  if (!isPostgres) {
    const errorMsg = "启动失败：试点和生产环境必须使用 PostgreSQL，请检查 DATABASE_URL。";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
} else {
  // development
  if (!isPostgres) {
    console.log("[DB SETUP] 当前为 development 环境，正在使用 SQLite 作为本地开发数据库。");
  }
}

const dbPath = path.resolve(process.cwd(), "bidworks.sqlite");
const db = new Database(dbPath);

console.log(`[DB SETUP] Connected to SQLite database at: ${dbPath}`);

export let pgPool: pg.Pool | null = null;

if (isPostgres) {
  console.log(`[DB SETUP] PostgreSQL configured as production target database via: ${databaseUrl}`);
  try {
    pgPool = new pg.Pool({
      connectionString: databaseUrl,
    });
    // Validate connection asynchronously to avoid startup blocking in dev
    pgPool.query("SELECT 1").then(() => {
      console.log("[DB SETUP] PostgreSQL connection verified successfully for MVP pilot.");
    }).catch((err) => {
      if (appEnv === "pilot" || appEnv === "production") {
        console.error("[DB SETUP] PostgreSQL connection failed at runtime. Fallback to SQLite is prohibited in pilot/production.", err.message);
        throw new Error(`启动失败：试点和生产环境必须使用 PostgreSQL，请检查 DATABASE_URL。连接失败: ${err.message}`);
      } else {
        console.warn("[DB SETUP] PostgreSQL connection failed at runtime. Fallback to SQLite is active.", err.message);
      }
    });
  } catch (err: any) {
    console.error("[DB SETUP] Failed to create PostgreSQL pool.", err.message);
    if (appEnv === "pilot" || appEnv === "production") {
      throw new Error(`启动失败：试点和生产环境必须使用 PostgreSQL，请检查 DATABASE_URL。Pool异常: ${err.message}`);
    }
  }
}

// Run migrations on startup
export function initDb() {
  const migrationPath = path.resolve(process.cwd(), "migrations/202605200000_init_schema.sql");
  if (fs.existsSync(migrationPath)) {
    console.log(`[DB SETUP] Executing migrations from: ${migrationPath}`);
    const sql = fs.readFileSync(migrationPath, "utf-8");
    db.exec(sql);
    console.log("[DB SETUP] Migrations executed successfully.");
  } else {
    console.warn(`[DB SETUP] Migration file not found at: ${migrationPath}`);
  }

  // Seed default simulated users if not present to comply with ForeignKey constraints in project_members
  const existingUsersCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  if (existingUsersCount.count === 0) {
    console.log("[DB SETUP] Seeding mock simulated users...");
    const insertUser = db.prepare("INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)");
    const mockUsersList = [
      { id: "user-pm", name: "李四 (项目负责人)", email: "pm_lisi@example.com" },
      { id: "user-sales", name: "张三 (营业官)", email: "sales_zhang@example.com" },
      { id: "user-const", name: "陈七 (施工总工)", email: "const_chen@example.com" },
      { id: "user-cost", name: "赵六 (概算负责人)", email: "cost_zhao@example.com" },
      { id: "user-review", name: "钱八 (总监审核官)", email: "reviewer_qian@example.com" },
      { id: "user-doc", name: "周十 (资料汇总员)", email: "doc_zhou@example.com" },
      { id: "user-created", name: "录入人员 (Created)", email: "created_user@example.com" }
    ];
    for (const u of mockUsersList) {
      insertUser.run(u.id, u.name, u.email, "mock_password_hash", new Date().toISOString());
    }
  }

  // Seed default roles if not present
  const existingRolesCount = db.prepare("SELECT COUNT(*) as count FROM roles").get() as { count: number };
  if (existingRolesCount.count === 0) {
    console.log("[DB SETUP] Seeding roles...");
    const roles = [
      { id: "r1", name: "SystemAdmin", desc: "IT/系统管理员" },
      { id: "r2", name: "ProjectManager", desc: "项目负责人 (李四)" },
      { id: "r3", name: "Sales", desc: "营业专员/商务 (张三)" },
      { id: "r4", name: "Design", desc: "设计负责人 (王五)" },
      { id: "r5", name: "Cost", desc: "概算负责人 (赵六)" },
      { id: "r6", name: "Pricing", desc: "报价专员" },
      { id: "r7", name: "Construction", desc: "施工技术总工 (陈七)" },
      { id: "r8", name: "VECD", desc: "VECD深化专家" },
      { id: "r9", name: "Reviewer", desc: "审核领导 (钱八)" },
      { id: "r10", name: "DocumentCoordinator", desc: "资料汇总归档员 (周十)" },
      { id: "r11", name: "Viewer", desc: "只能查看的访客" },
    ];

    const insertRole = db.prepare("INSERT INTO roles (id, role_name, description) VALUES (?, ?, ?)");
    for (const r of roles) {
      insertRole.run(r.id, r.name, r.desc);
    }
  }

  // Seed default sensitive dictionary if not present
  const existingSensitiveCount = db.prepare("SELECT COUNT(*) as count FROM sensitive_black_dictionary").get() as { count: number };
  if (existingSensitiveCount.count === 0) {
    console.log("[DB SETUP] Seeding sensitive black dictionary...");
    const insertSensitive = db.prepare("INSERT INTO sensitive_black_dictionary (id, sensitive_word, replacement_hint) VALUES (?, ?, ?)");
    const sensitiveWords = [
      { id: "sens-1", word: "徐汇", hint: "替换为实际项目所在区" },
      { id: "sens-2", word: "张江", hint: "替换为合适的高新技术区名" },
      { id: "sens-3", word: "大同", hint: "替换为真实承包方或合作企业名" },
      { id: "sens-4", word: "XX项目", hint: "请填写完整项目名称" },
      { id: "sens-5", word: "某某项目", hint: "请填写完整项目名称" },
      { id: "sens-6", word: "上一项目名称", hint: "请删除上一项目残余字句" },
      { id: "sens-7", word: "样板项目", hint: "请替换为正式项目名" },
      { id: "sens-8", word: "测试项目", hint: "请替换为正式项目名" }
    ];
    for (const sw of sensitiveWords) {
      insertSensitive.run(sw.id, sw.word, sw.hint);
    }
  }

  // Seed default test projects and master data
  const existingProjectsCount = db.prepare("SELECT COUNT(*) as count FROM projects").get() as { count: number };
  if (existingProjectsCount.count === 0) {
    console.log("[DB SETUP] Seeding default projects and master data...");

    const insertProject = db.prepare(
      "INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    );
    const insertMasterData = db.prepare(`
      INSERT INTO project_master_data (
        project_id, project_name, client_name, project_address, building_type,
        gross_floor_area_value, gross_floor_area_unit,
        total_duration_value, total_duration_unit,
        bid_closing_date, clarification_due, site_visit_date,
        tender_scope, construct_scope, design_scope, payment_terms,
        bim_requirements, green_buildings, safety_level, quality_goal, vecd_constraints,
        updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?
      )
    `);

    const proj1Id = "proj-001";
    const proj2Id = "proj-002";
    const ts = new Date().toISOString();

    // Project 1
    insertProject.run(proj1Id, "上海青浦日资制造企业研发及生产基地项目", "投标进行中", ts, ts);
    insertMasterData.run(
      proj1Id,
      "上海青浦日资制造企业研发及生产基地项目",
      "某知名日资微电子智能制造有限会社",
      "上海市青浦区工业园区香花桥路",
      "研发办公楼（混凝土）、精密厂房（钢结构）与配套辅助用房",
      85000,
      "㎡",
      400,
      "日历天",
      "2026-07-15",
      "2026-06-28",
      "2026-06-24",
      "全套土建、钢结构、多功能精密机电（含无尘室）、高端外立面幕墙、园林临设配套等施工总承包。",
      "含基础工程、上部混凝土结构主体、精密生产厂房钢结构网架安装、无尘车间、特殊气体配给与厂区市政配套等。",
      "深化设计包，含施工深化节点、钢网架优化设计、BIM深化模型配合等。",
      "按月进度申报，核定支付完成值的70%，主体结构封顶支付至75%，竣工验收付至85%",
      "提供 LOD400 精度的全过程 BIM 实体模型，包括管线综合碰撞、运维深化指标归集。",
      "设计施工必须严格执行二星级以上绿色建筑专项环保标准，限制高耗能机械进场。",
      "创上海市‘白玉兰’质量及安全文明示范标段，对防尘防噪及施工资源利用有极严苛要求。",
      "上海市优质结构奖、安全生产标准化样板工地。",
      "提供不少于3项总造价不低于2%的减低成本（VECD）优化提案，重点针对钢结构梁及桩基。",
      ts
    );

    // Project 2
    insertProject.run(proj2Id, "常州晶元光电精密洁净工业房扩建案", "待确认主数据", ts, ts);
    insertMasterData.run(
      proj2Id,
      "常州晶元光电精密洁净工业房扩建案",
      "晶元半导体股份有限公司",
      "江苏省常州市新北区电子工业园区",
      "新建厂房及辅助无尘净化间（钢结构）",
      120000,
      "㎡",
      450,
      "日历天",
      "2026-08-10",
      "2026-07-20",
      "2026-07-15",
      "常州新北生产区主干钢网架厂房扩建、机电净化及暖通调试包。",
      "本期主厂房打桩、基础环梁及上部特制钢混承托柱组全流程技术履约。",
      "机房管路流体压力分析及荷载分布应答设计。",
      "设备进场拨付总价款15%，整体自检达标合规归档后并封顶付至60%，尾期审计决算付清。",
      "一般 BIM 管线防撞校核协作。",
      "达到一星级绿色建筑标准设计标准。",
      "常州市标杆示范级工地规范。",
      "创江苏省优质工程类奖项。",
      "无强约束，建议在桩基打设间歇做工效比优化降低1.5%造价。",
      ts
    );

    // Seed project member mappings so default users can query projects
    const insertMember = db.prepare(
      "INSERT INTO project_members (project_id, user_id, role_name) VALUES (?, ?, ?)"
    );
    // Project Managers, Sales, Construction engineers, cost estimators are mapped.
    const mappings = [
      { projectId: "proj-001", userId: "user-pm", role: "ProjectManager" },
      { projectId: "proj-001", userId: "user-sales", role: "Sales" },
      { projectId: "proj-001", userId: "user-const", role: "Construction" },
      { projectId: "proj-001", userId: "user-cost", role: "Cost" },
      { projectId: "proj-001", userId: "user-review", role: "Reviewer" },
      { projectId: "proj-001", userId: "user-doc", role: "DocumentCoordinator" },
      
      { projectId: "proj-002", userId: "user-pm", role: "ProjectManager" },
      { projectId: "proj-002", userId: "user-sales", role: "Sales" },
      { projectId: "proj-002", userId: "user-const", role: "Construction" },
    ];
    for (const m of mappings) {
      insertMember.run(m.projectId, m.userId, m.role);
    }
  }
}

export default db;
