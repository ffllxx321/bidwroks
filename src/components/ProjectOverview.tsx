import React, { useState } from "react";
import { MasterData, UserRole } from "../types";
import { AlertCircle, History, Edit3, FileText, Calendar, Compass, ArrowRight } from "lucide-react";

interface ProjectOverviewProps {
  projectId: string;
  masterData: MasterData;
  activeRole: UserRole;
  onChangeLogs: any[];
  onUpdateMaster: (updatedFields: Record<string, any>) => void;
}

export const ProjectOverview: React.FC<ProjectOverviewProps> = ({
  projectId,
  masterData,
  activeRole,
  onChangeLogs,
  onUpdateMaster,
}) => {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [isAlteringSensitive, setIsAlteringSensitive] = useState(false);

  // Check editable privileges
  // Rule: 营业 (张三) and 项目负责人 (李四) can edit Master Data.
  const canEditMaster = activeRole === "营业官 (张三)" || activeRole === "项目负责人 (李四)";

  const fieldKeys: { key: keyof MasterData; label: string; icon: any; category: "商务" | "工程" | "设计技术" }[] = [
    { key: "projectName", label: "招标项目名称", icon: FileText, category: "商务" },
    { key: "clientName", label: "建设业主单位", icon: Compass, category: "商务" },
    { key: "projectAddress", label: "项目建设地点", icon: Compass, category: "商务" },
    { key: "grossFloorArea", label: "总计建筑面积 (㎡)", icon: FileText, category: "商务" },
    { key: "bidClosingDate", label: "招标截止日期", icon: Calendar, category: "商务" },
    { key: "clarificationDue", label: "提疑答疑限期", icon: Calendar, category: "商务" },
    { key: "siteVisitDate", label: "踏勘及说明会日", icon: Calendar, category: "商务" },
    { key: "totalDuration", label: "总合同工期 (天)", icon: Calendar, category: "工程" },
    { key: "paymentTerms", label: "付款条件与违约惩罚", icon: AlertCircle, category: "商务" },
    { key: "tenderScope", label: "总承包招标范围", icon: FileText, category: "工程" },
    { key: "constructScope", label: "施工总承包具体界线", icon: FileText, category: "工程" },
    { key: "vecdConstraints", label: "VECD深化优化约束", icon: AlertCircle, category: "设计技术" },
  ];

  const handleStartEdit = (key: string, currentVal: any) => {
    if (!canEditMaster) {
      alert("⚠️ 权限提示：仅限[营业(张三)]或[项目负责人(李四)]具备修改项目主数据的操作权限！");
      return;
    }
    setEditingField(key);
    setEditValue(String(currentVal));
    setIsAlteringSensitive(key === "grossFloorArea" || key === "totalDuration" || key === "paymentTerms");
  };

  const handleSaveEdit = () => {
    if (!editingField) return;
    
    // Call props to update Master Data
    onUpdateMaster({
      [editingField]: editValue,
    });

    setEditingField(null);
    setEditValue("");
    setIsAlteringSensitive(false);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 font-sans">
      {/* LEFT & CENTER PANEL: MASTER FIELDS LIST */}
      <div className="xl:col-span-2 flex flex-col gap-5">
        <div className="bg-white border border-border rounded-lg shadow-xs overflow-hidden">
          <div className="bg-stone-50 border-b border-border px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand" />
              <span className="text-sm font-semibold text-stone-900">项目主数据</span>
            </div>
            <span className="text-[10px] bg-stone-100 text-stone-500 px-2 py-0.5 border border-stone-200 rounded-md">
              项目编码: {projectId}
            </span>
          </div>

          <div className="p-4 bg-bg-subtle border-b border-border text-xs text-stone-500 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <span>
              <strong>修改联动说明：</strong> 如果在此处对<strong>建筑面积</strong>或<strong>总工期</strong>等关键指标做出修改，系统将通知相关负责人，并在技术方案自检、文件管理等模块中触发复核提示，请各科室在个人工作台予以响应和确认。
            </span>
          </div>

          {/* EDITING DIALOG / WIDGET */}
          {editingField && (
            <div className="p-4 bg-stone-50 border-b border-border animate-in fade-in duration-150">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-brand/10 text-brand rounded-lg shrink-0">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <span className="text-[10px] font-bold text-brand uppercase tracking-wider block mb-0.5">
                    正在编辑字段属性
                  </span>
                  <h4 className="text-xs font-semibold text-stone-800 mb-2">
                    正在修改的字段：{fieldKeys.find((f) => f.key === editingField)?.label}
                  </h4>
                  
                  <div className="flex items-stretch gap-2 mb-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="flex-1 bg-white border border-border rounded-md px-3 py-1.5 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-brand"
                      placeholder="请输入新的主数据内容"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveEdit}
                      className="px-4 py-1.5 bg-brand hover:bg-brand-hover text-white rounded-md text-xs font-semibold transition-colors"
                    >
                      保存更改
                    </button>
                    <button
                      onClick={() => {
                        setEditingField(null);
                        setIsAlteringSensitive(false);
                      }}
                      className="px-3 py-1.5 bg-white text-stone-605 border border-border rounded-md text-xs hover:bg-stone-50 transition-colors"
                    >
                      取消
                    </button>
                  </div>

                  {isAlteringSensitive && (
                    <div className="bg-red-50 border border-red-100 p-2.5 text-[11px] text-red-800 rounded-md flex items-center gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        <strong>提示：</strong> 修改建筑面积或工期属于核心指标变更，将要求技术、概算等科室重新对齐任务进度。
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* GRID OF FIELDS */}
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            {fieldKeys.map((item) => {
              const fieldObj = masterData[item.key];
              const value = fieldObj ? fieldObj.value : "—";
              const status = fieldObj ? fieldObj.status : "Pending";
              const source = fieldObj ? fieldObj.source : "暂无";
              const ItemIcon = item.icon;

              return (
                <div
                  key={item.key}
                  className="bg-white border border-border hover:border-brand/40 hover:bg-bg-subtle p-4 rounded-lg flex flex-col justify-between shadow-xs transition-all duration-150"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-stone-50 border border-stone-200 text-stone-600 rounded-md">
                        <ItemIcon className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-semibold text-stone-800">
                        {item.label}
                      </span>
                    </div>
                    
                    {/* Status Badge */}
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded font-medium ${
                        status === "Confirmed"
                          ? "bg-emerald-50 text-[#2F6B57] border border-emerald-100"
                          : "bg-amber-50 text-[#A86E1A] border border-amber-100"
                      }`}
                    >
                      {status === "Confirmed" ? "已确认" : "需复核"}
                    </span>
                  </div>

                  {/* Field Value Box */}
                  <div className="bg-bg-subtle border border-border-subtle rounded-md px-3 py-2.5 mb-2 text-stone-900 font-bold text-xs flex items-center justify-between">
                    <span className="truncate">{value}</span>
                    
                    {canEditMaster ? (
                      <button
                        onClick={() => handleStartEdit(item.key as string, value)}
                        className="text-stone-405 hover:text-brand p-1 border border-stone-200 rounded hover:border-brand/40 transition-all bg-white shadow-xs"
                        title="点击修改此数值"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-stone-300" title="无编辑权限">锁定</span>
                    )}
                  </div>

                  {/* Traceability Source */}
                  <div className="border-t border-border-subtle pt-2 mt-1 flex items-center justify-between text-[11px] text-stone-400 font-sans">
                    <span className="truncate max-w-[180px]">
                      数据来源：{source}
                    </span>
                    <span className="text-stone-400">
                      {item.category}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: CHANGE LOGS */}
      <div className="flex flex-col gap-5">
        <div className="bg-white border border-border rounded-lg p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-brand" />
            <h3 className="font-bold text-sm text-stone-900">
              指标变更与联动复核日志
            </h3>
          </div>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {onChangeLogs.length === 0 ? (
              <div className="text-center py-10 text-xs text-stone-400 bg-bg-subtle border border-dashed border-stone-200 rounded-lg">
                <div>暂无核心主数据修改历史</div>
                <div className="text-[10px] text-stone-400 mt-1 font-sans">
                  变更关键数据可在此处查看各专业小组接收复核通知的状态
                </div>
              </div>
            ) : (
              onChangeLogs.slice().reverse().map((log) => {
                return (
                  <div key={log.id} className="bg-white border border-border rounded-lg p-3.5 shadow-xs">
                    <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-stone-100">
                      <span className="font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded text-[10px]">
                        {log.fieldLabel}
                      </span>
                      <span className="text-stone-400 text-[10px]">
                        {new Date(log.modifiedAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="text-stone-850 text-[11px] mb-2 font-semibold flex items-center flex-wrap gap-1">
                      <span>已将</span>
                      <span className="bg-stone-50 px-1 line-through text-stone-400">{log.oldValue}</span>
                      <ArrowRight className="w-3 text-stone-400 font-bold" />
                      <span className="bg-emerald-50 text-emerald-800 px-1.5 rounded">{log.newValue}</span>
                    </div>

                    <div className="text-[10px] text-stone-550 mb-2 font-sans">
                      <strong>变更人：</strong>{log.modifiedBy}
                    </div>

                    {log.notifiedRoles && log.notifiedRoles.length > 0 && (
                      <div className="bg-stone-50 border border-stone-100 p-2 rounded-md text-[10px] text-stone-600">
                        <span className="font-semibold block mb-1">已下发待复核通知组：</span>
                        <div className="flex flex-wrap gap-1">
                          {log.notifiedRoles.map((role: string, idx: number) => (
                            <span key={idx} className="bg-amber-50 text-[#A86E1A] border border-amber-100 text-[9px] px-1.5 py-0.5 rounded font-semibold">
                              {role} · 待复核
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* SIMULATION */}
        <div className="bg-stone-900 text-stone-200 rounded-lg p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-brand" />
            <h3 className="font-bold text-sm text-white">
              模拟指标变更测试
            </h3>
          </div>
          <p className="text-xs text-stone-400 mb-4 leading-relaxed font-sans">
            由外部变动引发的情况。点击快速下发主数据变更，验证各职能系统组件的指标对齐、合规提示与协同流程。
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!canEditMaster) {
                  alert("⚠️ 权限提示：请切换至[营业(张三)]或[项目负责人(李四)]视角操作！");
                  return;
                }
                const oldVal = masterData.grossFloorArea.value;
                onUpdateMaster({
                  grossFloorArea: 78000
                });
                alert(`✨ 模拟变更成功！建筑面积由原先的 ${oldVal}㎡ 缩减变更为 78000㎡，施工和概算部门相关的自检文件已触发需复核提示！`);
              }}
              className="flex-1 px-3 py-2 bg-brand hover:bg-brand-hover text-white rounded-md text-xs font-semibold shadow-xs transition-colors"
            >
              变面积为 7.8万㎡
            </button>
            
            <button
              onClick={() => {
                if (!canEditMaster) {
                  alert("⚠️ 权限提示：请切换至[营业(张三)]或[项目负责人(李四)]视角操作！");
                  return;
                }
                const oldVal = masterData.totalDuration.value;
                onUpdateMaster({
                  totalDuration: 360
                });
                alert(`✨ 模拟变更成功！总工期由原先的 ${oldVal}天 缩短为 360天，设计深化及进度表已发出重载通知！`);
              }}
              className="flex-1 px-3 py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-md text-xs font-semibold border border-stone-700 transition-colors"
            >
              变工期为 360天
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
