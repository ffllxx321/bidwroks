import { UserRoleType } from "../../../backend/src/modules/permissions/constants.ts";
import { roleLabelMap } from "../../utils/labelMaps.ts";

interface LoginProps {
  onLogin: (username: string, role: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const mockUsers = [
    { username: "张三 (营业)", role: UserRoleType.Sales, desc: "负责创建投标项目与主数据录入" },
    { username: "李四 (项目负责人)", role: UserRoleType.ProjectManager, desc: "负责全面项目管理、计划排期与终审" },
    { username: "陈七 (施工技术)", role: UserRoleType.Construction, desc: "负责技术编制、方案上传和提报" },
    { username: "钱八 (审核人)", role: UserRoleType.Reviewer, desc: "负责评片、下发修改意见与决议" },
    { username: "周十 (资料汇总员)", role: UserRoleType.DocumentCoordinator, desc: "负责定稿、合规确认与密封归集" },
    { username: "系统专员 (IT)", role: UserRoleType.SystemAdmin, desc: "系统运维与日志审计，不参与标书内容修改" },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 py-12">
      <div className="w-full max-w-lg bg-white border border-border rounded-lg shadow-md p-8">
        <div className="mb-6 text-center border-b border-border pb-6 flex flex-col items-center">
          <div className="mb-4">
            <img src="/logo-shimizu.svg" alt="BidWorks" className="w-12 h-12 object-contain" referrerPolicy="no-referrer" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#17324D] font-sans">
            BidWorks 投标协作平台
          </h1>
          <p className="text-xs text-stone-500 font-medium tracking-wide mt-1">
            仅供企业内部试点环境使用
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            选择所属角色以登录系统
          </label>
          <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
            {mockUsers.map((user) => (
              <button
                key={user.username}
                id={`btn-login-${user.role}`}
                onClick={() => onLogin(user.username, user.role)}
                className="w-full text-left p-3.5 bg-bg-subtle hover:bg-stone-50 border border-border hover:border-brand/40 rounded-md flex justify-between items-center group transition-all"
              >
                <div>
                  <div className="font-semibold text-xs text-stone-900 group-hover:text-brand font-sans transition-colors">
                    {user.username}
                  </div>
                  <div className="text-[11px] text-stone-500 font-sans mt-0.5">{user.desc}</div>
                </div>
                <span className="text-[10px] font-semibold bg-stone-100 border border-stone-200 text-stone-600 px-2 py-0.5 rounded-md group-hover:bg-brand/10 group-hover:text-brand group-hover:border-brand/20 transition-all">
                  进入系统
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="text-center font-sans text-[11px] text-stone-400 mt-4 pt-4 border-t border-border border-dashed">
          基于角色的动态权限控制已启用 (RBAC)  •  受控沙箱环境
        </div>
      </div>
    </div>
  );
}
