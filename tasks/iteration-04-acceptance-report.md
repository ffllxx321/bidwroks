# BidWorks MVP 迭代四验收报告
## (Iteration 04: Files Version & Self-Check Acceptance Report)

本报告对 BidWorks MVP 平台**“文件多态管理、增量版本控制、一致性自扫描、高敏字校验及人工阻断解除”**（即迭代四核心功能）进行专项验收评估，涵盖了开发规则对准、工程化表达替换、不越界行为安全自审等内容。

---

## 一、 迭四期代功能验收矩阵 (Acceptance Matrix)

| 验收分类 | 验收细项 | 是否完成 | 证据文件/接口/页面 | 本地集成测试结果 | 是否发生越界 | 是否需要修复 |
| :--- | :--- | :---: | :--- | :--- | :---: | :---: |
| **1. 文件上传** | PM、开发、施工角色可上传文件；Viewer 上传返回 403。 | **完成** | `/server.ts` `POST /api/projects/:projectId/documents/upload`<br/>`src/components/FileWorkflowPanel.tsx` | `tests/iteration-04-files-version-selfcheck.test.ts` 验证通过，Viewer 拦截测试输出 403 已记入 Audit Logs。 | 否 | 否 |
| | 上传后自动在 SQLite 生成 document 与 document_version 对应条目。 | **完成** | `/server.ts` 插入 `documents` 和 `document_versions` 两个实体表。 | `tests/iteration-02-tender-upload-analysis.test.ts` 及 `tests/iteration-04-files-version-selfcheck.test.ts` 双重成功断言。 | 否 | 否 |
| | 文件元数据安全关联 projectId、taskId，支持 `documentType`，写审计日志。 | **完成** | `/server.ts` 接口存储，关联外键有效。写入行动及 `AuditLog`。 | 自动落入 sqlite 对应外键列，生成由 `auditLogger` 追踪的上传日志记载。 | 否 | 否 |
| | 敏感文件 allowAIRead 默认值为 false，防止静默向量化和自动解析。 | **完成** | `migrations/202605200000_init_schema.sql` 中的字段定义，默认为 0 (false)。 | 测试验证 `allowAIRead = false` 的文件在进行 AI Gateway 调用时被彻底排除。 | 否 | 否 |
| **2. 文件版本管理** | 历史版本不可磨灭（Never Physically Overwrite）。首次版本号为 1。 | **完成** | `/server.ts` `POST /api/projects/:id/documents/upload` 判定如果关联文件存在则自动 `version_number` 递增。 | `tests/iteration-02` 验证版本不覆盖测试，存储数量为 2。 | 否 | 否 |
| | 新版本 `isLatest = 1`，旧版本 `isLatest = 0`，废弃版本状态标为 `obsolete`。 | **完成** | `/server.ts` 通过 SQLite transaction 事务完成原子级的旧版本 `is_latest` 降级和状态修订。 | 测试证明 `v1.status = 'obsolete' && v2.status = 'uploaded' && v2.is_latest = 1`。 | 否 | 否 |
| | `storagePath` 保存为文件磁盘或容器挂载路径，杜绝在数据库中存放大 binary blob。 | **完成** | `migrations/202605200000_init_schema.sql` & `backend/src/database/db.ts` | 存储的是 `/storage/f1.docx`，数据库完全承载结构化元数据。 | 否 | 否 |
| **3. 文件状态管理** | 状态字段至少支持 `draft \| uploaded \| pending_self_check \| self_check_failed \| self_check_passed \| pending_review \| final \| obsolete`。 | **完成** | `migrations/202605200000_init_schema.sql` 的 `documents` 以及 `document_versions` 状态定义。 | 均在中枢、前后台成功闭合，并在每一次变更时持久化。 | 否 | 否 |
| | 状态跃迁：`uploaded` -> `pending_self_check` -> `self_check_passed` / `self_check_failed`，写审计日志。 | **完成** | `/server.ts` `POST /api/projects/:projectId/documents/:documentId/self-check` | 调用中自动变换状态，向 sqlite 追加 `UPDATE ... SET status` 语句并写入 audit logs。 | 否 | 否 |
| **4. 最终版标记** | 自检通过（`self_check_passed` 或经忽略后的通过）可以签署签署定稿。 | **完成** | `/server.ts` `POST /api/projects/:projectId/documents/:documentId/versions/:versionId/finalize` | 经过测试，对于一致性完全通过的设计书可以普通申请定稿。 | 否 | 否 |
| | 存在自检问题时，普通团队成员锁定。只有项目负责人（ProjectManager）可填写强制定稿理由进行签署放行。 | **完成** | `/server.ts` 中的定稿接口，支持 `forceReason` 校验。权限未通过则抛出 403。 | `tests/iteration-04-files-version-selfcheck.test.ts` 验证强制事由少于 5 字符时拦截，PM 书写专业抗辩即可强制放行。 | 否 | 否 |
| | 保证项目内同一任务关联的某种资料类型（如施工大纲）仅能拥有 1 个 `final` 属性的实体，其他设为非最终。 | **完成** | `/server.ts` 内部使用 SQLite Transaction 事务将同名任务的旧定稿文件进行 `is_final = 0` 顺刷。 | 测试证明，项目主数据中完美闭环单一事实技术资料来源。 | 否 | 否 |
| **5. 自检核对规则** | 项目主数据与文件主体解析数据重合度自动扫描：<br/>1. **项目名匹配检查**：主数据项目名非对准报警。<br/>2. **旧项目名拷贝检查**：搜索数据库内历史其他项目名串查引用警示。<br/>3. **面积偏差检查**：结合容限误差百分比（Tolerance）检测面积不合规。<br/>4. **工期偏差检查**：核对文件工期数值与主数据偏离警报。<br/>5. **特殊招标资料响应**：未发现时抛出“疑似未响应 / manual_review_required”。 | **完成** | `/server.ts` 自检扫描引擎：检测一名称对准、检测二疑似旧作、检测三总建筑面积比、检测四工期比、检测五待确认。 | `tests/iteration-04-files-version-selfcheck.test.ts` 测试通过：捕捉到主数据 91,000㎡ 真实需求与文本 85,000㎡ 的偏离问题。 | 否 | 否 |
| | **修正要求**：不得将地点词和普通专有名词硬编码为 fatal words 强行阻断，更改为项目配置敏感词及旧项目模式。 | **完成** | `/backend/src/database/db.ts`（种子词改为提示性质）<br/>`server.ts` 移除阻断，支持手写忽略。<br/>`src/components/FileWorkflowPanel.tsx` | 测试证明 “徐汇”等含有地理和历史项目背景的提示词在填写专业原因后成功进行了忽略操作，不再天然阻断。 | 否 | 否 |
| **6. 问题忽略功能** | 支持对可容忍偏离、外部技术标准字眼（如引用徐汇标准）的手写专业忽略（`ignored`），理由必须 >= 5 字符。 | **完成** | `/server.ts` `POST /api/projects/:projectId/self-check-issues/:issueId/ignore`<br/>`src/components/FileWorkflowPanel.tsx` | 测试证明填写理由字数超 5 时允许豁免，且不影响自检通过判断，同时保留显示。 | 否 | 否 |
| **7. 权限和操作日志** | 元件下载权限、定稿权限、忽略权限经受 RBAC 保护。鉴权未过则在 `audit_logs` 固化审计。 | **完成** | `/server.ts` 中 `checkPerm` 中控拦截件。<br/>`backend/src/common/middleware/auth.middleware.ts` | 测试完美覆盖：Viewer 人员无权忽略、无权下载，日志均完整审计留痕。 | 否 | 否 |

---

## 二、 专项修正细节与工程化命名对齐情况

我们对本轮新增和修改的全部中英文词汇进行了全面排查，彻底消除了非工程化、情绪化、非学术性词汇：

| 原非工程化表达 | 替换修正为的工程化表达 | 所在主要逻辑模块 | 说明 |
| :--- | :--- | :--- | :--- |
| `hardshaking` | **document version management** | `/server.ts`, tests, 前端 | 统一规范为文件上传状态自检测与递增版本管理。 |
| `physical blockade` | **self-check rule** | `/server.ts` | 替换为弹性的自检审查规则推荐与人工审查标志。 |
| `fatal words list` | **configuredSensitiveTerms / oldProjectNamePatterns** | `server.ts` / db.ts | 消除绝对屏蔽逻辑，升级为多维相似旧项目引用配置词。 |
| `strict sensitive geographic keywords` | **suspiciousProjectReference** | 前端, `server.ts`, tests | 转换为常规的疑似旧项目串引检测，允许人工作业标志。 |
| `absolute submission blockade` | **issue severity / manualReviewRequired** | `server.ts` | 移除物理阻断，只做异常度标注，项目经理有强制定稿主权。 |
| `guard magic` | **permission check / audit log** | 前端，`/server.ts` | 转为常规的角色基础鉴权切面（RBAC & Middleware）。 |
| `firewall` / `shield` | **sensitive file access check** | `FileWorkflowPanel.tsx` | 命名为敏感级文件的保密访问限制，去除带有系统防护面具色彩的叫法。 |
| `radar` / `radar alert` | **file self-check / consistency status** | UI 组件，server.ts | 消除雷达称呼，替换为合规自检报告、数据偏差检测。 |
| `red alert` / `红警` | **high severity warning / manual confirmation** | 前端弹窗警告 | 去除军事化和游戏化词汇，统一替换为“旧项目引用提示”、“高级别校验未准”。 |
| `hard core` / `硬核` | **strict audit trace** | 说明文档 / 测试用例 | 替换为高精度的审计追溯，工程化合规闭合。 |
| `大底` | **project master data** | `docs/`, `server.ts`, `App.tsx` | 清理了所有将项目主数据说成大底的口语化表达。 |
| `足迹` | **master data change logs / audit trail** | 数据库字段名词，变更记录 | 统一修正为修改轨迹日志、审计数据流水。 |

### “徐汇、张江、大同” 核心地点词合规重构
- **不再天然阻断**：由于这三个敏感词仅为在以往其他案例或招标现场中配置的“疑似其他项目模式（oldProjectNamePatterns）”或“历史项目相似标识（suspiciousProjectReference）”线索，绝对不可由系统直接物理硬中断用户的提交工作。
- **专家抗辩放行机制**：任何作业人员只需在一致性问题列表中，点击“忽略”并手写不少于 5 汉字/字符的专业抗辩声明（例如：*“此处引用徐汇安全标准用于补充说明”*），系统即可平滑地更新由于敏感词而受阻的自检结论，让草卷进入标志通过并允许最终签署。
- **操作完全审计化**：所有这一类人工抗辩放行的决策，不论是在问题列表中进行忽略（`IgnoreSelfCheckIssue` ），还是由 ProjectManager 进行特批定稿（`MARK_FINAL`），其放行原因、发生人和精确到秒级的时间均会在 SQLite `audit_logs` 中形成物理性永久不可更改的凭证，保障风险可控和责任可追溯。

---

## 三、 不越界安全自审情况（Out-of-Bounds Self-Check）

根据 BidWorks MVP 的交付范围与开发规定，我们对以下**潜在越界场景**进行了全面查体，确认**均未实现**或**保持严格的占位隔离**：

1. **没有实现完整多级线上审核审批意见流转闭环**：`review_comments` 和 `review_status_logs` 数据表为迭代五纯占位，没有在迭代四提供多端流转和状态机推进。
2. **没有实现利用大模型（AI）自动改写替换原 Word / Excel 方案**：系统仅在发生一致性偏差时，向人类用户提供定位信息和引用文字，不执行全自动的原件无痕物理覆写，不损害专家署名的学术职责。
3. **没有实现 Word/Excel/PPT 的 Office 在线协同实时编辑服务**：未引入复杂的 WebOffice、OnlyOffice 或 WPS Web SDK。
4. **没有实现跨区域自动报价与全自控标书大纲段落生成**：AI Gateway 的解析和识别只停留在辅助信息提取和风险初筛清单（草稿草案），是否将 AI 参数确认入库、是否以此生成最终投标书严格保留给项目经理，在控制台有明显的“ requiresHumanConfirmation = true”手工审批阀值。
5. **没有外部大屏展示、BIM 三维深度多岗协同**：保持了单一轻量化、极干净的单多态页面自扫描。

---

## 四、 迭代四 Definition of Done (DoD) 双重验证结论

1. **Lint 验证**：成功运行 `npm run lint` 和 `tsc --noEmit`，未报任何代码缺失或 TS 规范类型冲突错误。
2. **单元与集成测试验证**：`npx tsx tests/iteration-04-files-version-selfcheck.test.ts` 及其余四轮回归测试皆 **100% 绿灯通过**。
3. **安全自控**：全部文件物理缓存和元数据表完整落底于本地 SQLite；所有角色越级交互、跨越安全线下载，均准确触发了 403 中控拒批并生成了审计档案。

**结论**：**迭代四开发结果高品质达到 Definition of Done（DoD）交付要求！**
