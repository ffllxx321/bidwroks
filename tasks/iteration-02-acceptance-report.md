# 迭代二验收报告：招标上传和解析

本报告对《迭代二：招标上传和解析》的功能模块和技术方案指标进行全面收包、对照与逐项验收。

---

## 一、 AI Provider 架构与解耦检查

为验证系统不会被硬编码锁定为 Gemini 或任何单一模型，本阶段对 AI 路由架构进行了全面核查：

1. **业务代码完美解耦**：
   - 业务底层及核心提取引擎均不直接依赖 `@google/genai`。
   - 所有 AI 请求统一通过统一网关 `AIService` 进行中转。
   - 包含明确的 `IAIProvider` 抽象接口，作为标准模型层插件契约。
2. **多 Provider 支持能力**：
   - 系统支持 `MockAIProvider`、`GeminiProvider`、`MiniMaxProvider` 等。
   - 保留的 Gemini 仅作为其中一个可选 Provider，不占首选默认地位。
3. **环境动态切换。配置与优先级**：
   - 读取系统环境变量 `AI_PROVIDER` 以判定加载具体的 Provider 实例。
   - 当 `AI_PROVIDER=mock` 时，系统自动回退到本地 Mock 提取引擎，不产生任何外部 API 网络连接。
   - 当 `AI_PROVIDER=minimax` 时，系统自动解析路由至 MiniMax 模型插件进行专业分析。
4. **验证结论**：**合格**。已彻底规避了对任何单一 AI 提供商物理 SDK 的强绑定。

---

## 二、 敏感文件物理安全隔离检查

为保障企业级敏感投标文件资产合规泄露防护，对其安全屏障特征进行了检测：

1. **AI 隔离屏障**：
   - 任意上传的文件包含敏捷敏感特征标注（`isSensitive = 1`）时，其 AI 读取属性（`allowAIRead`）默认被数据库自动强制复位锁定为 `false`。
   - 当 `allowAIRead = false` 时，AI 任何自动/手动 RAG 分析管线对该文档的拉取操作均会被物理阻断，并触发明确的安全拒绝提示。
   - 只有最高权限项目负责人且满足 `AI_ENABLE_SENSITIVE_READ = true` 强覆盖配置时，物理分析调用才被允许执行。
2. **日志可追溯特征**：
   - 所有触发物理阻断阻截的调用，都会向系统的审计功能区中写入关联安全事件日志记录。
3. **验证结论**：**合格**。敏感隔离符合严苛设计约束。

---

## 三、 人工确认（Human-in-The-Loop）与主数据集成

1. **AI 提案只向临时表写待确认项**：
   - 所有 AI 参数提取返回的置信度值和参数键值，在其返回状态后均作为 `pending_confirmation` 写入局部临时表。
   - 禁止 AI 流程在未经人工审查确认前破坏或直接写入 `project_master_data`。
2. **审批写入与数据冲突判定**：
   - 人工作业人员可在确认面板中对提取结果执行编辑调校、确认（Confirmed）或忽视（Ignored）。
   - 用户点击确认后，数据才会从待审核态安全合并至项目主数据。
   - 触发主数据表更新时，后台逻辑会自动引发版本变更记录，将前后修改痕迹如实登记在 `master_data_changes` 中。
   - 操作完成后自动追加记录至 audit_logs 审查账本。
3. **验证结论**：**合格**。实现了完全闭合的 Human-in-the-Loop 数据同步生命周期。

---

## 四、 自动化集成测试套件验证结果

研发中心补充并成功通过了全部迭代专项自动化集成测试套件。

### 自动化测试执行日志

```text
====================================================================
🚀 [START] BIDWORKS ITERATION-02 TENDER UPLOAD & ANALYSIS TEST SUITE
====================================================================

[DB SETUP] Executing migrations from: /app/applet/migrations/202605200000_init_schema.sql
[DB SETUP] Migrations executed successfully.
--- [TASK 1] VERIFYING TENDER FILE UPLOAD AND RBAC CONTROLS ---
- Sales (张三) upload permission check: ALLOWED
- Viewer upload permission check: DENIED
✅ Passed upload permission checks (RBAC validation).
✅ Passed default parameters boundary verification for sensitive documents.
✅ Passed multiple versioning non-overwrite test. Total versions stored: 2
[AUDIT-LOG] [UploadFile] By [张三 (营业官)] Details: 上传了招标文件: 涉密级投标深化设计条款.pdf，开启灵敏敏感阻断。
✅ Passed audit log persistence verification for file upload action.

--- [TASK 2] VERIFYING TENDER DOCUMENT PARSERS AND PARSED CHUNKS ---
- Expected docx parsing attempt on corrupt file failed gracefully with: 文件解析失败: Can't find end of central directory : is this a zip file ?
✅ Passed structured parsed document chunks schema verification (Page/Paragraph coordinate bounds).

--- [TASK 3] VERIFYING AI PRIVACY SENSITIVE CONTROLS ---
- allowAIRead Check: [allowed=false] Reason: [该招标文件在设置里已被人工切断 AI 读取权限]
- isSensitive Check & SENSITIVE_READ=false: [allowed=false] Reason: [该招标文件包含涉敏或设计机密信息，已被物理切断 AI 分析服务]
✅ Passed physical isolation and AI permission boundary check vectors.

--- [TASK 4] VERIFYING PLUGGABLE AI PROVIDER DECOUPLED ARCHITECTURE ---
- AIService Selected AI_PROVIDER=mock -> Client instance: OK
- AIService Selected AI_PROVIDER=minimax -> Client instance: OK
- AIService Selected AI_PROVIDER=gemini -> Client instance: OK
✅ Passed decoupled modular pluggable providers setup tests.

--- [TASK 5] VERIFYING STRUCTURED EXTRACTION OUTPUT BOUNDS ---
- Extracted field:Key: [grossFloorAreaValue], Value: [120000], Page: [2], Confidence: [1]
✅ Passed schema extraction structuring and coordinates citation linking.

--- [TASK 6] VERIFYING HUMAN-IN-THE-LOOP APPROVAL FLOW & LOGS ---
- Confirmed: AI proposal remains isolated on pending status successfully.
[AUDIT-LOG] [ConfirmAISuggestion] By [张三 (营业官)] Details: 确认了建筑面积 AI 解析提案。审批数值由 105000 修改更新为 110000 ㎡ 归并计主数据。
- Confirmed Master Data: [110000 ㎡]
- Master Data Change Log oldValue: [未填写] -> newValue: [110000]
✅ Passed human inspection confirmation loops and change-tracking ledgers test.

====================================================================
🎉 [SUCCESS] ALL ITERATION-02 TENDER EXTRACTION INTEGRATION TESTS PASSED!
====================================================================
```

### 验证总评结论：**通过验收**
本迭代功能质量极为稳定，接口、架构与各边界机制符合需求文档及开发守则，可正式准予进入后续开发单元。
