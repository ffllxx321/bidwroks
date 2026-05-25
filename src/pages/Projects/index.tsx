import { useEffect, useState } from "react";
import { FolderOpen, Plus, Clock, RefreshCw } from "lucide-react";
import { roleLabelMap } from "../../utils/labelMaps.ts";

interface ProjectsProps {
  onSelectProject: (projectId: string) => void;
  onNavigateToCreate: () => void;
  currentUser: { username: string; role: string };
}

interface ProjectData {
  id: string;
  name: string;
  status: string;
  client: string;
  area: string;
  duration: string;
  date: string;
  createdAt: string;
}

export default function Projects({ onSelectProject, onNavigateToCreate, currentUser }: ProjectsProps) {
  const [projectsList, setProjectsList] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchProjects = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/projects", {
        headers: {
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.username,
          "x-username": currentUser.username
        }
      });
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("检测到未授权。当前账号岗位无投开项目列表的查阅权限！");
        }
        throw new Error(`获取项目列表失败: 服务器响应 ${res.status}`);
      }
      const data = await res.json();
      setProjectsList(data);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "请求服务器出错");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [currentUser]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Upper Status strip */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b border-border">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight font-sans">
            项目列表
          </h2>
          <p className="text-xs text-stone-550 mt-1 font-sans">
            当前用户: <span className="font-semibold text-stone-700">{currentUser.username}</span> 权限角色：
            <span className="text-brand font-semibold font-sans">[{roleLabelMap[currentUser.role] || currentUser.role}]</span>
          </p>
        </div>
        <div className="flex items-center gap-3 mt-4 md:mt-0">
          <button
            onClick={fetchProjects}
            className="p-2.5 rounded-md bg-white border border-border text-stone-700 hover:bg-stone-50 transition-colors"
            title="刷新列表"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          
          <button
            onClick={onNavigateToCreate}
            className="px-5 py-2 rounded-md bg-brand hover:bg-brand-hover text-white flex items-center gap-2 text-xs font-semibold shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>新建投标项目</span>
          </button>
        </div>
      </div>

      {errorMsg ? (
        <div className="p-6 border border-red-200 bg-red-50 text-red-900 font-sans text-xs max-w-2xl mx-auto text-center rounded-md shadow-xs">
          <p className="font-semibold mb-1">提示</p>
          <p className="mb-4">{errorMsg}</p>
          <button
            onClick={fetchProjects}
            className="px-4 py-1.5 rounded-md bg-brand text-white text-xs font-medium hover:bg-brand-hover transition-colors"
          >
            重新验证
          </button>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent animate-spin rounded-full mb-3" />
          <p className="text-xs text-stone-400 font-medium tracking-wide animate-pulse">
            获取项目列表数据中...
          </p>
        </div>
      ) : projectsList.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-stone-300 bg-white p-8 rounded-lg shadow-xs">
          <p className="text-stone-505 text-xs mb-4 font-medium font-sans">
            暂无项目数据。
          </p>
          <button
            onClick={onNavigateToCreate}
            className="px-5 py-2 rounded-md bg-brand hover:bg-brand-hover text-white text-xs font-semibold shadow-xs transition-colors"
          >
             新建第一个投标项目
          </button>
        </div>
      ) : (
        /* Grid List */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {projectsList.map((p) => (
            <div key={p.id} className="bg-white border border-border rounded-lg p-5 flex flex-col justify-between shadow-xs hover:shadow-md hover:border-brand/35 transition-all">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-medium text-stone-400 bg-stone-100 border border-stone-200/60 px-2 py-0.5 rounded-md">
                    项目编码: {p.id}
                  </span>
                  <span className="text-[10px] font-semibold text-[#3F5B4E] bg-[#EAF5EF] border border-[#CDE5D9] px-2 py-0.5 rounded-md">
                    {p.status}
                  </span>
                </div>
                <h3 
                  className="text-base font-bold text-stone-900 hover:text-brand cursor-pointer mb-2 leading-snug font-sans transition-colors" 
                  onClick={() => onSelectProject(p.id)}
                >
                  {p.name}
                </h3>
                <p className="text-xs text-stone-500 mb-4 font-sans">
                  项目业主: <span className="text-stone-800 font-medium">{p.client}</span>
                </p>

                {/* Subdued metrics grid */}
                <div className="grid grid-cols-2 gap-4 mb-5 p-3.5 bg-bg-subtle border border-border-subtle rounded-md text-xs">
                  <div>
                    <span className="text-stone-400 block mb-0.5 text-[11px] font-sans">总建筑面积：</span>
                    <div className="text-stone-800 font-bold text-xs font-sans">{p.area}</div>
                  </div>
                  <div>
                    <span className="text-stone-400 block mb-0.5 text-[11px] font-sans">总工期：</span>
                    <div className="text-stone-800 font-bold text-xs font-sans">{p.duration}</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-border-subtle pt-3.5 flex justify-between items-center mt-auto text-xs">
                <span className="text-stone-400 flex items-center gap-1.5 text-[11px] font-sans">
                  <Clock className="w-3.5 h-3.5 text-stone-405" /> 投标截止日: {p.date}
                </span>
                <button
                  onClick={() => onSelectProject(p.id)}
                  className="px-3.5 py-1.5 rounded-md bg-stone-50 hover:bg-stone-100 border border-border text-stone-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-stone-500" />
                  <span>进入项目</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
