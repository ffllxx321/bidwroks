import React from "react";
import { UserRole } from "../types";
import { CheckCircle, UserCheck, EyeOff } from "lucide-react";

interface RoleSwitcherProps {
  activeRole: UserRole;
  onRoleChange: (role: UserRole) => void;
}

export const RoleSwitcher: React.FC<RoleSwitcherProps> = ({
  activeRole,
  onRoleChange,
}) => {
  const rolesList: { role: UserRole; label: string; bg: string; text: string; desc: string; restricts: string }[] = [
    {
      role: "营业商务 (张三)",
      label: "商务主管 · 张三",
      bg: "bg-brand",
      text: "text-white",
      desc: "负责标前招标文件解析、基础数据登记、主要条款合规审查",
      restricts: "不可编辑或查看核心商务敏感文件",
    },
    {
      role: "项目负责人 (李四)",
      label: "项目经理 · 李四",
      bg: "bg-blue-600",
      text: "text-white",
      desc: "负责整体进度把控，审核基础数据，批复纠偏偏离，进行最终成果定稿",
      restricts: "拥有项目管理与敏感级别阅览权限",
    },
    {
      role: "设计负责人 (王五)",
      label: "技术主管 · 王五",
      bg: "bg-emerald-600",
      text: "text-white",
      desc: "负责施工图及方案深化、工程结构编制、方案上传与自检",
      restricts: "无法查阅商务造价类敏感文件",
    },
    {
      role: "概算编制员 (赵六)",
      label: "造价主管 · 赵六",
      bg: "bg-indigo-600",
      text: "text-white",
      desc: "负责造价与估算编制、价格明细测算、核心商务敏感文件管理",
      restricts: "操作核心商务敏感数据信息，配合自动偏离测算",
    },
    {
      role: "施工技术总工 (陈七)",
      label: "施工总工 · 陈七",
      bg: "bg-rose-600",
      text: "text-white",
      desc: "施工组织、排期和平面配置方案编制，触发规范一致性核查纠错",
      restricts: "无法查看商务造价类敏感文件",
    },
    {
      role: "资料汇总归档员 (周十)",
      label: "汇总员 · 周十",
      bg: "bg-stone-600",
      text: "text-white",
      desc: "收集全专业最终发布定稿的附件包，核验规约自检通过及修正回复情况",
      restricts: "不可直接修改各专业施工图纸及原始报价数据",
    },
  ];

  const currentRoleInfo = rolesList.find((r) => r.role === activeRole) || rolesList[0];

  return (
    <div className="bg-white border border-border p-4 rounded-lg shadow-xs mb-6 font-sans">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg ${currentRoleInfo.bg} ${currentRoleInfo.text} flex items-center justify-center shadow-xs`}>
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wide">
              当前仿真视角所属岗位
            </div>
            <div className="text-sm font-bold text-stone-900 tracking-tight flex items-center gap-2 mt-0.5">
              <span>{activeRole}</span>
              <span className="text-[10px] bg-stone-105 border border-stone-200 text-stone-600 px-1.5 py-0.5 rounded-md font-medium">
                当前角色
              </span>
            </div>
          </div>
        </div>

        {/* Display details/permissions */}
        <div className="bg-[#FAF9F6] border border-border/60 p-3 rounded-lg flex-1 max-w-xl text-xs text-stone-600 flex flex-col justify-center gap-1.5 shadow-2xs">
          <div className="flex justify-between items-start gap-4">
            <span className="font-bold text-stone-700 shrink-0">💼 岗位职责：</span>
            <span className="text-right">{currentRoleInfo.desc}</span>
          </div>
          <div className="flex justify-between items-start gap-4 pt-1 border-t border-stone-200/45">
            <span className="font-bold text-rose-700 flex items-center gap-1 shrink-0">
              <EyeOff className="w-3" /> 权限范围限制：
            </span>
            <span className="text-right text-stone-500">{currentRoleInfo.restricts}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="text-[10px] font-bold text-stone-400 mb-2 uppercase tracking-wide">
          快速进行角色协同切换验证 (RBAC 角色系统验证)
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {rolesList.map((item) => {
            const isSelected = item.role === activeRole;
            return (
              <button
                key={item.role}
                onClick={() => onRoleChange(item.role)}
                className={`w-full text-left p-2.5 text-xs transition-all relative rounded-lg border ${
                  isSelected
                    ? `${item.bg} ${item.text} border-transparent shadow-xs font-bold`
                    : "bg-white text-stone-700 border-border hover:border-brand/40 hover:bg-stone-50"
                }`}
              >
                <div className="font-semibold truncate text-[11px]">{item.label}</div>
                <div className={`text-[9px] mt-0.5 ${isSelected ? "text-stone-100" : "text-stone-400"}`}>
                  角色验证
                </div>
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5 text-white">
                    <UserCheck className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
