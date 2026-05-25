# 阿里云百炼大模型集成与联调测试指南 (Alibaba Model Studio Integration & Verification Playbook)

本指南指导技术专家及测试工程师针对 **Alibaba Model Studio (阿里云百炼 / DashScope) OpenAI 兼容接口**进行集成联调、安全合规隔离测试、防错以及端到端验证。

---

## 一、 百炼集成环境变量

在使用百炼 Provider 解析招标文件之前，请确保宿主机或容器镜像的运行环境配置文件（`.env`）中已按照下述标准写入以下内容：

```env
# 选定 AI 服务提供商为百炼
AI_PROVIDER=bailian

# 阿里云百炼 / DashScope API 密钥
BAILIAN_API_KEY=your_dashscope_api_key_here

# 阿里云百炼 OpenAI 兼容网关地址
BAILIAN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# 指定调用的大语种模型（选用 35B 参数规模 Qwen 系列）
BAILIAN_MODEL=qwen3.6-35b-a3b

# 备用轻量模型
BAILIAN_FALLBACK_MODEL=qwen3.6-plus

# 真实 API 联调测试开关（当且仅当本参数设为 true 时才允许执行真实网络请求）
RUN_BAILIAN_LIVE_TEST=true

# 敏感文件阻断：禁止 AI 读取敏感标记为真的文件
AI_ENABLE_SENSITIVE_READ=false

# 网络请求超时配额 (毫秒)
AI_REQUEST_TIMEOUT_MS=120000

# 提取允许读取的文本分段最大数量
AI_MAX_INPUT_CHUNKS=20

# 模型单次输出 Token 上限
AI_MAX_OUTPUT_TOKENS=4096
```

> **🚨 安全警告 (Security Guardrail)：**
> - 绝对禁止将真实的 `BAILIAN_API_KEY` 显式写入任何 TypeScript 源代码。
> - 任何报错日志、命令行标准输出、以及数据库持久化中，严禁泄漏 API Key 的明文，必须对该参数保持未配置或脱敏展示。

---

## 二、 自动化测试套件说明

系统配备了三层独立的自动化测试套件，用以检验百炼 Provider 从基础单元结构、系统权限路由阻断，到真实 API 联调的全部链路：

### 1. 单元结构与路由选择测试 (`tests/bailian-provider.test.ts`)
- **验证目的：** 确保 `BailianProvider` 被 `AIService` 动态路由机制正确解析和注册，检验 API 密钥缺失时的异常捕捉与容错、默认超时配额以及输出格式是否被正确控制。
- **执行方式 (无需真实密钥)：**
  ```bash
  npx tsx tests/bailian-provider.test.ts
  ```

### 2. 标书解析、阻断与人工确认逻辑测试 (`tests/tender-extraction-with-bailian.test.ts`)
- **验证目的：** 
  - 当文件 `allow_ai_read = false` 时，是否执行物理拦截且不触发外部 API 投递。
  - 当文件被标记为 `is_sensitive = true` 且全局阻断未被覆盖时，拦截器是否正确运行。
  - 人工对提炼结果进行二次校对确认前，大模型输出仅记录在 `ai_extraction_results` 待决区，不能直接修改 `project_master_data`。人工确认操作后安全写回主数据，并生成 `master_data_changes` 及 `audit_logs` 溯源记录。
- **执行方式 (基本 Mock 模拟)：**
  ```bash
  npx tsx tests/tender-extraction-with-bailian.test.ts
  ```

### 3. 真实百炼 API 联调测试 (`tests/bailian-live-integration.test.ts`)
- **验证目的：** 
  - 本套件仅在设置 `RUN_BAILIAN_LIVE_TEST=true` 且提供了有效 `BAILIAN_API_KEY` 时运行。
  - 触发真实的网络请求，在模型 `qwen3.6-35b-a3b` 上针对不相同的主题样本执行解析。
  - 检验系统能否识别出差异，防止使用被写死的样例值或本地预设静态答复，确保极佳的动态解析提炼。
- **执行方式 (带真实网络请求)：**
  ```bash
  RUN_BAILIAN_LIVE_TEST=true BAILIAN_API_KEY=your_real_key_goes_here npx tsx tests/bailian-live-integration.test.ts
  ```

---

## 三、 敏感文件及权限阻断流程说明

为防止项目合规文件或保密条款对外部大模型有泄密风险，平台建立了两道物理过滤防线：

1. **敏感标识阻断 (Sensitivity-Level Stop)：** 当文档标记 `is_sensitive = 1` 时且系统全局未指明读取权限时，在将原文合并投递至百炼 Provider 之前，会在 `server.ts` 和 `ai-permission-checker.ts` 中拦截异常，直接抛出 `PermissionBlocked`。
2. **人工可读许可 (Permission Consent Check)：** 当 `allow_ai_read = 0` 时，系统自动拒绝读取。该状态必须写回 `ai_call_logs` 作安全性物理合规痕迹备查。

---

## 四、 人工在环确认 (Human-in-the-loop Guard)

为了防止模型幻觉或失真直接污染正式的生产数据库或项目投标工期/面积主指标：
1. 大模型提取的标准格式化结果将状态配置为 `status = 'pending'` 储存于 `ai_extraction_results` 专属临时表中。
2. 每一个提取值均关联确凿的段落引用、页码指引与原文缩写片段，将 `requires_human_confirmation` 设为 `1`。
3. 只有当具有项目合规权限的人员 (如 `ProjectManager` 或者是 `Sales`) 点击了“人造确认写入”（is_confirmed = 1），主系统数据对应的单元格值才会被重构替换。
4. 所有的主数据写动作将同步写进 `master_data_changes` 日志备查且写入系统的安全审计日志 `audit_logs` 中。
