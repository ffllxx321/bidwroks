# BidWorks MVP 任务拆分 - 迭代 02：招标文件上传与 AI 解析对照 (Tender Upload & Analysis)

本文件定义招标解析模块的研发方案。核心逻辑是上传文本源 PDF/docx 文档，AI 获取全文后结构化提取出十余个商务与技术主要字段，并在前端使用左右双列对照形式呈报，提供高对比原文一键溯源引证。

---

## 一、迭代目标

说明本迭代要解决什么问题，以及本迭代完成后系统应该具备什么能力：
- 支持将招标文件（文本型 PDF 或 docx 格式）进行上传。
- 启动后台非阻塞解析进程，提取其文本，执行切分。
- 调用统一的 AI 服务网关，提取出十多个重点结构化参数、资料文件清单要求、风险合同条款，以及首版简明摘要。
- 保证 AI 提取数据具备极其严苛的可信度校验：每个推荐提取项中强制夹带物理页码、段落原文（引证标签形式呈放）。
- 在前端呈现高对比的分立双栏阅读器，左侧正文在点击右侧提取标签时可一键高亮跳转定位。
- 坚持人机闭环：AI 绝对不能在人确认前将这些信息写入或覆写到项目主数据库。管理员或营业员人工审校、修改并点击“手工同步入库”后，对应参数才会覆盖写入项目主数据表。
- 确立安全边界：敏感文件默认禁止 AI 读取，AI 读取前必须进行权限校验，禁止对敏感文件进行切片、向量化、摘要和问答。

---

## 二、功能范围

1. **招标文件多格式上传与落盘**：
   - 验证文本格式 PDF 提取或 Docx 核心文字过滤落盘能力。
2. **统一 AI 服务路由组件 (AI Gateway Adapter)**：
   - 架构独立封装，可热插拔。支持底层接入 MiniMax-M2.7。
3. **AI 高密信息结构化提取 (Structured Extraction)**：
   - AI 需要提取参数大项：项目名、建设地、面积、工期限额、发包方名称。
   - 提取投标资料要求清单：如“需要提供：施工大纲、概算表格、授权证明”。
   - 提取潜在合同风险条款：高密度负面责任条款，例如逾期罚款、垫资条款。
   - 提取项目的首版管理摘要。
4. **精确原文引证与段落对应 (Page & Paragraph Citations)**：
   - AI 返回的 JSON 包含 `sources: { page: number, exactText: string }`，表示该字段生成的底牌证据。
5. **极简独立双栏审阅对照盘 (Double Column Verification Panel)**：
   - 左侧为招标文件正文分段浏览器。
   - 右侧为 AI 推荐的数据看板。
   - 点击右侧行，左侧自动跳转到对应引证页，并将对应原文段落标红泛黄高亮。
6. **人工一键批量更正与一键入库同步机制**：
   - 对提取到的 10 余个指标提供人手键盘校正（支持二次校对防错字），点击“校对无误，同步到项目主数据”使数据库完成同步并退去 Pending 虚线。
7. **敏感范围限制 (High Sensitivity Gateway Gate)**：
   - 默认敏感文件不可读。若文书被标记为高密或涉敏，拦截一切 AI 解析尝试，降级返回：“高敏文书被禁用AI服务”。

---

## 三、不包含内容

1. **非文本型的照片偏转、手写模糊、打印不稳 PDF 的强效 OCR**（一律提示退路：“文本解析不准，请采用无招标文件手工速建”）。
2. **CAD 工程图纸的深度提取、BIM 清单解析**。
3. **自动将 AI 生成的合同文本打包合并为最终投标文本**（严控自动替代人做出投标决策）。
4. **基于工期截止的计划倒排倒推引擎**（进入迭代三）。
5. **在提交前运行面积、工期等一致性排查，泄密废项目名称检查**（进入迭代四）。

---

## 四、开发任务清单

| 任务名称 | 任务说明 | 输入 | 输出 | 依赖 | 验收标准 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-2.1: 文档文本隔离提取引擎建立** | 编写 PDF 分页文本提取处理器，读取 Docx 正文字符并切分为段落页码，并在关系库入库中对 `isSensitive` 设为 0（不敏感） | 招标文件物理文件 | 分物理页文本切片集合、大小限制检验结果 | 迭代一 | 后台能够读取一份 10 页 PDF 全文并正确辨识页一至页十纯文字 |
| **TSK-2.2: 独立 AI 可插拔网关适配层设计** | 实现统一安全 AI 接口 `AIServiceGateway` 契约，支持注入 MiniMax-M2.7，并建立防错降级网拦截 | 提纯文本文本及提取 Prompt | 符合 JSON Schema 定义的一致性提取结构体 | 无 | 提供单元测试模拟不通时返回 “未提取到”，确保模型超时不致使页面整个挂死 |
| **TSK-2.3: 文档切片与多极目标提取 API** | 组织 API 发起提取：`POST /api/projects/:id/tender/parse`。核心调用 AI 并过滤，强制要求含有 `sources` 属性，并将提取到的临时建议存入 `tender_extracted_results` | 文件在库路径 | 含有大宗指标、物料清单、风险词典、页码的综合 JSON 对象 | TSK-2.1, TSK-2.2 | 发起接口，回吐提取的建议并且每一条核心变量均附带着对应的 `page` 与 `text` 段原文 |
| **TSK-2.4: 安全 AI 可读性控制门禁** | 在进入 AI 调用中间件核心添加校验，如 `file.isSensitive == true` 或 `isAiAllowed == false`，则系统强行截断，直接跳过 AI 并报错 | 物理对象标志位 | `AI_BLOCKED_ERR` 屏蔽返回 | 迭代一权限 | 实测如果文档高密，此提取接口立即在后端中断拦截，完全没有任何段落被投喂到外网 |
| **TSK-2.5: 前端双分屏对照页面及高亮锚点交互** | 绘制双向比对界面，左边是切分好的文本段落列表，右侧是可修改表单详情盒以及一键同步大按钮。实现右至左高亮联动 | 提取结果 JSON | HTML5 双栏渲染联动视图 | TSK-2.3 | 点击右边“建筑面积”提取词，左侧浏览器自动弹跳至其第 4 页，并把 “基地规划总建积...” 这排原文加亮 |
| **TSK-2.6: AI 提取人工修改落盘及主数据同步 API** | 实现 `POST /api/projects/:id/master-data/sync` 接口，接收人工再校准数据，更新 `project_master_data` 并记录操作日志与时间原值变迁痕迹 | 手动已确认的指标表单 | 数据表覆写，修改历史累加 | 迭代一主数据 | 李四在前端把提取错的 85000 面积在文本框盖写成 90000 提交，数据库更新为 90000，来源标手动更正 |

---

## 五、前端任务

1. **拖放上传与状态框（Dropzone & Upload Panel）**：
   - 精致的招标文件提交框（支持 PDF、Docx）。
   - 实时的解析跑网进度条指示（如提示：“AI正在切片标书并抓取关键信息，请稍候...”，杜绝用户以为其挂死）。
2. **人机比照对照编辑器 (Double-Column Split Verification)**：
   - **左半栏：标书逐页浏览器**。高对比度展示标书切片文本。点击右侧定位点即可直接触发 `.scrollIntoView()` 跳转高亮。
   - **右半栏：提取实体诊断列表**。以卡片表单形式平列展示：项目名称、业主、工期日历天、安全文明要求。每一条属性的侧边，放置一个带图标的“高亮引证 `【引自第X页第Y行】`”的皮标。下方单独展示“AI 提取到的：投标文件资料清单建议（如需准备施工组织文件、技术授权书等）”和“条款风险提示区”。
3. **审阅手工一键通过控（Acknowledge & Save Controls）**：
   - 一个极为醒目的绿色“确凿无误，将指标手动写入项目主数据”同步大按钮。未确认前，页面会显示一条淡色提示警告：“当前数据属于 AI 推荐草案，未写入项目主数据中，需要点击此处才会发生效力”。

---

## 六、后端任务

1. **统一 AI 管道防幻觉强控 Prompt (Extraction Prompts)**：
   - 撰写控制字（System Prompt）：对大面积、大工期限额进行提取。在约束中加上：“任何情况下不准瞎编不存在的年份和面积数值。找不到一律打为‘待确认’。对每个得出的结果必须在 `source` 列附录精确的几行原文”。
2. **安全涉敏第一大拦截门禁 (AiAllowed Middleware)**：
   - 用户发起解析，系统先到 SQLite 的 `project_documents` 里读取敏感标志位：
     - 如果 `is_sensitive == 1` 或 `is_ai_allowed == 0`，则后端拦截，拒不往 `AIServiceGateway` 传参，确保物理零泄密。
3. **AI 每笔调用 Token 实时监测记录 (AI Token Audits)**：
   - 在 AI 通道回调结束那一秒，提取返回包中的消耗 tokens 分布值并持久化在 `token_usage_logs` 表，包括调用时间、响应毫秒。

---

## 七、AI / 文档解析任务

- **输入文件类型**：文本型 PDF 或 Word (Docx) 招标文件。
- **解析核心内容**：建筑投标中极为关键的十类信息：工程别名、业主、大承面积、投标起止、安全目标等级、所需提报资料名称列表、风险极高合同阻沙条款。
- **AI 输出具体契约**：
  ```json
  {
    "projectName": "上海青浦基地一标",
    "grossFloorArea": 85000.0,
    "totalDuration": 400,
    "sources": {
      "projectName": { "page": 1, "text": "本项目全称：上海青浦基地一标" },
      "grossFloorArea": { "page": 4, "text": "本期工程基地总建筑面积为 85000 平方米" }
    }
  }
  ```
- **人工审定确认**：AI 默认只将对象放在临时缓存或草稿建议表上，严禁静默覆写 `project_master_data`，必须在营业员或负责人人手点击前端 `POST /api/projects/:id/master-data/sync` 交互动作之后，经由鉴权才可以合并进主表。

---

## 八、数据表或实体变更

本迭代新增物理文件与 AI 建议草案记录表：

```sql
-- 招标文件存储管理
CREATE TABLE project_documents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    file_type TEXT NOT NULL, -- PDF, DOCX
    is_sensitive INTEGER NOT NULL DEFAULT 0, -- 0:不敏感, 1:高度敏感数据。敏感文件默认禁止 AI 读取
    is_ai_allowed INTEGER NOT NULL DEFAULT 0, -- AI可读范围许可。0:拒绝, 1:允许
    uploaded_by TEXT NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- AI 临时提取状态暂存表 ──── 人确认前不在项目主数据中。
CREATE TABLE tender_extracted_results (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    field_key TEXT NOT NULL,
    extracted_value TEXT,
    citation_page INTEGER,
    citation_text TEXT,
    is_approved INTEGER NOT NULL DEFAULT 0, -- 0:审核中, 1:已被人工确认写入
    approved_by TEXT,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(document_id) REFERENCES project_documents(id) ON DELETE CASCADE
);

-- AI 统一费用耗用日志审计
CREATE TABLE ai_token_usage_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    elapsed_ms INTEGER,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 九、接口清单

### 1. 物理安全上传招标文件 API
* **方法**：`POST`
* **路径**：`/api/projects/:id/tender/upload`
* **参数**：Multipart Form 携带文件、和 `isSensitive` 设置标志。
* **返回**：`{ "success": true, "docId": "doc-88", "isSensitive": false }`
* **权限**：营业员 (BD) / 负责人，其他专员禁止。
* **日志**：`[FILE_UPLOAD] 上传多媒体文件: 某招标文件.pdf, 物理路径 /storage/temp/xxx.pdf`

### 2. 发起 AI 切片提取解析 API
* **方法**：`POST`
* **路径**：`/api/projects/:id/tender/parse`
* **参数**：`{ "docId": "doc-88" }`
* **返回**：AI 临时提取到的结构化 JSON、包含原文页码引证。
* **权限**：全登录。
* **日志**：高密审计。在进入 AI 网关层之前，中间件判定 `if (file.isSensitive == 1) return 403`。如果顺利通过，记录：`[LOG_AI_EXTRACTION] 用户李四发起AI抽取, 消耗总 tokens`。

### 3. 校准入主单一事实同步 API
* **方法**：`POST`
* **路径**：`/api/projects/:id/master-data/sync`
* **参数**：
  ```json
  {
    "grossFloorArea": 90000,
    "totalDuration": 400,
    "bidClosingDate": "2026-07-16"
  }
  ```
* **返回**：`{ "success": true, "message": "已成功同步更新本工程项目主数据" }`
* **权限**：仅营业人员/负责人可用
* **日志**：`[LOG_AUDIT] 用户：李四 汇总确认同步AI解析库，中风险面积更新为 90000 ㎡ (原值为 null)`

---

## 十、权限和日志要求

- **极其严苛的涉敏物理网拦截**：
  - 在后端 `parse` 控制器最上方第一行加设安全硬性验证。任何 `is_sensitive == 1` 文书绝对禁止往 AI 服务组发送、切切分流。凡是强行绕过发起的直接打回 `403` 权限不足。
- **每笔调用不脱水审计**：
  - AI 网关每一次交互均在 `ai_token_usage_logs` 保存一条消费记录，这成为后续计费、耗用追溯、以及机密泄漏审查的核心底座。

---

## 十一、验收标准

1. **多格式敏捷解析测试**：上传一张普通文本型 PDF 日资工程标书。在控制台观察：后端分页提取器无损截获其第 4 页的“拟建总建筑面积为 85000 ㎡”，没有中文字符串截断乱码。
2. **AI 引证原文一键高亮呈现**：前端加载解析结果。右侧卡片处点击面积 `85000` 链接。左半侧的滚动正文自动定位泛黄，直指出原文：“本期工程基地总建筑面积为 85000 平方米”。
3. **人工覆盖校准并同步入库**：人工在此指标文本框修改错别字或面积把 85000 回改为正式 90000。按下一个绿色“确认入库”，主数据 `project_master_data` 得到完全重写，主数据盘刷新成功。

---

## 十二、测试场景

### 场景 1：招标文件解析人工核验入项目主数据库表串盘大联调
- **测试前置条件**：系统内已有由李四持有的项目 P1。
- **操作步骤**：
  1. 通过前端上传一个名为“招标文件上海一期.docx”的文件。
  2. 点击一键解析。等待分析结束，右栏出现了提取到的：建筑面积 `85000`、投标截止期：`2026-07-16`。
  3. 人工发现在文书第 9 页业主其实有补充答疑，表示最新面积调整为 `91000 ㎡`。
  4. 李四在右侧文本输入框里将 85000 后退清零，录入 `91000`。
  5. 点击“一键同步至项目主数据库”。
- **预期结果**：
  - 去 SQLite 主数据库中查阅 `project_master_data` 表，对应建设面积成功写为 `91000`，来源自动自动标定为：`人工校正同步`，其 confirmed 标志生效。

### 场景 2：安全测试 ── 敏感文档默认禁止 AI 读取校验测试
- **测试前置条件**：管理员将项目内“高敏设计机密方案.pdf”其 `is_sensitive` 强制标记为 1，`is_ai_allowed` 标记为 0。
- **操作步骤**：
  1. 陈七登录并尝试在控制台点击此高敏文件的 AI 智能摘要解析。
- **预期结果**：
  - 后端直接被过滤器拦截，在 API 请求还未打包给外接公用 AI 服务时，抛回大红错警告：“本案属于高危涉敏资料，已被物理切断AI可读范围，无法发起AI抽取解析！”

### 场景 3：无来源幻觉数据防范测试
- **测试前置条件**：调用 `POST /api/projects/:id/tender/parse` 并准备故意放入一段无关联废话。
- **操作步骤**：
  1. 假定 AI 模型突然产生幻觉，推荐了一个不含 `page` 的指标。
- **预期结果**：
  - 后台数据规范化校验（Validator）抛异常。由于不符合 `sources` 的物理页码约束，系统打回丢弃此垃圾字段，在前端展示警告：“部分提取建议引证证据缺失，已予以物理过滤抛弃”。

---

## 十三、风险和注意事项

* **扫描件 OCR 全废和偏转模糊问题**：很多时候标书是手持拍出的偏转 PDF，后台根本取不出一丁点文本。
  * *处理原则*：在检测到提取文本流低于 10 个字符时，系统前端要极其温和地弹框引导：“当前版本为不能解析的图片版，请采用本平台支持的纯手工快速建立项目并分配任务，体验依旧极速”。
* **网络超时响应堵塞**：
  - AI 分析几十页的标书，后台需要消耗 20秒左右，如果阻塞路由，页面会长时间卡死打转。
  - *处理原则*：一律做成异步任务排队，前端建立进度条让用户知晓系统正在全力运算中。

---

## 十四、完成定义 Definition of Done

- [ ] **功能完成**：文书纯文本切分器、AI 屏蔽网关拦截层、双栏对照阅读高亮跳转、一键审阅同步机制全数实现。
- [ ] **权限验证完成**：敏感数据强制不可提交至 AI 发送，并有专门越权测试。
- [ ] **日志验证完成**：AI 的 tokens 用量、调用消耗在库跟踪。
- [ ] **测试通过**：三个全端核心联调测试场景 100% 绿。
- [ ] **产品验收通过**：双栏锚点滚动跳转位置丝般顺滑。
- [ ] **业务演示完成**：在开发环境中模拟整个提取校对流程，完美。
- [ ] **未完成项已记录**：由于大模型不直接代行合同起草、PPT 生成等不当 AI 扩张，相关事项归至 Backlog。
