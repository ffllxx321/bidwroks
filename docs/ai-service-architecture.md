# BidWorks MVP AI 服务与人机工程自研网关设计
## (AI Service, Pluggable AI Gateway & Human-in-the-Loop Integration)

本设计文档阐明了 BidWorks MVP 平台的大型语言模型（LLM）与生成式人工智能服务系统架构。设计聚焦于**内网脱敏、即插即用、人机工程确认与严密的审计追溯机制**，确保 AI 在完全作为“人类决策辅助、不替代专业判断”的原则下，开展标书解析、偏差初筛及合规预检工作。

---

## 1. 灵动解耦：即插即用 AI 抽象中控网关 (Decoupled AI Gateway)

为应对复杂的本地物理局域网部署和多态云端集群，BidWorks 绝对不将核心业务与特定 AI 提供商（如 OpenAI、Gemini 等）强绑定。系统构建了一套**即插即用的 AI Gateway 抽象中间层**。

### 1.1 隔离性中控网关接口定义
系统的后台 API 通过一个统一的 `AIGatewayProvider` 接口调用所有模型服务（无论是本地推理的 Ollama，还是通过公网代理的 Gemini）：

```typescript
// backend/src/modules/ai/gateway-provider.interface.ts
import { ChatMessage, ExtractionResult, SelfCheckResult } from "./types.ts";

export interface AIGatewayProvider {
  /**
   * 结构化信息提炼：基于招标文件或设计书的分块信息，提取符合工程控制参数的 JSON
   */
  extractStructuredFields(
    chunks: string[], 
    schema: Record<string, any>
  ): Promise<ExtractionResult>;

  /**
   * 一致性初筛校验：传入招标文件主数据与设计文本，比对并推荐偏差报告
   */
  analyzeConsistency(
    documentText: string,
    masterData: Record<string, any>
  ): Promise<SelfCheckResult>;
  
  /**
   * 通用智能对话交互支持
   */
  chat(messages: ChatMessage[]): Promise<string>;
}
```

### 1.2 支持的高能模型适配渠道
1. **`MockAIProvider`**：针对本地没有卡、没网的极速开发物理调试，秒级反馈预设的合规文本（防止外部部署阶段由于硬件迟缓中断研发流程）。
2. **`OllamaLocalProvider`**：纯内网绝对封闭部署的主力。后台调度局域网 Mac mini 或 GPU 服务器上的 `Qwen2.5-7B-Instruct` / `Llama-3-8B-Instruct` 接口，提供完全不受 Internet 拦截的超低延时提取。
3. **`GoogleGeminiProvider`**：当系统部署在支持外网安全通道的环境时，可动态切换到云端 **Google Gemini API** (如 `gemini-2.5-flash` 或其高能推理版)。通过 Node 官方 `@google/genai` 深度融合，输出极高推理能力的抽取判断，并原生支持学术级结构化 JSON 强校验（Structured Outputs）。

---

## 2. 局部项目级 RAG 与安全数据审查
*(Security Filtering & Project-Level RAG)*

为了辅助项目经理分析高达数百页的超级施工大纲，BidWorks 内置了一个安全可控的**项目级 RAG (Retrieval-Augmented Generation)**。

### 2.1 文本切片（Chunking）与特征映射
- **切片规则**：基于 PDF / Word 文本解析器所导出的 JSON 结构，按照 **500 - 800 字符（Tokens）** 作为一个实体分块，并配置 **100 字符的段落滑窗重合性（Overlap）**，确保由于切分可能造成的边界术语、造价数不丢失。
- **本地词特征计算**：采用完全部署在内网宿主机上的小算力 Embedding 模型（如 `bge-m3` 或 `m3e-base`），生成高维特征向量落盘于关系数据库，不需要向公网模型传输任何物理标书分块。

### 2.2 涉密与非授权阻断硬屏蔽机制
在将分块扔向大模型或向量搜索之前，必须强制进行**白名单与不可穿透检验**：

```
                    ┌────────────────────────────┐
                    │     用户发送 AI 自检请求    │
                    └──────────────┬─────────────┘
                                   │
                                   ▼
                  /─────────────────────────────\
                 <  该文件 is_sensitive === 1 ?  >
                  \─────────────────────────────/
                     /                       \
             [是]  /                           \ [否]
                 ▼                               ▼
  /─────────────────────────\           /──────────────────────────\
 < 有安全管理授权和专批角色？ >          < documents.allow_ai_read  >
  \─────────────────────────/           <        === 1 ?           >
        /              \                \──────────────────────────/
    [是] /          [否] \                      /              \
        ▼              ▼                   [是] /          [否] \
  [通过安全线]    [ 拦截并阻断 ]                 ▼              ▼
  进行大模型抽取    拒绝 AI 读取并写日志  大模型向量计算与RAG   [ 物理安全屏蔽 ]
                                                              AI 无法抓取分块
```
- 如果一个招标文件在库里被打上了保密涉密标 `is_sensitive = 1`，并且当前的局域网管理员未配置 explicit `AI_ENABLE_SENSITIVE_READ = true` 的特殊全局保险（或是普通 Viewer 发起的请求），**AI Gateway 的中枢控制器物理机制必须抛出异常：`AI_ACCESS_DENIED_EXCLUSION: File and chunks are completely shielded from AI parsing`**。
- 这项安全底线设计确保企业保密资产获得了物理防范与自主合规。

---

## 3. 人类最后确认原则：人机工程交互机制 (Human-in-the-Loop)

BidWorks 在系统建设中绝对奉行一个指导性价值观：**“自检只能提示、AI 仅能建议，必须人类做最后签字闭环，不得替代专业判断。”**

### 3.1 AI 数据流沙盒隔离：`requiresHumanConfirmation = true`
当一个招标文件（如 PDF）经过 AI Gateway 提取后，所获得的控制性参数（如：总建筑面积 120,500 ㎡，要求总工期 540 日历天）**绝对禁止直接改写、覆盖对应项目的主数据库表 `project_master_data`**。

1. **临时沙盒状态**：所有的 extraction 生成一条带有 `requiresHumanConfirmation = true` 的临时提案（Proposal），保存在提取提案影子表或挂起在 `documents` 的 `meta_payload` JSON 状态里，状态打标为 `'pending_approval'`。
2. **可视人机比对（Side-by-Side Review Page）**：
   - 系统为造价师或商务总监渲染一面双向审阅墙。
   - 左侧：高亮显示标书中被 AI 圈定的原始大纲页码和引用引用文本（如：“第22页第三大段原文：工程建筑面积共约 120500 ㎡”），附带 AI 推理的可信度分值。
   - 右侧：提供可录入、可人工手工修改微调的建议值输入框（如：手动由于施工安全余量，将 AI 的 120500 修正为 120000 ㎡ 的管理主调）。

### 3.2 审计日志的物理留痕与变更轨迹追溯
唯有在用户点击了“**确认并并入主数据中心 (Approve Suggestions to Master Data)**”后，该组数值才能通过 SQLite 事务转移入 `project_master_data`：

```typescript
// 写入审计日志的典型元数据捕获字段 (Auditing changes)
const oldValue = previousMasterData.gross_floor_area_value;
const newValue = humanApprovedValue; // 用户在 UI 最终确认并修改的数值

auditLogger.logAction({
  projectId: projectId,
  operator: currentUser.username,
  role: currentUser.role,
  action: "ConfirmAISuggestion",
  details: `确认了建筑面积 AI 解析提案。审批数值由原先 AI 推荐的 ${aiExtractedValue} 经专家核定为 ${newValue} ㎡ 并平移写入工程中控主数据。`
});
```

这种追溯链条明确划分了系统软件提供的信息化建议与人类专家的专业责任。在后期任何环节发生涉密及合规质疑时，能够明确溯源，保障责任闭环。
