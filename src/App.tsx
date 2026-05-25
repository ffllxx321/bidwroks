import { useState, useEffect, useRef } from "react";
import Login from "./pages/Login/index.tsx";
import Projects from "./pages/Projects/index.tsx";
import ProjectCreate from "./pages/ProjectCreate/index.tsx";
import ProjectMasterData from "./pages/ProjectMasterData/index.tsx";
import PersonalWorkbench from "./components/PersonalWorkbench.tsx";
import { UserRoleType } from "../backend/src/modules/permissions/constants.ts";
import { 
  LogOut, LayoutGrid, Award, HardDrive, Briefcase, 
  LayoutDashboard, ChevronDown, Search, Plus, Building, 
  Calendar, Check, FolderGit2, AlertCircle
} from "lucide-react";
import { roleLabelMap } from "./utils/labelMaps.ts";

export default function App() {
  const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(null);
  const [route, setRoute] = useState<"projects" | "create" | "workbench">("projects");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Switcher states
  const [projects, setProjects] = useState<any[]>([]);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const switcherRef = useRef<HTMLDivElement>(null);

  const handleLogin = (username: string, role: string) => {
    setCurrentUser({ username, role });
    setRoute("projects");
    setSelectedProjectId(null);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSelectedProjectId(null);
    setShowSwitcher(false);
  };

  // Fetch projects list for header switcher
  const fetchProjects = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch("/api/projects", {
        headers: {
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.username,
          "x-username": currentUser.username
        }
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error("Failed to fetch projects list inside App header", err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchProjects();
    }
  }, [currentUser, selectedProjectId]);

  // Click outside switcher close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
        setShowSwitcher(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!currentUser) {
    return (
      <div className="bg-bg-page min-h-screen text-text-primary selection:bg-brand selection:text-white">
        <Login onLogin={handleLogin} />
      </div>
    );
  }

  // Find the selected project object
  const activeProj = projects.find(p => p.id === selectedProjectId);

  // Filter projects inside dropdown
  const filteredProjects = projects.filter(p => {
    const query = searchQuery.toLowerCase();
    return (
      p.name?.toLowerCase().includes(query) ||
      p.id?.toLowerCase().includes(query) ||
      p.client_name?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="bg-bg-page min-h-screen text-text-primary flex flex-col selection:bg-brand selection:text-white">
      {/* Dynamic Header */}
      <header className="bg-white border-b border-border sticky top-0 z-55 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center gap-4">
          
          {/* Logo & Switcher container */}
          <div className="flex items-center gap-6">
            
            {/* System logo */}
            <div 
              className="flex items-center gap-3 cursor-pointer" 
              onClick={() => { setSelectedProjectId(null); setRoute("projects"); }}
            >
              <img src="/logo-shimizu.svg" alt="BidWorks" className="w-7 h-7 object-contain" referrerPolicy="no-referrer" />
              <div className="flex flex-col hidden md:flex">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-bold text-gray-950 tracking-tight font-sans">BidWorks 投标协作平台</span>
                </div>
                <span className="text-[8.5px] text-stone-500 uppercase font-semibold tracking-wider leading-none">企业内部试点工程空间</span>
              </div>
            </div>

            {/* Separator */}
            <div className="h-6 w-px bg-stone-200 hidden md:block" />

            {/* ========================================================
                🚀 ENTERPRISE TOP PROJECT SWITCHER (顶部项目切换器)
                ======================================================== */}
            <div className="relative font-sans" ref={switcherRef}>
              <button 
                onClick={() => setShowSwitcher(!showSwitcher)}
                className={`p-2 px-3 border rounded-lg transition-all flex items-center justify-between gap-3 text-left shadow-3xs cursor-pointer select-none max-w-[280px] md:max-w-[360px] ${
                  selectedProjectId 
                    ? "bg-slate-50 border-brand/40 hover:bg-slate-100" 
                    : "bg-white border-stone-200 hover:border-gray-400"
                }`}
              >
                <div className="truncate">
                  {activeProj ? (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[11.5px] font-extrabold text-stone-900 truncate">
                          {activeProj.name}
                        </span>
                        <span className="shrink-0 text-[8.5px] bg-[#2E6B57] text-white px-1 rounded-xs font-bold leading-none py-0.5">
                          {activeProj.status || "设计深化中"}
                        </span>
                      </div>
                      <div className="text-[9.5px] text-stone-550 font-semibold flex items-center gap-1.5">
                        <span className="font-mono text-stone-400">ID: {activeProj.id}</span>
                        <span>•</span>
                        <span>截止日: {activeProj.bid_closing_date || "未填"}</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-extrabold text-[#17324D] block">主协同工作空间</span>
                      <span className="text-[9px] text-stone-400 font-semibold block leading-none mt-0.5">请快速点击下拉切换投标工程项目</span>
                    </div>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-stone-400 shrink-0 transition-transform ${showSwitcher ? "rotate-180" : ""}`} />
              </button>

              {/* Popup Switcher Drawer Panel */}
              {showSwitcher && (
                <div className="absolute left-0 mt-2 w-80 bg-white border border-border rounded-xl shadow-xl z-100 p-4 space-y-4 animate-in fade-in slide-in-from-top-1 duration-150">
                  
                  {/* Search query input */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-stone-400" />
                    <input
                      type="text"
                      placeholder="检索项目名、业主或 ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 p-2 bg-stone-50 border border-border rounded-lg text-[10.5px] font-semibold text-stone-800 placeholder-stone-400 focus:outline-none focus:border-brand"
                    />
                  </div>

                  {/* Add Bid button */}
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">切换至指定空间</span>
                    <button
                      onClick={() => {
                        setRoute("create");
                        setSelectedProjectId(null);
                        setShowSwitcher(false);
                      }}
                      className="text-[9.5px] text-brand hover:underline font-bold flex items-center gap-0.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>新建项目</span>
                    </button>
                  </div>

                  {/* Projects categories */}
                  <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-0.5">
                    
                    {filteredProjects.length === 0 ? (
                      <p className="text-[9.5px] text-stone-400 italic py-4 text-center">暂无匹配到此试点工程。</p>
                    ) : (
                      filteredProjects.map(proj => {
                        const isCurrent = proj.id === selectedProjectId;
                        return (
                          <div
                            key={proj.id}
                            onClick={() => {
                              setSelectedProjectId(proj.id);
                              setShowSwitcher(false);
                            }}
                            className={`p-2.5 rounded-lg border cursor-pointer transition-colors block text-left ${
                              isCurrent 
                                ? "bg-brand/10 border-brand" 
                                : "bg-white border-stone-150 hover:bg-slate-50 hover:border-stone-300"
                            }`}
                          >
                            <div className="flex justify-between items-start gap-1">
                              <span className="text-[11px] font-extrabold text-stone-900 line-clamp-1">
                                {proj.name}
                              </span>
                              {isCurrent && <Check className="w-3.5 h-3.5 text-brand shrink-0" />}
                            </div>
                            <div className="text-[9px] text-stone-500 flex items-center gap-1.5 mt-1">
                              <span className="font-mono text-stone-400 font-semibold">编号 ID: {proj.id}</span>
                              <span>•</span>
                              <span className="truncate">业主: {proj.client_name || "日资本部"}</span>
                            </div>
                            <div className="text-[9px] text-stone-500 flex justify-between items-center mt-1.5 border-t border-dashed border-stone-100 pt-1">
                              <span>状态: <b className="text-stone-700">{proj.status || "处理中"}</b></span>
                              <span className="font-mono">截止日: <b>{proj.bid_closing_date || "待定"}</b></span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Bottom dashboard index route */}
                  <div className="border-t pt-2.5 flex items-center justify-between text-[10px]">
                    <button
                      onClick={() => {
                        setSelectedProjectId(null);
                        setRoute("projects");
                        setShowSwitcher(false);
                      }}
                      className="text-stone-500 hover:text-stone-900 font-bold"
                    >
                      返回全部工程列表 ➔
                    </button>
                    <span className="text-stone-350 text-[9px] font-mono">Shimizu ERP v2.4</span>
                  </div>

                </div>
              )}
            </div>

          </div>

          {/* Navigation Bar Toggle */}
          <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-md border border-stone-200">
            <button
              onClick={() => { setSelectedProjectId(null); setRoute("projects"); }}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                route === "projects" && !selectedProjectId
                  ? "bg-white text-stone-900 shadow-xs font-semibold"
                  : "text-stone-500 hover:text-stone-900"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-stone-505" />
              <span>项目列表</span>
            </button>
            <button
              onClick={() => { setSelectedProjectId(null); setRoute("workbench"); }}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                route === "workbench" && !selectedProjectId
                  ? "bg-white text-stone-900 shadow-xs font-semibold"
                  : "text-stone-500 hover:text-stone-900"
              }`}
            >
              <Briefcase className="w-3.5 h-3.5 text-stone-505" />
              <span>个人工作台</span>
            </button>
          </div>

          {/* Connected role and account actions */}
          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
              <span className="text-[9px] text-stone-400 block font-bold uppercase tracking-wider leading-none">安全协作岗位</span>
              <span className="text-xs font-extrabold text-stone-700 block mt-1">
                {currentUser.username} <span className="text-brand ml-0.5">[{roleLabelMap[currentUser.role] || currentUser.role}]</span>
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-md bg-stone-50 hover:bg-stone-100 border border-border text-stone-650 hover:text-stone-900 text-xs transition-colors flex items-center gap-1.5 font-bold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">退出登录</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main content viewport */}
      <main className="flex-grow">
        {selectedProjectId ? (
          <ProjectMasterData
            projectId={selectedProjectId}
            currentUser={currentUser}
            onBack={() => {
              if (route === "workbench") {
                setRoute("workbench");
              } else {
                setRoute("projects");
              }
              setSelectedProjectId(null);
            }}
          />
        ) : route === "create" ? (
          <ProjectCreate
            currentUser={currentUser}
            onBack={() => setRoute("projects")}
            onProjectCreated={(newProj) => {
              setRoute("projects");
              setSelectedProjectId(newProj.id);
            }}
          />
        ) : route === "workbench" ? (
          <PersonalWorkbench
            currentUser={currentUser}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
            }}
          />
        ) : (
          <Projects
            currentUser={currentUser}
            onNavigateToCreate={() => setRoute("create")}
            onSelectProject={(id) => setSelectedProjectId(id)}
          />
        )}
      </main>

      {/* System info Footer */}
      <footer className="bg-white border-t border-border-subtle py-5 text-center font-sans text-[11px] text-stone-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© 2026 BidWorks 投标协作平台</span>
          <span className="text-stone-400 font-mono text-[10px]">内部自研试点系统隔离保护环境  •  基于 PostgreSQL 及审计日志双轨保全</span>
        </div>
      </footer>
    </div>
  );
}
