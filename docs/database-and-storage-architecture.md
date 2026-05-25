# BidWorks MVP 数据库、向量与文件存储架构设计
## (Database, Vector & Storage Infrastructure Architecture)

本设计文档旨在阐明 BidWorks MVP 并向生产环境平滑过渡时的持久化技术底座。详细定义了关系事务、高密语义检索、非结构局域网存储及分布式中间件缓存的协同机制，确保涉密数据的高可用、抗并发和安全合规。

---

## 1. 关系型数据库区域：PostgreSQL 实质目标数据库与 SQLite 开发隔离设计 (Relational Engine)

为了让系统安全架构具备极致规范与合规闭环，**PostgreSQL (版本 >= 15)** 是 BidWorks 唯一的试点（pilot）与正式生产环境（production）目标数据库。

**【重要部署与运行限制】**
- **开发与生产绝对隔离**：SQLite 仅允许用于本地开发（development 环境）以方便快速调试和原型验证。
- **取消静默回落机制**：在试点（pilot）和正式生产（production）环境启动时，系统若检测到 `DATABASE_URL` 不是 PostgreSQL 连接（以 `postgres://` 或 `postgresql://` 开头），**必须强制抛出 fatal runtime 错误并拒绝启动服务**，全面排除由于无感静默降级（silent fallback）回落 SQLite 导致的生产数据碎片化、资产脱节风险。
- **底层 ANSI SQL 选型建模**：为了便于跨平台和演示环境快速适配，采用符合 ANSI SQL 规范的标准建模，避免任何由于 SQLite/PostgreSQL 独有方言引起的行为偏离。

### 1.1 核心数据表设计、索引与外链关联关系

```
                       ┌──────────────────────┐
                       │       projects       │
                       └──────────┬───────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│project_masterdata│    │  project_members │    │      tasks       │
└──────────────────┘    └──────────────────┘    └──────────┬───────┘
                                                           │
                                                           ▼
                                                ┌──────────────────┐
                                                │    documents     │
                                                └──────────┬───────┘
                                                           │
                                                           ▼
                                                ┌──────────────────┐
                                                │document_versions │
                                                └──────────┬───────┘
                                                           │
                                        ┌──────────────────┴──────────────────┐
                                        ▼                                     ▼
                               ┌──────────────────┐                  ┌──────────────────┐
                               │ self_check_runs  │                  │ document_chunks  │
                               └────────┬─────────┘                  │ (pgvector Table) │
                                        │                            └──────────────────┘
                                        ▼
                               ┌──────────────────┐
                               │self_check_issues │
                               └──────────────────┘
```

#### Table A. `projects` (项目主表)
- 用于储存项目基础信息与技术规格总括。
```sql
CREATE TABLE projects (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT '投标进行中',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_projects_status ON projects(status);
```

#### Table B. `project_master_data` (项目核心主数据表)
- 用于沉淀专家和 AI 网关验证过的投标技术控制性参数，不提倡“大底”等多维口语化叫法。
```sql
CREATE TABLE project_master_data (
    project_id VARCHAR(50) PRIMARY KEY,
    project_name VARCHAR(255) NOT NULL,
    client_name VARCHAR(255),
    project_address VARCHAR(255),
    building_type VARCHAR(100),
    gross_floor_area_value NUMERIC(15, 2) DEFAULT 0.00,
    gross_floor_area_unit VARCHAR(20) DEFAULT '㎡',
    total_duration_value INT DEFAULT 0,
    total_duration_unit VARCHAR(20) DEFAULT '日历天',
    bid_closing_date VARCHAR(50),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

#### Table C. `project_members` (项目干系人映射表)
- 定义该工程局域网内的组织架构角色。
```sql
CREATE TABLE project_members (
    id SERIAL PRIMARY KEY,
    project_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    role_name VARCHAR(50) NOT NULL, -- ProjectManager, Construction, Sales, Auditor, Viewer 等
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, user_id)
);
CREATE INDEX idx_members_project_user ON project_members(project_id, user_id);
```

#### Table D. `tasks` (任务控制表)
- 支持任务倒排与关键控制性日期锁定阀。
```sql
CREATE TABLE tasks (
    id VARCHAR(50) PRIMARY KEY,
    project_id VARCHAR(50) NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    task_type VARCHAR(50) NOT NULL, -- technical_scheme, pricing_files 等
    status VARCHAR(50) NOT NULL DEFAULT 'not_started',
    responsible_user_id VARCHAR(50),
    reviewer_user_id VARCHAR(50),
    start_date VARCHAR(50),
    due_date VARCHAR(50),
    review_due_date VARCHAR(50),
    is_date_locked INT DEFAULT 0, -- 1为强锁定抗卷
    requirement_link_id VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX idx_tasks_project ON tasks(project_id);
```

#### Table E. `documents` (文档逻辑关联表)
```sql
CREATE TABLE documents (
    id VARCHAR(50) PRIMARY KEY,
    project_id VARCHAR(50) NOT NULL,
    task_id VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    is_sensitive INT DEFAULT 0, -- 1为敏感级文件
    allow_ai_read INT DEFAULT 0, -- 1允许 AI 向量与自检
    uploaded_by VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    current_version_id VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
```

#### Table F. `document_versions` (文件版本控制物理表)
- `storage_path` 严格规置磁盘/网关映射，实现“多态管理，不覆盖”，历史可保留自检审计追溯。
```sql
CREATE TABLE document_versions (
    id VARCHAR(50) PRIMARY KEY,
    document_id VARCHAR(50) NOT NULL,
    version_number INT NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    file_size INT DEFAULT 0,
    file_hash VARCHAR(100),
    is_latest INT DEFAULT 1, -- 1代表最新
    is_final INT DEFAULT 0,  -- 1 代表签发完成定稿版
    status VARCHAR(50) NOT NULL DEFAULT 'uploaded',
    uploaded_by VARCHAR(50) NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);
CREATE INDEX idx_versions_doc_latest ON document_versions(document_id, is_latest);
```

#### Table G. `self_check_runs` (自检运行历史主表)
```sql
CREATE TABLE self_check_runs (
    id VARCHAR(50) PRIMARY KEY,
    project_id VARCHAR(50) NOT NULL,
    task_id VARCHAR(50) NOT NULL,
    document_id VARCHAR(50) NOT NULL,
    document_version_id VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL, -- passed, failed
    executed_by VARCHAR(50) NOT NULL,
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    summary TEXT,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
);
```

#### Table H. `self_check_issues` (自检偏差及旧项目引用偏差清单)
```sql
CREATE TABLE self_check_issues (
    id VARCHAR(50) PRIMARY KEY,
    self_check_run_id VARCHAR(50) NOT NULL,
    project_id VARCHAR(50) NOT NULL,
    task_id VARCHAR(50) NOT NULL,
    document_id VARCHAR(50) NOT NULL,
    document_version_id VARCHAR(50) NOT NULL,
    issue_type VARCHAR(100) NOT NULL, -- gross_floor_area_mismatch, old_project_name 等
    severity VARCHAR(30) NOT NULL, -- warning, high 等
    message TEXT NOT NULL,
    source_text_snippet TEXT,
    source_page INT,
    source_paragraph INT,
    expected_value TEXT,
    actual_value TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'open', -- open, ignored, resolved
    ignored_reason TEXT,
    ignored_by VARCHAR(50),
    ignored_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(self_check_run_id) REFERENCES self_check_runs(id) ON DELETE CASCADE
);
CREATE INDEX idx_self_check_issues_run ON self_check_issues(self_check_run_id);
```

#### Table I. `audit_logs` (中控合规日志表)
```sql
CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- PostgreSQL下更换为 BIGSERIAL PRIMARY KEY
    project_id VARCHAR(50),
    operator VARCHAR(50) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_logs_project ON audit_logs(project_id);
```

---

## 2. 向量存储：基于 PostgreSQL & `pgvector` 的局部嵌入
*(Vector Architecture)*

在企业私有云与大型试点环境中，不提倡引入沉重复杂的重量级向量数据库。BidWorks 选择 **PostgreSQL + `pgvector`** 作为统一的向量搜索方案：

### 2.1 结构化向量存储与主数据的绑定设计
语义分块是局限于每一个项目、任务下的，不能无序共享从而防范隔层穿透。
```sql
-- 启用 pgvector 插件 (需以超级用户执行)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunks (
    id BIGSERIAL PRIMARY KEY,
    project_id VARCHAR(50) NOT NULL,
    document_id VARCHAR(50) NOT NULL,
    document_version_id VARCHAR(50) NOT NULL,
    chunk_index INT NOT NULL,
    page_number INT NOT NULL,
    paragraph_index INT NOT NULL,
    text_content TEXT NOT NULL,
    embedding VECTOR(1536), -- 匹配典型的本地 Embedding 模型维数（如 text-embedding-ada-002 或 bge-large 1024等）
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY(document_version_id) REFERENCES document_versions(id) ON DELETE CASCADE
);

-- 建立专属的多列联合索引过滤（先按项目ID过滤，再进行语义向量余弦匹配搜索）
CREATE INDEX idx_chunks_project_doc ON document_chunks(project_id, document_version_id);

-- 构建高维 HNSW 索引极速寻找偏差相似匹配 (Cosmic Scale Speed)
CREATE INDEX idx_chunks_embedding_hnsw 
ON document_chunks USING hnsw (embedding vector_cosine_ops)
WITH (maxconnections = 16, efconstruction = 64);
```

### 2.2 安全隔离判定：排他敏感校验
- **`allowAIRead` 阻断**：当用户在设置里对某个商业标书文件进行 `allow_ai_read = 0 (false)` 变更、或者该文件被设为涉密级 `is_sensitive = 1` 并且无 AI 安全环境授权时，**后台在往向量检索表插入段落或进行 RAG 查寻时，必须显式对文件源头数据加设屏蔽条件**：
```sql
-- 检索时的物理阻断
SELECT * FROM document_chunks c
INNER JOIN documents d ON c.document_id = d.id
WHERE c.project_id = :projectId
  AND d.allow_ai_read = 1
  AND d.is_sensitive = 0  -- 或满足授权条件
ORDER BY c.embedding <=> :queryEmbedding
LIMIT 5;
```
这一硬性设计避免了敏感内容被误录入向量索引而导致全局大模型交互时泄密。

---

## 3. 文件分级存储设计与对象键名规范 (File Storage & Key Design)

非结构化的大型标书文档、施工图压缩包和算量表格具有天然的多色、多版本和极高的可恢复性诉求，须在物理存取层进行精细规制：

### 3.1 树状物理对象储存键设计 (Object Storage Key Pattern)
无论是使用局域网本地极简物理挂载文件夹，还是本地多机部署的 **MinIO** 对象服务器，所有文件对象键名（Object Keys）均依循下述严整的防碰撞树形目录结构：

```
/projects/{projectId}/tasks/{taskId}/documents/{documentId}/versions/{versionId}_{filename}
```
- **这种层级规范的突出优势**：
  1. **空间隔离无碰撞**：同一工程下不同任务上传同名文件（例如多专业都上传 `通用安全技术标准.docx`），路径天生在 taskID、documentID 进行了逻辑切离，没有互相覆盖风险。
  2. **便捷的整目录规置**：当某个工程项目最终归档（或被 PM 判定整项删除）时，可依据 `/projects/{projectId}/` 前缀执行原子级极速批量清理或同步离线备份。

### 3.2 逻辑删除优先与物理延时消消乐机制
- **零物理直删（Soft Delete by Default）**：出于规避专家编写时由于网络异动、手误操作导致前功尽弃，前后台在用户请求“作废”（Obsolete）或“删除”版本时，**绝不在物理层、对象存储中实施直删**。
- **机制流程**：
  - 更新对应 `document_versions.status = 'obsolete'` 或向 documents 新设 `is_deleted = 1` 的逻辑状态。
  - 对于带有 `obsolete` 的历史记录，前端在列表上进行隐去并在列表中进行横向波划线（line-through）渲染，随时备有防手滑恢复。
  - **延时消洁器（Physical Janitor Cron）**：系统在内联网闲时调度异步垃圾清理任务（Delayed Garbage Collector），把逻辑作废超过 30 天以上的物理大文件，批量整理输出成物理磁盘释放历史并打标最终物理移除，保持存储卷常态健康。

---

## 4. 分布式缓存与多岗防暴并发：Redis 的精准运用 (Redis Map)

本地部署中，**Redis** 并非作为事实存储数据库（严防瞬时断电丢失数据），而是提供内存级别的极速高能“信号切面”：

1. **大文件分割异步队列（BullMQ Connection）**：
   - 包含图纸、三维大纲、商务大表格的标书通常达到几百兆以上。单进程 Node 端因其单线程机制无法直接解析如此巨大的文件，否则会造成阻塞崩盘。
   - 文件上传完毕，Node API 向 Redis 的 `document-parsing-queue` 中塞入作业号，让独立物理部署的 Parser Worker 群并发拉取、拆页提取并逐行吐回数据，主服务端一直保持常态响应极速。
2. **多岗标记冲突互斥锁（In-Memory Locks）**：
   - 两个造价师同时改写项目汇总参数，或者多个专家同时尝试执行 `Mark Final` 签署最终版。
   - API 中结合 Redis `SET key value NX PX 10000` 构建短暂自旋同步排他锁，防止数据发生多线程并发覆盖。
3. **高敏规则查询缓存基底**：
   - 自检比对频繁需要访问 `sensitive_black_dictionary`、配置库字键，以及历史被忽略的问题字典，这些热数据缓存在 Redis 结构中，访问效率由 15ms IO 耗时直降至亚毫秒 0.2ms，为整个一致性自扫描引擎提供瞬时诊断回显的极致体验。
