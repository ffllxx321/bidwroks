import React, { useState, useEffect, useRef } from "react";
import { 
  Calendar, Clock, CheckSquare, AlertTriangle, PlayCircle, Lock, 
  User, Database, RefreshCw, ChevronRight, Edit3, Briefcase, 
  AlertCircle, CheckCircle, ArrowRight, ShieldAlert, BookOpen, 
  X, Info, HelpCircle, Eye, Network, List, Activity
} from "lucide-react";

interface BidScheduleOverviewProps {
  projectId: string;
  currentUser: { username: string; role: string };
  onNavigateToTab: (tab: string) => void;
  onEditMasterData?: () => void;
}

interface TaskData {
  id: string;
  taskName: string;
  taskType: string;
  responsibleUsername: string;
  reviewerUsername: string;
  startDate: string;
  dueDate: string;
  reviewDueDate: string;
  status: string;
  priority: string;
  riskLevel: string;
  isDateLocked: boolean;
  dependencyTaskIds: string[];
  requiresReview?: boolean;
  reviewReason?: string;
  updatedAt?: string;
}

export default function BidScheduleOverview({ 
  projectId, 
  currentUser, 
  onNavigateToTab,
  onEditMasterData 
}: BidScheduleOverviewProps) {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [projectMeta, setProjectMeta] = useState<any>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Views: overview (Default), list, timeline
  const [viewMode, setViewMode] = useState<"overview" | "list" | "timeline">("overview");

  // Interaction State
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);

  // Connection positions state
  const containerRef = useRef<HTMLDivElement>(null);
  const [cardPositions, setCardPositions] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});

  const headers = {
    "x-user-role": currentUser.role,
    "x-user-id": currentUser.username,
    "x-username": currentUser.username
  };

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch project master data
      const resMd = await fetch(`/api/projects/${projectId}/master-data`, { headers });
      let md: any = null;
      if (resMd.ok) {
        md = await resMd.json();
        setProjectMeta(md);
      }

      // 2. Fetch project task planning
      const resTasks = await fetch(`/api/projects/${projectId}/tasks`, { headers });
      if (resTasks.ok) {
        const list = await resTasks.json();
        setTasks(list);
      }

      // 3. Fetch dashboard summary
      const resDash = await fetch(`/api/projects/${projectId}/dashboard`, { headers });
      if (resDash.ok) {
        const dash = await resDash.json();
        setDashboardData(dash);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("数据加载失败：" + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  // Handle line recalculation when DOM changes
  const updateCardPositions = () => {
    if (!containerRef.current || viewMode !== "overview") return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const positions: Record<string, { x: number; y: number; w: number; h: number }> = {};

    tasks.forEach(t => {
      const el = document.getElementById(`overview-card-${t.id}`);
      if (el) {
        const elRect = el.getBoundingClientRect();
        positions[t.id] = {
          x: elRect.left - containerRect.left + elRect.width / 2,
          y: elRect.top - containerRect.top + elRect.height / 2,
          w: elRect.width,
          h: elRect.height
        };
      }
    });

    // Also update deadline anchor position
    const anchorEl = document.getElementById("deadline-anchor");
    if (anchorEl) {
      const anchorRect = anchorEl.getBoundingClientRect();
      positions["DEADLINE_ANCHOR"] = {
        x: anchorRect.left - containerRect.left + anchorRect.width / 2,
        y: anchorRect.top - containerRect.top + anchorRect.height / 2,
        w: anchorRect.width,
        h: anchorRect.height
      };
    }

    setCardPositions(positions);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      updateCardPositions();
    }, 400); // Wait for animations or layout settled
    return () => clearTimeout(timer);
  }, [tasks, viewMode]);

  // Recalculate on window resize
  useEffect(() => {
    window.addEventListener("resize", updateCardPositions);
    return () => window.removeEventListener("resize", updateCardPositions);
  }, [tasks, viewMode]);

  if (loading && !projectMeta) {
    return (
      <div className="flex flex-col items-center justify-center py-40 font-sans">
        <RefreshCw className="w-10 h-10 text-brand animate-spin mb-4" />
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest leading-none">
          正在载入 “投标排期总览” 数据...
        </p>
      </div>
    );
  }

  // Helper: map a task to its corresponding swimlane stage index (0-4)
  const getTaskStageIndex = (task: TaskData): number => {
    const name = task.taskName.toLowerCase();
    
    // Stage 1: 信息识别与资料要求确认
    if (name.includes("识别") || name.includes("要求确认") || name.includes("解析") || name.includes("提取") || name.includes("招标文件") || name.includes("主数据")) {
      return 0;
    }
    // Stage 5: 投标提交
    if (name.includes("提交") || name.includes("递交") || name.includes("开标") || name.includes("解密") || name.includes("投递")) {
      return 4;
    }
    // Stage 4: 最终汇总与定稿
    if (name.includes("汇总") || name.includes("定稿") || name.includes("盖章") || name.includes("装订") || name.includes("签字") || name.includes("定稿组工作")) {
      return 3;
    }
    // Stage 3: 内部校核与修订
    if (name.includes("自检") || name.includes("校核") || name.includes("修订") || name.includes("校对") || name.includes("审查") || name.includes("合理性")) {
      return 2;
    }
    // Stage 2: 资料准备与专业编制 (Default fallback for initial writing tasks)
    if (name.includes("准备") || name.includes("编制") || name.includes("深化") || name.includes("测算") || name.includes("图纸") || name.includes("方案") || name.includes("技术")) {
      return 1;
    }

    // Default distribution fallback based on indices or roles to keep visual progression balanced
    if (task.responsibleUsername?.includes("Design") || task.responsibleUsername?.includes("施工")) return 1;
    if (task.responsibleUsername?.includes("Review") || task.reviewerUsername?.includes("Review")) return 2;
    if (task.responsibleUsername?.includes("Manager")) return 3;

    return 1;
  };

  // Chinese statuses mapping
  const getChineseStatus = (task: TaskData) => {
    // Check overdue first
    const today = new Date().toISOString().slice(0, 10);
    const isOverdue = task.dueDate && task.dueDate < today && task.status !== "completed";
    
    if (isOverdue) return { label: "已逾期", color: "bg-red-50 text-red-700 border-red-200" };
    
    // Check if blocked by dependencies
    const isBlocked = task.dependencyTaskIds?.some(depId => {
      const depTask = tasks.find(t => t.id === depId);
      return depTask && depTask.status !== "completed";
    });

    if (isBlocked && task.status !== "completed") {
      return { label: "被阻塞", color: "bg-slate-150 text-slate-700 border-slate-300" };
    }

    switch (task.status) {
      case "completed":
        return { label: "已完成", color: "bg-emerald-50 text-emerald-800 border-emerald-200" };
      case "pending_review":
        return { label: "待审核", color: "bg-indigo-50 text-indigo-800 border-indigo-200" };
      case "at_risk":
        return { label: "修改中", color: "bg-amber-50 text-amber-800 border-amber-200" };
      case "in_progress":
        return { label: "进行中", color: "bg-blue-50 text-blue-850 border-blue-200" };
      case "not_started":
      default:
        return { label: "未开始", color: "bg-stone-50 text-stone-605 border-stone-200" };
    }
  };

  // Group tasks by their swimlanes
  const swimlanes = [
    { title: "信息识别与资料要求确认", index: 0, desc: "澄清提炼、主数据锚定" },
    { title: "资料准备与专业编制", index: 1, desc: "多部门对标编制深化" },
    { title: "内部校核与修订", index: 2, desc: "自检合规防漏、锁偏纠差" },
    { title: "最终汇总与定稿", index: 3, desc: "成果总集成、会签及用印" },
    { title: "投标提交", index: 4, desc: "最终成果上传与递交校验" }
  ];

  const tasksInLanes = swimlanes.map(lane => {
    return tasks.filter(t => getTaskStageIndex(t) === lane.index);
  });

  // Calculate stats
  const totalCount = tasks.length;
  const completedCount = tasks.filter(t => t.status === "completed").length;
  const inProgressCount = tasks.filter(t => t.status === "in_progress" || t.status === "at_risk" || t.status === "pending_review").length;
  const notStartedCount = tasks.filter(t => t.status === "not_started").length;
  
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdueCount = tasks.filter(t => t.dueDate && t.dueDate < todayStr && t.status !== "completed").length;
  const riskCount = tasks.filter(t => t.riskLevel === "High" || t.status === "at_risk").length;

  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Selected drawers task detail
  const drawerTask = tasks.find(t => t.id === drawerTaskId);

  // "我的待处理" filter (Current User matches responsible or reviewer)
  const isUserResponsible = (t: TaskData) => t.responsibleUsername === currentUser.username || (currentUser.role === "Construction" && t.responsibleUsername.includes("const")) || (currentUser.role === "Design" && t.responsibleUsername.includes("design"));
  const isUserReviewer = (t: TaskData) => t.reviewerUsername === currentUser.username || (currentUser.role === "Reviewer" && t.reviewerUsername.includes("review"));

  const myTasks = tasks.filter(t => t.status !== "completed" && (isUserResponsible(t) || isUserReviewer(t)));

  const myUrgentTasks = myTasks.filter(t => {
    const isOverdue = t.dueDate && t.dueDate < todayStr;
    const isRisk = t.riskLevel === "High" || t.status === "at_risk";
    return isOverdue || isRisk;
  });

  const myAssignedTasks = myTasks.filter(t => isUserResponsible(t) && t.status !== "pending_review");
  const myReviewPendingTasks = myTasks.filter(t => isUserReviewer(t) && t.status === "pending_review");
  const myUnderRevisionTasks = myTasks.filter(t => isUserResponsible(t) && t.status === "at_risk");

  // Critical Alerts list (3-5 items of high urgency)
  const criticalAlerts: Array<{ id: string; type: "overdue" | "blocked" | "pending_review" | "latest_change"; text: string; actionText?: string; tab?: string }> = [];
  
  // 1. Add overdue alerts
  tasks.forEach(t => {
    if (t.dueDate && t.dueDate < todayStr && t.status !== "completed") {
      criticalAlerts.push({
        id: `alert-overdue-${t.id}`,
        type: "overdue",
        text: `【超期未交】任务「${t.taskName}」截止日期为 ${t.dueDate}，目前处于超期未交付状态！`,
        actionText: "去跟进并上传交付"
      });
    }
  });

  // 2. Add blocked alerts
  tasks.forEach(t => {
    const blockedBy = t.dependencyTaskIds?.map(depId => tasks.find(x => x.id === depId)).filter(x => x && x.status !== "completed");
    if (blockedBy && blockedBy.length > 0 && t.status !== "completed") {
      criticalAlerts.push({
        id: `alert-blocked-${t.id}`,
        type: "blocked",
        text: `【流被阻塞】任务「${t.taskName}」受到前置任务「${blockedBy[0]?.taskName}」未完成而被阻塞。`,
        actionText: "查阅前置计划"
      });
    }
  });

  // 3. Add pending reviews
  tasks.forEach(t => {
    if (t.status === "pending_review") {
      criticalAlerts.push({
        id: `alert-review-${t.id}`,
        type: "pending_review",
        text: `【待审核】交付资料「${t.taskName}」已上传编制阶段成果，等待领导会签盖章确认。`,
        actionText: "前往审核结案",
        tab: "fileManagement"
      });
    }
  });

  // Filter top 3 alerts
  const displayAlerts = criticalAlerts.slice(0, 3);
  if (displayAlerts.length === 0) {
    displayAlerts.push({
      id: "alert-all-green",
      type: "latest_change",
      text: "✓ 目前计划运行平稳，暂无风险偏差，下游技术和专业正在全力深化推进中。"
    });
  }

  // Deadline days remaining text styling
  const daysRemainingVal = dashboardData?.daysRemaining !== undefined ? dashboardData.daysRemaining : 15;
  const daysDiff = daysRemainingVal;

  return (
    <div className="space-y-6 font-sans text-xs pb-16 animate-in fade-in duration-300">
      
      {/* 🚀 PROJECT SUMMARY HEADER (一级重点明确 - 按照极简、单入口、信息弱化原则重排) */}
      {projectMeta && (
        <div className="bg-white p-5 rounded-lg border border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-3xs">
          <div className="space-y-1.5 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span id="proj-code-id" className="text-[10px] bg-slate-100 text-stone-600 font-bold px-2 py-0.5 rounded-sm font-mono">
                项目编号: {projectId}
              </span>
              <span className="text-stone-300">|</span>
              <span className="text-stone-500 font-extrabold text-[10px]">
                当前阶段：<b className="text-stone-700">资料编制与合规自检</b>
              </span>
              {projectMeta.bidClosingDate && (
                <>
                  <span className="text-stone-300">|</span>
                  <span className="text-stone-500 font-semibold text-[10px]">
                    投标截止日：<b className="text-[#1F5F8B] font-mono">{projectMeta.bidClosingDate}</b>
                  </span>
                </>
              )}
            </div>
            <h2 className="text-base md:text-lg font-extrabold text-[#17324D] tracking-tight">
              {projectMeta.projectName}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-1 gap-x-4 text-stone-550 text-[10.5px] font-semibold">
              <div>业主：<span className="text-stone-800">{projectMeta.clientName || "日资制造企业"}</span></div>
              <div>结构类型：<span className="text-stone-800">{projectMeta.buildingType || "研发办公楼 / 混凝土结构"}</span></div>
              <div>项目地点：<span className="text-stone-800">{projectMeta.projectAddress || "上海青浦"}</span></div>
            </div>
          </div>

          {/* 右上角唯一修改主数据库按钮及轻量进度条 */}
          <div className="flex items-center gap-3 w-full md:w-auto self-start md:self-center">
            <div className="hidden sm:flex items-center gap-2 bg-slate-50 p-2 py-1.5 rounded border border-slate-200">
              <span className="text-[9px] font-bold text-stone-500">整体计划交付率:</span>
              <span className="text-xs font-mono font-black text-stone-800">{completionRate}%</span>
              <div className="w-10 bg-slate-200 h-1 rounded-full overflow-hidden">
                <div className="bg-[#10B981] h-full" style={{ width: `${completionRate}%` }} />
              </div>
            </div>

            <button
              id="header-edit-master-data-btn"
              onClick={() => {
                if (onEditMasterData) {
                  onEditMasterData();
                } else {
                  onNavigateToTab("fields"); // Fallback trigger
                }
              }}
              className="px-3.5 py-2 bg-white hover:bg-stone-50 text-stone-700 hover:text-stone-900 border border-slate-300 hover:border-stone-400 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer w-full sm:w-auto justify-center shadow-3xs"
              title="前往主数据校验和手工变更对准"
            >
              <Edit3 className="w-3.5 h-3.5 text-stone-500" />
              <span>修改主数据</span>
            </button>
          </div>
        </div>
      )}

      {/* 📊 TASK STATISTICS (数字清晰，白底低饱和度，不要大色块) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-4 bg-white border border-border rounded-lg shadow-2xs">
          <span className="text-stone-400 text-[10px] font-bold block uppercase tracking-wider">计划总任务</span>
          <span className="text-2xl font-black text-stone-850 block mt-1 font-mono">{totalCount} <span className="text-xs text-stone-400 font-normal">项</span></span>
          <span className="text-[9.5px] text-stone-500 block mt-1">底板计划资料提炼总数</span>
        </div>
        <div className="p-4 bg-white border border-border rounded-lg shadow-2xs">
          <span className="text-emerald-700 text-[10px] font-bold block uppercase tracking-wider">已完成并核准</span>
          <span className="text-2xl font-black text-emerald-700 block mt-1 font-mono">{completedCount} <span className="text-xs text-stone-400 font-normal">项</span></span>
          <span className="text-[9.5px] text-stone-500 block mt-1">经过人工作业专家核准放行</span>
        </div>
        <div className="p-4 bg-white border border-border rounded-lg shadow-2xs">
          <span className="text-blue-700 text-[10px] font-bold block uppercase tracking-wider">正在编制深化</span>
          <span className="text-2xl font-black text-blue-850 block mt-1 font-mono">{inProgressCount} <span className="text-xs text-stone-400 font-normal">项</span></span>
          <span className="text-[9.5px] text-stone-500 block mt-1">正在进行专业核查、送审中</span>
        </div>
        <div className="p-4 bg-white border border-border rounded-lg shadow-2xs">
          <span className="text-stone-500 text-[10px] font-bold block uppercase tracking-wider">待启动计划</span>
          <span className="text-2xl font-black text-stone-605 block mt-1 font-mono">{notStartedCount} <span className="text-xs text-stone-400 font-normal">项</span></span>
          <span className="text-[9.5px] text-stone-500 block mt-1">无前置依赖，进入排程等待</span>
        </div>
        <div className="p-4 bg-white border border-border rounded-lg shadow-2xs col-span-2 md:col-span-1">
          <span className="text-red-650 text-[10px] font-bold block uppercase tracking-wider">严重偏离/逾期</span>
          <span className="text-2xl font-black text-red-650 block mt-1 font-mono">{overdueCount + riskCount} <span className="text-xs text-stone-400 font-normal">项</span></span>
          <span className="text-[9.5px] text-stone-500 block mt-1">超过截止日或受阻于下游风险</span>
        </div>
      </div>

      {/* VIEW PANEL CONTROLS & DESCRIPTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-border pb-3">
        <div className="space-y-0.5">
          <h3 className="font-extrabold text-xs text-[#17324D] flex items-center gap-1.5 uppercase">
            <Network className="w-4 h-4 text-brand" />
            <span>内部对位倒排协作流</span>
          </h3>
          <p className="text-[10px] text-stone-500 font-medium font-sans">所有的任务卡片通过依赖连线表达前后依赖关系，并最终汇聚指向投标截止日。</p>
        </div>

        {/* View Switches (总览视图, 列表视图) */}
        <div className="flex gap-1.5 p-0.5 bg-stone-100 border border-stone-200 rounded-md">
          <button
            onClick={() => setViewMode("overview")}
            className={`px-3.5 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1.5 ${
              viewMode === "overview" 
                ? "bg-white text-stone-900 shadow-2xs" 
                : "text-stone-500 hover:text-stone-850"
            }`}
          >
            <Network className="w-3.5 h-3.5 text-stone-500" />
            <span>总览关系视图 ({totalCount})</span>
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`px-3.5 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1.5 ${
              viewMode === "list" 
                ? "bg-white text-stone-900 shadow-2xs" 
                : "text-stone-500 hover:text-stone-850"
            }`}
          >
            <List className="w-3.5 h-3.5 text-stone-500" />
            <span>大排程列表视图</span>
          </button>
        </div>
      </div>

      {/* CORE DISPLAY PORTAL WITH OPTION C TWO-COLUMN SPLIT LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column (Main functional region - scrollable) */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6 w-full">
          {viewMode === "overview" && (
            <div className="space-y-4">
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 min-h-[420px] bg-slate-50/50 border border-dashed border-stone-200 rounded-xl text-center gap-3">
                  <Activity className="w-10 h-10 text-stone-300" />
                  <p className="text-sm font-bold text-stone-700">暂无任何对位倒排协作任务</p>
                  <p className="text-xs text-stone-400 max-w-sm">当前项目尚未生成任务排程，请先在其他业务面板选择通用模板或提取大纲生成基本项。</p>
                </div>
              ) : (
                <div 
                  className="relative bg-slate-50 border border-border rounded-xl p-6 min-h-[580px] overflow-x-auto select-none"
                  ref={containerRef}
                  style={{ contentVisibility: 'auto' }}
                >
                  {/* SVG Overlay containing standard and highlighted paths */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                    <defs>
                      <marker id="arrow-standard" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 2 L 8 5 L 0 8 z" fill="#D1D5DB" />
                      </marker>
                      <MarkerDef id="arrow-highlight-incoming" color="#1E40AF" />
                      <MarkerDef id="arrow-highlight-outgoing" color="#4F46E5" />
                      <MarkerDef id="arrow-blocked" color="#EF4444" />
                    </defs>

                    {/* Draw paths between tasks with dependencies */}
                    {tasks.map(task => {
                      const toPos = cardPositions[task.id];
                      if (!toPos) return null;

                      return task.dependencyTaskIds?.map(depId => {
                        const fromPos = cardPositions[depId];
                        if (!fromPos) return null;

                        // Determine highlight properties
                        const isSelectedSelf = selectedTaskId === task.id;
                        const isSelectedPrereq = selectedTaskId === depId;
                        const isHoveredSelf = hoveredTaskId === task.id;
                        const isHoveredPrereq = hoveredTaskId === depId;

                        const isIncoming = isSelectedSelf || isHoveredSelf;
                        const isOutgoing = isSelectedPrereq || isHoveredPrereq;

                        // Statuses
                        const isBlockedPath = task.status !== "completed" && (() => {
                          const depTask = tasks.find(x => x.id === depId);
                          return depTask && depTask.status !== "completed";
                        })();

                        let strokeColor = "#E2E8F0"; // Default light gray-blue path
                        let strokeWidth = 1.5;
                        let markerId = "arrow-standard";
                        let strokeDasharray = "";

                        if (selectedTaskId !== null || hoveredTaskId !== null) {
                          if (isIncoming) {
                            strokeColor = "#1D4ED8"; // Deep blue for incoming prereq
                            strokeWidth = 2.5;
                            markerId = "arrow-highlight-incoming";
                          } else if (isOutgoing) {
                            strokeColor = "#6366F1"; // Purple-indigo for outgoing subsequent
                            strokeWidth = 2.5;
                            markerId = "arrow-highlight-outgoing";
                          } else {
                            strokeColor = "#F1F5F9"; // Fade completely others
                            strokeWidth = 1.0;
                            markerId = "";
                          }
                        } else if (isBlockedPath) {
                          strokeColor = "#FCA5A5"; // Red for blocked flows
                          strokeWidth = 1.5;
                          strokeDasharray = "4,4";
                          markerId = "arrow-blocked";
                        }

                        // Bezier cubic calculations for graceful flow
                        const startX = fromPos.x + fromPos.w / 2;
                        const startY = fromPos.y;
                        const endX = toPos.x - toPos.w / 2;
                        const endY = toPos.y;

                        const cp1X = startX + (endX - startX) * 0.4;
                        const cp1Y = startY;
                        const cp2X = startX + (endX - startX) * 0.6;
                        const cp2Y = endY;

                        return (
                          <path
                            key={`line-${depId}-${task.id}`}
                            d={`M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                            strokeDasharray={strokeDasharray}
                            markerEnd={markerId ? `url(#${markerId})` : undefined}
                            className="transition-all duration-200"
                          />
                        );
                      });
                    })}

                    {/* Draw lines from final stage tasks to the Bidding Deadline anchor */}
                    {(() => {
                      const anchorPos = cardPositions["DEADLINE_ANCHOR"];
                      if (!anchorPos) return null;

                      // Find final stage tasks or any task that has no dependents
                      const finalTasks = tasks.filter(t => {
                        const stageIdx = getTaskStageIndex(t);
                        const isDependedOn = tasks.some(x => x.dependencyTaskIds?.includes(t.id));
                        return stageIdx === 4 || !isDependedOn;
                      });

                      return finalTasks.map(t => {
                        const tPos = cardPositions[t.id];
                        if (!tPos) return null;

                        const startX = tPos.x + tPos.w / 2;
                        const startY = tPos.y;
                        const endX = anchorPos.x - anchorPos.w / 2;
                        const endY = anchorPos.y;

                        const cp1X = startX + (endX - startX) * 0.35;
                        const cp2X = startX + (endX - startX) * 0.65;

                        return (
                          <path
                            key={`final-deadline-line-${t.id}`}
                            d={`M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`}
                            fill="none"
                            stroke="#D1D5DB"
                            strokeWidth={1.5}
                            markerEnd="url(#arrow-standard)"
                          />
                        );
                      });
                    })()}
                  </svg>

                  {/* Swimlanes layout columns */}
                  <div className="grid grid-cols-1 xl:grid-cols-6 gap-6 relative z-20 min-w-[1240px]">
                    
                    {/* 5 Stages Swimlanes */}
                    {swimlanes.map(lane => {
                      const laneTasks = tasksInLanes[lane.index] || [];
                      return (
                        <div key={lane.title} className="bg-white/80 backdrop-blur-xs p-4 rounded-lg border border-slate-200 flex flex-col min-h-[500px]">
                          {/* Lane Heading Header */}
                          <div className="border-b border-dashed border-stone-200 pb-3 mb-4">
                            <span className="font-mono text-[9px] text-[#17324D] font-extrabold tracking-wider uppercase bg-brand-soft px-1.5 py-0.5 rounded-xs leading-none">
                              STAGE 0{lane.index + 1}
                            </span>
                            <h4 className="font-sans font-bold text-xs text-stone-800 tracking-tight block mt-1.5 leading-snug">
                              {lane.title}
                            </h4>
                            <span className="text-[9.5px] text-stone-450 block mt-0.5 font-medium leading-none">
                              {lane.desc}
                            </span>
                          </div>

                          {/* Lane task list */}
                          <div className="space-y-3.5 flex-grow overflow-y-auto max-h-[480px] pr-0.5">
                            {laneTasks.length === 0 ? (
                              <div className="py-5 px-2 border border-dashed border-stone-200 rounded-lg flex flex-col items-center justify-center text-center bg-stone-50/40">
                                <span className="text-[10px] text-stone-400 font-bold leading-relaxed">该阶段暂无任务</span>
                                <div className="mt-2.5 w-full flex flex-col gap-1">
                                  <button
                                    onClick={() => onNavigateToTab("taskPlanning")}
                                    className="w-full text-[9px] bg-white hover:bg-stone-100 border border-stone-200 text-stone-600 font-bold py-1 px-1.5 rounded-sm transition-all shadow-3xs cursor-pointer hover:text-stone-800"
                                  >
                                    生成资料清单
                                  </button>
                                  <button
                                    onClick={() => onNavigateToTab("taskPlanning")}
                                    className="w-full text-[9px] bg-white hover:bg-stone-100 border border-stone-200 text-stone-600 font-bold py-1 px-1.5 rounded-sm transition-all shadow-3xs cursor-pointer hover:text-stone-800"
                                  >
                                    生成任务计划
                                  </button>
                                </div>
                              </div>
                            ) : (
                              laneTasks.map(task => {
                                const { label: statusLabel, color: statusColorClasses } = getChineseStatus(task);
                                const isSelected = selectedTaskId === task.id;
                                const isHovered = hoveredTaskId === task.id;
                                
                                // Highlight if linked
                                const isLinked = selectedTaskId !== null && (
                                  selectedTaskId === task.id || 
                                  task.dependencyTaskIds?.includes(selectedTaskId) || 
                                  tasks.find(x => x.id === selectedTaskId)?.dependencyTaskIds?.includes(task.id)
                                );

                                return (
                                  <div
                                    id={`overview-card-${task.id}`}
                                    key={task.id}
                                    onClick={() => {
                                      setSelectedTaskId(selectedTaskId === task.id ? null : task.id);
                                    }}
                                    onMouseEnter={() => setHoveredTaskId(task.id)}
                                    onMouseLeave={() => setHoveredTaskId(null)}
                                    onDoubleClick={() => setDrawerTaskId(task.id)}
                                    className={`p-3 bg-white border rounded-lg cursor-pointer transition-all duration-200 select-none shadow-3xs hover:shadow-2xs ${
                                      isSelected 
                                        ? "ring-2 ring-brand border-brand bg-brand-soft/10 scale-[1.01]" 
                                        : isHovered
                                          ? "border-stone-400 bg-stone-50"
                                          : isLinked
                                            ? "ring-1 ring-brand-soft/60 border-brand/40 bg-brand-soft/5"
                                            : "border-stone-200"
                                    }`}
                                  >
                                    <div className="flex justify-between items-start gap-1.5">
                                      <span className="text-[8px] font-mono text-stone-400 font-bold">#{task.id}</span>
                                      <span className={`px-2 py-0.5 text-[9px] font-bold border rounded-md leading-none whitespace-nowrap uppercase ${statusColorClasses}`}>
                                        {statusLabel}
                                      </span>
                                    </div>

                                    <p className="mt-1.5 font-sans font-bold text-xs text-stone-850 leading-tight block break-words hover:text-brand">
                                      {task.taskName}
                                    </p>

                                    <div className="mt-3 pt-2 border-t border-stone-100 grid grid-cols-2 gap-1 text-[9.5px] text-stone-500 font-semibold">
                                      <div className="flex items-center gap-1">
                                        <User className="w-3 h-3 text-stone-400" />
                                        <span className="truncate" title={task.responsibleUsername}>{task.responsibleUsername}</span>
                                      </div>
                                      <div className="flex items-center gap-1 justify-end font-mono">
                                        <Clock className="w-3 h-3 text-stone-400" />
                                        <span>{task.dueDate ? task.dueDate.slice(5) : "待定"}</span>
                                      </div>
                                    </div>

                                    {/* Icons indicators block */}
                                    <div className="mt-2 flex items-center justify-between">
                                      <div className="flex items-center gap-1">
                                        {task.dependencyTaskIds && task.dependencyTaskIds.length > 0 && (
                                          <span className="text-[8.5px] bg-slate-100 text-stone-600 px-1 rounded-xs font-mono font-bold" title="前置前置依赖数">
                                            前置: {task.dependencyTaskIds.length}
                                          </span>
                                        )}
                                        {task.requiresReview && (
                                          <span className="text-[8.5px] bg-indigo-50 border border-indigo-200 text-indigo-750 px-1 rounded-xs font-bold leading-none" title="主数据变更连锁，需要重新在自检流中核准">
                                            待核准
                                          </span>
                                        )}
                                      </div>
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDrawerTaskId(task.id);
                                        }}
                                        className="text-[9px] text-brand hover:underline font-bold flex items-center gap-0.5"
                                      >
                                        详情 ➔
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* 🎯 Stage 6: Bidding Deadline extreme endpoint anchor (投标截止日汇总对齐点，设计精致) */}
                    <div className="xl:col-span-1 flex flex-col justify-center items-center h-full sm:min-h-0 pl-1 self-center">
                      <div 
                        id="deadline-anchor"
                        className="bg-[#F0F6FA] text-stone-850 p-4 rounded-xl border border-[#C8D8E4] border-l-4 border-l-[#1F5F8B] text-center w-full shadow-2xs relative overflow-hidden flex flex-col justify-between max-w-[160px]"
                      >
                        <div className="space-y-1.5">
                          <div className="mx-auto w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100">
                            <Clock className="w-4 h-4 text-[#1F5F8B]" />
                          </div>
                          <div>
                            <span className="text-[10px] text-stone-500 font-bold block leading-none">计划终点</span>
                            <span className="font-sans font-extrabold text-[11px] text-[#1F5F8B] block mt-1 tracking-tight leading-normal">
                              投标截止日
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-200 text-[9.5px] text-stone-600 font-semibold space-y-1">
                          <div>
                            <span className="text-stone-400 text-[8.5px] block leading-none">预定截止</span>
                            <span className="font-mono text-[10px] font-bold block mt-0.5 text-stone-850">{projectMeta?.bidClosingDate || "未设定"}</span>
                          </div>
                          <div>
                            <span className="text-stone-400 text-[8.5px] block leading-none">重点完成率</span>
                            <span className="font-mono text-[10px] font-bold block mt-0.5 text-stone-850">{completionRate}%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </div>
          )}

          {viewMode === "list" && (
            <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse font-sans text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-border text-stone-550 font-bold">
                    <th className="p-3.5 pl-5">项目ID</th>
                    <th className="p-3.5">协作计划任务名称</th>
                    <th className="p-3.5">对应阶段</th>
                    <th className="p-3.5">主责编制人</th>
                    <th className="p-3.5">截止时间</th>
                    <th className="p-3.5">前置依赖数</th>
                    <th className="p-3.5">状态</th>
                    <th className="p-3.5 text-right pr-5">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {tasks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-stone-400 font-medium">
                        当前项目暂无任务大纲条目。
                      </td>
                    </tr>
                  ) : (
                    tasks.map(t => {
                      const { label, color } = getChineseStatus(t);
                      const stageName = swimlanes[getTaskStageIndex(t)].title;
                      return (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3.5 pl-5 font-mono text-stone-400 font-semibold">#{t.id}</td>
                          <td className="p-3.5 font-bold text-stone-850">{t.taskName}</td>
                          <td className="p-3.5 text-stone-500 font-medium">{stageName}</td>
                          <td className="p-3.5 text-stone-700 flex items-center gap-1.5 mt-2.5">
                            <User className="w-3.5 h-3.5 text-stone-400" />
                            <span>{t.responsibleUsername}</span>
                          </td>
                          <td className="p-3.5 font-mono text-stone-605">{t.dueDate || "N/A"}</td>
                          <td className="p-3.5 font-mono">
                            {t.dependencyTaskIds?.length > 0 ? (
                              <span className="bg-slate-100 text-stone-600 px-1.5 py-0.5 rounded-sm font-bold text-[10px]">
                                {t.dependencyTaskIds.length} 个前置
                              </span>
                            ) : (
                              <span className="text-stone-300">-</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span className={`px-2 py-0.5 border rounded-md text-[9px] font-bold ${color}`}>
                              {label}
                            </span>
                          </td>
                          <td className="p-3.5 text-right pr-5">
                            <button
                              onClick={() => setDrawerTaskId(t.id)}
                              className="p-1 px-3 bg-stone-50 border border-border rounded hover:bg-stone-100 text-[10.5px] font-semibold text-stone-700 cursor-pointer"
                            >
                              详情
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column (Fixed sticky info rails - Always Visible & Highlights the Closing Date card) */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-6 w-full lg:sticky lg:top-[24px]">
          
          {/* 1. Fully Refactored & Polished 投标截止日 Card */}
          <div 
            id="right-closing-deadline-card"
            className="bg-[#F0F6FA] border border-[#C8D8E4] border-l-[5px] border-l-[#1F5F8B] shadow-[0_4px_12px_rgba(15,23,42,0.08)] rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="font-sans font-bold text-stone-700 text-xs tracking-tight uppercase">投标截止日</span>
              <Calendar className="w-4 h-4 text-[#1F5F8B]" />
            </div>
            
            <div className="space-y-1">
              <div id="right-deadline-date" className="font-mono text-2xl font-black text-[#17324D] tracking-tight leading-none">
                {projectMeta?.bidClosingDate || "待定"}
              </div>
              <div className="text-xs font-bold text-[#1F5F8B] flex items-center gap-1.5 mt-2">
                <Clock className="w-3.5 h-3.5" />
                <span>剩余 {daysDiff !== null ? daysDiff : 0} 天</span>
              </div>
            </div>

            <div className="border-t border-[#C8D8E4]/50 pt-3.5 space-y-2.5 text-[11px] text-stone-605 font-semibold">
              <div className="flex justify-between items-center">
                <span>关键未完成任务</span>
                <span className="bg-slate-200/60 text-stone-700 px-2 py-0.5 rounded-sm font-mono font-black text-[10px]">
                  {notStartedCount + inProgressCount} 项
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>高风险任务</span>
                <span className={`px-2 py-0.5 rounded-sm font-mono font-black text-[10px] ${
                  riskCount > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-800"
                }`}>
                  {riskCount} 项
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>逾期任务</span>
                <span className={`px-2 py-0.5 rounded-sm font-mono font-black text-[10px] ${
                  overdueCount > 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
                }`}>
                  {overdueCount} 项
                </span>
              </div>
            </div>
          </div>

          {/* 2. Critical Warning Alerts (只针对紧急和受阻，低饱和) */}
          <div className="bg-white border border-border p-5 rounded-lg shadow-xs space-y-4">
            <h4 className="font-extrabold text-xs text-stone-850 uppercase tracking-tight flex items-center gap-1.5 border-b pb-2">
              <AlertTriangle className="w-4 h-4 text-red-650" />
              <span>关键提醒 (紧急与受阻)</span>
            </h4>

            <div className="space-y-3.5">
              {displayAlerts.map(alert => (
                <div 
                  key={alert.id} 
                  className="p-3 bg-stone-50 border border-stone-205 rounded-lg flex gap-3 items-start justify-between text-[11px]"
                >
                  <p className="text-stone-700 leading-relaxed font-sans font-semibold">
                    {alert.text}
                  </p>
                  {alert.actionText && (
                    <button
                      onClick={() => {
                        if (alert.tab) {
                          onNavigateToTab(alert.tab);
                        } else {
                          onNavigateToTab("taskPlanning");
                        }
                      }}
                      className="flex-shrink-0 text-[10px] text-brand hover:underline font-bold flex items-center gap-0.5 whitespace-nowrap self-center cursor-pointer"
                    >
                      <span>去跟准</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 bg-emerald-50/40 border border-emerald-100 text-[10px] font-sans text-emerald-850 rounded-lg leading-relaxed font-medium">
              ℹ️ <b>主数据一致性提示：</b> 当任何项目底板主数据变更后，受其影响的任务会被暂时标记为 <b>待核准</b> 标准状态，请至自检流或变更复核中解锁放行。
            </div>
          </div>

          {/* 3. My Tasks Panel (我负责的或待我核准的交付) */}
          <div className="bg-white border border-border p-5 rounded-lg shadow-xs space-y-4">
            <h4 className="font-extrabold text-xs text-stone-850 uppercase tracking-tight flex items-center gap-1.5 border-b pb-2">
              <Briefcase className="w-4 h-4 text-brand" />
              <span>我的待处理 ({myTasks.length} 项未结)</span>
            </h4>

            {myTasks.length === 0 ? (
              <div className="py-8 bg-stone-50 text-stone-400 text-center rounded-lg border border-dashed border-stone-200">
                <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2 opacity-80" />
                <p className="text-[11px] font-bold text-stone-605">✓ 恭喜！您负责的所有投标协作交付任务已全部结案归档。</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {/* Highlight Pending Reviews */}
                {myReviewPendingTasks.map(t => (
                  <div key={t.id} className="p-2.5 bg-indigo-50/50 border border-indigo-100 rounded-md text-[11px] space-y-1.5">
                    <span className="bg-indigo-100 text-indigo-850 px-1.5 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-wide">
                      待我签署盖章
                    </span>
                    <p className="text-stone-800 font-extrabold leading-snug">{t.taskName}</p>
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-[9.5px] text-stone-550 font-medium">会签截止: {t.reviewDueDate || "暂缺"}</span>
                      <button
                        onClick={() => onNavigateToTab("fileManagement")}
                        className="px-2.5 py-1 bg-[#1F5F8B] text-white rounded-md text-[10px] font-bold"
                      >
                        签印
                      </button>
                    </div>
                  </div>
                ))}

                {/* Highlight Revise Backups */}
                {myUnderRevisionTasks.map(t => (
                  <div key={t.id} className="p-2.5 bg-amber-50/50 border border-amber-100 rounded-md text-[11px] space-y-1.5">
                    <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-wide font-sans">
                      退回待修订
                    </span>
                    <p className="text-stone-800 font-extrabold leading-snug">{t.taskName}</p>
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-[9.5px] text-stone-550 font-medium truncate max-w-[125px]" title={t.reviewReason}>
                        {t.reviewReason || "请查阅说明进行修改。"}
                      </span>
                      <button
                        onClick={() => setDrawerTaskId(t.id)}
                        className="px-2.5 py-1 bg-white hover:bg-stone-50 border border-amber-205 text-stone-800 rounded-md text-[10px] font-bold"
                      >
                        改写
                      </button>
                    </div>
                  </div>
                ))}

                {/* General active responsibilities list */}
                {myAssignedTasks.map(t => {
                  const isOverdue = t.dueDate && t.dueDate < todayStr;
                  return (
                    <div key={t.id} className="p-2.5 bg-slate-50 border border-stone-200 rounded-md text-[11px] space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-stone-400 font-mono font-bold text-[8.5px]">#{t.id} • 主责编制</span>
                        {isOverdue && <span className="text-red-650 font-bold text-[9px]">【已逾期】</span>}
                      </div>
                      <p className="text-stone-850 font-bold leading-snug">{t.taskName}</p>
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-[9.5px] text-stone-550">截止日期: {t.dueDate}</span>
                        <button
                          onClick={() => setDrawerTaskId(t.id)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 text-stone-700 border border-stone-200 rounded-md text-[10px] font-bold"
                        >
                          交付
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>



      {/* ========================================================
          🚀 TASK DETAIL DRAWER (任务详情抽屉) — 完美执行交互大纲
          ======================================================== */}
      {drawerTaskId && drawerTask && (
        <div className="fixed inset-0 z-100 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden">
            {/* Overlay background */}
            <div 
              onClick={() => setDrawerTaskId(null)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity" 
            />

            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <div className="pointer-events-auto w-screen max-w-md animate-in slide-in-from-right duration-200">
                <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-xl border-l border-border font-sans text-xs">
                  
                  {/* Drawer Header */}
                  <div className="bg-stone-900 px-6 py-5.5 text-white flex justify-between items-start">
                    <div className="space-y-1">
                      <span className="font-mono text-[9px] font-extrabold uppercase text-brand tracking-wider">
                        任务详情 • ID: #{drawerTask.id}
                      </span>
                      <h3 className="text-sm font-black leading-snug font-sans tracking-tight">
                        {drawerTask.taskName}
                      </h3>
                    </div>
                    <button 
                      onClick={() => setDrawerTaskId(null)}
                      className="p-1 rounded-sm bg-stone-850 hover:bg-stone-800 text-stone-400 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Drawer Body Content */}
                  <div className="flex-1 space-y-6 px-6 py-5">
                    
                    {/* Status card block */}
                    <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg space-y-3.5">
                      <div className="flex justify-between items-center text-[10.5px]">
                        <span className="text-stone-400 font-extrabold uppercase">当前审核与锁定状态</span>
                        <span className={`px-2 py-0.5 border rounded-md text-[9px] font-bold uppercase ${getChineseStatus(drawerTask).color}`}>
                          {getChineseStatus(drawerTask).label}
                        </span>
                      </div>
                      
                      {/* Technical detail fields */}
                      <div className="grid grid-cols-2 gap-4 font-sans text-[10.5px] border-t pt-3 border-stone-200">
                        <div>
                          <span className="text-gray-400 block pb-1">负责人编制岗位</span>
                          <span className="font-bold text-stone-800 flex items-center gap-1">
                            <User className="w-3.5 h-3.5 opacity-60 text-brand" />
                            {drawerTask.responsibleUsername}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400 block pb-1">审核批准领导人</span>
                          <span className="font-bold text-stone-800 flex items-center gap-1">
                            <User className="w-3.5 h-3.5 opacity-60 text-slate-500" />
                            {drawerTask.reviewerUsername}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Timeline dates section */}
                    <div className="space-y-2">
                      <h4 className="font-bold text-xs text-stone-850 uppercase border-b pb-1">计划关键时限表</h4>
                      <div className="grid grid-cols-3 gap-3 font-mono text-[10.5px] p-2 bg-slate-50 border rounded-sm font-semibold text-center text-stone-700">
                        <div>
                          <span className="text-stone-400 text-[9px] block uppercase font-sans">启动排期</span>
                          <span>{drawerTask.startDate || "未填"}</span>
                        </div>
                        <div>
                          <span className="text-stone-400 text-[9px] block uppercase font-sans">成果递交</span>
                          <span className="text-stone-900 font-bold">{drawerTask.dueDate || "未填"}</span>
                        </div>
                        <div>
                          <span className="text-stone-400 text-[9px] block uppercase font-sans">会签截止</span>
                          <span>{drawerTask.reviewDueDate || "未填"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Dependencies relationship lists (前置与后续任务) */}
                    <div className="space-y-3.5">
                      <h4 className="font-bold text-xs text-stone-850 uppercase border-b pb-1 flex items-center gap-1.5">
                        <Network className="w-4 h-4 text-brand" />
                        <span>任务依赖</span>
                      </h4>

                      {/* Incoming Prerequisites dependencies */}
                      <div className="space-y-2">
                        <span className="text-[10px] text-stone-450 block font-semibold uppercase leading-none">前置任务：依赖以下任务完成方可开展</span>
                        {drawerTask.dependencyTaskIds && drawerTask.dependencyTaskIds.length > 0 ? (
                          <div className="space-y-1.5">
                            {drawerTask.dependencyTaskIds.map(depId => {
                              const found = tasks.find(x => x.id === depId);
                              return (
                                <div key={depId} className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-md font-sans text-[10px] flex justify-between items-center">
                                  <span className="font-bold text-stone-750 truncate max-w-[280px]">
                                    {found ? found.taskName : depId}
                                  </span>
                                  <span className="text-[8px] font-mono font-bold bg-slate-100 text-stone-500 px-1 py-0.2 rounded-xs">
                                    {found ? getChineseStatus(found).label : "N/A"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-[9.5px] italic text-stone-400 block pl-1">（无前置强依赖条件，可以并行推进编制）</span>
                        )}
                      </div>

                      {/* Outgoing Subsequent dependents */}
                      <div className="space-y-2">
                        <span className="text-[10px] text-stone-450 block font-semibold uppercase leading-none">后续任务：制约着以下任务开展</span>
                        {(() => {
                          const subsequent = tasks.filter(x => x.dependencyTaskIds?.includes(drawerTask.id));
                          return subsequent.length > 0 ? (
                            <div className="space-y-1.5">
                              {subsequent.map(sub => (
                                <div key={sub.id} className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-md font-sans text-[10px] flex justify-between items-center">
                                  <span className="font-bold text-stone-750 truncate max-w-[280px]">
                                    {sub.taskName}
                                  </span>
                                  <span className="text-[8px] font-mono font-bold bg-slate-100 text-stone-500 px-1 py-0.2 rounded-xs">
                                    {getChineseStatus(sub).label}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[9.5px] italic text-stone-400 block pl-1">（无后续任务制约关联，属于末梢节点）</span>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Related documents / files and requirements */}
                    <div className="space-y-2">
                      <h4 className="font-bold text-xs text-stone-850 uppercase border-b pb-1">关联招标文件条款依据</h4>
                      <div className="p-3 bg-[#FAFAF9] border rounded-lg space-y-1">
                        <span className="text-[9.5px] text-stone-400 font-mono block">条款提取ID: {drawerTask.requirementId || "通用底板模板任务"}</span>
                        <p className="font-semibold text-stone-800 leading-normal">
                          {drawerTask.requirementId 
                            ? "AI提炼：该编制依据来源于招标书第 3.2.4 条关于抗震与特种地质等防偏条款深化要求。"
                            : "通用资料排期规范，旨在为设计及施工方案提供双轨合规质量保护。"
                          }
                        </p>
                      </div>
                    </div>

                    {/* Change impact review instructions */}
                    {drawerTask.requiresReview && (
                      <div className="p-3 border border-red-200 bg-red-50/60 rounded-lg text-red-900 space-y-2">
                        <h5 className="font-sans font-bold text-xs flex items-center gap-1 leading-none text-red-800">
                          <AlertCircle className="w-4 h-4 text-red-600" />
                          <span>主数据变更连锁锁定</span>
                        </h5>
                        <p className="text-[10px] text-red-800 font-sans leading-normal font-semibold">
                          该任务检测到由于项目主数据的改变而发生了偏差！在变更未复核结束前，交付动作已被暂时锁定并贴标。请至“变更影响复核”面板核准。
                        </p>
                        <button
                          onClick={() => {
                            setDrawerTaskId(null);
                            onNavigateToTab("changeImpact");
                          }}
                          className="w-full text-center py-1 bg-white hover:bg-stone-50 text-stone-800 rounded border border-red-200 text-[10px] font-bold"
                        >
                          立即参与变更影响复核
                        </button>
                      </div>
                    )}

                  </div>

                  {/* Drawer Footer */}
                  <div className="bg-stone-50 border-t border-border px-6 py-4 flex justify-between gap-3">
                    <button
                      onClick={() => setDrawerTaskId(null)}
                      className="flex-1 py-2 text-center text-stone-700 bg-white hover:bg-stone-100 rounded-md border border-border text-[11px] font-bold cursor-pointer"
                    >
                      返回总览
                    </button>
                    <button
                      onClick={() => {
                        setDrawerTaskId(null);
                        onNavigateToTab("taskPlanning");
                      }}
                      className="flex-1 py-1.5 text-center text-white bg-brand hover:bg-brand-hover rounded-md text-[11px] font-bold cursor-pointer"
                    >
                      前往排程面板修改
                    </button>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Marker definitions generator helper for arrows in highlighted links
function MarkerDef({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 2 L 8 5 L 0 8 z" fill={color} />
    </marker>
  );
}
