import React, { useState } from "react";
import { 
  ArrowLeft, Upload, CheckCircle, Sparkles, AlertOctagon, 
  Trash2, Plus, Calendar, Clock, Building, MapPin, User, FileText, Check
} from "lucide-react";

interface ProjectCreateProps {
  onBack: () => void;
  onProjectCreated: (projData: any) => void;
  currentUser: { username: string; role: string };
}

interface ReqItem {
  id: string;
  category: string;
  requirementName: string;
  requiredValue: string;
  complianceStatus: string;
  sourceSnippet: string;
}

interface TaskItem {
  taskName: string;
  bidPhase: string;
  suggestedAssignee: string;
  description: string;
  durationDays: number;
}

interface AnalysisResult {
  projectInfo: {
    projectName: string;
    ownerName: string;
    projectLocation: string;
    buildingType: string;
    bidDeadline: string;
    grossFloorAreaValue: number;
    grossFloorAreaUnit: string;
    totalDurationValue: number;
    totalDurationUnit: string;
    sourceText: string;
  };
  tenderRequirements: ReqItem[];
  taskSuggestions: TaskItem[];
}

export default function ProjectCreate({ onBack, onProjectCreated, currentUser }: ProjectCreateProps) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseStep, setParseStep] = useState<string>("");
  const [parseResult, setParseResult] = useState<AnalysisResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"info" | "reqs" | "tasks">("info");

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      setFile(selected);
      if (!name) {
        // Preset project name based on file name minus extension
        const rawName = selected.name.substring(0, selected.name.lastIndexOf("."));
        setName(rawName + "解析项目");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      if (!name) {
        const rawName = selected.name.substring(0, selected.name.lastIndexOf("."));
        setName(rawName + "解析项目");
      }
    }
  };

  const convertFileToBase64 = (fileObj: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(fileObj);
      reader.onload = () => {
        const base64Str = (reader.result as string).split(",")[1];
        resolve(base64Str);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Trigger Real Bailian Analysis Flow
  const handleTriggerAIParse = async () => {
    if (!name) return alert("请先填写项目名称！");
    if (!file) return alert("需解析文件，请先上传招标文件！");

    setIsParsing(true);
    setErrorMessage(null);
    setParseStep("1/4: 正在读取并准备传输二进制文件...");

    try {
      const base64Content = await convertFileToBase64(file);
      
      setParseStep("2/4: 正在上传大文件至百炼支持兼容接口 (purpose=file-extract)...");
      
      // Delay to let UI breathing
      await new Promise(r => setTimeout(r, 600));
      setParseStep("3/4: 百炼接收完毕，正在对文档进行预解析、抽取及排队处理 (最多等待30秒)...");

      const res = await fetch("/api/ai/analyze-tender-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.username,
          "x-username": currentUser.username,
        },
        body: JSON.stringify({
          fileName: file.name,
          fileData: base64Content
        })
      });

      if (!res.ok) {
        const errResult = await res.json();
        throw new Error(errResult.error || "大模型文件分析返回错误代码");
      }

      setParseStep("4/4: 解析索引完成！正在调用 qwen-long 提取结构化合规清单及工作包建议...");
      const reply = await res.json();
      
      // Keep the document project name aligned
      if (reply.projectInfo && !reply.projectInfo.projectName) {
        reply.projectInfo.projectName = name;
      }

      setParseResult(reply);
      setParseStep("");
    } catch (err: any) {
      console.error(err);
      setErrorMessage(`❌ 解析操作失败: ${err.message || '未知连接故障'}`);
    } finally {
      setIsParsing(false);
    }
  };

  // Save the Entire Confirmed Changes to Database Together
  const handleConfirmAndSave = async () => {
    if (!parseResult) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      let base64Content = "";
      if (file) {
        base64Content = await convertFileToBase64(file);
      }

      const res = await fetch("/api/ai/confirm-tender-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": currentUser.role,
          "x-user-id": currentUser.username,
          "x-username": currentUser.username,
        },
        body: JSON.stringify({
          projectName: parseResult.projectInfo.projectName || name,
          projectInfo: parseResult.projectInfo,
          tenderRequirements: parseResult.tenderRequirements,
          taskSuggestions: parseResult.taskSuggestions,
          fileName: file ? file.name : undefined,
          fileData: file ? base64Content : undefined
        }),
      });

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("👮 权限校验拦截：当前系统角色无权创建项目或写入主数据！");
        }
        const data = await res.json();
        throw new Error(data.error || "同步到数据库失败");
      }

      const reply = await res.json();
      // Navigate to Project Dashboard
      onProjectCreated({ id: reply.projectId, name: reply.projectName, status: "已创建" });
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "请求服务器出错");
    } finally {
      setSubmitting(false);
    }
  };

  // Requirements Helper operations
  const handleAddRequirement = () => {
    if (!parseResult) return;
    const newReq: ReqItem = {
      id: `req-manual-${Date.now()}`,
      category: "资质业绩要求",
      requirementName: "新考核指标",
      requiredValue: "需补充要求值",
      complianceStatus: "待确认",
      sourceSnippet: "手动添加"
    };
    setParseResult({
      ...parseResult,
      tenderRequirements: [...parseResult.tenderRequirements, newReq]
    });
  };

  const handleDeleteRequirement = (id: string) => {
    if (!parseResult) return;
    setParseResult({
      ...parseResult,
      tenderRequirements: parseResult.tenderRequirements.filter(r => r.id !== id)
    });
  };

  const handleUpdateRequirement = (id: string, field: keyof ReqItem, val: string) => {
    if (!parseResult) return;
    setParseResult({
      ...parseResult,
      tenderRequirements: parseResult.tenderRequirements.map(r => r.id === id ? { ...r, [field]: val } : r)
    });
  };

  // Suggestions Helper operations
  const handleAddTask = () => {
    if (!parseResult) return;
    const newTask: TaskItem = {
      taskName: "手动建议编制任务",
      bidPhase: "Construction",
      suggestedAssignee: "陈七 (施工总工)",
      description: "需细化方案内容描述及编制规范",
      durationDays: 3
    };
    setParseResult({
      ...parseResult,
      taskSuggestions: [...parseResult.taskSuggestions, newTask]
    });
  };

  const handleDeleteTask = (index: number) => {
    if (!parseResult) return;
    setParseResult({
      ...parseResult,
      taskSuggestions: parseResult.taskSuggestions.filter((_, idx) => idx !== index)
    });
  };

  const handleUpdateTask = (index: number, field: keyof TaskItem, val: any) => {
    if (!parseResult) return;
    setParseResult({
      ...parseResult,
      taskSuggestions: parseResult.taskSuggestions.map((t, idx) => idx === index ? { ...t, [field]: val } : t)
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Back Header */}
      <div className="flex justify-between items-center mb-6">
        <button onClick={onBack} className="pmd-btn px-4 py-2 flex items-center gap-1.5 text-xs font-semibold text-stone-700 bg-white border border-stone-200 hover:bg-stone-50 rounded-lg shadow-2xs">
          <ArrowLeft className="w-4 h-4" /> 返回项目列表
        </button>
        <div className="text-xs font-mono bg-stone-100 text-stone-600 px-3 py-1.5 rounded-md">
          操作员: <span className="font-bold text-stone-800">{currentUser.username} ({currentUser.role})</span>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-6 p-4 border border-rose-200 bg-rose-50 text-rose-950 font-sans text-xs flex items-start gap-3 rounded-lg shadow-sm">
          <AlertOctagon className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-bold mb-1">操作遇到了问题</h4>
            <p className="font-medium">{errorMessage}</p>
          </div>
        </div>
      )}

      {!parseResult ? (
        <div className="pmd-card bg-white p-6 md:p-8 rounded-lg shadow-xs border border-stone-200 max-w-3xl mx-auto animate-fadeIn">
          <div className="border-b border-stone-100 pb-4 mb-6">
            <h2 className="text-lg font-bold font-sans text-stone-900 tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand" />
              <span>新建招标解析项目</span>
            </h2>
            <p className="text-xs text-stone-500 font-sans mt-1">
              由阿里云百炼大模型（qwen-long）对招标文件进行一键公式分析，自动提炼指标并生成建议任务排期。
            </p>
          </div>

          <div className="space-y-6">
            {/* Project name input */}
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase mb-2">
                项目工作空间名称 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：普陀精密厂房施工项目"
                className="w-full mt-1.5 p-2.5 bg-white border border-stone-300 rounded-lg font-sans text-sm focus:ring-1 focus:ring-brand focus:border-brand focus:outline-none text-stone-900 font-medium"
              />
            </div>

            {/* Sandbox Drag-And-Drop area */}
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase mb-2">
                上传招标文件 (PDF, Word, Docx) <span className="text-rose-500">*</span>
              </label>
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-stone-300 rounded-lg p-10 bg-stone-50 text-center cursor-pointer hover:bg-stone-100/40 transition-all relative"
              >
                <input
                  type="file"
                  id="file-upload"
                  onChange={handleFileChange}
                  accept=".docx,.pdf,.doc"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center space-y-3">
                  <Upload className="w-10 h-10 text-stone-400 stroke-[1.5px]" />
                  <p className="font-sans font-bold text-sm text-stone-750">
                    {file ? `已选定文件：${file.name}` : "拖入 PDF/DOCX 投标文件，或点按选择本地文件"}
                  </p>
                  <p className="text-xs text-stone-400 font-sans">
                    百炼官方提取通道：大容量长文本自适应 (目的: file-extract)
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleTriggerAIParse}
              disabled={isParsing || !name || !file}
              className="w-full py-4 px-6 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex justify-center items-center gap-2.5 font-sans font-bold text-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:bg-stone-300"
            >
              {isParsing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  <span className="font-sans font-semibold text-xs tracking-wider uppercase">分析链路推进中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-white animate-bounce" />
                  <span className="font-sans font-bold">开始百炼官方文档理解分析</span>
                </>
              )}
            </button>

            {isParsing && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-950 font-sans text-xs">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                  <span className="font-bold">百炼闭环执行日志:</span>
                </div>
                <p className="font-mono text-stone-600 font-medium">{parseStep}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ==================== 3-PART HUMAN-IN-THE-LOOP INTEGRATION SCREEN ==================== */
        <div className="space-y-6 animate-fadeIn">
          {/* Welcome Alert */}
          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-lg flex items-center justify-between text-xs font-sans">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-emerald-600" />
              <div>
                <span className="font-bold text-emerald-900">官方解析成功！</span>
                <span className="text-emerald-700 font-medium">请审核并调整提炼出来的三套核心对象。确认无误后一键同步。</span>
              </div>
            </div>
            <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded">
              来源件: {file?.name || "未知"}
            </span>
          </div>

          <div className="bg-white rounded-lg border border-stone-200">
            {/* Tabs Selector */}
            <div className="flex border-b border-stone-200 font-sans font-bold text-xs">
              <button 
                onClick={() => setActiveTab("info")}
                className={`flex-1 py-4 text-center border-b-2 transition-all ${activeTab === "info" ? 'border-brand text-brand' : 'border-transparent text-stone-500 hover:text-stone-800'}`}
              >
                1. 项目主数据 ({parseResult.projectInfo ? "100% 已填" : "待查"})
              </button>
              <button 
                onClick={() => setActiveTab("reqs")}
                className={`flex-1 py-4 text-center border-b-2 transition-all ${activeTab === "reqs" ? 'border-brand text-brand' : 'border-transparent text-stone-500 hover:text-stone-800'}`}
              >
                2. 制式合规表单要求 ({parseResult.tenderRequirements.length} 项)
              </button>
              <button 
                onClick={() => setActiveTab("tasks")}
                className={`flex-1 py-4 text-center border-b-2 transition-all ${activeTab === "tasks" ? 'border-brand text-brand' : 'border-transparent text-stone-500 hover:text-stone-800'}`}
              >
                3. 建议工作包分配 ({parseResult.taskSuggestions.length} 项)
              </button>
            </div>

            {/* Tab content 1: Project Info */}
            {activeTab === "info" && (
              <div className="p-6 md:p-8 space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs font-sans">
                  <div>
                    <label className="text-stone-600 font-semibold uppercase flex items-center gap-1">
                      <Building className="w-3.5 h-3.5 text-stone-500" /> 项目正式名称
                    </label>
                    <input
                      type="text"
                      value={parseResult.projectInfo.projectName}
                      onChange={(e) => setParseResult({
                        ...parseResult,
                        projectInfo: { ...parseResult.projectInfo, projectName: e.target.value }
                      })}
                      className="w-full mt-1.5 p-2.5 bg-white border border-stone-300 rounded-lg text-stone-900 font-bold focus:ring-1 focus:ring-brand focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-stone-600 font-semibold uppercase flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-stone-500" /> 发包业主/建设单位
                    </label>
                    <input
                      type="text"
                      value={parseResult.projectInfo.ownerName}
                      onChange={(e) => setParseResult({
                        ...parseResult,
                        projectInfo: { ...parseResult.projectInfo, ownerName: e.target.value }
                      })}
                      className="w-full mt-1.5 p-2.5 bg-white border border-stone-300 rounded-lg text-stone-900 font-semibold focus:ring-1 focus:ring-brand focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-stone-600 font-semibold uppercase flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-stone-500" /> 建设地点/地址
                    </label>
                    <input
                      type="text"
                      value={parseResult.projectInfo.projectLocation}
                      onChange={(e) => setParseResult({
                        ...parseResult,
                        projectInfo: { ...parseResult.projectInfo, projectLocation: e.target.value }
                      })}
                      className="w-full mt-1.5 p-2.5 bg-white border border-stone-300 rounded-lg text-stone-900 font-medium focus:ring-1 focus:ring-brand focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-stone-600 font-semibold uppercase flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-stone-500" /> 建筑大类与结构形式
                    </label>
                    <input
                      type="text"
                      value={parseResult.projectInfo.buildingType}
                      onChange={(e) => setParseResult({
                        ...parseResult,
                        projectInfo: { ...parseResult.projectInfo, buildingType: e.target.value }
                      })}
                      className="w-full mt-1.5 p-2.5 bg-white border border-stone-300 rounded-lg text-stone-900 font-medium focus:ring-1 focus:ring-brand focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-stone-600 font-semibold uppercase flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-stone-500" /> 总工期指标 (数值)
                    </label>
                    <input
                      type="number"
                      value={parseResult.projectInfo.totalDurationValue}
                      onChange={(e) => setParseResult({
                        ...parseResult,
                        projectInfo: { ...parseResult.projectInfo, totalDurationValue: Number(e.target.value) }
                      })}
                      className="w-full mt-1.5 p-2.5 bg-white border border-stone-300 rounded-lg text-stone-900 font-mono font-bold focus:ring-1 focus:ring-brand focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-stone-600 font-semibold uppercase flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-stone-400" /> 总工期指标 (单位)
                    </label>
                    <input
                      type="text"
                      value={parseResult.projectInfo.totalDurationUnit}
                      onChange={(e) => setParseResult({
                        ...parseResult,
                        projectInfo: { ...parseResult.projectInfo, totalDurationUnit: e.target.value }
                      })}
                      className="w-full mt-1.5 p-2.5 bg-white border border-stone-300 rounded-lg text-stone-900 focus:ring-1 focus:ring-brand focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-stone-600 font-semibold uppercase flex items-center gap-1">
                      📐 总建筑面积 (数值)
                    </label>
                    <input
                      type="number"
                      value={parseResult.projectInfo.grossFloorAreaValue}
                      onChange={(e) => setParseResult({
                        ...parseResult,
                        projectInfo: { ...parseResult.projectInfo, grossFloorAreaValue: Number(e.target.value) }
                      })}
                      className="w-full mt-1.5 p-2.5 bg-white border border-stone-300 rounded-lg text-stone-900 font-mono font-bold focus:ring-1 focus:ring-brand focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-stone-600 font-semibold uppercase flex items-center gap-1">
                      📐 总建筑面积 (单位)
                    </label>
                    <input
                      type="text"
                      value={parseResult.projectInfo.grossFloorAreaUnit}
                      onChange={(e) => setParseResult({
                        ...parseResult,
                        projectInfo: { ...parseResult.projectInfo, grossFloorAreaUnit: e.target.value }
                      })}
                      className="w-full mt-1.5 p-2.5 bg-white border border-stone-300 rounded-lg text-stone-900 focus:ring-1 focus:ring-brand focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-stone-600 font-semibold uppercase flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-stone-500" /> 投标交付截止日期
                    </label>
                    <input
                      type="text"
                      value={parseResult.projectInfo.bidDeadline}
                      onChange={(e) => setParseResult({
                        ...parseResult,
                        projectInfo: { ...parseResult.projectInfo, bidDeadline: e.target.value }
                      })}
                      className="w-full mt-1.5 p-2.5 bg-white border border-stone-300 rounded-lg text-stone-900 font-mono font-bold focus:ring-1 focus:ring-brand focus:border-brand focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-6 border-t border-stone-100 pt-6">
                  <h4 className="text-xs font-bold font-sans text-stone-800 uppercase mb-2">
                    📄 百炼官方文档定位来源引用:
                  </h4>
                  <blockquote className="p-3 bg-stone-50 border-l-4 border-emerald-500 rounded-r text-stone-600 font-sans text-xs leading-relaxed italic">
                    &ldquo;{parseResult.projectInfo.sourceText || '无直接引用段落或未识别明确来源部分。'}&rdquo;
                  </blockquote>
                </div>
              </div>
            )}

            {/* Tab content 2: Requirements list */}
            {activeTab === "reqs" && (
              <div className="p-6 md:p-8 space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center pb-2 border-b border-stone-150">
                  <h3 className="text-xs font-bold text-stone-800 uppercase">
                    智能提炼制式表单 ({parseResult.tenderRequirements.length} 条硬性红线要求)
                  </h3>
                  <button 
                    onClick={handleAddRequirement}
                    className="flex items-center gap-1 text-[11px] font-bold text-brand bg-brand/5 hover:bg-brand/10 px-3 py-1.5 rounded-md"
                  >
                    <Plus className="w-3.5 h-3.5" /> 增加表单行
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full font-sans text-xs border text-left border-stone-200">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold">
                        <th className="p-3 w-1/5">分类</th>
                        <th className="p-3 w-1/5">要求名称</th>
                        <th className="p-3 w-2/5">具体指标规范值</th>
                        <th className="p-3 w-1/6">合规状态</th>
                        <th className="p-3 text-center w-12">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-150">
                      {parseResult.tenderRequirements.map((req) => (
                        <tr key={req.id} className="hover:bg-stone-50/50">
                          <td className="p-2.5">
                            <select
                              value={req.category}
                              onChange={(e) => handleUpdateRequirement(req.id, "category", e.target.value)}
                              className="w-full p-2 bg-white border border-stone-300 rounded-md focus:outline-none"
                            >
                              <option value="资质业绩要求">资质业绩要求</option>
                              <option value="人员资格要求">人员资格要求</option>
                              <option value="工期与质量">工期与质量</option>
                              <option value="技术规范">技术规范</option>
                            </select>
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={req.requirementName}
                              onChange={(e) => handleUpdateRequirement(req.id, "requirementName", e.target.value)}
                              className="w-full p-2 bg-white border border-stone-300 rounded-md focus:outline-none text-stone-900 font-semibold"
                            />
                          </td>
                          <td className="p-2.5">
                            <textarea
                              rows={2}
                              value={req.requiredValue}
                              onChange={(e) => handleUpdateRequirement(req.id, "requiredValue", e.target.value)}
                              className="w-full p-2 bg-white border border-stone-300 rounded-md focus:outline-none leading-relaxed"
                            />
                          </td>
                          <td className="p-2.5">
                            <select
                              value={req.complianceStatus}
                              onChange={(e) => handleUpdateRequirement(req.id, "complianceStatus", e.target.value)}
                              className="w-full p-2 bg-white border border-stone-300 rounded-md focus:outline-none font-bold"
                            >
                              <option value="满足">满足 (Compliant)</option>
                              <option value="待确认">待确认 (Unknown)</option>
                              <option value="不满足">不满足 (Non-Compliant)</option>
                            </select>
                          </td>
                          <td className="p-2.5 text-center">
                            <button 
                              onClick={() => handleDeleteRequirement(req.id)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {parseResult.tenderRequirements.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-stone-400 italic">
                            没有提取出特定制式要求。点右上角进行手工新增。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab content 3: Suggested tasks */}
            {activeTab === "tasks" && (
              <div className="p-6 md:p-8 space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center pb-2 border-b border-stone-150">
                  <h3 className="text-xs font-bold text-stone-800 uppercase">
                    推荐编制任务包 ({parseResult.taskSuggestions.length} 个协同建议任务)
                  </h3>
                  <button 
                    onClick={handleAddTask}
                    className="flex items-center gap-1 text-[11px] font-bold text-brand bg-brand/5 hover:bg-brand/10 px-3 py-1.5 rounded-md"
                  >
                    <Plus className="w-3.5 h-3.5" /> 增加建议任务
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {parseResult.taskSuggestions.map((t, idx) => (
                    <div key={idx} className="p-4 border border-stone-200 rounded-lg bg-stone-50/50 space-y-3 relative group">
                      <button 
                        onClick={() => handleDeleteTask(idx)}
                        className="absolute right-3 top-3 p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="space-y-2">
                        <span className="text-[10px] bg-stone-200 text-stone-700 px-2 py-0.5 rounded font-mono font-semibold uppercase">
                          AI 推荐工作包
                        </span>
                        
                        <div>
                          <label className="text-[10px] text-stone-500 font-bold block mb-1">任务工作内容</label>
                          <input
                            type="text"
                            value={t.taskName}
                            onChange={(e) => handleUpdateTask(idx, "taskName", e.target.value)}
                            className="w-full p-2 bg-white border border-stone-300 rounded font-sans text-xs font-bold text-stone-900 focus:outline-none"
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="text-[10px] text-stone-500 font-bold block mb-1">对应阶段</label>
                            <select
                              value={t.bidPhase}
                              onChange={(e) => handleUpdateTask(idx, "bidPhase", e.target.value)}
                              className="w-full p-2 bg-white border border-stone-300 rounded"
                            >
                              <option value="TenderParse">TenderParse (解析)</option>
                              <option value="Design">Design (设计编制)</option>
                              <option value="Estimation">Estimation (概算核对)</option>
                              <option value="Construction">Construction (施工方案)</option>
                              <option value="Review">Review (总监审核)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-stone-500 font-bold block mb-1">建议执掌责任人</label>
                            <select
                              value={t.suggestedAssignee}
                              onChange={(e) => handleUpdateTask(idx, "suggestedAssignee", e.target.value)}
                              className="w-full p-2 bg-white border border-stone-300 rounded text-stone-900 font-semibold"
                            >
                              <option value="李四 (项目负责人)">李四 (项目负责人)</option>
                              <option value="张三 (营业官)">张三 (营业官)</option>
                              <option value="陈七 (施工总工)">陈七 (施工总工)</option>
                              <option value="赵六 (概算负责人)">赵六 (概算负责人)</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-stone-500 font-bold block mb-1">计划工时限制 (天数)</label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={t.durationDays}
                            onChange={(e) => handleUpdateTask(idx, "durationDays", Number(e.target.value))}
                            className="w-full p-2 bg-white border border-stone-300 rounded font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-stone-500 font-bold block mb-1">任务职责及交付规范描述</label>
                          <textarea
                            rows={3}
                            value={t.description}
                            onChange={(e) => handleUpdateTask(idx, "description", e.target.value)}
                            className="w-full p-2 bg-white border border-stone-300 rounded leading-relaxed text-stone-600"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {parseResult.taskSuggestions.length === 0 && (
                    <div className="col-span-2 p-8 text-center text-stone-400 italic">
                      没有生成协同建议。点右上角进行手动新建。
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="flex gap-4 p-4 border border-stone-200 bg-stone-50/50 rounded-lg justify-end">
            <button
              onClick={() => {
                if (confirm("确定要放弃当前的百炼解析成果，重新上传吗？")) {
                  setParseResult(null);
                  setFile(null);
                }
              }}
              className="px-5 py-3 border border-stone-300 hover:bg-stone-100 rounded-lg font-sans font-bold text-xs text-stone-600 transition-colors"
            >
              重新解析
            </button>
            <button
              onClick={handleConfirmAndSave}
              disabled={submitting}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-sans font-bold text-xs uppercase tracking-wide transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  <span>正在提交并同步至数据库...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4.5 h-4.5" />
                  <span>确认无误，写入数据库并激活协作</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
