import React, { useState, useEffect } from "react";
import { 
  BarChart, PieChart, Activity, AlertTriangle, CheckCircle, 
  Clock, ShieldAlert, UserPlus, FileWarning, ArrowRight, RefreshCw, 
  Calendar, CheckSquare, ClipboardPlus 
} from "lucide-react";

interface ProjectDashboardPanelProps {
  projectId: string;
  currentUser: { username: string; role: string };
  onNavigateToTab: (tab: string) => void;
}

export default function ProjectDashboardPanel({ projectId, currentUser, onNavigateToTab }: ProjectDashboardPanelProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers = {
    "x-user-role": currentUser.role,
    "x-user-id": currentUser.username,
    "x-username": currentUser.username
  };

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/dashboard`, { headers });
      if (!res.ok) throw new Error("加载总控数据异常");
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "同步服务报错");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [projectId]);

  if (loading) {
    return (
      <div className="p-8 text-center font-sans text-xs text-stone-550 space-y-3">
        <RefreshCw className="w-5 h-5 animate-spin text-brand mx-auto" />
        <span>正在读取项目进度及日程统计...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-md font-sans text-xs text-red-900">
        📢 载入监控面板失败: {error || "数据获取失败"}
      </div>
    );
  }

  const stats = data.statusSummary || {};
  const totalTasks = Object.values(stats).reduce((a: any, b: any) => a + b, 0) as number;
  const completedCount = stats.completed || 0;
  const inProgressCount = stats.in_progress || 0;
  const pendingReviewCount = stats.pending_review || 0;
  const notStartedCount = stats.not_started || 0;
  const atRiskCount = stats.at_risk || 0;
  const completionPercentage = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6 font-sans text-xs">
      
      {/* Cards header metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        
        {/* Countdown */}
        <div className="p-5 bg-stone-900 text-white rounded-lg md:col-span-2 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-2 right-2 opacity-10 rotate-12">
            <Clock className="w-24 h-24 text-stone-200" />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-brand uppercase tracking-wider block">投标交付倒计时</span>
            <h3 className="font-sans font-bold text-xl leading-none">
              距离投标截止日仅余 <span className="text-brand text-2xl font-bold font-sans">{data.daysRemaining !== null ? data.daysRemaining : "N/A"}</span> 天
            </h3>
            <span className="text-[10px] text-stone-400 block mt-1">
              截止日期: <strong>{data.bidClosingDate || "未设定"}</strong>
            </span>
          </div>
          <div className="mt-4 pt-3 border-t border-stone-800 text-[10px] text-stone-400">
            * 倒排编制机制：预留 2 天统筹，并提前 2 天送达审核组。
          </div>
        </div>

        {/* Task completion Rate */}
        <div className="p-5 bg-white border border-border rounded-lg shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block">累计完成率</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold text-stone-900 font-sans">{completionPercentage}%</span>
              <span className="text-stone-500 text-[10px]">已归档</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-[#E5E7EB] h-2.5 mt-3 rounded-full overflow-hidden">
              <div 
                className="bg-brand h-full transition-all duration-300" 
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
          <div className="text-[10px] text-stone-500 mt-2">
            总任务: <strong>{totalTasks}</strong> 项 | 已完成: <strong className="text-[#2F6B57]">{completedCount}</strong> 项
          </div>
        </div>

        {/* Action Status Summary */}
        <div className="p-5 bg-white border border-border rounded-lg shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block">编制与审核中</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold text-stone-900 font-sans">
                {inProgressCount + pendingReviewCount}
              </span>
              <span className="text-stone-500 text-[10px]">项处于深化/核对中</span>
            </div>
          </div>
          <div className="text-[10px] text-stone-550 border-t border-stone-100 pt-2 mt-2 flex justify-between">
            <span>未开始: <strong className="text-stone-700">{notStartedCount}</strong></span>
            <span>存在风险: <strong className="text-red-600">{atRiskCount}</strong></span>
          </div>
        </div>
      </div>

      {/* Grid 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left column */}
        <div className="space-y-6">
          
          {/* Overdue Checklist */}
          <div className="bg-white border border-border rounded-lg p-5 shadow-xs space-y-3">
            <h4 className="font-bold text-xs text-red-700 flex items-center gap-1.5 border-b border-stone-100 pb-2.5">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span>逾期未交付任务</span>
            </h4>

            {data.overdueTasks && data.overdueTasks.length === 0 ? (
              <div className="p-4 bg-stone-50 text-stone-400 text-center rounded-md font-sans">
                目前项目中无已逾期的任务。
              </div>
            ) : (
              <div className="space-y-2">
                {data.overdueTasks?.map((t: any) => (
                  <div key={t.id} className="p-3 bg-red-50/50 border border-red-100/80 text-red-905 rounded-md flex justify-between items-center text-xs">
                    <div>
                      <span className="font-semibold block text-stone-850">{t.taskName}</span>
                      <span className="text-[10px] text-stone-450 font-sans mt-0.5 block">
                        岗位：{t.responsibleUsername} | 截止日期: {t.dueDate}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 text-[9px] font-semibold rounded-md">
                      已到期
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* High Risk Tasks Checklist */}
          <div className="bg-white border border-border rounded-lg p-5 shadow-xs space-y-3">
            <h4 className="font-bold text-xs text-brand flex items-center gap-1.5 border-b border-stone-100 pb-2.5">
              <ShieldAlert className="w-4 h-4 text-brand" />
              <span>进度偏离警示列表</span>
            </h4>

            {data.highRiskTasks && data.highRiskTasks.length === 0 ? (
              <div className="p-4 bg-stone-50 text-stone-400 text-center rounded-md">
                暂未发现计划偏离点。
              </div>
            ) : (
              <div className="space-y-2">
                {data.highRiskTasks?.map((t: any) => (
                  <div key={t.id} className="p-3 bg-amber-50/50 border border-amber-100 text-amber-900 rounded-md flex justify-between items-center text-xs">
                    <div>
                      <span className="font-sans font-semibold block text-stone-850">{t.taskName}</span>
                      <span className="text-[10px] text-stone-455 mt-0.5 block">
                        编制人: {t.responsibleUsername} | 风险等级: <span className="text-red-650 font-semibold">{t.riskLevel === 'high' ? '严重偏离' : '轻微延迟'}</span>
                      </span>
                    </div>
                    <button
                      onClick={() => onNavigateToTab("tasks")}
                      className="px-2.5 py-1 border border-amber-200 hover:bg-white text-[10px] text-amber-800 font-semibold rounded-md transition-colors"
                    >
                      前去跟进
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          
          {/* Unassigned Work Items */}
          <div className="bg-white border border-border rounded-lg p-5 shadow-xs space-y-3">
            <h4 className="font-bold text-xs text-stone-800 flex items-center gap-1.5 border-b border-stone-100 pb-2.5">
              <UserPlus className="w-4 h-4 text-stone-500" />
              <span>待明确负责人项目</span>
            </h4>

            {data.unassignedResponsibleTasks?.length === 0 && data.unassignedReviewerTasks?.length === 0 ? (
              <div className="p-4 bg-stone-50 text-stone-400 text-center rounded-md">
                任务分工明确，全部岗位已配人。
              </div>
            ) : (
              <div className="space-y-2 max-h-[165px] overflow-y-auto pr-1">
                {data.unassignedResponsibleTasks?.map((t: any) => (
                  <div key={t.id} className="p-2.5 bg-stone-50 border border-border text-stone-800 rounded-md flex justify-between items-center text-xs">
                    <div>
                      <span className="font-sans font-semibold text-stone-850">{t.taskName}</span>
                      <span className="text-[10px] text-stone-400 block mt-0.5">主责编制编制岗位空缺</span>
                    </div>
                    <button
                      onClick={() => onNavigateToTab("tasks")}
                      className="text-[10px] font-bold text-brand hover:underline flex items-center gap-0.5"
                    >
                      指派人员 <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {data.unassignedReviewerTasks?.map((t: any) => (
                  <div key={t.id} className="p-2.5 bg-stone-50 border border-dashed border-border text-stone-800 rounded-md flex justify-between items-center text-xs">
                    <div>
                      <span className="font-sans font-semibold text-stone-805">{t.taskName}</span>
                      <span className="text-[10px] text-stone-400 block mt-0.5">审核领导岗位空缺</span>
                    </div>
                    <button
                      onClick={() => onNavigateToTab("tasks")}
                      className="text-[10px] font-semibold text-brand hover:underline flex items-center gap-0.5"
                    >
                      确认审核 <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Missing Doc Requirements */}
          <div className="bg-white border border-border rounded-lg p-5 shadow-xs space-y-3">
            <h4 className="font-bold text-xs text-stone-800 flex items-center gap-1.5 border-b border-stone-100 pb-2.5">
              <ClipboardPlus className="w-4 h-4 text-stone-500" />
              <span>招标文件尚未开始的要求</span>
            </h4>

            {data.missingDocRequirements && data.missingDocRequirements.length === 0 ? (
              <div className="p-4 bg-stone-50 text-stone-400 text-center rounded-md">
                招标文件全部条款已转化为排程任务。
              </div>
            ) : (
              <div className="space-y-2 max-h-[165px] overflow-y-auto pr-1">
                <span className="text-[10px] text-stone-400 block mb-1">
                  共计 {data.missingDocRequirements.length} 条识别条目：
                </span>
                {data.missingDocRequirements?.map((r: any) => (
                  <div key={r.id} className="p-2.5 bg-[#FAFAF9] border border-border rounded-md flex justify-between items-center text-xs">
                    <div>
                      <span className="font-sans font-semibold text-stone-800">{r.requirementName}</span>
                      <span className="text-[10px] text-stone-400 block mt-0.5">识别来源: {r.sourceType === "common_template" ? "通用体系" : "AI深度提取"}</span>
                    </div>
                    <button
                      onClick={() => onNavigateToTab("requirements")}
                      className="px-2.5 py-1 bg-brand hover:bg-brand-hover text-white text-[10px] font-semibold rounded-md transition-all flex items-center gap-0.5"
                    >
                      纳入排计划 <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
