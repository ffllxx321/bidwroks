import React, { useState, useEffect } from "react";
import { 
  Briefcase, CheckSquare, ShieldAlert, ChevronRight, ClipboardList, 
  ArrowRight, User, Award, RefreshCw, X
} from "lucide-react";
import FileWorkflowPanel from "./FileWorkflowPanel.tsx";

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

interface PersonalWorkbenchProps {
  currentUser: { username: string; role: string };
  onSelectProject: (projectId: string) => void;
}

export default function PersonalWorkbench({ currentUser, onSelectProject }: PersonalWorkbenchProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"todo" | "review" | "overdue" | "risks">("todo");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedTaskForFiles, setSelectedTaskForFiles] = useState<any | null>(null);

  // Quick action update state
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [quickStatus, setQuickStatus] = useState("completed");
  const [quickReason, setQuickReason] = useState("");

  const loadWorkbenchData = async () => {
    setLoading(true);
    try {
      const headers = {
        "x-user-role": currentUser.role,
        "x-user-id": currentUser.username,
        "x-username": currentUser.username
      };

      const [resT, resR, resO, resS, resP] = await Promise.all([
        fetch(`/api/workbench/my-tasks`, { headers }),
        fetch(`/api/workbench/my-reviews`, { headers }),
        fetch(`/api/workbench/my-overdue-tasks`, { headers }),
        fetch(`/api/workbench/my-risk-tasks`, { headers }),
        fetch(`/api/workbench/my-projects`, { headers })
      ]);

      if (resT.ok) setTasks(await resT.json());
      if (resR.ok) setReviews(await resR.json());
      if (resO.ok) setOverdue(await resO.json());
      if (resS.ok) setRisks(await resS.json());
      if (resP.ok) setProjects(await resP.json());

    } catch (err: any) {
      console.error("Workbench load error", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkbenchData();
  }, [currentUser]);

  const handleQuickStatusSubmit = async (t: any) => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/projects/${t.projectId}/tasks/${t.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.username,
          "x-username": currentUser.username
        },
        body: JSON.stringify({
          status: quickStatus,
          reason: quickReason || "工作台快速更新"
        })
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || "状态更新拒绝！");
      }

      setFeedback(`✓ 任务 [${t.taskName}] 状态已更新，并成功记录至审计。`);
      setUpdatingTaskId(null);
      setQuickReason("");
      await loadWorkbenchData();
    } catch (err: any) {
      setFeedback(`🚨 操作失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      not_started: "未开始",
      in_progress: "深化中",
      pending_review: "待核对",
      completed: "已归档",
      at_risk: "存在偏差",
      cancelled: "已取消"
    };
    return labels[status] || status;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6 font-sans text-xs">
      
      {/* Header Greeting panel */}
      <div className="bg-white border border-border rounded-lg p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand/10 text-brand rounded-lg">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900 font-sans tracking-tight">
              个人工作台
            </h2>
            <div className="flex items-center gap-1.5 mt-1 text-stone-500 font-sans text-xs">
              <User className="w-3.5 h-3.5 text-brand" />
              当前用户: <strong className="text-stone-800 font-semibold">{currentUser.username}</strong>
              <span className="text-stone-300">|</span>
              <Award className="w-3.5 h-3.5 text-stone-400" />
              系统角色: <strong className="text-stone-800 font-semibold">{roleLabelMap[currentUser.role] || currentUser.role}</strong>
            </div>
          </div>
        </div>

        <button 
          onClick={loadWorkbenchData}
          className="px-4 py-1.5 border border-border rounded-md bg-stone-50 hover:bg-stone-100 text-stone-700 font-semibold text-xs flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-stone-500" /> <span>刷新数据</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3.5 bg-[#EAF5EF] border border-[#CDE5D9] text-[#2F6B57] font-semibold rounded-md flex justify-between items-center text-xs animate-in fade-in duration-150">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="hover:text-[#184435] text-xs font-bold">✕</button>
        </div>
      )}

      {/* Grid: 4 widgets tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Tab 1: My Todos */}
        <button
          onClick={() => setActiveTab("todo")}
          className={`p-4 text-left border rounded-lg transition-all shadow-xs flex flex-col justify-between h-[100px] ${
            activeTab === "todo" 
              ? "bg-white border-brand ring-1 ring-brand/10" 
              : "bg-white border-border hover:bg-stone-50"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase text-stone-400 block tracking-wide">我的待办</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold text-stone-900">{tasks.length}</span>
            <span className="text-stone-500 text-[11px] ml-1">个待编制</span>
          </div>
        </button>

        {/* Tab 2: My Reviews */}
        <button
          onClick={() => setActiveTab("review")}
          className={`p-4 text-left border rounded-lg transition-all shadow-xs flex flex-col justify-between h-[100px] ${
            activeTab === "review" 
              ? "bg-white border-brand ring-1 ring-brand/10" 
              : "bg-white border-border hover:bg-stone-50"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase text-stone-400 block tracking-wide">待我审核</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold text-brand">{reviews.length}</span>
            <span className="text-stone-500 text-[11px] ml-1">项待校核</span>
          </div>
        </button>

        {/* Tab 3: Overdue */}
        <button
          onClick={() => setActiveTab("overdue")}
          className={`p-4 text-left border rounded-lg transition-all shadow-xs flex flex-col justify-between h-[100px] ${
            activeTab === "overdue" 
              ? "bg-white border-red-500 ring-1 ring-red-100" 
              : "bg-white border-border hover:bg-stone-50"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase text-red-500 block tracking-wide">逾期任务</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold text-red-650">{overdue.length}</span>
            <span className="text-red-700 font-semibold text-[11px] ml-1">已超期</span>
          </div>
        </button>

        {/* Tab 4: Highly Risk */}
        <button
          onClick={() => setActiveTab("risks")}
          className={`p-4 text-left border rounded-lg transition-all shadow-xs flex flex-col justify-between h-[100px] ${
            activeTab === "risks" 
              ? "bg-white border-rose-500 ring-1 ring-rose-100" 
              : "bg-white border-border hover:bg-stone-50"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase text-stone-400 block tracking-wide">风险提醒</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-bold text-rose-600">{risks.length}</span>
            <span className="text-stone-500 text-[11px] ml-1">个涉及风险</span>
          </div>
        </button>
      </div>

      {loading && (
        <div className="p-3 bg-stone-50 border border-border text-stone-500 text-center rounded-md text-xs font-sans">
          获取工作项列表中...
        </div>
      )}

      {/* Main tasks container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Active list based on selected Tab */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-border rounded-lg overflow-hidden shadow-xs">
            
            <div className="p-4 bg-stone-550 bg-stone-50 border-b border-border font-bold text-stone-800 flex items-center justify-between">
              <span className="text-xs">
                {activeTab === "todo" && "待办编制工作任务"}
                {activeTab === "review" && "由我把关的质量审核项目"}
                {activeTab === "overdue" && "已逾期的未交付任务"}
                {activeTab === "risks" && "关键方案偏差及受控任务"}
              </span>
              <span className="text-[10px] bg-stone-100 border border-stone-200 text-stone-605 px-2.5 py-0.5 rounded-md font-medium">
                当前视图
              </span>
            </div>

            {/* List */}
            {activeTab === "todo" && (
              <div className="divide-y divide-stone-100">
                {tasks.length === 0 ? (
                  <div className="p-10 text-center text-stone-400">
                    暂无需要编制的具体任务项。
                  </div>
                ) : (
                  tasks.map((t) => (
                    <div key={t.id} className="p-4 hover:bg-stone-50/50 transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold text-brand tracking-wide">
                          项目: {t.projectName}
                        </span>
                        <h4 className="font-sans font-bold text-xs text-stone-900 leading-snug">
                          {t.taskName}
                        </h4>
                        <div className="text-[10px] text-stone-400 font-sans flex items-center gap-3">
                          <span>截止时间: <strong className="text-stone-600">{t.dueDate}</strong></span>
                          <span>工期锁定: <strong className={t.isDateLocked ? "text-stone-700" : "text-stone-400"}>{t.isDateLocked ? "已锁定" : "系统计算"}</strong></span>
                        </div>
                      </div>

                      <div className="flex gap-2 w-full sm:w-auto justify-end flex-wrap items-center">
                        <button
                          onClick={() => setSelectedTaskForFiles(t)}
                          className="px-3 py-1.5 text-xs font-semibold border border-[#CDE5D9] text-[#2F6B57] bg-[#EAF5EF] hover:bg-[#D9EFE3] rounded-md flex items-center gap-1 transition-colors"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" /> 资料自检
                        </button>

                        <button
                          onClick={() => onSelectProject(t.projectId)}
                          className="px-3 py-1.5 text-xs font-semibold border border-border hover:bg-stone-50 rounded-md flex items-center gap-1 text-stone-700 transition-colors"
                        >
                          工作台 <ChevronRight className="w-3 h-3 text-stone-400" />
                        </button>

                        {updatingTaskId !== t.id ? (
                          <button
                            onClick={() => {
                              setUpdatingTaskId(t.id);
                              setQuickStatus(t.status === 'not_started' ? 'in_progress' : 'completed');
                            }}
                            className="px-3 py-1.5 bg-stone-900 hover:bg-stone-850 text-white text-xs font-semibold rounded-md flex items-center gap-1 transition-colors"
                          >
                            <CheckSquare className="w-3.5 h-3.5" /> 更改状态
                          </button>
                        ) : (
                          <div className="border border-amber-200 bg-amber-50/45 p-3 rounded-lg space-y-2 text-xs w-full max-w-[200px]">
                            <select
                              value={quickStatus}
                              onChange={(e) => setQuickStatus(e.target.value)}
                              className="p-1.5 rounded bg-white border border-stone-205 w-full text-xs"
                            >
                              <option value="in_progress">推进至：深化中</option>
                              <option value="pending_review">推进至：待复核</option>
                              <option value="completed">推进至：已归档</option>
                            </select>
                            <input
                              type="text"
                              value={quickReason}
                              onChange={(e) => setQuickReason(e.target.value)}
                              placeholder="推进进展/修改日志"
                              className="p-1 px-2 border rounded bg-white w-full text-xs"
                            />
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setUpdatingTaskId(null)} className="text-stone-400">取消</button>
                              <button onClick={() => handleQuickStatusSubmit(t)} className="text-brand font-bold">确定</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "review" && (
              <div className="divide-y divide-stone-100">
                {reviews.length === 0 ? (
                  <div className="p-10 text-center text-stone-405">
                     暂无项目质量审核待办。作为审核人，您把关的任务均已处于完成状态。
                  </div>
                ) : (
                  reviews.map((r) => (
                    <div key={r.id} className="p-4 hover:bg-stone-50/50 transition-all flex justify-between items-center gap-4">
                      <div>
                        <span className="text-[10px] font-semibold text-brand block">
                          所属工程项目: {r.projectName}
                        </span>
                        <h4 className="font-sans font-bold text-xs text-stone-900">{r.taskName}</h4>
                        <span className="text-[10px] text-stone-400 font-sans block mt-1">
                          预定编制审核节点: <strong className="text-stone-605">{r.reviewDueDate}</strong>  |  编制人员: <strong className="text-stone-605">{r.responsibleUserId}</strong>
                        </span>
                      </div>

                      <div className="flex gap-2 flex-wrap items-center">
                        <button
                          onClick={() => setSelectedTaskForFiles(r)}
                          className="px-3 py-1.5 text-xs font-semibold border border-[#CDE5D9] text-[#2F6B57] bg-[#EAF5EF] hover:bg-[#D9EFE3] rounded-md flex items-center gap-1 transition-colors"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" /> 资料自检
                        </button>
                        
                        <button
                          onClick={() => onSelectProject(r.projectId)}
                          className="px-3 py-1.5 text-xs font-semibold border border-border hover:bg-stone-100 rounded-md hover:text-brand transition-colors text-stone-700"
                        >
                          审核空间
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "overdue" && (
              <div className="divide-y divide-stone-100">
                {overdue.length === 0 ? (
                  <div className="p-10 text-center text-[#2F6B57] font-semibold bg-[#EAF5EF] border border-[#CDE5D9] rounded-md m-4">
                    ✓ 暂无已逾期的任务记录，当前各项任务按时流转。
                  </div>
                ) : (
                  overdue.map((o) => (
                    <div key={o.id} className="p-4 hover:bg-stone-50 transition-all flex justify-between items-center bg-red-50/10">
                      <div>
                        <span className="text-[10px] text-red-600 font-semibold block">
                          项目: {o.projectName} (已逾期)
                        </span>
                        <h4 className="font-sans font-bold text-xs text-stone-900 leading-snug">{o.taskName}</h4>
                        <span className="text-[10px] font-sans block text-red-700 mt-1">
                          截止期限: <strong className="underline">{o.dueDate}</strong>
                        </span>
                      </div>

                      <button
                        onClick={() => onSelectProject(o.projectId)}
                        className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
                      >
                        排查纠正
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "risks" && (
              <div className="divide-y divide-stone-100">
                {risks.length === 0 ? (
                  <div className="p-10 text-center text-stone-400 m-4 bg-stone-50 border border-border rounded-md">
                    ✓ 暂无高难度或需受控的方案任务。
                  </div>
                ) : (
                  risks.map((r) => (
                    <div key={r.id} className="p-4 hover:bg-amber-50/10 transition-all flex justify-between items-center bg-amber-50/5">
                      <div>
                        <span className="text-[10px] text-amber-700 font-semibold block uppercase">
                          项目: {r.projectName}
                        </span>
                        <h4 className="font-sans font-bold text-xs text-stone-900">{r.taskName}</h4>
                        <div className="text-[10px] text-stone-500 font-sans flex items-center gap-3 mt-1">
                          <span>目前进度: <strong>{statusLabel(r.status)}</strong></span>
                          <span>偏离风险度: <strong className="text-red-500 font-bold">{r.riskLevel}</strong></span>
                        </div>
                      </div>

                      <button
                        onClick={() => onSelectProject(r.projectId)}
                        className="px-3 py-1.5 border border-amber-200 bg-white hover:bg-amber-50 text-xs font-medium rounded-md transition-colors"
                      >
                        查看详细要求
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Joined Projects lists */}
        <div className="space-y-6">
          <div className="bg-white border border-border rounded-lg p-5 shadow-xs space-y-4">
            <h4 className="font-bold text-xs text-stone-900 flex items-center gap-2 border-b border-border-subtle pb-2 font-sans">
              <ClipboardList className="w-4 h-4 text-brand" />
              我参与的投标项目
            </h4>

            {projects.length === 0 ? (
              <div className="p-4 bg-stone-50 text-stone-400 text-center rounded-md">
                未加入任何特定的项目组。
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {projects.map((p) => (
                  <div 
                    key={p.id}
                    onClick={() => onSelectProject(p.id)}
                    className="p-3 bg-bg-subtle hover:bg-stone-50 border border-border hover:border-brand/40 cursor-pointer rounded-md flex justify-between items-center transition-all"
                  >
                    <div>
                      <span className="font-sans font-semibold text-xs text-stone-800 block">
                        {p.name}
                      </span>
                      <span className="text-[10px] text-stone-400 font-mono mt-0.5 block">
                        项目编码: {p.id}
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-stone-400" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Team Information */}
          <div className="p-4 bg-stone-50 border border-border rounded-lg space-y-2 font-sans text-xs text-stone-600 leading-relaxed shadow-xs">
            <h5 className="font-sans font-bold text-stone-850 text-xs">💡 使用说明</h5>
            <p>
              工作台所涉数据和进度均已与技术方案、核算数据库保持一致。每一次指标确认和状态提交都会进入系统审计，确保流程信息的可追溯性。
            </p>
          </div>
        </div>
      </div>

      {selectedTaskForFiles && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-stone-50 border border-border rounded-lg w-full max-w-6xl p-5 relative shadow-xl my-8 max-h-[95vh] overflow-y-auto text-left">
            <button 
              onClick={() => setSelectedTaskForFiles(null)}
              className="absolute top-4 right-4 text-stone-500 hover:text-stone-805 p-1 hover:bg-stone-100 rounded-md transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="mb-4 pr-16 border-b border-border pb-3">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-emerald-600" />
                <span>文件编制与自动校核闭环系统</span>
              </h3>
              <p className="text-[11px] text-stone-500 font-sans mt-0.5">
                当前受检：{selectedTaskForFiles.taskName} | 项目: {selectedTaskForFiles.projectName}
              </p>
            </div>
            <div className="bg-white p-2 border border-border rounded-lg shadow-xs overflow-hidden">
              <FileWorkflowPanel 
                projectId={selectedTaskForFiles.projectId} 
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
