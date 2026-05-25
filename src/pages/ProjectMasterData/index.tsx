import React, { useState, useEffect } from "react";
import { roleLabelMap, translateStatus } from "../../utils/labelMaps.ts";
import { ArrowLeft, Edit3, Lock, Info, Database, History, FileText, Check, AlertTriangle, User, RefreshCw, Eye, Calendar, LayoutDashboard, Share2 } from "lucide-react";
import TenderAnalysisPanel from "../../components/TenderAnalysisPanel.tsx";
import TaskPlanningPanel from "../../components/TaskPlanningPanel.tsx";
import ProjectDashboardPanel from "../../components/ProjectDashboardPanel.tsx";
import FileWorkflowPanel from "../../components/FileWorkflowPanel.tsx";
import BidScheduleOverview from "../BidScheduleOverview/index.tsx";

interface ProjectMasterDataProps {
  projectId: string;
  onBack: () => void;
  currentUser: { username: string; role: string };
}

interface FieldMeta {
  value: string | number;
  status: string;
  source: string;
  impactLevel: string;
  updatedBy: string;
  updatedAt: string;
}

export default function ProjectMasterData({ projectId, onBack, currentUser }: ProjectMasterDataProps) {
  // Master states loaded dynamically from backend APIs
  const [masterData, setMasterData] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"bidScheduleOverview" | "fields" | "logs" | "audit" | "tenderAnalysis" | "taskPlanning" | "projectDashboard" | "fileManagement" | "changeImpact">("bidScheduleOverview");
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<any>({});
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Iteration 5: Master Data Change Impact & Structured Reviews states
  const [changeImpactRecords, setChangeImpactRecords] = useState<any[]>([]);
  const [masterChanges, setMasterChanges] = useState<any[]>([]);
  const [impactLoading, setImpactLoading] = useState<boolean>(false);

  const loadImpactData = async () => {
    setImpactLoading(true);
    const headers = {
      "x-user-role": currentUser.role,
      "x-user-id": currentUser.username,
      "x-username": currentUser.username
    };
    try {
      const resChanges = await fetch(`/api/projects/${projectId}/master-data/changes`, { headers });
      if (resChanges.ok) {
        setMasterChanges(await resChanges.json());
      }
      const resImpact = await fetch(`/api/projects/${projectId}/change-impact-records`, { headers });
      if (resImpact.ok) {
        setChangeImpactRecords(await resImpact.json());
      }
    } catch (err) {
      console.error("Failed to load change impact records", err);
    } finally {
      setImpactLoading(false);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const headers = {
        "x-user-role": currentUser.role,
        "x-user-id": currentUser.username,
        "x-username": currentUser.username
      };

      // 1. Load active project master data
      const resMd = await fetch(`/api/projects/${projectId}/master-data`, { headers });
      if (!resMd.ok) {
        if (resMd.status === 403) throw new Error("👮 无权查阅项目主数据！主数据安全等级受控拦截。");
        throw new Error("加载项目主数据错误");
      }
      const mdJson = await resMd.json();
      setMasterData(mdJson);
      setEditedData(mdJson);

      // 2. Load master data change logs
      const resChanges = await fetch(`/api/projects/${projectId}/master-data/changes`, { headers });
      if (resChanges.ok) {
        const changesJson = await resChanges.json();
        setLogs(changesJson);
      }

      // 3. Load operational audit logs
      const resAudit = await fetch(`/api/projects/${projectId}/audit-logs`, { headers });
      if (resAudit.ok) {
        const auditJson = await resAudit.json();
        setAuditLogs(auditJson);
      }

      // 4. Load change impact records
      await loadImpactData();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "后端接口调取失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [projectId, currentUser]);

  const handleSaveChanges = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSaveSuccessMsg(null);

    // Build the fields that changed
    const updatedFields: any = {};
    const keysToCheck = [
      "projectName", "clientName", "projectAddress", "buildingType",
      "grossFloorAreaValue", "grossFloorAreaUnit", "totalDurationValue", "totalDurationUnit",
      "bidClosingDate", "clarificationDue", "siteVisitDate", "tenderScope",
      "constructScope", "designScope", "paymentTerms", "bimRequirements",
      "greenBuildings", "safetyLevel", "qualityGoal", "vecdConstraints"
    ];

    let hasChanges = false;
    for (const key of keysToCheck) {
      if (editedData[key] !== masterData[key]) {
        updatedFields[key] = editedData[key];
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      setIsEditing(false);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/master-data`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.username,
          "x-username": currentUser.username
        },
        body: JSON.stringify({
          updatedFields,
          source: "手工调准",
          impactLevel: "medium"
        })
      });

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("🚨 主数据写入被拒绝：您的系统岗位无权编辑本项目主数据！");
        }
        const errJson = await res.json();
        throw new Error(errJson.error || "写入主数据失败");
      }

      setSaveSuccessMsg("主数据对准成功！修改内容已持久化至 SQL 数据库并自动记录审计。");
      setIsEditing(false);
      await loadAllData();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "写入错误");
      setLoading(false);
    }
  };

  // --- CHANGE IMPACT ANALYSIS PROCEDURES (Iteration 5) ---

  const handleTriggerImpactAnalysis = async (changeId: string) => {
    const headers = {
      "x-user-role": currentUser.role,
      "x-user-id": currentUser.username,
      "x-username": currentUser.username
    };
    try {
      const res = await fetch(`/api/projects/${projectId}/master-data-changes/${changeId}/analyze-impact`, {
        method: "POST",
        headers
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "手动重算变更影响失败");
      setErrorMsg(null);
      setSaveSuccessMsg("✓ 主数据多态影响追踪成功重算，已为匹配的计划及设计草稿标记需要重新核准！");
      setTimeout(() => setSaveSuccessMsg(null), 6000);
      await loadImpactData();
    } catch (err: any) {
      alert("评估重算错误: " + err.message);
    }
  };

  const handleMarkImpactRequiresReview = async (impactId: string) => {
    const headers = {
      "x-user-role": currentUser.role,
      "x-user-id": currentUser.username,
      "x-username": currentUser.username
    };
    try {
      const res = await fetch(`/api/projects/${projectId}/change-impact-records/${impactId}/mark-requires-review`, {
        method: "POST",
        headers
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "标注失败");
      }
      setErrorMsg(null);
      setSaveSuccessMsg("✓ 已发起重新合规审查指令，目标交付资料/计划已被标记为 [需要重新审核]。");
      setTimeout(() => setSaveSuccessMsg(null), 6000);
      await loadImpactData();
    } catch (err: any) {
      alert("标记失败: " + err.message);
    }
  };

  const handleConfirmImpactReview = async (impactId: string) => {
    const note = window.prompt("请输入此变更项影响核算的审查确认意见：", "经对准最新项目主数据标准，确认该交付资料的建筑容量偏差、消防一致性全部符合，确认放行核准通过。");
    if (note === null) return;
    const headers = {
      "x-user-role": currentUser.role,
      "x-user-id": currentUser.username,
      "x-username": currentUser.username,
      "Content-Type": "application/json"
    };
    try {
      const res = await fetch(`/api/projects/${projectId}/change-impact-records/${impactId}/confirm-review`, {
        method: "POST",
        headers,
        body: JSON.stringify({ confirmationNote: note })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "确认审核失败");
      }
      setErrorMsg(null);
      setSaveSuccessMsg("✓ 变更影响状态已合规收口！标记已清除。");
      setTimeout(() => setSaveSuccessMsg(null), 6000);
      await loadImpactData();
    } catch (err: any) {
      alert("确认错误: " + err.message);
    }
  };

  const getMeta = (fieldKey: string): FieldMeta => {
    return masterData[`_${fieldKey}`] || {
      value: masterData[fieldKey],
      status: "待确认",
      source: "默认系统录入",
      impactLevel: "low",
      updatedBy: "系统初始化",
      updatedAt: "25分钟前"
    };
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "已确认": return "bg-emerald-50 text-emerald-700 border-emerald-300";
      case "需复核": return "bg-amber-50 text-amber-705 border-amber-300";
      default: return "bg-stone-100 text-stone-500 border-stone-200";
    }
  };

  if (loading && !masterData) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <div className="w-10 h-10 border-4 border-brand border-t-transparent animate-spin rounded-full mb-4" />
        <p className="font-sans text-xs text-gray-400 font-semibold uppercase tracking-wider">
          正在加载项目主数据...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Back Button */}
      <div className="flex justify-between items-center mb-6">
        <button onClick={onBack} className="pmd-btn px-4 py-2 flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-white hover:bg-stone-50 rounded-lg">
          <ArrowLeft className="w-4 h-4" /> 返回项目列表
        </button>
        <button onClick={loadAllData} className="pmd-btn p-2 bg-white text-stone-700 rounded-lg" title="刷新">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 border border-rose-200 bg-rose-50 text-rose-950 font-sans text-xs flex items-start gap-3.5 rounded-lg shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold mb-1">系统操作提示</h4>
            <p className="font-semibold text-rose-800">{errorMsg}</p>
          </div>
        </div>
      )}

      {saveSuccessMsg && (
        <div className="mb-6 p-4 border border-emerald-200 bg-[#F0FDF4] text-emerald-950 font-sans text-xs rounded-lg shadow-2xs">
          <p className="font-bold text-emerald-800">✓ 保存成功</p>
          <p className="mt-1 font-medium">{saveSuccessMsg}</p>
        </div>
      )}

      {masterData && (
        <div className="pmd-card bg-white p-6 md:p-8 mb-8 rounded-lg shadow-sm border border-border">
          {/* Top Info Ribbon */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-border pb-5 mb-6 gap-4">
            <div>
              <span className="text-[11px] font-sans font-semibold bg-brand-soft text-brand px-2.5 py-1 rounded-md mb-2 inline-block">
                项目 ID: {projectId} • 内部协作空间
              </span>
              <h2 className="text-xl md:text-2xl font-bold font-sans text-[#17324D] tracking-tight leading-snug">
                {masterData.projectName}
              </h2>
            </div>

            <button
              onClick={() => {
                if (isEditing) {
                  handleSaveChanges();
                } else {
                  setEditedData({ ...masterData });
                  setIsEditing(true);
                }
              }}
              className={`w-full md:w-auto px-5 py-2.5 flex justify-center items-center gap-2 text-xs font-bold rounded-lg transition-colors border ${
                isEditing 
                  ? "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700" 
                  : "bg-white text-stone-700 hover:bg-stone-50 border-border"
              }`}
            >
              {isEditing ? (
                <>
                  <Check className="w-4 h-4" /> 提交并保存主数据
                </>
              ) : (
                <>
                  <Edit3 className="w-4 h-4 text-brand" /> 修改主数据
                </>
              )}
            </button>
          </div>

          {/* Core Tabs triggers */}
          <div className="flex flex-wrap space-x-1 border-b border-border mb-6 gap-y-2 font-sans">
            {[
              { id: "bidScheduleOverview", label: "投标排期总览", icon: LayoutDashboard },
              { id: "fields", label: "项目主数据", icon: Database },
              { id: "tenderAnalysis", label: "招标上传和解析", icon: FileText },
              { id: "taskPlanning", label: "资料清单与任务计划", icon: Calendar },
              { id: "fileManagement", label: "文件管理与会签自检", icon: FileText },
              { id: "logs", label: "变更记录", icon: History },
              { id: "changeImpact", label: "变更影响复核", icon: AlertTriangle },
              { id: "audit", label: "审计日志", icon: Lock },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === "changeImpact") {
                      loadImpactData();
                    }
                    setActiveTab(tab.id as any);
                  }}
                  className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-t border-x transition-all flex items-center gap-1.5 ${
                    isActive 
                      ? "border-border border-b-white bg-white text-brand -mb-[1px] pb-3.5 shadow-xs font-bold" 
                      : "border-transparent bg-transparent text-stone-500 hover:text-stone-900"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-brand" : "text-stone-400"}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* ACTIVE FIELDS DISPLAY PANEL */}
          {activeTab === "fields" && (
            <div className="space-y-8">
              {/* Manual mode instruction banner */}
              {isEditing && (
                <div className="p-3 border border-amber-200 bg-amber-50 text-amber-900 font-sans text-xs font-semibold rounded-lg">
                  ⚠️ 您正在修改投标系统底板主数据。保存后，所有下游工程模块 (设计、测算、施工) 将会收到变更联动提醒，且系统会自动生成防篡改变更行追踪。
                </div>
              )}

              {/* Grid 1: Core Bidding Identifiers */}
              <div>
                <h3 className="font-sans font-bold text-xs tracking-wider text-brand mb-4 border-b pb-2 border-dashed border-border">
                  一、项目核心主数据
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Project Name */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg">
                    <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">项目名称</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedData.projectName || ""}
                        onChange={(e) => setEditedData({ ...editedData, projectName: e.target.value })}
                        className="w-full mt-2 p-2 bg-white border border-border rounded-md font-sans text-xs font-semibold focus:border-brand focus:ring-1 focus:ring-brand/10 focus:outline-none text-stone-900"
                      />
                    ) : (
                      <div className="font-sans text-stone-900 text-sm font-bold mt-1.5 leading-snug">{masterData.projectName}</div>
                    )}
                    <span className="font-mono text-[9px] text-gray-400 block mt-2">
                       来源: {translateStatus(getMeta("projectName").source)}  |  更新: {getMeta("projectName").updatedBy}
                    </span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg">
                    <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">业主名称</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedData.clientName || ""}
                        onChange={(e) => setEditedData({ ...editedData, clientName: e.target.value })}
                        className="w-full mt-2 p-2 bg-white border border-border rounded-md font-sans text-xs font-semibold focus:border-brand focus:ring-1 focus:ring-brand/10 focus:outline-none text-stone-900"
                      />
                    ) : (
                      <div className="font-sans text-stone-900 text-sm font-bold mt-1.5">{masterData.clientName}</div>
                    )}
                    <span className="font-mono text-[9px] text-gray-400 block mt-2">
                      来源: {translateStatus(getMeta("clientName").source)}  |  状态: <b className="text-[#2F6B57]">{translateStatus(getMeta("clientName").status)}</b>
                    </span>
                  </div>

                  {/* Project Address */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg">
                    <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">项目地点</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedData.projectAddress || ""}
                        onChange={(e) => setEditedData({ ...editedData, projectAddress: e.target.value })}
                        className="w-full mt-2 p-2 bg-white border border-border rounded-md font-sans text-xs text-stone-900 focus:border-brand focus:ring-1 focus:ring-brand/10 focus:outline-none"
                      />
                    ) : (
                      <div className="font-sans text-stone-800 text-xs font-semibold mt-1.5">{masterData.projectAddress}</div>
                    )}
                    <span className="font-mono text-[9px] text-gray-400 block mt-2">
                      来源: {translateStatus(getMeta("projectAddress").source)}
                    </span>
                  </div>

                  {/* Building Type */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg">
                    <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">建筑类型 / 结构形式</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedData.buildingType || ""}
                        onChange={(e) => setEditedData({ ...editedData, buildingType: e.target.value })}
                        className="w-full mt-2 p-2 bg-white border border-border rounded-md font-sans text-xs text-stone-900 focus:border-brand focus:ring-1 focus:ring-brand/10 focus:outline-none"
                      />
                    ) : (
                      <div className="font-sans text-stone-800 text-xs font-semibold mt-1.5">{masterData.buildingType}</div>
                    )}
                    <span className="font-mono text-[9px] text-gray-400 block mt-2">
                      影响等级: <b className="text-amber-700">{translateStatus(getMeta("buildingType").impactLevel)}</b>
                    </span>
                  </div>
                </div>
              </div>

              {/* Grid 2: Rule 1 Structurized Numerics */}
              <div>
                <h3 className="font-sans font-bold text-xs tracking-wider text-brand mb-4 border-b pb-2 border-dashed border-border flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-brand" />
                  <span>二、结构化数值</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Gross Floor Area split block */}
                  <div className="p-5 bg-[#F8FAFC] border border-border rounded-lg shadow-2xs">
                    <span className="text-xs font-sans font-bold text-stone-600 block uppercase">📐 登记总建筑面积</span>
                    {isEditing ? (
                      <div className="flex gap-2 mt-2">
                        <input
                          type="number"
                          value={editedData.grossFloorAreaValue || 0}
                          onChange={(e) => setEditedData({ ...editedData, grossFloorAreaValue: Number(e.target.value) })}
                          className="w-2/3 p-2 bg-white border border-border rounded-md font-mono font-bold text-xs focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none"
                        />
                        <input
                          type="text"
                          value={editedData.grossFloorAreaUnit || "㎡"}
                          onChange={(e) => setEditedData({ ...editedData, grossFloorAreaUnit: e.target.value })}
                          className="w-1/3 p-2 bg-white border border-border rounded-md font-sans text-xs text-center focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none"
                        />
                      </div>
                    ) : (
                      <div className="font-mono text-xl font-bold text-[#17324D] mt-2.5">
                        {Number(masterData.grossFloorAreaValue).toLocaleString()} {masterData.grossFloorAreaUnit === "m²" || masterData.grossFloorAreaUnit === "m2" ? "㎡" : masterData.grossFloorAreaUnit}
                      </div>
                    )}
                    <span className="font-sans text-[10px] text-stone-500 block mt-2.5 font-semibold">
                       状态: {translateStatus(getMeta("grossFloorAreaValue").status)} • 面积来源: {translateStatus(getMeta("grossFloorAreaValue").source)}
                     </span>
                  </div>

                  {/* Bidding Duration split block */}
                  <div className="p-5 bg-[#F8FAFC] border border-border rounded-lg shadow-2xs">
                    <span className="text-xs font-sans font-bold text-stone-600 block uppercase">⏱️ 登记总工期</span>
                    {isEditing ? (
                      <div className="flex gap-2 mt-2">
                        <input
                          type="number"
                          value={editedData.totalDurationValue || 0}
                          onChange={(e) => setEditedData({ ...editedData, totalDurationValue: Number(e.target.value) })}
                          className="w-2/3 p-2 bg-white border border-border rounded-md font-mono font-bold text-xs focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none"
                        />
                        <input
                          type="text"
                          value={editedData.totalDurationUnit || "日历天"}
                          onChange={(e) => setEditedData({ ...editedData, totalDurationUnit: e.target.value })}
                          className="w-1/3 p-2 bg-white border border-border rounded-md font-sans text-xs text-center focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none"
                        />
                      </div>
                    ) : (
                      <div className="font-mono text-xl font-bold text-[#17324D] mt-2.5">
                        {masterData.totalDurationValue} {masterData.totalDurationUnit}
                      </div>
                    )}
                    <span className="font-sans text-[10px] text-stone-500 block mt-2.5 font-semibold">
                       状态: {translateStatus(getMeta("totalDurationValue").status)} • 工期来源: {translateStatus(getMeta("totalDurationValue").source)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Grid 3: Milestones and technical parameters */}
              <div>
                <h3 className="font-sans font-bold text-xs tracking-wider text-brand mb-4 border-b pb-2 border-dashed border-border">
                  三、招标关键点与专项条款
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* bid closing */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-xs">
                    <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">投标截止日</span>
                    {isEditing ? (
                      <input
                        type="date"
                        value={editedData.bidClosingDate || ""}
                        onChange={(e) => setEditedData({ ...editedData, bidClosingDate: e.target.value })}
                        className="w-full mt-1.5 p-1.5 bg-white border border-border rounded-md font-sans text-xs focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none"
                      />
                    ) : (
                      <div className="font-mono font-semibold text-stone-850 mt-1">{masterData.bidClosingDate || "待定"}</div>
                    )}
                  </div>

                  {/* clarification due */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-xs">
                    <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">答疑截止日</span>
                    {isEditing ? (
                      <input
                        type="date"
                        value={editedData.clarificationDue || ""}
                        onChange={(e) => setEditedData({ ...editedData, clarificationDue: e.target.value })}
                        className="w-full mt-1.5 p-1.5 bg-white border border-border rounded-md font-sans text-xs focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none"
                      />
                    ) : (
                      <div className="font-mono font-semibold text-stone-850 mt-1">{masterData.clarificationDue || "未填报"}</div>
                    )}
                  </div>

                  {/* site visit date */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-xs">
                    <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">现场踏勘日</span>
                    {isEditing ? (
                      <input
                        type="date"
                        value={editedData.siteVisitDate || ""}
                        onChange={(e) => setEditedData({ ...editedData, siteVisitDate: e.target.value })}
                        className="w-full mt-1.5 p-1.5 bg-white border border-border rounded-md font-sans text-xs focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none"
                      />
                    ) : (
                      <div className="font-mono font-semibold text-stone-850 mt-1">{masterData.siteVisitDate || "未填报"}</div>
                    )}
                  </div>
                </div>

                {/* Sub technical lists */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {/* tenderScope */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-xs">
                     <span className="text-[10px] font-sans font-bold text-brand block uppercase">招标范围</span>
                     {isEditing ? (
                       <textarea
                         value={editedData.tenderScope || ""}
                         onChange={(e) => setEditedData({ ...editedData, tenderScope: e.target.value })}
                         className="w-full mt-2 p-2 bg-white border border-border rounded-lg text-stone-900 focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none h-20 text-xs"
                       />
                     ) : (
                       <p className="text-stone-700 leading-relaxed mt-1.5">{masterData.tenderScope || "由营业口待补。"} </p>
                     )}
                  </div>

                  {/* Payment terms */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-xs">
                     <span className="text-[10px] font-sans font-bold text-brand block uppercase">合同付款条件</span>
                     {isEditing ? (
                       <textarea
                         value={editedData.paymentTerms || ""}
                         onChange={(e) => setEditedData({ ...editedData, paymentTerms: e.target.value })}
                         className="w-full mt-2 p-2 bg-white border border-border rounded-lg text-stone-900 focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none h-20 text-xs"
                       />
                     ) : (
                       <p className="text-stone-700 leading-relaxed mt-1.5 font-semibold text-stone-800">{masterData.paymentTerms || "尚未提炼。"} </p>
                     )}
                  </div>

                  {/* Construct scope */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-xs">
                     <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">施工范围</span>
                     {isEditing ? (
                       <textarea
                         value={editedData.constructScope || ""}
                         onChange={(e) => setEditedData({ ...editedData, constructScope: e.target.value })}
                         className="w-full mt-2 p-2 bg-white border border-border rounded-lg text-stone-900 focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none h-16 text-xs"
                       />
                     ) : (
                       <p className="text-stone-700 leading-relaxed mt-1.5">{masterData.constructScope || "暂无施工范围边界。"} </p>
                     )}
                  </div>

                  {/* Design scope */}
                  <div className="p-4 bg-stone-50 border border-stone-100 rounded-lg text-xs">
                     <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">设计深化范围</span>
                     {isEditing ? (
                       <textarea
                         value={editedData.designScope || ""}
                         onChange={(e) => setEditedData({ ...editedData, designScope: e.target.value })}
                         className="w-full mt-2 p-2 bg-white border border-border rounded-lg text-stone-900 focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none h-16 text-xs"
                       />
                     ) : (
                       <p className="text-stone-700 leading-relaxed mt-1.5">{masterData.designScope || "未提及设计。"} </p>
                     )}
                  </div>

                  {/* bim requirements */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-xs">
                     <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">BIM 要求</span>
                     {isEditing ? (
                       <textarea
                         value={editedData.bimRequirements || ""}
                         onChange={(e) => setEditedData({ ...editedData, bimRequirements: e.target.value })}
                         className="w-full mt-2 p-2 bg-white border border-border rounded-lg text-stone-900 focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none h-16 text-xs"
                       />
                     ) : (
                       <p className="text-stone-700 leading-relaxed mt-1.5">{masterData.bimRequirements || "未声明。"} </p>
                     )}
                  </div>

                  {/* Green buildings */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-xs">
                     <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">绿色建筑与环保要求</span>
                     {isEditing ? (
                       <textarea
                         value={editedData.greenBuildings || ""}
                         onChange={(e) => setEditedData({ ...editedData, greenBuildings: e.target.value })}
                         className="w-full mt-2 p-2 bg-white border border-border rounded-lg text-stone-900 focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none h-16 text-xs"
                       />
                     ) : (
                       <p className="text-stone-700 leading-relaxed mt-1.5">{masterData.greenBuildings || "未指明。"} </p>
                     )}
                  </div>

                  {/* Safety standard, Quality level, VECD constraint */}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-lg text-xs col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">安全文明定级</span>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedData.safetyLevel || ""}
                          onChange={(e) => setEditedData({ ...editedData, safetyLevel: e.target.value })}
                          className="w-full mt-2 p-1.5 bg-white border border-border rounded-md focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none text-xs text-stone-900"
                        />
                      ) : (
                        <p className="text-stone-700 mt-1 font-semibold">{masterData.safetyLevel || "符合常规标准"} </p>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">工程质量目标</span>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedData.qualityGoal || ""}
                          onChange={(e) => setEditedData({ ...editedData, qualityGoal: e.target.value })}
                          className="w-full mt-2 p-1.5 bg-white border border-border rounded-md focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none text-xs text-stone-900"
                        />
                      ) : (
                        <p className="text-stone-700 mt-1 font-semibold text-emerald-700">{masterData.qualityGoal || "上海市优质结构奖门槛"} </p>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-sans font-bold text-gray-400 block uppercase">VECD降本优化</span>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedData.vecdConstraints || ""}
                          onChange={(e) => setEditedData({ ...editedData, vecdConstraints: e.target.value })}
                          className="w-full mt-2 p-1.5 bg-white border border-border rounded-md focus:ring-1 focus:ring-brand/10 focus:border-brand focus:outline-none text-xs text-stone-900"
                        />
                      ) : (
                        <p className="text-stone-700 mt-1 font-semibold text-amber-800">{masterData.vecdConstraints || "优化3%及以上提案"} </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MASTER DATA MODIFICATION LOGS TAB (Querying changes history from DB) */}
          {activeTab === "logs" && (
            <div className="space-y-4">
              <div className="font-mono text-xs text-gray-400 mb-2 border-b border-gray-100 pb-2 flex justify-between">
                <span>基础主数据变更历史记录追踪  •  SQL持久化状态链</span>
                <span className="text-[#EA580C] font-semibold">共计 {logs.length} 条变更记录</span>
              </div>
              
              {logs.length === 0 ? (
                <div className="text-center py-10 bg-stone-50 border border-stone-200">
                  <p className="font-mono text-xs text-stone-400">项目主数据暂无字段变更日志记录。</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div key={log.id} className="border-2 border-[#1C1917] p-4 bg-stone-50 text-xs font-mono">
                      <div className="flex flex-col sm:flex-row justify-between text-stone-500 mb-2 font-bold pb-1.5 border-b border-dashed border-stone-300">
                        <span>🔄 已变更字段名称: <b className="text-stone-800 font-bold">{log.fieldLabel}</b> ({log.fieldKey})</span>
                        <span>操作人: {log.modifiedBy} @ {log.modifiedAt.replace("T", " ").slice(0, 19)}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-2 text-stone-800">
                        <div>
                          <span className="text-rose-500 font-bold block mb-1">《 修改前旧值 》</span> 
                          <div className="p-2 bg-rose-50 border border-rose-200 rounded-sm font-medium break-all">{log.oldValue || "(空值)"}</div>
                        </div>
                        <div>
                          <span className="text-emerald-600 font-bold block mb-1">《 修改后新值 》</span>
                          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-sm font-medium break-all">{log.newValue || "(空值)"}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-[10px] text-gray-500 flex justify-between">
                        <span>变更依据: <b className="text-stone-700">{log.source || "手工调整防篡改审核"}</b></span>
                        <span>对下游连锁影响评级: <b className="text-[#EA580C] uppercase">{log.impactLevel === 'high' ? '高' : log.impactLevel === 'medium' ? '中' : '低'}</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* BID SCHEDULE OVERVIEW PANEL */}
          {activeTab === "bidScheduleOverview" && (
            <BidScheduleOverview
              projectId={projectId}
              currentUser={currentUser}
              onNavigateToTab={(tab) => {
                if (tab === "changeImpact") {
                  loadImpactData();
                }
                setActiveTab(tab as any);
              }}
              onEditMasterData={() => {
                setActiveTab("fields" as any);
                setIsEditing(true);
              }}
            />
          )}

          {/* PROJECT DASHBOARD PANEL */}
          {activeTab === "projectDashboard" && (
            <BidScheduleOverview
              projectId={projectId}
              currentUser={currentUser}
              onNavigateToTab={(tab) => {
                if (tab === "changeImpact") {
                  loadImpactData();
                }
                setActiveTab(tab as any);
              }}
              onEditMasterData={() => {
                setActiveTab("fields" as any);
                setIsEditing(true);
              }}
            />
          )}

          {/* TASK PLANNING AND REVERSE SCHEDULE PANEL */}
          {activeTab === "taskPlanning" && (
            <TaskPlanningPanel
              projectId={projectId}
              currentUser={currentUser}
              bidClosingDate={masterData?.bidClosingDate || ""}
            />
          )}

          {/* TENDER UPLOAD AND ANALYSIS AUTOMATION PANEL */}
          {activeTab === "tenderAnalysis" && (
            <TenderAnalysisPanel 
              projectId={projectId}
              currentUser={currentUser}
              onSyncComplete={() => {
                // Instantly sync local states to maintain dynamic master data values refresh
                loadAllData();
              }}
            />
          )}

          {/* DYNAMIC FILE WORKFLOW & CONSISTENCY SELF-checking PANEL */}
          {activeTab === "fileManagement" && (
            <FileWorkflowPanel
              projectId={projectId}
              currentUser={currentUser}
            />
          )}

          {/* MASTER DATA CHANGE MULTIVARIATE IMPACT ANALYSIS PANEL (Iteration 5) */}
          {activeTab === "changeImpact" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="font-mono text-xs text-stone-500 mb-2 border-b border-gray-100 pb-2 flex justify-between items-center">
                <span>联动整改区域  •  主数据多维变更影响任务流程追踪</span>
                <span className="text-[#EA580C] font-black">共计 {changeImpactRecords.length} 项受到牵连关系标记</span>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                {/* Left side: List of master data changes with manual trigger */}
                <div className="xl:col-span-5 space-y-4">
                  <div className="border-4 border-stone-900 bg-white p-4 rounded-sm pmd-shadow-sm space-y-4">
                    <h4 className="text-xs font-extrabold uppercase text-stone-900 flex items-center gap-1.5 border-b pb-2">
                      <Database className="w-4 h-4 text-[#EA580C]" />
                      主数据对准变更库
                    </h4>
                    
                    {logs.length === 0 ? (
                      <p className="text-[10px] text-stone-400">目前暂无有效的基础主数据变更。</p>
                    ) : (
                      <div className="space-y-3.5 max-h-[480px] overflow-y-auto pr-1">
                        {logs.map((log) => (
                          <div key={log.id} className="p-3 border-2 border-stone-200 bg-stone-50 rounded-xs space-y-2">
                            <div className="flex justify-between items-center text-[10px] border-b pb-1">
                              <span className="font-extrabold text-[#EA580C]">{log.fieldLabel}</span>
                              <span className="text-stone-400 font-mono text-[9px]">{log.modifiedAt.slice(11, 16)}</span>
                            </div>
                            <div className="text-[9.5px] font-mono leading-tight space-y-1">
                              <div>原值: <span className="text-stone-550 font-semibold">{log.oldValue || "(空值)"}</span></div>
                              <div>新值: <span className="text-emerald-700 font-extrabold">{log.newValue || "(空值)"}</span></div>
                              <div className="text-[9px] text-stone-400">操作人: <strong>{log.modifiedBy}</strong></div>
                            </div>
                            {/* Manual Re-evaluation Button for PM, Sales and Admin */}
                            {(currentUser.role === "ProjectManager" || currentUser.role === "SystemAdmin" || currentUser.role === "Sales") && (
                              <button
                                onClick={() => handleTriggerImpactAnalysis(log.id)}
                                className="w-full mt-1.5 p-1 px-2 border border-stone-900 bg-white hover:bg-stone-50 text-[10px] font-black uppercase tracking-tight flex items-center justify-center gap-1 transition-all"
                                title="手动重算该变更对于全线任务排期及自检差异产生的波动影响"
                              >
                                <RefreshCw className="w-3 h-3 animate-spin duration-1000" /> 手动重算变更多态影响
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right side: Change impact trace records displaying tasks and documents marked requirements */}
                <div className="xl:col-span-7 space-y-4">
                  <div className="border-4 border-stone-950 bg-white p-5 rounded-sm pmd-shadow-sm space-y-4">
                    <h4 className="text-xs font-extrabold uppercase text-stone-900 flex items-center gap-1.5 border-b pb-2">
                      <AlertTriangle className="w-4 h-4 text-rose-555 font-extrabold" />
                      对齐影响联动整改仓
                    </h4>

                    {changeImpactRecords.length === 0 ? (
                      <div className="text-center py-10 bg-stone-50 border border-stone-200">
                        <span className="text-[11px] text-stone-450 font-bold">✓ 变更流转无阻涉，全线计划排期及设计草案一致收敛。</span>
                      </div>
                    ) : (
                      <div className="space-y-3.5 max-h-[520px] overflow-y-auto pr-1">
                        {changeImpactRecords.map((rec) => {
                          const isRequiresReview = rec.status === "marked_requires_review";
                          const isConfirmed = rec.status === "confirmed";

                          return (
                            <div 
                              key={rec.id} 
                              className={`p-3.5 border-2 rounded-xs space-y-2 transition-all ${
                                isConfirmed 
                                  ? "bg-slate-50 border-slate-200 opacity-70" 
                                  : "border-[#1C1917] bg-white text-stone-900"
                              }`}
                            >
                              <div className="flex justify-between items-start gap-2 border-b pb-1.5">
                                <span className={`text-[9px] font-semibold p-0.5 px-2.5 border leading-none uppercase ${
                                  rec.affectedType === 'task' 
                                    ? 'bg-amber-50 text-amber-800 border-amber-300' 
                                    : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                }`}>
                                  {rec.affectedType === 'task' ? '📅 计划任务' : '📄 交付图纸'}
                                </span>
                                
                                <span className={`px-1.5 py-0.5 text-[9px] leading-none border font-bold uppercase ${
                                  isConfirmed 
                                    ? "bg-stone-100 text-stone-500 border-stone-200" 
                                    : isRequiresReview 
                                      ? "bg-red-50 text-red-700 border-red-350 font-extrabold" 
                                      : "bg-amber-50 text-amber-700 border-amber-305"
                                }`}>
                                  {isConfirmed ? "已复核通过" : isRequiresReview ? "需要重新审核" : "待标记"}
                                </span>
                              </div>

                              <div className="space-y-1">
                                <p className="text-[11px] font-extrabold text-stone-900">
                                  涉及整改对象: <span className="underline font-bold">{rec.affectedName || rec.affectedId}</span>
                                </p>
                                <p className="text-[10px] text-stone-605 font-sans leading-tight">
                                  <strong>影响判定依据 (Audit Trail Source):</strong> {rec.reason}
                                </p>
                              </div>

                              {isConfirmed && rec.resolutionNote && (
                                <div className="p-2 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9.5px] font-sans rounded-xs space-y-0.5">
                                  <label className="font-extrabold block uppercase">🔒 合规性核准签署意见（人工作业结案凭证）:</label>
                                  <p className="font-semibold text-stone-800 font-sans">“{rec.resolutionNote}”</p>
                                  <p className="text-[8.5px] text-emerald-600">审核确认人: {rec.resolvedBy} (于 {new Date(rec.resolvedAt).toLocaleString()})</p>
                                </div>
                              )}

                              {/* PM Actions to change impact status */}
                              {!isConfirmed && (currentUser.role === "ProjectManager" || currentUser.role === "SystemAdmin") && (
                                <div className="flex gap-2 justify-end border-t pt-2 mt-1.5">
                                  {!isRequiresReview && (
                                    <button
                                      onClick={() => handleMarkImpactRequiresReview(rec.id)}
                                      className="p-1 px-2 border border-stone-900 bg-white hover:bg-stone-50 text-[9.5px] font-bold text-stone-800"
                                      title="手动将此交付资料锁定、打标‘需要重新审核’发起质检意见"
                                    >
                                      🚨 锁定打标待重审
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleConfirmImpactReview(rec.id)}
                                    className="p-1 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9.5px]"
                                    title="清除重新审核标记，对准该变更进行彻底结案放行"
                                  >
                                    ✓ 已完成并复核通过
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECURITY AUDIT LOG TAB */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              <div className="font-mono text-xs text-gray-400 mb-2 border-b border-gray-100 pb-2">
                安全监测审计链  •  关键事务与越权行为限制日志
              </div>

              {auditLogs.length === 0 ? (
                <div className="text-center py-10 bg-stone-50 border border-stone-200">
                  <p className="font-mono text-xs text-stone-400">目前暂无此项目空间的审计日志。所有限制越权行为将在此呈现。</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                  {auditLogs.map((a) => (
                    <div key={a.id} className="border-l-4 border-[#1C1917] bg-stone-50 p-3.5 text-xs font-mono flex flex-col md:flex-row justify-between gap-2.5">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-stone-900 text-white px-1.5 py-0.5 text-[9px] uppercase font-bold rounded-sm">
                            {a.action}
                          </span>
                          <span className="font-bold text-stone-700 flex items-center gap-1">
                            <User className="w-3.5 h-3.5 opacity-60 text-[#EA580C]" /> {a.operator} [{roleLabelMap[a.role] || a.role}]
                          </span>
                        </div>
                        <p className="text-stone-600 font-sans font-medium">{a.details}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap md:self-center">
                        {a.timestamp.replace("T", " ").slice(0, 19)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
