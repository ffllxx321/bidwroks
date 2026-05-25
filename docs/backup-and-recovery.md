# BidWorks MVP 灾难恢复、物理备份与重建架构设计
## (Disaster Recovery, Physical Backups & Rebuild Playbook)

本设计文档旨在规制 BidWorks MVP 平台在完全局域网物理部署隔离下的数据灾备规范。规章涵盖了关系库特征、原始工件、审计流水和向量特征库的多元备份方案，并针对 Mac mini 试点服务器提供极致实操的**一键重建恢复规程**，确保企业宝贵投标机密资产的高可用和不可倾覆性。

---

## 1. 灾备核心技术指标：RPO 与 RTO (RPO/RTO Targets)

为了确保核心业务在极端硬设损毁、局域网异常断电时获得强保障，系统设定如下服务保障等级：

1. **RPO (Recovery Point Objective, 恢复点目标) < 24小时**：
   - 数据最高丢失量不能突破昨日发生的提交历史。
   - 所有关系型事务、系统操作痕迹审计流水和新版施工草案支持按天做全物理备份；标书原件及最终签发版工件进行多路径每日增量同步。
2. **RTO (Recovery Time Objective, 恢复时间目标) < 2小时**：
   - 在宿主机物理硬件（如 Mac mini 主板开机损毁）彻底损坏、需要整体搬运或临时更换新设备时，**系统从开箱起网、环境重部署到完好复存，全周期操作必须在 2 小时内完美闭合完成。**

---

## 2. 局部局域网多态物理备份对象、频次与介质设计
*(Backup Strategies)*

本系统的存储由三个不同层次构成，需要采取异构隔离备份：

| 存储载体 | 备份内容与意义 | 抽取备份工具与技术 | 执行频次 | 灾备介质与物理存储地 |
| :--- | :--- | :--- | :---: | :--- |
| **A. 结构化关系数据库 (PostgreSQL / SQLite)** | 项目成员、任务锁定排定、一致性报告、高敏忽略事由、审计行为日志等。 | SQLite：拷贝 `.sqlite` 物理二进制副本。<br/>PostgreSQL：`pg_dump` 格式化导出并以 `tar.gz` 封包。 | 每 24 小时 (日备) | 物理挂载之企业局域网专用 **NAS 存储卷 (RAID6 保护阵列)** 或磁带保险箱。 |
| **B. 非结构文件物理库 (MinIO / 文件夹)** | PDF 原标书、投标写大纲、商务Excel及各历史增量 `uploaded` / `final` 版本。 | 基于 `rsync` 差分增量传输、`restic` 快照加密封存档案或 MinIO 的 `mc mirror` 命令同步。 | 每 12 小时 (半日备) | 局域网物理专线离线备用服务器 (NAS / 本地物理备份磁盘卷)。 |
| **C. 语义特征向量库 (pgvector 表)** | `document_chunks` 的高维向量嵌入特征，用于进行 RAG 比对。 | 无需独立冷备（或随 PostgreSQL 库一同直接 pg_dump 备份）。 | 随数据库运行 | **技术说明**：向量数据是由大语言模型切片生成的衍生特征。当极端故障数据剥离丢失时，只需通过原件依靠大模型再次提取或 Embedding 重算一遍即可完美重构。 |
| **D. Redis 内存对象缓存** | 会话状态、锁、大解析排队进度。 | **无需备份**。Redis 内存中仅保存易失性调度标识，断电重启后，后台无状态 Worker 依据 SQLite `draft`/`pending` 的现有数据可 100% 自愈重组。 | 无 | 无 |

---

## 3. Mac mini 一键灾备重建与平滑迁移方案
*(One-Click Rebuild Playbook for Single M-chip Host)*

在 Mac mini 物理机发生彻底不可逆的物理故障（如咖啡倾洒、雷击主板损毁）时，由局域网系统管理员（Admin）执行以下极简**一键重构快照规程**，使全新空机快速重返前线：

### 3.1 预设灾备应急包准备 (Disaster Prep Toolkit)
管理员须把下述“应急介质”刻入一个便携式企业安全 U 盘（通常常驻保存在弱电房保险箱中）：
1. 自研的局域网一键安装包或离线 docker 镜像：`bidworks-images-pack.tar`。
2. 基础配置文件快照：`.env.production` 环境变量配制和 `docker-compose.yml` 系统运行堆栈定义。
3. 数据库和文件同步的离线恢复脚本：`restore_playbook.sh`。

### 3.2 极速重建五步走实操 (Step-by-step Active Rebuild)

#### 步骤 1：新设备接入局域网并设置基础系统
- 抱来一台完好无损的 Mac mini 设备，接入原机所在的网络网口。
- 分配跟原物理服务器一模一样的特定静态 IP（如：`192.168.1.100`），保证所有编写专家的终端无感平刷。
- 安装 Docker Engine (Docker for Desktop mac, 开启 Rosetta 2 加速兼容)。

#### 步骤 2：环境解包建立物理沙盒文件目录
- 插入企业安全 U 盘，将 `docker-compose.yml` 导入新物理机根目录 `/opt/bidworks/`。
- 将增量原件存储沙盒目录结构初始化：
```bash
mkdir -p /opt/bidworks/storage/
```

#### 步骤 3：数据恢复操作（一键恢复脚本）
- 执行离线 U 盘里的 `restore_playbook.sh`。该脚本主要执行两个层级的解包和同步：
```bash
#!/usr/bin/env bash
set -e

echo "=== [START REBUILD] BidWorks MVP Mac mini 一键完全自愈恢复程序 ==="

# 1. 恢复物理文件目录 (从内网离线 NAS 差分恢复物理 PDF/Word)
echo "正在从企业物理 NAS 同步还原非结构化工件原件..."
rsync -avz --progress /mnt/nas/bidworks/storage/ /opt/bidworks/storage/

# 2. 还原 SQL 数据库
echo "正在同步拉取局域网最新 PostgreSQL 全量日备份..."
# SQLite 环境下直接拷贝物理文件：
# cp /mnt/nas/bidworks/backups/bidworks_latest.sqlite /opt/bidworks/bidworks.sqlite
# PostgreSQL 环境下使用 pg_restore 快速灌回：
docker exec -i bidworks-db pg_restore -U bidworks -d bidworks < /mnt/nas/bidworks/backups/pg_latest.dump

echo "=== [SUCCESS] 数据还原，数据库事务和非结构原件已就绪 ==="
```

#### 步骤 4：镜像载入与服务一键拉起
- 加载本地離线镜像：
```bash
docker load -i bidworks-images-pack.tar
```
- 拉起整个多容器物理堆栈（Nginx, Express, PostgreSQL, Redis, Ollama）：
```bash
docker compose up -d
```
- Ollama 会自动识别并秒级热挂载已经解压在大模型专用存储卷下的 Qwen 量化模型，不需要再次去公网下载。

#### 步骤 5：综合功能自动化回归自检 (System Verification Check)
- 服务拉起后，管理员在新物理机上调用系统内置的回归自检诊断套包：
```bash
npx tsx tests/iteration-04-files-version-selfcheck.test.ts
```
- 看到终端输出中满屏幕绿色 **`[SUCCESS]`**，即宣告此轮灾备重建在大约 15 - 20 分钟内无缝打赢，系统正式重新对全外网和全办公室放行。

---

## 4. 生产级主从同步与实时 PITR 恢复演进 (Production Continuity)

随着试点通过，升级到生产数据集群后，可将“天备级”的备份架构演进为**金融级的实时非中断灾备方案**：

1. **WAL 归档与实时增量恢复 (Point-in-Time Recovery - PITR)**：
   - 使用 **`pgBackRest`** 等大厂主力同步工具，对 PostgreSQL 的所有 **WAL (Write-Ahead Logging)** 写前日志进行准实时分钟级物理传输，固化到灾备存储。
   - 这项机制能够使系统在崩溃时，指定恢复到“今天下午 3 点 42 分 11 秒”的极细物理时间点，丢失量直接从按天算收窄至以秒算。
2. **多节点异地 / 异柜容灾**：
   - 部署两台对等的高性能私有云 PostgreSQL：一主（Primary）一备（Standby），保持流式复制（Streaming Replication）。
   - 配合自动化故障转移工具（如 `Patroni` + `ETCD`），当主物理服务器出现故障瞬间，备库仅需 5 秒即可自动升格为主数据库对外接管写事务，业务完全不断线，完美构筑工程公司的技术安全铜墙铁壁。
