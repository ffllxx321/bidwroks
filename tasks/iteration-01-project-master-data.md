# BidWorks MVP 任务拆分 - 迭代 01：项目空间和主数据 (Project Space & Master Data)

本文件定义 BidWorks MVP 平台最核心的基础能力开发大纲。包括项目的创建、项目单一事实主数据源（MasterData）的字段构建、手动初始化与人工更新和主数据记录足迹变更审计。

---

## 一、迭代目标

说明本迭代要解决什么问题，以及本迭代完成后系统应该具备什么能力：
- 奠定平台的基础设施：构建用户登录、多角色基础权限框架（营业人员、项目负责人、设计人员、概算人员、施工技术人员、审核领导）。
- 实现两个基本的建项闭环：“暂无招标书手工速创项目”与“上传招标书建项（本迭代仅完成前端入口及托管存储，暂不发起后台 AI 解析）”。
- 建立单一真实信息源（Single Source of Truth, SSOT）：完成项目主数据管理页（Master Data Panel），支持核心指标字段的状态管理（已确认、待确认）、来源追溯（引自招标书第几页第几段、或特定用户手动配置），并在人工数据覆写时实时记录于变更历史记录。
- 操作日志防线：任何对主数据的变动必须写入系统审计日志。

---

## 二、功能范围

1. **用户登录与基础角色**：
   - 提供轻量用户登录与 JWT 鉴权。
   - 具备内置的 6 种标准平台角色属性：项目负责人 (Bid Manager)、营业人员 (BD/Commercial)、设计人员 (Architect)、概算人员 (Quantity Surveyor)、施工技术岗 (Tech Specialist)、审核领导 (Reviewer)。
2. **项目列表 & 新建项目**：
   - 项目列表：查看本人归属的投标项目，支持根据项目状态进行过滤。
   - 上传招标书建项入口：前端支持上传 PDF/Docx 文件（点击或拖放），系统将其安全托管在专属存储目录，但本迭代暂不触发 AI 解析。
   - 无招标书手工速创：录入最简必填项，由营业员直接建立空的投标活动。
3. **项目主数据页（Master Data Panel）**：
   - 以高可读两栏或卡片样式展示核心字段：
     - `projectName` (项目名称, 低风险)
     - `clientName` (业主名称, 低风险)
     - `constructionLocation` (建设地点, 中风险)
     - `constructionType` (建筑类型, 中风险)
     - `grossFloorAreaValue` / `grossFloorAreaUnit` (建筑面积数值与单位, 中风险)
     - `bidClosingDate` (投标截止日期, 高风险)
     - `totalDurationValue` / `totalDurationUnit` (总工期数值与单位, 高风险)
     - `safetyCivilianTarget` (安全文明目标, 中风险)
4. **字段状态与来源管理**：
   - 支持字段状态定义：`Confirmed` (已确认)、`Pending` (待确认)。若为空，则在界面上呈虚线标记。
   - 字段来源标记：详细记录每个字段的产生源，例如“王五手动录入于 2026-05-20”。
5. **主数据变更痕迹记录 (MasterDataChangeLog)**：
   - 当人工手动修改、保存核心数据段时，自动在数据库中生成一条变更痕迹记录，记录：修改字段、原值、新值、修改者、修改时间。
6. **基础操作日志**：
   - 全程持久化审计日志流，记录用户登录、项目创建、主数据修改。

---

## 三、不包含内容

1. **招标文件 AI 自动解析与提取**（进入迭代二）。
2. **AI 切片和来源可视化引证、PDF双列对照阅读器**（进入迭代二）。
3. **基于截止日期的后向自动计划倒排排程引擎**（进入迭代三）。
4. **个人极简工作台 (Workbench) 完整版**（本迭代普通专员仅提供基础只读视图，任务列表与审核详情进入迭代三）。
5. **一致性检查、地名未脱敏、特殊招标响应检测**（进入迭代四）。
6. **审核意见关闭与审核意见状态流转、中高风险变更带来的变更影响提醒与需复核状态提醒**（进入迭代五）。
7. **P1/P2/BIM 深度联动、自动报价或投标文件长文本自动拼接吐出**（永不开发范围）。

---

## 四、开发任务清单

| 任务名称 | 任务说明 | 输入 | 输出 | 依赖 | 验收标准 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-1.1: 数据库与脚手架基础模型建立** | 在后端（SQLite）中初始化项目基础模型与角色映射，运行并验证建表脚本 | SQL 脚本，表定义 schema | 物理 SQLite database 文件及初始测试用户数据 | 无 | `projects`, `project_master_data`, `master_data_change_logs` 物理表均已生成且可用 |
| **TSK-1.2: 用户登录鉴权 API 与基础中间件** | 开发后端轻量 Auth Login 控制器及基础校验 JWT / 角色鉴权拦截中间件 | 登录表单 `{ username, password }` | 成功时返回 Token 及角色，失败返回 401 | 无 | 独立测试请求登录接口，成功分发可用身份凭证且带角色字段 |
| **TSK-1.3: 无标书手工建项服务端逻辑** | 编写 `POST /api/projects/manual` 接口，在项目创建后自动向 `project_master_data` 初始化未填字段，其默认属性全置为“待确认” (Pending) | 项目注册表单 JSON | 新建项目物理行 ID，及初始化完毕的主数据关系实体 | TSK-1.1 | 数据库被安全追加，其余中高风险主数据值被默认填为 `0` 或空，且状态为 `Pending` |
| **TSK-1.4: 上传标书建项入口与文件物理托管** | 编写 `POST /api/projects/upload-init` 接口。本迭代中仅上传文件作为入口，建立空项目并将文档物理加密存储在托管路径下，但不调用解析或 AI 服务 | 上传的多媒体 Form 文件 | 返回物理文件落盘路径与托管 ID | TSK-1.1 | 上传测试文件，大底仓成功在对应托管盘下发现该 Docx/PDF 并重命规范格式更名，状态无损 |
| **TSK-1.5: 主数据详情展示与 PUT 修改保存 API** | 开发主数据的 `GET /api/projects/:id/master-data` 获取接口和 `PUT /api/projects/:id/master-data` 人工更改同步保存接口。PUT 接口具有极严的防空越权校验，并捕获字段变动在后台写入 `master_data_change_logs` | 主数据修改表单 | 主数据更新成功，记录最新历史 Trace Log 变更记录 | TSK-1.3 | 用 Postman 修改建筑面积从 85000 至 90000 发生变更，变更记录表中物理多了一行带原老值的记录 |
| **TSK-1.6: 项目列表与手工速建前端界面** | 绘制单页面前端的项目总大盘，并用卡片形式高显，含有速建的悬浮按钮。支持营业员手工填写极简表单，和拖拽上传文件的建项入口展示 | 前端操作，文件拖拽 | 项目卡片列表，上传等待进度条组件 | TSK-1.3, TSK-1.4 | 前端界面良好展示，支持拖入文件即刻上传，和人工录入，无渲染报错 |
| **TSK-1.7: 项目主数据属性编辑器与历史足迹组件** | 在前端对应主数据标签下，做美观、易读的表单编辑行并带有锁定与编辑切换；未填项目标记灰色虚实线表示“待确认”，下方呈列其变历史修改表 | 主数据实体 JSON, 变迁记录 | 主数据表单交互界面，变更历史 Timeline 组件 | TSK-1.5 | 变更时间表完美对照呈现，空白或待定参数一目了然带有悬浮虚框指示 |

---

## 五、前端任务

1. **项目大盘（Project Dashboard List）**：
   - 界面列出该账户名下的总工程。每个卡片标注：项目代称、业主、最新修改天。
   - 点击卡片跳转进入对应的专属信息管理标签。
2. **速创项目复合浮层表单（Modal Dialog）**：
   - **方式一：暂无标书手工速创**。录入必填项：项目名称、业主。
   - **方式二：上传招标书建项入口**。支持文件拖曳（Drag-and-Drop），物理落盘后在前端反馈已完成托管存储，无报错，提示“本案解析待后续AI解析启动”。
3. **主数据指标管理页（Master Data Tab）**：
   - 多维度核心字段编辑器。支持在 `Readonly` 和 `Edit` 间平滑切换。
   - 精细化状态展示：对处于 `Confirmed` 状态的，字样高亮显现；对空白或未填的属于 `Pending` 属性，采用带灰色虚框的指示符，提示“待项目负责人确认”。
   - 侧边或底端内置主数据修改历史足迹时间轴（Timeline），记录修改的操作痕迹。

---

## 六、后端任务

1. **用户多角色骨架鉴权控制（Role-Based Middlewares）**：
   - 后端路由拦截校验。针对营业员或负责人有修改主数据的 `PUT` 权限，其他专员仅授权 `GET` 权限，执行双层阻击越权拦截。
2. **初始化值降级处理机制（Graceful Degradation for Fields）**：
   - 当收到手工创建请求时，自动向 `project_master_data` 初始化所有的核心物理数据行。由于是无标书速建，将建设地点、建筑面积、投标截止、工期、安全等中高风险目标，其确认状态统一设定为 `Pending` (待确认)，值初始化为 `null`。
3. **高密度变更记录与系统审计触发器（Log Triggers）**：
   - PUT 修改事务控制。在覆写数据库的同时，对比并检验前后值差异，一旦变更将 `modifier_id`, `field_key`, `old_value`, `new_value` 集中打包写入 `master_data_change_logs` 备份，并写入控制台物理安全日志。

---

## 七、AI / 文档解析任务

*本迭代不涉及AI/文档解析*。
(重点：招标文件上传仅在前端完成文件加密托管及文件服务器上传，本迭代暂不调用 AI 网关做分析和提取。)

---

## 八、数据表或实体变更

本迭代在 SQLite 内物理建立以下实体表：

```sql
-- 项目大表
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'INIT', -- INIT:立项中, ACTIVE:投标中, SUBMITTED:已提交, ARCHIVED:已归档
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 项目单一事实主数据表
CREATE TABLE project_master_data (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    project_name TEXT,
    client_name TEXT,
    construction_location TEXT, -- 建设地点 (中风险)
    construction_type TEXT,     -- 建筑类型 (中风险)
    gross_floor_area_value REAL,      -- 建筑面积数值 (中风险)
    gross_floor_area_unit TEXT DEFAULT '㎡', -- 建筑面积单位 (中风险)
    bid_closing_date TEXT,      -- 投标截止日期 (高风险)
    total_duration_value INTEGER,     -- 总工期数值 (高风险)
    total_duration_unit TEXT DEFAULT '日历天', -- 总工期单位 (高风险)
    safety_civilian_target TEXT,-- 安全文明目标 (中风险)
    location_status TEXT DEFAULT 'PENDING',  -- CONFIRMED, PENDING
    area_status TEXT DEFAULT 'PENDING',      -- CONFIRMED, PENDING
    date_status TEXT DEFAULT 'PENDING',      -- CONFIRMED, PENDING
    duration_status TEXT DEFAULT 'PENDING',  -- CONFIRMED, PENDING
    location_source TEXT DEFAULT '手动录入',
    area_source TEXT DEFAULT '手动录入',
    date_source TEXT DEFAULT '手动录入',
    duration_source TEXT DEFAULT '手动录入',
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 主数据覆写日志表
CREATE TABLE master_data_change_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    field_key TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    modifier_id TEXT NOT NULL,
    modifier_name TEXT NOT NULL,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 基本操作日志审计表
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 九、接口清单

### 1. 用户基础登录 API
* **方法**：`POST`
* **路径**：`/api/auth/login`
* **参数**：`{ "username": "zhangsan", "password": "password123" }`
* **返回**：`{ "success": true, "token": "jwt-string", "user": { "id": "u1", "username": "zhangsan", "role": "BD" } }`
* **权限**：公共可用
* **日志**：系统记录：`用户张三(BD)成功登录系统`

### 2. 无标书手工建项 API
* **方法**：`POST`
* **路径**：`/api/projects/manual`
* **参数**：`{ "name": "上海青浦基地一标", "clientName": "中设集团" }`
* **返回**：`{ "success": true, "projectId": "p1" }`
* **权限**：营业员 (BD) / 项目负责人 (Bid Manager) 可写入
* **日志**：注册日志：`用户张三新建项目[上海青浦基地一标]`

### 3. 上传标书建项入口 API
* **方法**：`POST`
* **路径**：`/api/projects/upload-init`
* **参数**：Multipart Form 携带文件、项目名称。
* **返回**：`{ "success": true, "projectId": "p2", "fileName": "[项目]_招标书.pdf" }`
* **权限**：仅营业人员/负责人可用
* **日志**：`[FILE_UPLOAD] 用户张三长传招标物理文件完成，托管ID：doc-393294`

### 4. 获取项目主数据 API
* **方法**：`GET`
* **路径**：`/api/projects/:id/master-data`
* **返回**：主数据明细、字段专属状态、以及来源标注。
* **权限**：全登录人员只读，拦截未登录人。
* **日志**：无特殊审计（只读仅统计次数）。

### 5. 人工更改主数据 API
* **方法**：`PUT`
* **路径**：`/api/projects/:id/master-data`
* **参数**：`{ "grossFloorAreaValue": 90000, "grossFloorAreaUnit": "㎡", "areaStatus": "CONFIRMED" }`
* **返回**：`{ "success": true, "data": { ... } }`
* **权限**：仅允许项目负责人或授权营业员。设计、施工等专员调用直接抛回 403。
* **日志**：**审计日志**（必须记）：`[LOG_AUDIT] 用户：李四(BM) 修改了grossFloorAreaValue的主数据：(null -> 90000)`

---

## 十、权限和日志要求

- **多层面角色控制**：
  - 设计人员、概算人员、施工专员无法调用 `PUT /api/projects/:id/master-data` 进行主数据纂改。前端提交键置灰。
  - 项目负责人和营业员对此接口有完全拥有写控制权限。
- **强制持久化审计日志**：
  - 对项目的创建、人工修改并保存主数据这两个动作，强制捕获操作 IP 地址、操作者账号，并生成无法被低阶用户删除的 `audit_logs` 历史备份。
- **敏感范围拦截机制**：
  - 本阶段因不具备 AI 调用，未单独设立 AI 层面可读范围，但在文件在库时在库关系表内设定 `isSensitive == false` 的默认屏蔽状态。

---

## 十一、验收标准

1. **测试登录和权限校验**：使用设计员（王五）和项目负责人（李四）两款账户实验。王五尝试调用保存接口更新建筑面积，系统应返回 403 未授权，并提示警告，前端按钮自动呈现不可点按。李四进行同样操作则可以顺畅落盘并入主数据。
2. **手工建项功能验证**：营业员账户张三登录，在新建项目选择“手工速建”，点击确定。在主数据面板中大面积、总历时天数及安全目标以灰色虚线框框提示 `Pending`（待确认），并且标明 `数据来源: 待初始化输入`，表示该空间顺利激活并隔离。
3. **变更审计入库可查**：人工在键盘输入面积 `90000` 并提交。系统刷新，在其主数据面板正下方的时间痕迹折叠夹中，确切生成带有 `[李四] 在 2026-05-20 将 grossFloorArea 修改为 90000 (原值为: 空)` 的变更足迹行，并在 SQLite 的 `master_data_change_logs` 写入物理记录。

---

## 十二、测试场景

### 场景 1：多角色权限严格阻隔测试
- **测试前置条件**：系统已有初始化测试项目 P1，带有两个账号账号：施工人员（陈七，密码123）、项目负责人（李四，密码123）。
- **操作步骤**：
  1. 打开登录页，使用陈七账号登录，页面提示“施工技术人员登录成功”。
  2. 点击进入 P1 项目，加载主数据详情，页面呈现各项指标。
  3. 尝试点击面积右下角的小铅笔更新建筑面积为 `85000` 并提交保存。
- **预期结果**：
  - 界面限制：前端输入框由于角色不是 BM 营业直接不可编辑，若通过 Postman 绕过前端强制 PUT 发起，后端拦截器检测其 role，返回：`{ "error": "SECURITY_EXCLUSION: 403 Forbidden" }`。

### 场景 2：暂无标书手工建项及字段虚线警告核对
- **测试前置条件**：账号营业张三登录。
- **操作步骤**：
  1. 点击“无标书手工速创项目”按钮，在弹出的轻表单中填入“青浦 BD 速建一标”和“业主中建集团”，其余空白。
  2. 点击一键速创，直接在主控空间生成卡片。
- **预期结果**：
  - 系统成功返回，其子表 `project_master_data` 中该项目的 `location_status` 均为 `PENDING`，页面上地点、面积和工期均呈现带灰色虚线的标牌：“待负责人确认录入”。

### 场景 3：主数据覆写防线与足迹记录器
- **测试前置条件**：账号项目负责人李四已成功登入项目 P1，其中 grossFloorArea 预置为 85000。
- **操作步骤**：
  1. 点击核心修改，在grossFloorArea处将数值清除并打入 `90000` 并标记状态 `Confirmed`。
  2. 点击保存并重新刷新主数据面板。
- **预期结果**：
  - 双栏主数据中 grossFloorArea 虚线框亮起为 Confirmed，消退 Pending。
  - 下方的历史更迭栏目里面成功生成一条时间足迹，标出“变更人：李四”、“旧值：85000”、“新值：90000”，表明变更记录防线无失真捕获。

---

## 十三、风险和注意事项

* **拼字与单位不匹配错误风险**：面积修改若混入了字母可能导致后续自检时无法执行文本比对大小。
  * *处理原则*：在表单校验中粗化 grossFloorArea 为单纯 REAL 实数类型，bidClosingDate 为规定标准的 YYYY-MM-DD 字符串，不容忍带有中文单位混杂存入数据库，防范后续正则引擎崩溃。
* **越权请求安全暴露**：很多情况下开发团队把权限鉴权只做在了前端，后端未拦截。MVP 迭代一开始，必须将 403 后端 Role 拦截器作为硬卡点合入。

---

## 十四、完成定义 Definition of Done

- [ ] **功能完成**：用户登录、手工速创、托管上传入口、主数据面板修改、足迹时间轴全数落地成型。
- [ ] **权限验证完成**：非授权角色王五通过 API 工具直接覆写主数据会被后端 ACL 中间件 100% 拦截并抛出受限错误。
- [ ] **日志验证完成**：每一次修改、登录和上传托管均能在底库及控制台产生明晰的 audit 追踪行。
- [ ] **测试通过**：本迭代三大场景冒烟测试零严重 bug 复现，SQLite 初始化脚本运行无溢出错误。
- [ ] **产品验收通过**：主数据虚线待确认、 confirmed 正常转换形态符合预期。
- [ ] **业务演示完成**：在 iframe 预览大屏里多岗配合实证正常运行。
- [ ] **未完成项已记录**：AI 解析和自动倒排排程逻辑已记录至 Backlog，决不在迭代一的代码库引入任何 AI 接口实现。
