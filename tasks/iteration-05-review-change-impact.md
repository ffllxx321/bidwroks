# BidWorks MVP 任务拆分 - 迭代 05：协作审核消项与信息变更影响级联 (Collaboration & Impact Cascade)

本文件定义结构化在线审核、划定段落批注提出、意见关闭、以及当主数据重大数字更迭时产生的级联通知、资料需复核卡点闭环工作流。

---

## 一、迭代目标

说明本迭代要解决什么问题，以及本迭代完成后系统应该具备什么能力：
- 确立全流程的多岗审核闭合卡口：编制专员将自检没有敏感词的文件“提交送审”后，审核领导可在专属 Review 页面大底盘调阅该方案，阅览 AI 的管理大纲摘要及之前的自检抗辩细节。
- 引导式的审核批注互动（No Silent Close）：审核领导对于不妥行和段落，提加带有明确责任人、期望整改期限的“结构化审核意见”（批注 Status=`ACTIVE`）。编制人必须在库回复答辩并更新 Word 版本。只有最终领导点按核签了“消项（Resolved）”，此工单才可通关。
- **划时代的中高风险变更级联 (Impact Cascade)**：如果在封标前夕主数据（如建筑面积 grossFloorArea）被强制调整：
  - 系统不允许静默不更新，而是计算依赖树，判定本面积更改属于高或中风险。
  - 立刻向所有关联专员推送一页“主数据重大变更评估单”，并级联将设计、概算编制、施工方案状态全数打回重审（设置为 `NEED_REWORK` / 需复核状态）。
  - 在相关岗位的专员手动回来完成 Word 校正并物理点击“我已经人手核对并完成了本次主数据更迭的复核”以前，总控台持续展示红色待复核大预警，并在流程中卡死、强力阻断将其标记为“最终版（FINAL）”。

---

## 二、功能范围

1. **提交送审控制流 (Submit for Review)**：
   - 专员完成自检、确认自检意见全部处理完毕且无 “MUST_RESOLVE” 状态时，点击将文件归档送审，任务其 status 改变为 `PENDING_REVIEW`。
2. **多面审核领导大工作台（Reviewer Desktop）**：
   - 打开某项送审任务卡：
     - **一目了然 AI 管理摘要**：大模型生成的第一版摘要。
     - **全方位自测豁免账单**：清晰展现此前该编制人员自己抗拒的那些警告、以及一并塞入的手写客观陈述，防止下属糊弄。
     - **版本差异简目（Diff Abstract）**：展示此版较前一老版的字节差、字数差异等粗颗粒差异状态。
3. **结构化审核意见消项机制 (Active to Resolved Workflow)**：
   - 领导可在页面右栏，新增批注，写入责任人（如王五）、文字、以及整改限期。意见状态初始化为 `ACTIVE`。
   - 编制人在工作台可以对应文字栏回信对话（如：“已纠正并上载了第4版”）。
   - 领导点击消项目 resolve，意见状态改为 `RESOLVED`。截至决归档封存前， ACTIVE 批注数必须为零。
4. **主数据大变更震动级联计算器 (Impact Cascading Analyzer)**：
   - 预设字段风险级：项目名 (低)、业主 (低)、建设地 (中)、面积 (中)、投标截止期 (高)、工期 (高)。
   - 当中级别以上的主数据核心字段被修改，触发底层级联引擎：
     - 第一步：全速检索此项目的 `project_tasks`，把受关联的设计、施工、概算这些进行中/已提报任务物理其状态强洗归为 `NEED_REWORK`。
     - 第二步：项目控台立即警告“有 3 类编制受主数据更新震波影响待复核，流程冻结锁死”。
5. **级联影响单弹窗物理消消乐**：
   - 在王五工作区中央出现遮罩弹窗，显示原老值面积 `85000` 变更为最新 `91000`，发起人李四，时间今。
   - 王五本地重新校订 Word 并在平台提交 v4，在弹出的对比框点击“确定，本人已校对完成”，此项目对应卡片的需复核状态解除，复原为常态。
6. **项目控制台大指标高密级风险聚合（Control Panel Risk Merging）**：
   - 总控制台一页：展现项目总体未关闭批注数、主数据级联未手动解除复核的人。

---

## 三、不包含内容

1. **跨角色、跨部门复杂的多重级会签、电子印章管理、可配置复杂逻辑审批流工作流排版引擎**。
2. **在网页端实时拉起两本 word 分栏排字、并用红色修订线标记每一个错别字的在线高密对比工具**（此行为在本地由用户通过 compare doc 功能执行）。
3. **主数据低风险变更（比如项目別名修改）引发的级联。低风险轻微变更仅记录审计足迹 log，绝不触发下游全员通知以防疲劳。**

---

## 四、开发任务清单

| 任务名称 | 任务说明 | 输入 | 输出 | 依赖 | 验收标准 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-5.1: 意见批注增更与消项目 resolved 引擎** | 编写数据库写入，允许审核领导钱八在右栏向某一文书挂载 ACTIVE 批注、允许组员陈七回复，开发 RESOLVE 点击状态更正 | 批注参数、RESOLVE 调用 | 批注状态在 SQLite 物理变为 `RESOLVED` | 迭代四文件 | 专员在接口无法自行关闭，钱八调用该接口返回 Resolved 行且在 Timeline 更新 |
| **TSK-5.2: 最终方案封装定稿双卡拦截 Api** | 编写最终版封锁拦截接口。在编制人发起标记最终版操作前，后端发起极严拼图比。如 ACTIVE 的 comment 百分百不为零，或者受主数据更迭影响相关岗位的复核单 COUNT > 0 | 最终版标记指令 | `DETER_BLOCK: 400 Bad Request` | 迭代三, TSK-5.1 | 假如有批注没 Resolved 拼图没拼齐，封标动作一定彻底拒绝，前端按钮禁用 |
| **TSK-5.3: 主数据风险等级级联触发服务** | 编写变更事件。一旦营业 `PUT /api/projects/:id/master-data` 的中高风险，检索底层项目相关卡，把处于 ACCEPTED/DOING 状态的，洗到 `NEED_REWORK` 状态 | 更改字段名, 前后极值 | SQLite 表内受指卡状态被批量重设，并将 `task_change_acknowledgements` 新开未认物理行 | 迭代一主数据，迭代三任务 | 建筑面积从 85000 变 91000 后的瞬间，查询在库施工任务，其 status 批量被重置为 `NEED_REWORK` |
| **TSK-5.4: 专岗已查核复核一键消除需复核状态 Api** | 编写 `/api/tasks/:taskId/acknowledge-change` 接口，成员抗诉上传最新版纠偏，点按该按钮，系统在 acknowledgement 内打上确认责任，退去需复核状态提醒 | 任务ID、变更记录ID | 需复核状态归位，任务重设为 DOING 或待自检 | TSK-5.3 | 专案王五按下一键认，该岗位的 `NEED_REWORK` 变为正常，总盘未核数减少一 |
| **TSK-5.5: 项目健康分析高密风险多汇总 API** | 编写 `GET /api/projects/:id/risk-agg` 接口。汇总：临截止天数、未 resolved 意见、未复核标记，输出一个综合健康得分 | 项目Id | `{ healthScore: 70, unacknowledgedCount: 2, activeCommentsCount: 3 }` | TSK-5.2 | 一旦概算人员没有点按确认变更，此处 unacknowledgedCount 物理反映数值 1 |
| **TSK-5.6: 前端审核互动页、差异对比及一键变更影响及需复核提醒** | 绘制领导 Review 页，以及普通编制人 Workbench 浮现的一键“主数据重变评估通告单”蒙层弹框 | UI 操作、相关 JSON | html5 高保协同审大页面 | TSK-5.1, TSK-5.4 | 领导端一目了然看到手下提交前自己特意豁免了 2 条警告，差异段、批注 Timeline 极度好看 |

---

## 五、前端任务

1. **全景协作评审大面板 (Page Review Panel)**：
   - 领导可见一页面。两边排列：
     - **左侧：文科全盘浏览器**。
     - **右侧：历史与互动区**。上面高亮贴出：`“当前专员王五在自评提白时，曾主观忽略了 1 个工期偏差警告，其抗辩说明理由是：【考虑到施工战略，该版中工期由400天局部调减至380天】”`。
     - 批注交互 Timeline 列表：以小贴条样式平铺每个活跃批注。
2. **结构化批注编辑多栏单 (Active Comment Box)**：
   - 领导点击文下段，新增批注。带有框：指定陈七（施工专员）、整改天数 1 天。
   - 编制员回复框直接在此批注卡片下呈现，支持打字对话，答复后给领导亮黄标提示。
3. **主数据重变影响级联评估卡 pop弹框 (Cascading Acknowledge Dialog)**：
   - 王五点击“需重复核”红叹号，拉起高对比弹窗。
   - 红色抬头 `"主数据发生变动 ── 变更影响评估及需复核提醒评估"`。
   - 两个气泡对比：`主数据变更变量：grossFloorArea（建筑面积）`，原：`85000 ㎡` ──► 现：`91000 ㎡`，修改者：营业员张三。
   - 点击下方复选框：“本人已完全审视该 6000㎡ 增长，并在本地修改了设计大纲，以 v4 规范上传”。点击“一键解除需复核状态”按钮。

---

## 六、后端任务

1. **主数据风险字典级联处理器（Synergy Analyzer Service）**：
   - 后端在接收到 `PUT` 主数据请求后，根据内置实体树，将中高变更进行事件触发：
     ```ts
     const impactMap = {
       grossFloorArea: ['DESIGN_ROLE', 'QS_ROLE', 'TECH_ROLE'], // 面积动对设计、施工、概算全震荡
       totalDuration: ['TECH_ROLE', 'QS_ROLE'],                // 工期动对施工、概算震荡
       projectName: [],                                        // 名字动仅记录log，不级联降重
     };
     ```
   - 批量对受关联岗位专有任务重置其 `status = 'NEED_REWORK'` 并存盘不脱水。
2. **终极定稿双卡卡扣安全卫士 (Double Locking Validator)**：
   - 提交定稿 `/finalize` 接口顶层审查：
     - 拦截一：`SELECT COUNT(*) FROM review_comments WHERE task_id = :id AND status = 'ACTIVE'`。大前提必须等于 0。
     - 拦截二：`SELECT COUNT(*) FROM task_change_acknowledgements WHERE task_id = :id AND acknowledged_at IS NULL`。大前提必须等于 0。
     - 如任何一个条件破坏，向前端回绝 400 警告：“抱歉，全案中尚有未 resolved 的批注，或者曾因主数据大更引发的级联专岗至今仍有未人手复核解除的灾点，系统强行封锁不可封标！”

---

## 七、AI / 文档解析任务

*本迭代不直接调用 AI 服务（在 Review 页面中提取展示的 Executive Summary 已经于迭代二中解析暂存入库，本模块仅需 GET 调回在库数据即可）。*

---

## 八、数据表或实体变更

本迭代新增意见批注关系、以及重大级联复核响应确认表：

```sql
-- 审核批注意见表
CREATE TABLE review_comments (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    commenter_id TEXT NOT NULL,
    commenter_name TEXT NOT NULL,
    comment_text TEXT NOT NULL,
    target_sentence TEXT, -- 划定的正文有意见文本划段
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE-未关闭意见, RESOLVED-已被领导消项
    rework_deadline TEXT, -- 指定整改最后期限 YYYY-MM-DD
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_by TEXT,
    resolved_at TEXT,
    FOREIGN KEY(document_id) REFERENCES project_documents(id) ON DELETE CASCADE
);

-- 主数据重大更新下游专职岗位一键复核对应履约确认表
CREATE TABLE task_change_acknowledgements (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    master_data_log_id TEXT NOT NULL, -- 依赖迭一代建的 master_data_change_logs.id
    acknowledged_by TEXT NOT NULL,
    acknowledged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY(master_data_log_id) REFERENCES master_data_change_logs(id) ON DELETE CASCADE
);
```

---

## 九、接口清单

### 1. 提交送审接口
* **方法**：`POST`
* **路径**：`/api/tasks/:taskId/submit`
* **返回**：`{ "success": true, "newStatus": "PENDING_REVIEW" }`
* **权限**：指派的编制专员
* **日志**：`[LOG_WORKFLOW] 陈七方案自检达标，成功发起提报送交领导钱八审定`

### 2. 写入结构化审核批注 API
* **方法**：`POST`
* **路径**：`/api/documents/:docId/comments`
* **参数**：`{ "commentText": "第4页面积大数字拼写和主数据对不上，请核对修正", "targetSentence": "2026日资...地基", "deadline": "2026-05-22" }`
* **返回**：`{ "success": true, "commentId": "com-33" }`
* **权限**：专属审核人/负责人
* **日志**：`[LOG_WORKFLOW] 审核主管钱八撰写 ACTIVE 批注，指向 doc-88`

### 3. 主手强制消项目 resolved API
* **方法**：`POST`
* **路径**：`/api/comments/:commentId/resolve`
* **参数**：`{ "resolveOpinion": "复审通过，面积现已在v4版完全吻合九万㎡" }`
* **返回**：`{ "success": true }`
* **权限**：**权限重点**。只有本批注的发起人领队钱八有权消除，陈七等专员越权调用一律拦截 403。
* **日志**：`[LOG_WORKFLOW] 钱八核签 resolved 批注 com-33`

### 4. 主数据变更一键消除需复核状态 Api
* **方法**：`POST`
* **路径**：`/api/tasks/:taskId/acknowledge-change`
* **参数**：`{ "changeLogId": "ch-102" }`
* **返回**：`{ "success": true }`
* **权限**：指派的该技术任务编制人。
* **日志**：`[LOG_CASCADE] 编制人王五确认了 grossFloorArea 之 (85000 -> 91000) 变动, 改动已在本地文案核查，其 NEED_REWORK 被清除解除 `

---

## 十、权限与日志要求

- **审核主管领队消项 resolved 强保护**：
  - 在 `/api/comments/:commentId/resolve` 底层加上鉴权限制。非专属审核人没有该操作物理写权限。
- **全案重大变更级联影响日志**：
  - 用户李四只要对 `grossFloorArea` 点击保存。后端不仅要批量重置四个由于依赖而备灾任务其状态至置红，且要把级联影响的岗位记录日志：“`[LOG_CASCADE] 触发中高风险提醒，级联将[设计]、[概算]等三项处于进行中的任务重置为需复核待复原。`”

---

## 十一、验收标准

1. **结构化批注不 closed 最终阻断**：技术方案下面存有 1 条 `ACTIVE` 尚未 resolved 的大意见。李四在后台执行 `PUT /finalize` 定稿。接口强硬吐出：400 Bad Request，不准定稿。等钱八手动点按核签 Resolve 关闭以后，定标秒亮绿顺利封存。
2. **中高变更引发联动变更影响提醒与需复核状态提醒**：目前状态下设计王五已提交技术卡，status 属于 `ACCEPTED`。李四突然到后台把投标截止日期修改（高风险变更）。系统后台直接把王五对应卡重洗设为 `NEED_REWORK`，并在王五工作案中央推送带需复核警告的一页“重大日历更改提醒单”。
3. **点点确认需复核状态消除**：当王五在本地把截止期重核、重编并在界面点击“本人已完全核准并在本地更正了此项 400 至 380 工作天更更”后。主大盘未复核数扣减、回到正常 DOING，最终版标记大闸门解锁。

---

## 十二、测试场景

### 场景 1：级联影响一岗未认、最终版持续卡闸拦截测试
- **测试前置条件**：项目 P1 主数据面积变动，面积被从 85000 更新为 90000 ㎡。受其波及，系统自动将设计及概算两岗位设为需复核。
- **操作步骤**：
  1. 设计人员王五看到了提醒并点按了“一键解除复核”；但极重要的工程概算底卡由于概算人员请假还没点按它的确认复核单。
  2. 负责人李四到控制台，强硬对该项目的编制大组卷发动“一键标记此版为最终投标本 (Finalize)”。
- **预期结果**：
  - 后端直接被阻塞拦截。由于还有 task_change_acknowledgements 呈未认空状态，数据库返回：“抱歉中高风险大震荡至今仍有专岗岗位（工程概算）未回归确认复核，平台拦截本次定稿封口，阻断发生失准废标风险！”

### 场景 2：普通方案普通专员越权 resolve 领导批注欺瞒拦截测试
- **测试前置条件**：陈七的任务下有 1 条由钱八主管在昨天设下的“第9页工法有安全漏洞必须修改”ACTIVE批注。
- **操作步骤**：
  1. 陈七懒得实改 Word，在控制台自行用 Postman 绕过组件发起 `POST /api/comments/com-xx/resolve` 覆写状态到 RESOLVED 骗取定标权。
- **预期结果**：
  - 后端中间件识别到当前用户角色为 TECH_ROLE 而非钱八的 REVIEWER 权限，极速抛回 403 Forbidden 并拒绝写，强制无法消项，安全性坚实可靠。

### 场景 3：主数据低风险轻微变更不惊忧级联拦截器
- **测试前置条件**：项目主数据里甲方业主由于拼写修正修改，由中设集团变更为 “中设建设集团有限公司”（低风险字段更替）。
- **操作步骤**：
  1. 营业员张三对该字段进行 PUT 更新。
- **预期结果**：
  - 看板不引起任何下游各岗位的 `NEED_REWORK` 回洗状态。仅仅在迭代一的底库 `master_data_change_logs` 中增加了一行操作痕迹，验证了避免重复警醒隔离。

---

## 十三、风险和注意事项

* **级联频繁震动报警疲劳解决原则**：如果甲方一天改 10 遍主数字，编制人会直接精神崩溃忽略所有弹窗。
  * *处理原则*：一是只有高/中级代表才会震荡，低级不联动降阶只写操作足迹 log。二是只针对处于“ACCEPTED / DOING / Pending check”活跃编制进行洗牌，对已归档、已解约或者属于立项未指派的任务绝不级联，将影响控制在最小职责关联岗位。
* **时序与假日问题带来的并发状态常识不合**：
  - 可能会造成多个人同时点保存时的数据库 SQLite lock。
  - *处理原则*：系统对状态写加事务串行，保证复核操作前后不被脏写覆盖。

---

## 十四、完成定义 Definition of Done

- [ ] **功能完成**：提交送审控制机制、领导批注Timeline对话条、中高变更底依赖级联重洗警示板、一键解除等大闭锁全数封顶完工。
- [ ] **权限验证完成**：专员绝不能欺越 resolve 主管批注，非法跨项目、跨单有后端隔离。
- [ ] **日志验证完成**：中高地震重置级联事件在大日志仓有记录，一笔不漏。
- [ ] **测试通过**：本迭代三大场景联测百分百。
- [ ] **产品验收通过**：主数据复核评估弹窗双色对比、字干极其雅致，不乱动。
- [ ] **业务演示完成**：能在大屏幕上完整演出面积发生震震引发 3 岗位集体置红打回、人手确认后才亮终标的大闭环故事。
- [ ] **未完成项已记录**：企业知识库、和多层级会签被记为 Backlog，拒绝任何非 P0 以外扩张。
