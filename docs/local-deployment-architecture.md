# BidWorks MVP 本地化部署与试点物理架构
## (Local Deployment & Pilot Site Physical Architecture)

本设计文档依据 BidWorks MVP 的核心商业场景与安全合规边界制订，旨在针对建筑、机电等具有高保密、涉密级投标要求的企业，设计**完全运行于企业内网、杜绝任何外网数据泄漏风险**的高可用、高性价比本地部署架构。

---

## 1. 部署前设与物理限制 (Deployment Assumptions)

在 MVP 及试点阶段，部署架构基于以下严格的物理与网络假设：

1. **绝对局域网隔离 (Offline Air-gapped LAN)**：
   - 整个系统（Web 客户端、Node.js 后台 API、PostgreSQL 数据库、本地物理存储、文档解析 Worker 以及本地 AI 推理大模型）全部部署在企业内部网络（Intranet）中。
   - 外部网络访问为**非必要**且默认处于断开或物理防火墙封锁状态，阻断任何商业保密数据（投标商务条款、施工大纲设计书、图纸等）通过 Internet 外泄。
2. **极简试点主硬件 (Mac mini Pilot Host)**：
   - MVP 试点阶段采用一台高性价比的物理商用计算机：如 Apple Mac mini (搭载 Apple M2 Pro/M3 芯片，32GB/64GB 统一内存，1TB SSD SSD) 作为综合微型物理机服务器。
   - 所有的基础数据库服务、AI 大模型和应用进程均通过 Docker Compose or 系统原生守护进程（systemd/launchd）运行在这一台物理机上，实现“开箱即用”的私有化单台设备运行。
3. **多端局域网访问 (Intranet Multi-Client)**：
   - 企业内标书编写专家、项目负责人（PM）、概算师与法务审计员，通过其 PC/iPad 的内网浏览器访问 Nginx 反向代理的主服务 IP（如 `http://192.168.1.100:3000`）实现多人协同作战。

---

## 2. 试点微型私有化技术栈与架构设计 (Pilot Micro-Architecture)

本架构将所有服务微服务化并运行于单台 Mac Mini 上，网络完全内联网。其核心拓扑关系如下：

```
                    [ 局域网内部终端 ] (PC/iPad 浏览器)
                            │
                            ▼
                    ┌──────────────────────────────────────────────┐
                    │            Mac mini 局域网单机服务器           │
                    │                                              │
                    │   Nginx Ingress (反向代理 / SSL 卸载: 3000端口) │
                    │                     │                        │
                    │      ┌──────────────┴──────────────┐         │
                    │      ▼                             ▼         │
                    │ [Node.js Express App]       [静态资源 Web Server]│
                    │      │                                       │
                    │      ├───► [Redis In-Memory Key/Value Cache] │
                    │      │                                       │
                    │      ├───► [PostgreSQL & pgvector DB Store]  │
                    │      │                                       │
                    │      ├───► [本地物理磁盘 / Ext4 / Storage]     │
                    │      │                                       │
                    │      ├───► [Python/Node 解析 Parsing Worker]  │
                    │      │                                       │
                    │      └─(Ollama API)─► [Ollama Local LLM]     │
                    │                       (Qwen2.5-7B @ M-chip)  │
                    └──────────────────────────────────────────────┘
```

### 2.1 核心选型与服务清单：
- **Web 静态代理**：由 **Nginx** 监听 3000 端口（或本地定制端口），负责 SPA 路由分发、资源静态压缩及 SSL 安全证书解析。
- **Backend API Application**：**Node.js (TypeScript Express 架构)**，负责业务实体关系、RBAC 权限中间件拦截、SQL 查询调度及审计日志固化，通过 `pm2` 或 `docker` 保持常驻。
- **关系与向量数据库**：**PostgreSQL (版本 >= 15)**，并预装 **`pgvector`** 插件。**【重要】** PostgreSQL 是唯一被官方允许的试点（pilot）和生产（production）目标数据库。SQLite 仅因局域网限制等原因允许作为本地开发环境下的临时演示/开发 fallback（development环境下）。在 pilot 或 production 环境下，严禁进行 SQLite 静默回落，如果配置缺漏或非 `postgres://`，系统将在启动阶段抛出 fatal 错误安全阻断，以保障数据一致性、防范碎片化。其分块特征（Chunk Embeddings）利用 IVFFlat / HNSW 进行高维相似度定位，实现“一次部署、单库闭环”。
- **缓存与异步通道**：**Redis (版本 >= 7.0)**，用作协调异步任务（如使用 BullMQ 接收文件大块解析请求）和并发安全锁及热点配置缓存，不作主数据最终持久化存储使用。
- **分层物理非结构化存储**：非结构化的大型 `.pdf`、`.docx`、`.xlsx` 原件文件物理存储直接落盘于**结构化磁盘目录**（如宿主机 `/var/bidworks/storage/`），由 Node.js 自带的 Stream 读取，严禁直接在关系数据库中存放大 binary blob。在生产多机高可用演进中，应摒弃单节点本地目录，独立配置局域网分布式 MinIO 容器机群或高性能局域网物理 NAS 挂载卷以防单点物理故障。
- **文本高速提取引擎**：**Independent Document Parser**。一个采用 Python (PDFPlumber, Mammoth, Openpyxl) 或者高能 Node 库封装的解析服务，通过对原文件进行多阶段分词、坐标标定，输出带 `页码/段落/单元格` 坐标的 JSON 结构。
- **全内网 AI 推理服务**：**Ollama**（运行本地量化模型）。Ollama 能极致释放 Mac mini Apple Silicon 芯片的 CPU/GPU 混合算力，装载 `Qwen2.5-7B-Instruct-4bit` 或 `Llama-3-8B-Instruct-4bit` 自研/开源大语言模型，通过完全本地的 Http REST API 向 Node 后台提供抽取与一致性校验支持。

---

## 3. 试点机 Apple Mac mini 可行性深度分析 (Feasibility Study)

针对 32GB / 64GB 统一内存（Unified Memory）的 Mac mini 进行试点，其性能和资源分配可行性评估如下：

### 3.1 内存及计算开销概算：
- **系统、Docker 守护及 Nginx 基底**：占用约 1.5GB ~ 2.0GB。
- **Node.js + Python Parser Worker**：常驻占用 500MB，文档解析峰值可上升到 2GB。
- **Redis & PostgreSQL (含 pgvector 内存缓冲池)**：配置 `shared_buffers` 为 4GB，Redis 1GB，合计占用 5GB。
- **Ollama 推理引擎 (Qwen2.5-7B-Int4 模型)**：
  - 7B 量化模型仅需 4.5GB ~ 5.2GB 显存/内存空间。
  - 运行并发 Batch 推理时，峰值占用约 8GB 统一内存。
- **整机运行总占用**：
  - **一般闲置及小幅解析**：约 12GB ~ 15GB。
  - **密集上传、多人并发自检、LLM 批量提取**：约 18GB ~ 24GB。
  - **可行性结论**：**32GB 版 Mac mini 完全有能力实现整机合一的完美运行！64GB 版则能提供长足的 PostgreSQL 缓存扩充跟高维语义检索极速体验！**

### 3.2 局限性与避坑指南 (Limitations & Caveats)：
- **推理冷启动**：Ollama 默认存在闲置卸载（Keep-Alive）机制。如果是冷启动，LLM 载入内存会有约 1.5 - 3 秒的延迟，后续 Token 输出能达到 35+ tok/s（在 Apple M2/M3 优秀的 GPU Core 助力下）。为了保证顺滑，建议在部署时调大 Ollama 闲置时间（设置 `OLLAMA_NUM_PARALLEL=2` 和常驻模型）。
- **极限并发瓶颈**：由于 Mac mini 缺乏纯英伟达 Tensor Cores HNSW 硬件加速，如果同一秒有超过 10 人都在调用向量检索（pgvector 聚类）和 LLM 一致性自检，计算会退化为排队等待。因此适用于**中小型 10 - 20 人的投标专业工作室**，对于公司全级大作战则必须扩容升级。

---

## 4. 生产级高可用集群演进路径 (Production Scaling Path)

当试点通过、企业决定将 BidWorks 升级至大厂集团级部署时，单台 Mac mini 架构可平滑无损迁移并横向扩展至**企业私有云多机高可用集群**：

```
                              [ 用户访问 Ingress ]
                                      │
                                      ▼
             ┌─────────────────  Nginx 负载均衡群  ─────────────────┐
             │                                                      │
             ▼                                                      ▼
   [ 应用节点 A (Express) ]                               [ 应用节点 B (Express) ]
             │                                                      │
             └──────────┬─────────┬───────────┬─────────────────────┘
                        │         │           │
                        ▼         ▼           ▼
               ┌────────┴──────┐ ┌┴───────────┴┐ ┌───────────────────┐
               │ PostgreSQL 主 │ │ Redis 哨兵  │ │   分布式对象存储  │
               │ (Primary )    │ │ (Sentinel)  │ │ (MinIO Cluster/NAS)│
               └────────┬──────┘ └─────────────┘ └───────────────────┘
                        │
                        ▼
               ┌────────┴──────┐
               │ PostgreSQL 从  │
               │ (Replica )    │
               └───────────────┘
                        ▲
                        │ (pgvector Sync)
                        ▼
               ┌───────────────────────────────┐
               │ 物理 GPU 服务器 / 推理局域网堆栈 │
               │   - Triton / vLLM 实例集群    │
               │   - NVIDIA V100 / A100 / L40S  │
               └───────────────────────────────┘
```

### 生产集群分裂方案：
1. **应用计算与底层数据彻底隔离**：
   - 将 Node.js Express 节点容器化运行在 Kubernetes (K8s) 或者三台对称服务器上，挂载 Nginx Active-Active 软负载。
2. **关系数据库独立集群**：
   - PostgreSQL 迁移至专有的多机环境，单干配置 1 主 2 从读写分离。
   - `pgvector` 通过定制编译支持高性能 **HNSW** 语法树，海量分块并发多线程并行匹配。
3. **专业分布式存储层**：
   - 弃用本地目录，升级为多节点的 **MinIO分布式集群**（支持 S3 REST API 协议）或高性能保密型物理企业 NAS。
4. **分离式高算力 AI 调度矩阵**：
   - 使用私有局域网中的独立 **GPU 推理服务器**（比如搭载 2~4 张 NVIDIA L4 24G 显卡，或者 A100 80G）通过 **vLLM** 或者 **Triton Inference Server** 暴露与 OpenAI 兼容的统一 ChatCompletion 接口。
   - 文档分割解析工作由多个无状态的 Python Parser Celery Worker 并发拆页消化。
