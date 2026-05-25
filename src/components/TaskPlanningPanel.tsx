import React, { useState, useEffect } from "react";
import { 
  FileText, Plus, HelpCircle, Check, AlertCircle, RefreshCw, Timer, 
  Calendar, UserCheck, Trash2, GitBranch, ArrowRight, Settings, 
  Clipboard, Clock, Lock, FilePlus, Zap, Edit, Activity, CheckCircle, ShieldAlert 
} from "lucide-react";
import FileWorkflowPanel from "./FileWorkflowPanel.tsx";

const reqTypeLabelMap: Record<string, string> = {
  Technical: "技术类资料",
  Commercial: "商务类资料",
  CivilWork: "施工类资料",
  BIMRequirements: "BIM设计规划",
  GreenBuilding: "节能环保措施",
  Safety: "安全防护论证",
  Custom: "其他特殊资料"
};

const roleLabelMap: Record<string, string> = {
  Design: "设计负责人",
  Construction: "施工技术负责人",
  Sales: "营业/商务负责人",
  Cost: "测算负责人",
  VECD: "VECD深化负责人",
  ProjectManager: "项目负责人",
  SystemAdmin: "系统管理员",
  Reviewer: "审核领导"
};

interface TaskPlanningPanelProps {
  projectId: string;
  currentUser: { username: string; role: string };
  bidClosingDate: string;
}

export default function TaskPlanningPanel({ projectId, currentUser, bidClosingDate }: TaskPlanningPanelProps) {
  const [requirements, setRequirements] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"requirements" | "tasks">("requirements");
  const [selectedTaskForFiles, setSelectedTaskForFiles] = useState<any | null>(null);

  // Manual Requirement Form State
  const [showReqForm, setShowReqForm] = useState(false);
  const [newReqName, setNewReqName] = useState("");
  const [newReqType, setNewReqType] = useState("Technical");
  const [newReqRole, setNewReqRole] = useState("Design");
  const [newReqDays, setNewReqDays] = useState(3);

  // Manual Task Form State
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskType, setNewTaskType] = useState("Task");
  const [newTaskId, setNewTaskId] = useState("");
  const [newTaskResp, setNewTaskResp] = useState("user-pm");
  const [newTaskRev, setNewTaskRev] = useState("user-review");
  const [newTaskPriority, setNewTaskPriority] = useState("Medium");
  const [newTaskRisk, setNewTaskRisk] = useState("Low");
  const [newTaskStart, setNewTaskStart] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [newTaskReviewDue, setNewTaskReviewDue] = useState("");
  const [newTaskDeps, setNewTaskDeps] = useState<string[]>([]);

  // Task inline editing state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editStatusReason, setEditStatusReason] = useState("");
  const [editResp, setEditResp] = useState("");
  const [editRev, setEditRev] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editReviewDue, setEditReviewDue] = useState("");
  const [editReason, setEditReason] = useState("");

  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const headers = {
    "Content-Type": "application/json",
    "x-user-role": currentUser.role,
    "x-user-id": currentUser.username,
    "x-username": currentUser.username
  };

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 6000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Load document requirements
      const resReq = await fetch(`/api/projects/${projectId}/document-requirements`, { headers });
      if (resReq.ok) {
        const reqJson = await resReq.json();
        setRequirements(reqJson);
      }

      // 2. Load active tasks
      const resTasks = await fetch(`/api/projects/${projectId}/tasks`, { headers });
      if (resTasks.ok) {
        const tasksJson = await resTasks.json();
        setTasks(tasksJson);
      }
    } catch (err: any) {
      showNotification("error", "加载计划数据失败: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  // Generate generic common templates requirements
  const handleGenerateCommon = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/document-requirements/generate-common`, {
        method: "POST",
        headers
      });
      if (!res.ok) throw new Error("API返回错误");
      showNotification("success", "通用资料要求清单生成完毕，已自动写入项目底板。");
      await loadData();
    } catch (err: any) {
      showNotification("error", "生成失败: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate specialized requirements from AI extractions
  const handleGenerateFromExtractions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/document-requirements/generate-from-extractions`, {
        method: "POST",
        headers
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "提取过程异常");
      }
      showNotification("success", `AI汇总提炼提取成功：对照招标文件提取特征，新提炼了 ${data.count} 项特殊资料编制要求。`);
      await loadData();
    } catch (err: any) {
      showNotification("error", "生成失败: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit manual doc requirement
  const handleAddRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReqName.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/document-requirements`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          requirementName: newReqName,
          requirementType: newReqType,
          defaultResponsibleRole: newReqRole,
          suggestedPreparationDays: newReqDays
        })
      });
      if (!res.ok) throw new Error("保存失败");
      
      showNotification("success", `手动录入资料要求 [${newReqName}] 成功！`);
      setNewReqName("");
      setShowReqForm(false);
      await loadData();
    } catch (err: any) {
      showNotification("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  // Skip / Ignore requirement
  const handleIgnoreRequirement = async (reqId: string, name: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/document-requirements/${reqId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "ignored" })
      });
      if (!res.ok) throw new Error("无法更新状态");
      showNotification("success", `已忽略资料要求: ${name}`);
      await loadData();
    } catch (err: any) {
      showNotification("error", err.message);
    }
  };

  // Convert Requirement to formal active Task
  const handleConvertToTask = async (reqId: string, name: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/document-requirements/${reqId}/convert-to-task`, {
        method: "POST",
        headers
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "转换失败");
      }
      showNotification("success", `成功转换！[${name}] 已变为带倒排计划的活跃任务。`);
      await loadData();
    } catch (err: any) {
      showNotification("error", "转换失败: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Manual Task creation
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          taskName: newTaskName,
          taskType: newTaskType,
          responsibleUserId: newTaskResp,
          reviewerUserId: newTaskRev,
          priority: newTaskPriority,
          riskLevel: newTaskRisk,
          startDate: newTaskStart || undefined,
          dueDate: newTaskDue || undefined,
          reviewDueDate: newTaskReviewDue || undefined,
          dependencyTaskIds: newTaskDeps
        })
      });
      if (!res.ok) throw new Error("手动建单任务保存失败");

      showNotification("success", `成功创建手工编制任务: ${newTaskName}`);
      setNewTaskName("");
      setNewTaskDeps([]);
      setShowTaskForm(false);
      await loadData();
    } catch (err: any) {
      showNotification("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  // Update Task status
  const handleUpdateStatus = async (taskId: string) => {
    if (!editStatus) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          status: editStatus,
          reason: editStatusReason || "更新进度完成度"
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "权限校验不满足或岗位被隔离。");
      }
      showNotification("success", "任务状态进度更新成功，变更记录已追溯存档。");
      setEditingTaskId(null);
      setEditStatusReason("");
      await loadData();
    } catch (err: any) {
      showNotification("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  // Update Task responsible and reviewer assignees
  const handleUpdateAssignees = async (taskId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/assignees`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          responsibleUserId: editResp,
          reviewerUserId: editRev
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "分工重组失败");
      }
      showNotification("success", "岗位职责重新分工和对准成功。");
      setEditingTaskId(null);
      await loadData();
    } catch (err: any) {
      showNotification("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  // Update dates manually (Locks automated dates re-plan)
  const handleUpdateDates = async (taskId: string) => {
    if (!editStart || !editDue || !editReviewDue) {
      showNotification("error", "请完整填写三个编制和审核控制节点时间");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/dates`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          startDate: editStart,
          dueDate: editDue,
          reviewDueDate: editReviewDue,
          reason: editReason || "手动锁定进行工期自定义调整"
        })
      });
      if (!res.ok) throw new Error("排期锁定写入错误");
      showNotification("success", "时间微调已入库锁定，不受后续自动倒排逻辑影响。");
      setEditingTaskId(null);
      setEditReason("");
      await loadData();
    } catch (err: any) {
      showNotification("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  // Click Trigger recalculation of dates for unlocked tasks
  const handleRecalculateDates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/recalculate-dates`, {
        method: "POST",
        headers
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "无法进行自动排程");
      showNotification("success", `进度倒排计算生效！已为项目中 ${data.count} 个未锁定任务刷新排程。`);
      await loadData();
    } catch (err: any) {
      showNotification("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  // Map database role list values to user identifiers
  const mockUsersList = [
    { id: "user-pm", label: "李四 (项目负责人)" },
    { id: "user-sales", label: "张三 (营业/商务负责人)" },
    { id: "user-const", label: "陈七 (施工技术总工)" },
    { id: "user-cost", label: "赵六 (概算负责人)" },
    { id: "user-review", label: "钱八 (审核领导)" },
    { id: "user-doc", label: "周十 (资料汇总归档员)" }
  ];

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      not_started: "🔴 未开始",
      in_progress: "🟡 编制中",
      pending_review: "🔵 待审核",
      completed: "🟢 已完成",
      at_risk: "⚠️ 存在风险",
      cancelled: "⚪ 已取消"
    };
    return labels[status] || status;
  };

  const statusTagsColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "in_progress": return "bg-sky-100 text-sky-800 border-sky-300";
      case "pending_review": return "bg-orange-100 text-orange-850 border-orange-300";
      case "at_risk": return "bg-red-100 text-red-800 border-red-300";
      case "not_started": return "bg-stone-100 text-stone-600 border-stone-250";
      default: return "bg-stone-50 text-stone-500 border-stone-200";
    }
  };

  return (
    <div className="space-y-6">
      {/* Dynamic alert bar */}
      {notification && (
        <div className={`p-4 border-l-4 font-mono text-xs font-semibold rounded-sm duration-300 flex items-center justify-between shadow-xs ${
          notification.type === "success" 
            ? "bg-emerald-50 border-emerald-600 text-emerald-900" 
            : "bg-red-50 border-red-600 text-red-900"
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === "success" ? <CheckCircle className="w-4.5 h-4.5" /> : <ShieldAlert className="w-4.5 h-4.5" />}
            <span>{notification.text}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-stone-500 hover:text-stone-850">✕</button>
        </div>
      )}

      {/* Sub tabs header selection */}
      <div className="flex border-b-2 border-stone-200">
        <button
          onClick={() => setActiveSubTab("requirements")}
          className={`px-5 py-2.5 font-mono text-xs font-bold transition-all ${
            activeSubTab === "requirements" 
              ? "border-b-4 border-[#EA580C] text-stone-900" 
              : "text-gray-400 hover:text-stone-900"
          }`}
        >
          <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" /> 1. 资料要求识别与核验</span>
        </button>
        <button
          onClick={() => setActiveSubTab("tasks")}
          className={`px-5 py-2.5 font-mono text-xs font-bold transition-all ${
            activeSubTab === "tasks" 
              ? "border-b-4 border-[#EA580C] text-stone-900" 
              : "text-gray-400 hover:text-stone-900"
          }`}
        >
          <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> 2. 编制任务排期与分工</span>
        </button>
      </div>

      {loading && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-mono flex items-center gap-2 rounded-sm justify-center">
          <RefreshCw className="w-4 h-4 animate-spin text-[#EA580C]" />正在与数据库服务同步数据，请保持页面安全连接...
        </div>
      )}

      {/* RENDER TAB 1: DOCUMENT REQUIREMENTS */}
      {activeSubTab === "requirements" && (
        <div className="space-y-6">
          {/* Quick Generators Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 bg-white border border-border flex flex-col justify-between rounded-lg shadow-xs">
              <div>
                <h4 className="font-sans font-bold text-xs text-brand flex items-center gap-1.5">
                  <Clipboard className="w-4 h-4 text-brand" />
                  常规核心资料清单
                </h4>
                <p className="text-stone-500 text-[11px] leading-relaxed mt-2 font-sans">
                  包含项目概况、商务条款合规偏离表、施工组织总设计方案等9组项目核心通用投标必备要求。一键自动对准规范。
                </p>
              </div>
              <button
                onClick={handleGenerateCommon}
                className="mt-4 py-2 text-xs font-semibold bg-stone-900 hover:bg-stone-850 text-white w-full rounded-md flex items-center justify-center gap-1.5 transition-colors"
              >
                <Zap className="w-4 h-4 fill-amber-400 text-amber-400" /> 一键生成通用编制要求
              </button>
            </div>

            <div className="p-5 bg-white border border-border flex flex-col justify-between rounded-lg shadow-xs">
              <div>
                <h4 className="font-sans font-bold text-xs text-brand flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-[#2F6B57]" />
                  招标文件提取分析
                </h4>
                <p className="text-stone-500 text-[11px] leading-relaxed mt-2 font-sans">
                  基于已上传招标文件的 AI 提取参数。自动分析对准 BIM 要求、绿色施工节能措施、周边安防等级、VECD 优化等高敏资料编制条款。
                </p>
              </div>
              <button
                onClick={handleGenerateFromExtractions}
                className="mt-4 py-2 text-xs font-semibold bg-[#2F6B57] hover:bg-[#204a3c] text-white w-full rounded-md flex items-center justify-center gap-1.5 transition-colors"
              >
                <FilePlus className="w-4 h-4" /> 依据AI提取生成专项要求
              </button>
            </div>

            <div className="p-5 bg-white border border-border flex flex-col justify-between rounded-lg shadow-xs">
              <div>
                <h4 className="font-sans font-bold text-xs text-brand flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-sky-550" />
                  特殊编制自定输入
                </h4>
                <p className="text-stone-500 text-[11px] leading-relaxed mt-2 font-sans">
                  针对特定的专家论证要求、特定资质、高管汇报需要等输入自定义条目。
                </p>
              </div>
              <button
                onClick={() => setShowReqForm(!showReqForm)}
                className="mt-4 py-2 text-xs font-semibold w-full bg-white border border-border text-stone-700 hover:bg-stone-50 rounded-md flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-4 h-4" /> 手工补充录入特殊要求
              </button>
            </div>
          </div>

          {showReqForm && (
            <form onSubmit={handleAddRequirement} className="p-5 bg-stone-50 border border-border space-y-4 rounded-lg shadow-xs">
              <h4 className="font-sans font-bold text-xs text-stone-900 border-b pb-2">录入自定义招标资料编制规划要求</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-[10px] font-mono font-bold text-gray-400 block uppercase">编写编制要求名称 (Name)</label>
                  <input
                    type="text"
                    required
                    value={newReqName}
                    onChange={(e) => setNewReqName(e.target.value)}
                    placeholder="例如: 临时用电专项专家评审方案"
                    className="w-full mt-1.5 p-2 bg-white border border-stone-300 font-sans text-xs focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono font-bold text-gray-400 block uppercase">资料类型 (Type)</label>
                  <select
                    value={newReqType}
                    onChange={(e) => setNewReqType(e.target.value)}
                    className="w-full mt-1.5 p-2 bg-white border border-stone-300 font-sans text-xs focus:ring-1"
                  >
                    <option value="Technical">技术类资料 (Technical)</option>
                    <option value="Commercial">商务类资料 (Commercial)</option>
                    <option value="CivilWork">施工类资料 (CivilWork)</option>
                    <option value="BIMRequirements">BIM设计规划 (BIM)</option>
                    <option value="GreenBuilding">节能环保措施 (Green)</option>
                    <option value="Safety">安全防护论证 (Safety)</option>
                    <option value="Custom">其他特殊资料 (Other)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono font-bold text-gray-400 block uppercase">建议编制负责岗位 (Responsible Role)</label>
                  <select
                    value={newReqRole}
                    onChange={(e) => setNewReqRole(e.target.value)}
                    className="w-full mt-1.5 p-2 bg-white border border-stone-300 font-sans text-xs focus:ring-1"
                  >
                    <option value="Design">设计负责人 (Design)</option>
                    <option value="Construction">施工技术负责人 (Construction)</option>
                    <option value="Sales">营业/商务负责人 (Sales)</option>
                    <option value="Cost">测算负责人 (Cost)</option>
                    <option value="VECD">VECD深化负责人 (VECD)</option>
                    <option value="ProjectManager">项目负责人 (ProjectManager)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono font-bold text-gray-400 block uppercase">建议预留时间 (Days)</label>
                  <input
                    type="number"
                    min="1"
                    max="15"
                    value={newReqDays}
                    onChange={(e) => setNewReqDays(Number(e.target.value))}
                    className="w-full mt-1.5 p-2 bg-white border border-stone-300 font-mono text-xs focus:ring-1"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowReqForm(false)}
                  className="px-4 py-2 font-mono text-xs font-bold uppercase hover:bg-stone-100"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-stone-900 text-white font-mono text-xs font-bold uppercase rounded-sm hover:bg-stone-850"
                >
                  确认保存
                </button>
              </div>
            </form>
          )}

          {/* List Table */}
          <div className="bg-white border border-border rounded-lg overflow-hidden shadow-xs">
            <div className="p-4 bg-stone-50 border-b border-border flex justify-between items-center">
              <span className="font-sans text-xs font-bold text-stone-850">
                资料要求底卷库 (共计 {requirements.length} 项要求)
              </span>
              <span className="text-[10px] font-sans font-bold text-brand uppercase">
                投标截止日: {bidClosingDate || "未配置截止日"}
              </span>
            </div>

            {requirements.length === 0 ? (
              <div className="p-10 text-center space-y-3 bg-stone-50">
                <FileText className="w-12 h-12 text-stone-300 mx-auto" />
                <p className="text-stone-500 font-mono text-xs font-semibold">该工程项目目前尚未生成任何资质或投标资料编制要求要求。</p>
                <p className="text-stone-400 text-[11px]">请点击上方按钮 “一键生成通用编制要求” 或通过 AI 招标文件解析快速识别！</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-xs text-left">
                  <thead className="bg-stone-50 border-b border-stone-200 uppercase text-[10px] text-stone-400">
                    <tr>
                      <th className="p-3 pl-4">资料要求名称</th>
                      <th className="p-3">类型</th>
                      <th className="p-3">来源方式</th>
                      <th className="p-3">默认编制校核</th>
                      <th className="p-3">编制周期</th>
                      <th className="p-3 text-center">状态</th>
                      <th className="p-3 text-right pr-4">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-150">
                    {requirements.map((r) => (
                      <tr key={r.id} className="hover:bg-amber-50/50 transition-all">
                        <td className="p-3 pl-4 font-sans font-bold text-stone-900 text-xs">
                          {r.requirementName}
                        </td>
                        <td className="p-3 text-stone-500">
                          <span className="px-2 py-0.5 border border-stone-200 bg-stone-50 rounded-xs text-[10px]">
                            {reqTypeLabelMap[r.requirementType] || r.requirementType}
                          </span>
                        </td>
                        <td className="p-3">
                          {r.sourceType === "common_template" && <span className="text-stone-500">⚙️ 通用模板</span>}
                          {r.sourceType === "tender_extraction" && <span className="text-emerald-600 font-bold">✨ AI 招标文件提取</span>}
                          {r.sourceType === "manual" && <span className="text-indigo-600">📝 手工补充</span>}
                        </td>
                        <td className="p-3 font-sans text-stone-550">
                          编制: <strong>{roleLabelMap[r.defaultResponsibleRole] || r.defaultResponsibleRole}</strong> | 审核: <strong>{roleLabelMap[r.defaultReviewerRole] || r.defaultReviewerRole}</strong>
                        </td>
                        <td className="p-3 text-stone-600">
                          约 <strong>{r.suggestedPreparationDays}</strong> 天
                        </td>
                        <td className="p-3 text-center">
                          {r.status === "pending" && (
                            <span className="px-2.5 py-0.5 font-mono text-[10px] bg-amber-50 text-amber-700 border border-amber-300 font-bold rounded-xs">
                              待转换确认
                            </span>
                          )}
                          {r.status === "ignored" && (
                            <span className="px-2.5 py-0.5 font-mono text-[10px] bg-stone-100 text-stone-400 border border-stone-200 rounded-xs">
                              已忽略 / 无需准备
                            </span>
                          )}
                          {r.status === "converted_to_task" && (
                            <span className="px-2.5 py-0.5 font-mono text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold rounded-xs">
                              已转化为排期任务
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right pr-4 space-x-1.5">
                          {r.status === "pending" && (
                            <>
                              <button
                                onClick={() => handleIgnoreRequirement(r.id, r.requirementName)}
                                className="px-2.5 py-1 text-[10px] font-bold text-stone-400 hover:text-stone-700 border border-stone-250 hover:bg-stone-50 rounded-xs transition-colors"
                              >
                                忽略
                              </button>
                              <button
                                onClick={() => handleConvertToTask(r.id, r.requirementName)}
                                className="px-2.5 py-1 text-[10px] font-bold text-white bg-stone-900 hover:bg-stone-850 rounded-xs transition-colors flex inline-flex items-center gap-1"
                              >
                                <Zap className="w-3 h-3 text-amber-400 fill-amber-400" /> 转化任务
                              </button>
                            </>
                          )}
                          {r.status === "confirmed" && (
                            <button
                              onClick={() => handleConvertToTask(r.id, r.requirementName)}
                              className="px-2.5 py-1 text-[10px] font-bold text-white bg-stone-900 hover:bg-stone-850 rounded-xs transition-colors flex inline-flex items-center gap-1"
                            >
                              <Zap className="w-3 h-3 text-amber-400 fill-amber-400" /> 转化任务
                            </button>
                          )}
                          {r.status === "converted_to_task" && (
                            <span className="text-[10px] text-emerald-600 font-bold flex items-center justify-end gap-1">
                              ✓ 已成功入库
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RENDER TAB 2: TASK PLANNING AND WORK SCHEDULE */}
      {activeSubTab === "tasks" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-center p-4 bg-white border border-border rounded-lg shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-sans font-semibold text-stone-500">
                排期调整计算
              </span>
              <button
                onClick={handleRecalculateDates}
                className="px-3 py-1.5 bg-stone-900 text-white rounded-lg font-sans text-xs font-semibold hover:bg-stone-850 flex items-center gap-1.5 transition-all shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" /> 重算计划排期 (Reverse Planning)
              </button>
            </div>
            <button
              onClick={() => setShowTaskForm(!showTaskForm)}
              className="px-3 py-1.5 border border-border rounded-lg hover:bg-stone-50 font-sans text-xs font-semibold flex items-center gap-1.5 text-stone-700"
            >
              <Plus className="w-3.5 h-3.5 text-stone-500" /> 新建手工任务
            </button>
          </div>

          {/* New manual task creation */}
          {showTaskForm && (
            <form onSubmit={handleAddTask} className="p-5 bg-stone-50 border border-border shadow-xs space-y-4 rounded-lg font-sans">
              <h4 className="font-sans font-bold text-xs uppercase text-stone-900 border-b pb-2">新建手工编制任务</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-[10px] font-mono font-bold text-gray-400 block uppercase">任务名称 (Task Name)</label>
                  <input
                    type="text"
                    required
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    placeholder="请输入需补充的任务说明..."
                    className="w-full mt-1.5 p-2 bg-white border border-stone-300 font-sans text-xs focus:ring-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono font-bold text-gray-400 block uppercase">专项负责人 (Responsible)</label>
                  <select
                    value={newTaskResp}
                    onChange={(e) => setNewTaskResp(e.target.value)}
                    className="w-full mt-1.5 p-2 bg-white border border-stone-300 font-sans text-xs focus:ring-1"
                  >
                    {mockUsersList.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono font-bold text-gray-400 block uppercase">质量审核领导 (Reviewer)</label>
                  <select
                    value={newTaskRev}
                    onChange={(e) => setNewTaskRev(e.target.value)}
                    className="w-full mt-1.5 p-2 bg-white border border-stone-300 font-sans text-xs focus:ring-1"
                  >
                    {mockUsersList.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-mono font-bold text-gray-400 block uppercase">重要紧急程度</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value)}
                    className="w-full mt-1.5 p-2 bg-white border border-stone-300 font-sans text-xs focus:ring-1"
                  >
                    <option value="High">🔴 高 (High)</option>
                    <option value="Medium">🟡 中 (Medium)</option>
                    <option value="Low">🟢 低 (Low)</option>
                  </select>
                </div>
              </div>

              {/* Advanced optional dating dates */}
              <div className="border-t pt-4">
                <span className="text-[10px] font-mono font-bold text-gray-400 block uppercase mb-2">手动覆盖默认反向排程规划 (Cover scheduling offsets manually)</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-mono text-stone-500 block">自定义 计划开始时间</label>
                    <input
                      type="date"
                      value={newTaskStart}
                      onChange={(e) => setNewTaskStart(e.target.value)}
                      className="w-full mt-1 p-2 bg-white border border-stone-300 font-mono text-xs focus:ring-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-stone-500 block">自定义 提交截止截止日</label>
                    <input
                      type="date"
                      value={newTaskDue}
                      onChange={(e) => setNewTaskDue(e.target.value)}
                      className="w-full mt-1 p-2 bg-white border border-stone-300 font-mono text-xs focus:ring-1"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-stone-500 block">自定义 领导首轮审核日</label>
                    <input
                      type="date"
                      value={newTaskReviewDue}
                      onChange={(e) => setNewTaskReviewDue(e.target.value)}
                      className="w-full mt-1 p-2 bg-white border border-stone-300 font-mono text-xs focus:ring-1"
                    />
                  </div>
                </div>
              </div>

              {/* Task Dependency select checklist */}
              {tasks.length > 0 && (
                <div className="border-t pt-4">
                  <span className="text-[10px] font-mono font-bold text-gray-400 block uppercase mb-2">配置前置强依赖关系 (Select dependency task prerequisites)</span>
                  <div className="flex flex-wrap gap-2">
                    {tasks.map(t => (
                      <label key={t.id} className="flex items-center gap-1.5 p-2 border border-stone-200 bg-white rounded-xs text-[11px] hover:bg-orange-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newTaskDeps.includes(t.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewTaskDeps([...newTaskDeps, t.id]);
                            } else {
                              setNewTaskDeps(newTaskDeps.filter(id => id !== t.id));
                            }
                          }}
                          className="rounded-xs focus:ring-0 text-orange-600"
                        />
                        <span className="font-sans font-bold text-stone-750">{t.taskName}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowTaskForm(false)}
                  className="px-4 py-2 font-mono text-xs font-bold uppercase hover:bg-stone-100"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-stone-900 text-white font-mono text-xs font-bold uppercase rounded-sm hover:bg-stone-850"
                >
                  确认保存
                </button>
              </div>
            </form>
          )}

          {/* Tasks List */}
          <div className="bg-white border border-border rounded-lg overflow-hidden shadow-xs">
            <div className="p-4 bg-stone-50 border-b border-border flex justify-between items-center text-xs font-sans">
              <span className="font-bold text-stone-850">
                编制计划任务列表 (共计 {tasks.length} 项)
              </span>
              <span className="text-[10px] text-stone-500 font-semibold">
                ⚠️ 手动微调时间节点后将自动锁定该任务工期
              </span>
            </div>

            {tasks.length === 0 ? (
              <div className="p-12 text-center bg-stone-50">
                <Calendar className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                <p className="font-mono text-xs font-semibold text-stone-500">当前项目尚未生成任务计划。</p>
                <p className="text-stone-400 text-[11px] mt-1.5">
                  请在 “1. 资料要求识别与核验” 模块中，选择合格条款点击 “转化任务” 自动生成计划。
                </p>
              </div>
            ) : (
              <div className="divide-y divide-stone-200">
                {tasks.map(t => {
                  const isEditingThis = editingTaskId === t.id;

                  return (
                    <div key={t.id} className="p-4 sm:p-5 hover:bg-stone-50/50 transition-all flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                      {/* Left: Metadata */}
                      <div className="space-y-1.5 max-w-xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-sans font-bold text-sm text-stone-900 tracking-tight leading-snug">
                            {t.taskName}
                          </h4>
                          <span className={`px-2 py-0.5 border text-[9px] font-mono leading-none rounded-xs font-bold uppercase ${statusTagsColor(t.status)}`}>
                            {getStatusLabel(t.status)}
                          </span>
                          {t.priority === "High" && (
                            <span className="px-1.5 py-0.5 bg-red-50 text-red-600 border border-red-200 text-[9px] font-mono font-bold rounded-xs uppercase">
                              P0 重要紧急
                            </span>
                          )}
                        </div>

                        {/* Assignee / Reviewer tags */}
                        <div className="text-[11px] font-sans text-stone-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>
                            负责人: <strong className="text-stone-800">{t.responsibleUsername} ({t.responsibleUserId})</strong>
                          </span>
                          <span className="text-stone-300">|</span>
                          <span>
                            审核人: <strong className="text-stone-850">{t.reviewerUsername} ({t.reviewerUserId})</strong>
                          </span>
                        </div>

                        {/* Dependencies list */}
                        {t.dependencyTaskIds && t.dependencyTaskIds.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-stone-400">
                            <GitBranch className="w-3.5 h-3.5 text-orange-500" />
                            <span>前置硬依赖 (Prerequisites):</span>
                            {t.dependencyTaskIds.map((depId: string) => {
                              const found = tasks.find(item => item.id === depId);
                              return (
                                <span key={depId} className="px-1.5 py-0.5 bg-orange-50 border border-orange-200 text-orange-800 text-[9px] rounded-xs font-sans font-bold">
                                  {found ? found.taskName : depId}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Middle: Timing display */}
                      <div className="bg-stone-50 p-2.5 px-3.5 border-2 border-stone-200 rounded-sm font-mono text-[11px] space-y-1 text-stone-600 min-w-[200px] shadow-2xs relative">
                        {t.isDateLocked && (
                          <span className="absolute -top-1.5 -right-1.5 p-0.5 bg-stone-900 border border-stone-850 text-white text-[8px] rounded-xs" title="排程已手工微调并锁定">
                            <Lock className="w-2.5 h-2.5" />
                          </span>
                        )}
                        <div className="flex justify-between">
                          <span>📅 计划启动:</span>
                          <strong className="text-stone-800">{t.startDate}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>⏱️ 首轮审核:</span>
                          <strong className="text-stone-800">{t.reviewDueDate}</strong>
                        </div>
                        <div className="flex justify-between text-orange-700">
                          <span>🏁 交付截止:</span>
                          <strong>{t.dueDate}</strong>
                        </div>
                      </div>

                      {/* Right Actions / Editor trigger */}
                      <div className="flex gap-2 self-stretch md:self-auto justify-end">
                        {!isEditingThis ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setSelectedTaskForFiles(t);
                              }}
                              className="px-3 py-1.5 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs"
                            >
                              <FileText className="w-3.5 h-3.5" /> 资料自检 (Files & Self-Check)
                            </button>
                            <button
                              onClick={() => {
                                setEditingTaskId(t.id);
                                setEditStatus(t.status);
                                setEditResp(t.responsibleUserId);
                                setEditRev(t.reviewerUserId);
                                setEditStart(t.startDate);
                                setEditDue(t.dueDate);
                                setEditReviewDue(t.reviewDueDate);
                              }}
                              className="px-3 py-1.5 border border-stone-200 hover:bg-stone-50 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs"
                            >
                              <Settings className="w-4 h-4 text-stone-500" /> 管理调节
                            </button>
                          </div>
                        ) : (
                          <div className="bg-amber-50/50 p-4 border border-amber-300 rounded-sm space-y-4 w-full md:min-w-[320px]">
                            <div className="flex items-center justify-between border-b pb-1.5">
                              <span className="font-bold text-stone-900 font-mono text-[11px]">任务管理</span>
                              <button onClick={() => setEditingTaskId(null)} className="text-gray-400 hover:text-stone-900 text-[11px]">收起✕</button>
                            </div>

                            {/* Section A: Status Changer */}
                            <div className="space-y-1.5">
                              <span className="text-[10px] text-stone-500 font-bold block">调节任务执行状态</span>
                              <div className="flex gap-1.5">
                                <select
                                  value={editStatus}
                                  onChange={(e) => setEditStatus(e.target.value)}
                                  className="p-1 px-1.5 bg-white border border-stone-300 text-xs w-full rounded-xs font-sans"
                                >
                                  <option value="not_started">🔴 未开始</option>
                                  <option value="in_progress">🟡 编制中</option>
                                  <option value="pending_review">🔵 待审核</option>
                                  <option value="completed">🟢 已完成</option>
                                  <option value="at_risk">⚠️ 有风险</option>
                                  <option value="cancelled">⚪ 已取消</option>
                                </select>
                                <button
                                  onClick={() => handleUpdateStatus(t.id)}
                                  className="px-2.5 py-1 bg-stone-900 text-white rounded-xs text-[10px] font-bold hover:bg-orange-600 transition-all font-mono"
                                >
                                  更新
                                </button>
                              </div>
                              <input
                                type="text"
                                placeholder="输入状态推进记录/变更原因"
                                value={editStatusReason}
                                onChange={(e) => setEditStatusReason(e.target.value)}
                                className="w-full p-1 border border-stone-250 bg-white font-mono text-[10px]"
                              />
                            </div>

                            {/* Section B: Assignees Changer */}
                            <div className="space-y-1.5 border-t pt-2.5">
                              <span className="text-[10px] text-stone-500 font-bold block">调配人员职责 (Assign Members)</span>
                              <div className="space-y-1.5 text-[10px]">
                                <div className="flex justify-between items-center gap-1">
                                  <span>负责人:</span>
                                  <select
                                    value={editResp}
                                    onChange={(e) => setEditResp(e.target.value)}
                                    className="p-1 border border-stone-300 bg-white font-sans text-[11px]"
                                  >
                                    {mockUsersList.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                                  </select>
                                </div>
                                <div className="flex justify-between items-center gap-1">
                                  <span>审核领导:</span>
                                  <select
                                    value={editRev}
                                    onChange={(e) => setEditRev(e.target.value)}
                                    className="p-1 border border-stone-300 bg-white font-sans text-[11px]"
                                  >
                                    {mockUsersList.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                                  </select>
                                </div>
                                <div className="flex justify-end">
                                  <button
                                    onClick={() => handleUpdateAssignees(t.id)}
                                    className="px-2 py-0.5 bg-stone-900 text-white font-mono rounded-xs text-[10px] font-bold hover:bg-stone-800"
                                  >
                                    确认变更分工
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Section C: Manual Timelines edit (with Lock action) */}
                            <div className="space-y-2 border-t pt-2.5">
                              <span className="text-[10px] text-stone-500 font-bold block">工期调节与倒排锁定</span>
                              <div className="grid grid-cols-1 gap-1.5 text-[10px] font-mono">
                                <div className="flex justify-between items-center">
                                  <span>计划启动:</span>
                                  <input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="p-0.5 border" />
                                </div>
                                <div className="flex justify-between items-center">
                                  <span>品质送审:</span>
                                  <input type="date" value={editReviewDue} onChange={(e) => setEditReviewDue(e.target.value)} className="p-0.5 border" />
                                </div>
                                <div className="flex justify-between items-center col">
                                  <span>交付截止:</span>
                                  <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="p-0.5 border" />
                                </div>
                                <input
                                  type="text"
                                  placeholder="工期节点微调及锁定具体理由"
                                  value={editReason}
                                  onChange={(e) => setEditReason(e.target.value)}
                                  className="w-full mt-1 p-1 border font-sans text-[10px]"
                                />
                                <div className="flex justify-end mt-1">
                                  <button
                                    onClick={() => handleUpdateDates(t.id)}
                                    className="px-2 py-1 bg-stone-900 border border-stone-850 hover:bg-[#EA580C] hover:border-orange-800 text-white rounded-xs text-[10px] font-bold transition-all"
                                  >
                                    🔒 确认修改并锁定工期
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedTaskForFiles && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-stone-50 border border-border rounded-lg w-full max-w-6xl p-5 relative shadow-xl my-8 max-h-[92vh] overflow-y-auto">
            <button 
              onClick={() => setSelectedTaskForFiles(null)}
              className="absolute top-4 right-4 text-stone-500 hover:text-stone-800 p-1 hover:bg-stone-100 rounded-md transition-colors"
            >
              关闭窗口 ✕
            </button>
            <div className="mb-4 pr-16 border-b border-border pb-3">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-emerald-600" />
                <span>任务专项资料上传与一致性自测: {selectedTaskForFiles.taskName}</span>
              </h3>
              <p className="text-[11px] text-stone-500 font-sans mt-0.5">
                编制职责岗位: {selectedTaskForFiles.responsibleUsername} | 校准人: {selectedTaskForFiles.reviewerUsername} | 工期锁: {selectedTaskForFiles.isDateLocked ? "已锁定" : "未锁"}
              </p>
            </div>
            <div className="bg-white p-2 border border-border rounded-lg overflow-hidden shadow-xs">
              <FileWorkflowPanel 
                projectId={projectId} 
                currentUser={currentUser} 
                taskId={selectedTaskForFiles.id} 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
