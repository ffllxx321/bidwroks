# BidWorks 投标一体化生产平台 MVP 数据字典与状态冻结 (Data Fields)

本规格定义 MVP 核心业务实体的模型设计、关联映射（ER 结构）及实体状态声明，为后续数据库架构提供理论参照。

## 1. 投标项目主数据实体 (ProjectMasterData)

项目主数据是平台的“单一真实信息源”，各核心字段对应明确的安全限制与变更影响划分特征。

| 中文物理字段名 | 字段存储技术Key | 字段类型 | 变更重要级别 | 是否必填 | 一致性校验目标 | 主责修改权限角色 | 受变更影响需触发提醒/复核的角色 |
| :--- | :--- | :--- |:--- |:--- | :--- | :--- | :--- |
| **项目名称** | `projectName` | string | **低** | 是 | 全局投标文件封皮及正页首段名称校验 | 营业、项目负责人 | 资料汇总员 |
| **业主名称** | `clientName` | string | **低** | 是 | 方案合同签章甲方名称自测核验 | 营业、项目负责人 | 资料汇总员 |
| **建设地点** | `projectAddress`| string | **中** | 是 | 地名残留、地方性规范冲突检测 | 营业、项目负责人 | 施工技术、设计 |
| **建筑类型** | `buildingType` | enum | **中** | 是 | 结构及消防指标对标自测 | 设计、项目负责人 | 设计、概算 |
| **建筑面积 (㎡)**| `grossFloorArea`| decimal | **中** | 否 | 设计说明与施工方案数值一致性自析 | 设计、项目负责人 | 设计、概算、施工技术、资料汇总员 |
| **投标截止日期**| `bidClosingDate`| date | **高** | 是 | 重算/修正倒排工步所有开始/提交限期 | 营业、项目负责人 | 全员（计划重算） |
| **答疑截止日期**| `clarificationDue`|date | **中** | 否 | 倒排工作流提醒与答疑跟踪卡点 | 营业 | 项目负责人、营业 |
| **现场踏勘日期**| `siteVisitDate` | date | **中** | 否 | 临设布置和施工技术大纲准备周期校核 | 营业 | 施工技术、项目负责人 |
| **总工期要求** | `totalDuration` | int | **高** | 否 | 施组方案内工期指标、进度网格对标校验 | 施工技术、项目负责人 | 施工技术、概算、项目负责人 |
| **招标工程范围**| `tenderScope` | text | **高** | 否 | 自检防丢章、合同核算边界自检 | 营业、项目负责人 | 概算、施工技术、报价 |
| **施工承包范围**| `constructScope`| text | **高** | 否 | 技术标、报价标工程量分界线判定 | 施工技术、项目负责人| 施工技术、概算、报价 |
| **设计承包范围**| `designScope` | text | **中** | 否 | 方案图、BIM和专项分工重叠防落自析 | 设计、项目负责人 | 设计、设计领导、概算 |
| **合同付款条件**| `paymentTerms` | text | **高** | 否 | 概算测算、项目资金流和报价加价系数核算| 报价、项目负责人 | 概算、最高指导人、项目负责人 |
| **BIM规划要求**| `bimRequirements`| text | **中** | 否 | 设计/临设建模精度及专业覆盖自析对标 | 设计、施工技术 | 设计、施工技术 |
| **绿色建筑星级**| `greenBuildings`| text | **中** | 否 | 空调、墙材及环保用材指标一致性校验 | 设计、施工技术 | 设计、施工技术 |
| **安全文明目标**| `safetyLevel` | text | **中** | 否 | 临设搭建、排桩支护、特定文明费提取校验 | 施工技术 | 施工技术、概算 |
| **标案质量目标**| `qualityGoal` | text | **中** | 否 | 重大节点混凝土、钢筋取样等专项验收要求 | 施工技术、项目负责人| 施工技术 |
| **VECD指派约束**| `vecdConstraints`|text | **中** | 否 | 降价限额及结构选型优配范围限制 | VECD、项目负责人 | VECD、概算、报价 |

---

## 2. 投标作业任务实体 (BidTask)

| 数据库字段名称 | 技术标 Key | 字段类型 | 约束值或枚举定义 | 备注与来源 |
| :--- | :--- | :--- | :--- | :--- |
| **任务主键ID** | `id` | uuid | 唯一自增 UUID | 系统自动计算生成 |
| **任务名称** | `taskName` | string | 不得超过 100 字符 | 如“上海青浦施组大纲编制” |
| **关联项目外键**| `projectId` | uuid | 对应 `Project.id` | 强制级级联级联作罢 |
| **所属业务阶段**| `bidPhase` | enum | `TenderParse` (招标解析), `Design` (设计),<br>`Estimation` (概算), `Construction` (施工),<br>`Review` (评审汇总), `Archive` (归档) | 用于排序与看板分类检索 |
| **主责编制人** | `assigneeId` | uuid | 对应 `User.id` | 在个人工作台展示本人待办 |
| **主责审核领导**| `reviewerId` | uuid | 对应 `User.id` | 在个人工作台展示他人待批 |
| **计划开始时间**| `plannedStart` | date | 必须小于或等于最终提交日 | 计划倒排引擎计算出后，支持手工微调 |
| **建议提交日期**| `plannedSubmit`| date | 自检与审核的门槛界限时间 | 逾期未上传触发总控台预警 |
| **建议核审限期**| `plannedReview`| date | 计划于此日期前完成终审 | 逾期触发审核人桌面挂单置亮 |
| **任务生产状态**| `taskStatus` | enum | `Unstarted` (未开始), `InputPending` (待输入),<br>`InProcess` (进行中), `SelfChecking` (自检中),<br>`ReviewPending` (待审核), `Reviewing` (审核中),<br>`NeedsRevision` (需修改), `NeedsReChecking` (需复核),<br>`Completed` (已完成), `AtRisk` (有风险), `Cancelled` (取消) | P0 关键控制链 |
| **数据涉密级别**| `isSensitive` | boolean| `true` (涉密) / `false` (公开) | 若置为 `true`，系统默认不允许非指定人调阅 |

---

## 3. 产出工件资料实体 (Document / File)

| 数据库字段名称 | 技术标 Key | 字段类型 | 约束值 | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| **文件主键ID** | `id` | uuid | UUID | 系统自建 |
| **文件存储原名**| `fileName` | string | 原始文件名，防注入处理 | (上传文件时留痕记录) |
| **任务关联外键**| `taskId` | uuid | 关联特定 `BidTask.id` | 单个任务下可产生多个版本的关联文本 |
| **当前软件版本**| `versionCode` | string | 格式如 `v1`, `v2`, `v3` 等 | 每次覆盖上传时，在原系列版本号累增 |
| **文件提交状态**| `fileStatus` | enum | `Draft` (草稿), `Uploaded` (已上传),<br>`SelfChecking` (自检中), `ReviewPending` (待审核),<br>`Reviewing` (审核中), `NeedsRevision` (需修改),<br>`Approved` (已审核通过), `Final` (最终版),<br>`Obsolete` (已作废) | 限制多岗不同的编辑行为 |
| **敏感核心标记**| `isSensitive` | boolean| 默认为 `false` | 概算及报价底表必须为 `true` |
| **AI读取批准码**| `isAiAllowed` | boolean| 默认为 `false` 极度受控 | 敏感或高度机密文件绝对置为 `false` |
| **物理存储路径**| `filePath` | string | 在安全网域内的分布式物理路径映射 | 前台无直接物理暴露下载链接 |
