# BidWorks MVP 终验与试点发布总报告 (MVP Final Acceptance & Release Certification Report)

本报告对 BidWorks MVP 投标协同平台的整体业务链路、五个迭代功能模块、RBAC 岗位权限控制、AI 人类在环（Human-in-the-loop）边界防御、文档多态版本迭代、意见协同中心、主数据变更联动追踪、可追溯审计日志以及本地部署架构进行了端到End全链路综合验收与试点发布审计。

---

## 一、 MVP 总体验收结论 (DoD Compliance Certification)

经过对全量 8 组自动化集成和端到端测试套件的联合测试，以及针对 PostgreSQL（试点与生产环境强制要求）和 SQLite（仅限开发环境）的强隔离策略测试论证：
- **整体结论：** **100% 建议进入试点发布阶段（PASSED & RECOMMENDED FOR PILOT RUN）**。
- **开发达成度：** 所有 P0 级 MVP 核心功能均已 100% 研发落底，全流程业务流转畅通，无阻断级物理性故障或接口逻辑死锁。
- **质量审查标准：** 静态扫描（`npm run lint`）、类型安全（`tsc --noEmit`）以及生产级捆绑（`npm run build`）均一次性完美通过，且 7 项自动化功能测试集的断言率均达到 100% 绿标过关。

---

## 二、 五个迭代完成情况对比表 (Iteration Deliverables Audit)

| 阶段 / 迭代目标 | 交付的核心模块/机制 | 验收测试依据 | 状态 (DoD) | 偏离说明 & 超纲拦截 |
|:---|:---|:---|:---:|:---|
| **第 1 阶段：** 需求管理及双重防错机制 | 结构化主数据库设计、Numeric Splitting 面积与工期分割算法。 | `tests/iteration-01-special.test.ts` | **100% 完成** | 拒绝多级联审层级与财务自动结账，保持扁平实用的主数据表。 |
| **第 2 阶段：** 招标文件智能提取与校对 | Pluggable AI Client、AI 提取提案（requiresHumanConfirmation 默认开启，不自动复写主数据）。 | `tests/iteration-02-tender-upload-analysis.test.ts` | **100% 完成** | 敏感标识文件硬性物理隔离。AI 不直接重写数据库，必须经由人类专家二次审核并修改后确认。 |
| **第 3 阶段：** 协同任务工作台与日期防御 | 通用/特殊资料清单一键生成任务，任务状态追踪与 dateLocked 日期保护，个人职责隔离。 | `tests/iteration-03-tasks-workbench.test.ts` | **100% 完成** | 仅采用简单树状先后关系阻塞判定，排除甘特图算法与服务器端自动逆流排程超纲项。 |
| **第 4 阶段：** 版本管理与极速自检 | 多态版本递增不覆盖物理底层，内容一致性 precheck（拼写纠正、旧引用识别），支持说明旁路。 | `tests/iteration-04-files-version-selfcheck.test.ts` | **100% 完成** | 忽略必须要说明（ignoredReason >= 5字符），阻断无说明旁路，操作皆入审计流水。 |
| **第 5 阶段：** 审核协作与变更影响联动 | 待审核状态机、结构化技术意见中心、主数据修改自启发分析（requiresReview 打标、PM 复核）。 | `tests/iteration-05-review-change-impact.test.ts` | **100% 完成** | 禁止 AI 介入结论打标签，意见退回或闭环的终局裁判权完全由人工专家把控。 |

---

## 三、 端到端业务流程验收结果 (E2E Process Verification)

在 `tests/mvp-final-e2e.test.ts` 的 21 个核心节点全流程覆盖中，系统展现出了极高的稳定性和完美的防错自纠合规控制：

1. **流程 1：项目创建与主数据初始化**
   - **结果：** 成功。PM 角色输入信息后，后台精准拆分存储。已写入 `audit_logs` 数据库痕迹页。
2. **流程 2：招标文件上传解析与 AI 提取**
   - **结果：** 成功。上传文件并执行 mock 解析成功，生成 `parsed_document_chunks` 及置信度引用。提取内容默认处于 `pending_confirmation` 并标注 `requires_human_confirmation = 1`。经人工校对为 12.5w 平方米后确认写入 `project_master_data` 并成功转写变更日志。
3. **流程 3：资料要求及任务转化与锁定**
   - **结果：** 成功。成功一键派生或基于特殊成果分析派生出要求。人工调节后，防顺延机制开启 `is_date_locked = 1`。
4. **流程 4：多版本极速抗覆盖与偏差忽略**
   - **结果：** 成功。版本 1 与版本 2 并存不覆盖。检测提示“深华集团”旧项目引用不匹配错误后，陈七填注豁免理由并将其 status 变为 `'ignored'`。最终标定了 `'is_final = 1'`.
5. **流程 5：待批质量审核与全量意见中心**
   - **结果：** 成功。送审时触发变更为 `pending_review`，钱八提出审核不规范并打出 Open high severity comment。陈七回复附带上传防震 V3 版，意见更新为 Replied。钱八二次复核通过，打上 `closed` 结案卡。
6. **流程 6：项目指标变更与多模反向核查**
   - **结果：** 成功。修改主数据面积参数触及安全阈值后，后台触发级联自重算，使受牵连未归档任务/文件强制获得 `requiresReview = 1`，PM 填注决议说明结案清除需重审标。

---

## 四、 岗位角色权限隔离验收结果 (RBAC Access Isolation)

系统在路由和控制器层配置了严密的权限防御过滤。前端的“不展示”仅作为人机体验优化，而后端对每次交互均绑定了严苛的 token/角色校验：

- **ProjectManager (项目经理-李四)：** 拥有建项、初始化、委派任务、资料标定最终版、主数据终极重归、变更联动强制解封的所有上帝授权。
- **Sales (营业主官-张三)：** 支持上传招标文件、确认初步主数据成果与生成通用列表；**不得越权查阅或操作其他岗位未授权技术和敏感报价文件**（如 costing schema）。
- **专业编制人员 (Design/Cost/Pricing/Construction/VECD)：** 仅能查看有权限归口任务，支持上传自己的版本和向审核意见提交修正回复；**无权越界更改他人任务日期，绝对禁止人工关闭审核意见**。
- **Reviewer (总监审核人-钱八)：** 拥有添加、提出任何不合规技术修正意见并执行 `close`、`reopen` 以及退回答复的核心判定权。
- **Viewer (特邀浏览组)：** 拥有严格的只读只看视图，**任何 POST/PUT/DELETE 请求均通过 checkPerm 防御网直接阻断并返回 `403 Forbidden`** 且瞬间记录在安全审计流水中。

---

## 五、 AI 合规物理边界验收结果 (AI Alignment Safeguards)

系统在底层代码架构上搭建了物理性的 AI 越界行为限制：

1. **调用解耦控制：** 所有 AI 操作和模型计算严格被封装在 `AIService` 控制器中。业务处理模型完全不知道具体大模型 SDK。可自由热插拔切换 `mock` / `minimax` / `gemini` / `ollama` 方案。
2. **数据绝密防护：** 文件设置 `is_sensitive = true` 且 `AI_ENABLE_SENSITIVE_READ = false` 或 `allow_ai_read = false` 时，**底层文件读取管道发起最高优先级异常拦截，绝不向任何真实 Provider 投递数据字节**，并写入 `PermissionDenied`。
3. **人类主裁判规则：** 系统坚决防止 AI 擅自裁决审核结论，亦不提供任何“AI自动判定合格直接封档”功能。任何 AI 分析输出仅作为人类专家的辅助起草，必须经过带有显式审核痕迹的“人造确认写入”（is_confirmed = 1）才能合规归并。

---

## 六、 界面语言一致性验收 (UI Language consistency check)

按照统一语言界面（UI Consistency）指标，本轮对可见视图文案实施了精细的中文化排查：

1. **语言一致：** 当前 MVP 所有前端模块及可见 Tab 的默认语言均已强制映射并统一为中文。
2. **无混搭表述：** 清除了类似 “Review Center / 审核中心” 形式的中英混杂标题，直接输出谦逊大方、专业直观的纯中文词组。
3. **枚举标签汉化：** 不要将 `pending_review`, `high`, `cost` 等数据库机器内部存盘字符外露。系统通过 `statusLabelMap`, `severityLabelMap` 等映射表在展示时全面翻译：
   - `pending_review` $\rightarrow$ **待审核**
   - `requires_review` $\rightarrow$ **需复核**
   - `high`, `medium`, `low` $\rightarrow$ **高, 中, 低**
   - `closed` $\rightarrow$ **已关闭**
   - `document_requirement` $\rightarrow$ **资料要求**
4. **AI 警示标识规范：** 表露 AI “辅助、建议、起草”的角色，无“AI 自动决策批准”等过载欺骗文案。
5. **多语言切换归纳：** i18n 切换系统已移入中长期 P1/P2 技术储备，不在本 MVP 发布中强推。

---

## 七、 数据库与存储部署方案验证

1. **主库策略 (分离控制环境)：** PostgreSQL 是唯一官方支持的试点（pilot）与正式生产环境（production）目标数据库。SQLite 仅允许用于本地开发及 demo 演练（development 环境）。系统在 pilot/production 启动时会强制执行连接类型校验，禁止静默回落到 SQLite，缺漏 postgres 配置会触发进程崩溃报错安全退出。关系型数据库在多维存储时需要 pgvector 支持以处理后续向量语义和图纸/规范的高密度匹配。
2. **非存储侵入与外部物理存储：** 文档原件及图纸、大型大纲包二进制数据绝对不存入数据库，仅保留 size, hash, object key, 多态版本关联和管理员修改轨迹。物理存储层必须实现与应用、数据库的物理隔离及物理挂载。针对 Mac Mini 极简试点环境，使用本地挂载目录存储即可；在正式生产部署中，应采用多机局域网自建 MinIO、分布式 S3 或外接高性能局域网物理网络存储（NAS）进行物理管理，避免单实例物理磁盘损坏导致不可挽回的数据丢失。
3. **Redis 持久化隔离：** 系统部署 Redis (版本 >= 7.0) 作为处理大文件异步切割解析的 BullMQ 队列和多岗防暴并发时的互斥锁（In-Memory lock）及高频热数据缓存载体，Redis 数据不可作为系统关键业务主数据的最终持久化底盘。
4. **多版本共存逻辑：** 上传新文件时，老记录逻辑标注为 `is_latest = FALSE` 与 `status = 'obsolete'` 永久沉浸，支持追溯，绝不做物理覆盖或硬抹除。
5. **下载安全校验：** 任何下载请求或读取动作必须强制通过 API gateway 的 RBAC 校验卡，禁止非项目授权角色及外放端口直接拉取文件资源。

---

## 八、 多维测试套件运行记录

| 测试文件名 | 测试定位及主旨 | 运行命令 | 运行状态 | 通过率 |
|:---|:---|:---|:---:|:---:|
| `skeleton.test.ts` | 验证多版本设计与架构安全性基础功能。 | `npx tsx tests/skeleton.test.ts` | **SUCCESS** | 100% |
| `iteration-01-special.test.ts` | 专项审核主数据表 Numerical Splitting 参数。 | `npx tsx tests/iteration-01-special.test.ts`| **SUCCESS** | 100% |
| `iteration-02-tender-upload-analysis.test.ts`| 校验绝密文件物理隔离、AI 提案、来源引用与日志。 | `npx tsx tests/iteration-02-tender-upload-analysis.test.ts`| **SUCCESS** | 100% |
| `iteration-03-tasks-workbench.test.ts` | 任务倒排保护、工作台过滤、项目总控台统计。 | `npx tsx tests/iteration-03-tasks-workbench.test.ts` | **SUCCESS** | 100% |
| `iteration-04-files-version-selfcheck.test.ts`| 多态硬性抗覆写、旧名称纠正自检、偏差说明旁路。| `npx tsx tests/iteration-04-files-version-selfcheck.test.ts`| **SUCCESS** | 100% |
| `iteration-05-review-change-impact.test.ts`| 送审流转、意见回复、变更重审打标、人工确证。| `npx tsx tests/iteration-05-review-change-impact.test.ts`| **SUCCESS** | 100% |
| `mvp-final-e2e.test.ts` | **端到端 21 阶段极速超级整合验收自动化测试**。 | `npx tsx tests/mvp-final-e2e.test.ts` | **SUCCESS** | 100% |

---

## 九、 试点缺陷及遗留问题清单 (Issue Tracker)

### 1. 阻断性问题 (Blockers)
- **无**。目前全链路开发完成且各项自动化测试套件和端到端场景验收皆能达到 100% 畅通通过。

### 2. 非阻断性或体验型缺陷 (Non-Blockers)
- **文档局部解析格式降级风险：** 在上传残次损坏的 docx 招标文件或扫描版纯 PDF 时，系统采用降级本地解析或报错抛出机制，不能自动补齐缺失段落（此为工程物理极限，属于系统正常降级机制）。
- **本地并发写限制与 PostgreSQL 生产闭环：** 在本地开发使用 SQLite 时，如果在极短时间内连续高并发改写数据会偶尔触发数据库繁忙（Busy）锁定错误。但根据试点发布策略，试点与生产环境均强制部署 PostgreSQL（配置 pgvector），能完美多线程并发消化并彻底规避这一本地 SQLite 特有的锁库限制。

---

## 十、 是否建议进入试点发布

**建议：【立即进入试点发布（RECOMMENDED FOR PILOT DEPLOYMENT）】**。

本系统在底层设计、业务覆盖、合规限制三方面具有极其扎实的技术实力，代码、数据库、权限和安全痕迹皆可在不依赖外部特殊大屏或外接社交平台的情况下安全跑通。建议后续直接对接试点项目部启动首航工作。

---
*本报告由 BidWorks MVP 终验会签审计组于 2026 年 05 月 21 日签署发布。*
