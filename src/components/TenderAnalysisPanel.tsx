import React, { useState, useEffect, useRef } from "react";
import { 
  Upload, FileText, Check, AlertCircle, RefreshCw, ChevronRight, 
  HelpCircle, CheckCircle2, ShieldAlert, BookOpen, Edit2, CheckSquare, 
  ArrowRight, Sparkles, Filter, Trash2, Plus, Calendar, Clock, Building, MapPin, User, CheckCircle,
  AlertOctagon
} from "lucide-react";

interface DocumentItem {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  document_type: string;
  is_sensitive: number;
  allow_ai_read: number;
  current_version_id: string;
  uploaded_by: string;
  uploaded_at: string;
  parse_status: string;
  version_number?: number;
  file_size?: number;
}

interface ChunkItem {
  id: string;
  pageNumber: number;
  paragraphIndex: number;
  textContent: string;
}

interface ExtractionItem {
  id: string;
  projectId: string;
  documentId: string;
  fieldKey: string;
  fieldLabel: string;
  extractedValue: string;
  normalizedValue: string;
  sourcePage: number;
  sourceParagraph: number;
  sourceTextSnippet: string;
  confidence: number;
  status: string;
  requiresHumanConfirmation: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
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

interface TenderAnalysisPanelProps {
  projectId: string;
  currentUser: { username: string; role: string };
  onSyncComplete?: () => void;
}

export default function TenderAnalysisPanel({ projectId, currentUser, onSyncComplete }: TenderAnalysisPanelProps) {
  // Modes: 'instant' (new official Bailian full panel update) vs 'classic' (the split dual book screen)
  const [panelMode, setPanelMode] = useState<"instant" | "classic">("instant");

  // ==================== INSTANT TAB (BAILIAN OFFICIAL FULL OVERHAUL) STATES ====================
  const [instantFile, setInstantFile] = useState<File | null>(null);
  const [instantParsing, setInstantParsing] = useState(false);
  const [instantStep, setInstantStep] = useState("");
  const [instantResult, setInstantResult] = useState<AnalysisResult | null>(null);
  const [instantSubmitting, setInstantSubmitting] = useState(false);
  const [instantTab, setInstantTab] = useState<"info" | "reqs" | "tasks">("info");
  const [aiDiagnostics, setAiDiagnostics] = useState<any>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyMessage, setApiKeyMessage] = useState<string | null>(null);

  // ==================== CLASSIC DUAL-VIEW STATES ====================
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [extractions, setExtractions] = useState<ExtractionItem[]>([]);
  const [activePage, setActivePage] = useState<number | null>(null);
  const [activeParagraph, setActiveParagraph] = useState<number | null>(null);
  const chunkRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [parsingProgress, setParsingProgress] = useState(false);
  const [extractingProgress, setExtractingProgress] = useState(false);
  const [syncingFieldId, setSyncingFieldId] = useState<string | null>(null);
  const [ignoringFieldId, setIgnoringFieldId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isSensitiveUpload, setIsSensitiveUpload] = useState(false);
  const [allowAIReadUpload, setAllowAIReadUpload] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const headers = {
    "x-user-role": currentUser.role,
    "x-user-id": currentUser.username,
    "x-username": currentUser.username
  };

  useEffect(() => {
    loadDocuments();
    loadAiDiagnostics();
  }, [projectId]);

  const loadAiDiagnostics = async () => {
    try {
      const res = await fetch("/api/ai/config-diagnostics");
      if (res.ok) {
        const data = await res.json();
        setAiDiagnostics(data);
      }
    } catch {
      // Diagnostics are development-only; absence should not block the page.
    }
  };

  const handleSaveApiKey = async () => {
    const trimmedKey = apiKeyInput.trim();
    if (!trimmedKey) {
      setApiKeyMessage("Enter a DashScope / Qwen-Long API key.");
      return;
    }

    setApiKeySaving(true);
    setApiKeyMessage(null);
    try {
      const res = await fetch("/api/ai/config-api-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({ apiKey: trimmedKey })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "API key save failed");
      }
      setApiKeyInput("");
      setAiDiagnostics(data.diagnostics);
      setApiKeyMessage(`Saved to local .env: ${data.maskedKey}`);
    } catch (err: any) {
      setApiKeyMessage(err.message || "API key save failed");
    } finally {
      setApiKeySaving(false);
    }
  };

  const loadDocuments = async () => {
    setLoadingDocs(true);
    setUploadError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/documents`, { headers });
      if (!res.ok) throw new Error("获取招标文件列表失败");
      const data = await res.json();
      setDocuments(data);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setLoadingDocs(false);
    }
  };

  const loadDocDetails = async (doc: DocumentItem) => {
    setSelectedDoc(doc);
    setLoadingDetails(true);
    setChunks([]);
    setExtractions([]);
    setGeneralError(null);

    try {
      if (doc.parse_status === "parsed") {
        const resChunks = await fetch(`/api/projects/${projectId}/documents/${doc.id}/chunks`, { headers });
        if (resChunks.ok) {
          const chunkData = await resChunks.json();
          setChunks(chunkData);
        }
      }

      const resExtracts = await fetch(`/api/projects/${projectId}/documents/${doc.id}/extraction-results`, { headers });
      if (resExtracts.ok) {
        const extractData = await resExtracts.json();
        setExtractions(extractData);
      }
    } catch (err: any) {
      setGeneralError(err.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Convert uploaded files into raw simulated Base64 binary packets
  const processUploadFile = async (file: File) => {
    setLoadingDocs(true);
    setUploadError(null);
    setSuccessInfo(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64String = (reader.result as string).split(",")[1];
        try {
          const res = await fetch(`/api/projects/${projectId}/upload`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...headers
            },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.name.split(".").pop(),
              fileData: base64String,
              isSensitive: isSensitiveUpload ? 1 : 0,
              allowAIRead: allowAIReadUpload ? 1 : 0
            })
          });

          if (!res.ok) {
            const errJson = await res.json();
            throw new Error(errJson.error || "上传失败");
          }

          setSuccessInfo("文件上传成功！请在已上传列表中选择文件以进行解析和核对。");
          loadDocuments();
        } catch (uploadErr: any) {
          setUploadError(uploadErr.message);
        } finally {
          setLoadingDocs(false);
        }
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploadError(err.message);
      setLoadingDocs(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleManualInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processUploadFile(e.target.files[0]);
    }
  };

  const handleParseDocument = async (docId: string) => {
    setParsingProgress(true);
    setGeneralError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${docId}/parse`, {
        method: "POST",
        headers
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "解析招标文件失败");
      }

      setSuccessInfo("招标文件解析成功！");
      const reloadRes = await fetch(`/api/projects/${projectId}/documents/${docId}`, { headers });
      if (reloadRes.ok) {
        const docObj = await reloadRes.json();
        await loadDocDetails(docObj);
      }
      loadDocuments();
    } catch (err: any) {
      setGeneralError(err.message);
    } finally {
      setParsingProgress(false);
    }
  };

  const handleAIExtract = async (docId: string) => {
    setExtractingProgress(true);
    setGeneralError(null);
    setSuccessInfo(null);
    try {
      setExtractions([]);
      const res = await fetch(`/api/projects/${projectId}/documents/${docId}/ai-extract`, {
        method: "POST",
        headers
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "AI要素提取错误");
      }

      setSuccessInfo("AI提取工作已完成！关键指标已经提取，请在右侧进行比对及确认。");
      if (selectedDoc) {
        await loadDocDetails(selectedDoc);
      }
    } catch (err: any) {
      setExtractions([]);
      setGeneralError(err.message);
    } finally {
      setExtractingProgress(false);
    }
  };

  const handleCitationJump = (page: number, paragraph: number) => {
    setActivePage(page);
    setActiveParagraph(paragraph);
    const refKey = `${page}_${paragraph}`;
    const targetEl = chunkRefs.current[refKey];
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleSaveEdit = async (item: ExtractionItem) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/extraction-results/${item.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({ extractedValue: editingValue })
      });

      if (!res.ok) throw new Error("修正参数失败");

      setExtractions(prev => prev.map(ex => ex.id === item.id ? { ...ex, extractedValue: editingValue } : ex));
      setEditingFieldId(null);
    } catch (err: any) {
      setGeneralError(err.message);
    }
  };

  const handleConfirmField = async (item: ExtractionItem) => {
    setSyncingFieldId(item.id);
    setGeneralError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/extraction-results/${item.id}/confirm`, {
        method: "POST",
        headers
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "主数据同步失败");
      }

      setExtractions(prev => prev.map(ex => ex.id === item.id ? { ...ex, status: "confirmed" } : ex));
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (err: any) {
      setGeneralError(err.message);
    } finally {
      setSyncingFieldId(null);
    }
  };

  const handleIgnoreField = async (item: ExtractionItem) => {
    setIgnoringFieldId(item.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/extraction-results/${item.id}/ignore`, {
        method: "POST",
        headers
      });

      if (!res.ok) throw new Error("忽略动作执行失败");

      setExtractions(prev => prev.map(ex => ex.id === item.id ? { ...ex, status: "ignored" } : ex));
    } catch (err: any) {
      setGeneralError(err.message);
    } finally {
      setIgnoringFieldId(null);
    }
  };


  // ==================== INSTANT TAB LOGIC ====================
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

  const handleInstantAIParse = async () => {
    if (!instantFile) return alert("请先选择要上传的补充/修改招标文件！");

    if (aiDiagnostics && !aiDiagnostics.resolvedApiKeyConfigured) {
      setGeneralError("Save a DashScope / Qwen-Long API key before running Bailian document analysis.");
      return;
    }

    setInstantParsing(true);
    setGeneralError(null);
    setInstantStep("1/4: 正在读取本地并准备进行大容量编码...");

    try {
      const base64Content = await convertFileToBase64(instantFile);
      setInstantStep("2/4: 正在通过百炼 OpenAI 兼容接口将文件转往云端解析库...");
      
      await new Promise(r => setTimeout(r, 600));
      setInstantStep("3/4: 云端上传就绪，正在命令百炼深度解析分词建档并提供长上下文支持...");

      const res = await fetch("/api/ai/analyze-tender-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          fileName: instantFile.name,
          fileData: base64Content
        })
      });

      if (!res.ok) {
        const errReply = await res.json();
        throw new Error(errReply.error || "模型处理异常");
      }

      setInstantStep("4/4: 解析就绪！正在通过 qwen-long 建立投标主数据匹配与工期/文明定级等工作包排期...");
      const reply = await res.json();
      setInstantResult(reply);
      setInstantStep("");
    } catch (err: any) {
      console.error(err);
      setGeneralError(`❌ 百炼官方文件提取失败: ${err.message || "请求服务器未响应"}`);
    } finally {
      setInstantParsing(false);
    }
  };

  const handleInstantConfirmAndSave = async () => {
    if (!instantResult || !instantFile) return;
    setInstantSubmitting(true);
    setGeneralError(null);

    try {
      const base64Content = await convertFileToBase64(instantFile);

      // Post to confirmation endpoint with existing projectId to update it
      const res = await fetch("/api/ai/confirm-tender-document", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          projectId: projectId, // Tells the backend to UPDATE existing rather than creating new
          projectName: instantResult.projectInfo.projectName,
          projectInfo: instantResult.projectInfo,
          tenderRequirements: instantResult.tenderRequirements,
          taskSuggestions: instantResult.taskSuggestions,
          fileName: instantFile.name,
          fileData: base64Content
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "确认写入数据库出错");
      }

      setSuccessInfo(`🎉 百炼全案解析更新成功！主数据字段已订正，追加了 ${instantResult.tenderRequirements.length} 条表单，启动了 ${instantResult.taskSuggestions.length} 项分析任务包。`);
      setInstantResult(null);
      setInstantFile(null);
      
      if (onSyncComplete) {
        onSyncComplete();
      }
    } catch (err: any) {
      console.error(err);
      setGeneralError(`确认写入失败: ${err.message}`);
    } finally {
      setInstantSubmitting(false);
    }
  };

  // Instant edits helpers
  const handleUpdateInstantRequirement = (id: string, field: keyof ReqItem, val: string) => {
    if (!instantResult) return;
    setInstantResult({
      ...instantResult,
      tenderRequirements: instantResult.tenderRequirements.map(r => r.id === id ? { ...r, [field]: val } : r)
    });
  };

  const handleUpdateInstantTask = (idx: number, field: keyof TaskItem, val: any) => {
    if (!instantResult) return;
    setInstantResult({
      ...instantResult,
      taskSuggestions: instantResult.taskSuggestions.map((t, i) => i === idx ? { ...t, [field]: val } : t)
    });
  };


  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Upper Navigation Tabs */}
      <div className="flex border border-stone-200 bg-stone-50 rounded-lg p-1.5 justify-between items-center text-xs font-sans font-bold">
        <div className="flex gap-2">
          <button 
            type="button"
            onClick={() => setPanelMode("instant")}
            className={`px-4 py-2 flex items-center gap-1 rounded-md transition-all ${panelMode === "instant" ? 'bg-brand text-white' : 'text-stone-500 hover:text-stone-800'}`}
          >
            <Sparkles className="w-4 h-4" /> 
            <span>1. 百炼官方大文件解析 (全案核准更新)</span>
          </button>
          <button 
            type="button"
            onClick={() => setPanelMode("classic")}
            className={`px-4 py-2 flex items-center gap-1 rounded-md transition-all ${panelMode === "classic" ? 'bg-brand text-white' : 'text-stone-500 hover:text-stone-800'}`}
          >
            <BookOpen className="w-4 h-4" /> 
            <span>2. 局部对比核对 (双屏原文对照校验)</span>
          </button>
        </div>
        <div className="font-mono text-stone-400 font-medium px-3 text-[10px]">
          项目空间: <span className="font-bold text-stone-700">{projectId}</span>
        </div>
      </div>

      {generalError && (
        <div className="p-4 border border-rose-200 bg-rose-50 text-rose-950 font-sans text-xs flex items-start gap-3 rounded-lg shadow-sm">
          <AlertOctagon className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-bold mb-1">百炼链路推进受到了警告</h4>
            <p className="font-medium">{generalError}</p>
          </div>
        </div>
      )}

      {successInfo && (
        <div className="p-4 border border-emerald-200 bg-emerald-50 text-emerald-950 font-sans text-xs flex items-start gap-3 rounded-lg shadow-sm">
          <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-bold mb-1">操作执行成功</h4>
            <p className="font-medium">{successInfo}</p>
          </div>
        </div>
      )}

      {/* ===================== MODE A: INSTANT FULL OVERHAUL ===================== */}
      {panelMode === "instant" && (
        <div className="space-y-6">
          {!instantResult ? (
            <div className="pmd-card bg-white p-6 rounded-lg max-w-2xl mx-auto border border-stone-200 text-center space-y-5 animate-fadeIn">
              <div className="space-y-2">
                <Sparkles className="w-10 h-10 text-brand mx-auto animate-pulse" />
                <h3 className="text-base font-bold text-stone-900 font-sans">
                  百炼深度文档分析及项目数据更新
                </h3>
                <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
                  导入该项目的补充招标文件或更新版要求包，由阿里云百炼（qwen-long）深度对比提炼，一次性产出主数据指标、合规红线与追加协同任务，助你一键人工确认！
                </p>
              </div>

              <div className="border border-stone-200 rounded-lg p-4 bg-white text-left space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className={`w-4 h-4 ${aiDiagnostics?.resolvedApiKeyConfigured ? "text-emerald-600" : "text-amber-600"}`} />
                    <div>
                      <p className="text-xs font-bold text-stone-900">Qwen-Long API Key</p>
                      <p className="text-[10px] text-stone-500">
                        {aiDiagnostics?.resolvedApiKeyConfigured
                          ? `Configured for ${aiDiagnostics.model || "qwen-long"}`
                          : "Not configured. Save a local development key first."}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={loadAiDiagnostics}
                    className="p-2 border border-stone-200 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-50"
                    title="Refresh config status"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Paste DashScope / Qwen-Long API key"
                    className="flex-1 px-3 py-2 border border-stone-200 rounded-md text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={handleSaveApiKey}
                    disabled={apiKeySaving}
                    className="px-4 py-2 bg-stone-900 text-white text-xs font-bold rounded-md hover:bg-stone-800 disabled:opacity-50"
                  >
                    {apiKeySaving ? "Saving" : "Save"}
                  </button>
                </div>

                {apiKeyMessage && (
                  <p className={`text-[10px] font-medium ${apiKeyMessage.includes("Saved") ? "text-emerald-700" : "text-rose-700"}`}>
                    {apiKeyMessage}
                  </p>
                )}
              </div>

              {/* Upload Entrance */}
              <div className="border border-dashed border-stone-300 rounded-lg p-8 bg-stone-50 hover:bg-stone-100/30 transition-all text-center relative pointer-events-auto">
                <input 
                  type="file" 
                  accept=".pdf,.docx,.doc"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setInstantFile(e.target.files[0]);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="space-y-2">
                  <Upload className="w-8 h-8 text-stone-400 mx-auto" strokeWidth={1.5} />
                  <p className="font-sans font-bold text-xs text-stone-700">
                    {instantFile ? `已选定文件: ${instantFile.name}` : "选择新的补充/招标文件以更新此项目"}
                  </p>
                  <p className="text-[10px] text-stone-400">
                    支持 .docx, .pdf。上传后将启动大模型全量提炼。
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleInstantAIParse}
                disabled={instantParsing || !instantFile || Boolean(aiDiagnostics && !aiDiagnostics.resolvedApiKeyConfigured)}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-sans font-bold text-xs rounded-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:bg-stone-300"
              >
                {instantParsing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>大模型长文本处理中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>执行百炼大模型辅助提取</span>
                  </>
                )}
              </button>

              {instantParsing && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-md text-[11px] text-emerald-950 font-sans text-left">
                  <span className="font-bold flex items-center gap-1.5 mb-1 text-emerald-900">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                    百炼官方运行链路状态：
                  </span>
                  <p className="font-mono text-stone-600">{instantStep}</p>
                </div>
              )}
            </div>
          ) : (
            /* ================= INTERACTIVE HUMAN CONFIRMATION PANELS ================= */
            <div className="bg-white rounded-lg border border-stone-200 animate-fadeIn space-y-6 p-6">
              <div className="flex border-b border-stone-200 pb-2 justify-between items-center text-xs font-sans font-bold">
                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setInstantTab("info")}
                    className={`pb-2 border-b-2 transition-all ${instantTab === "info" ? 'border-brand text-brand' : 'border-transparent text-stone-500 hover:text-stone-850'}`}
                  >
                    1. 拟更新项目基本信息
                  </button>
                  <button 
                    type="button"
                    onClick={() => setInstantTab("reqs")}
                    className={`pb-2 border-b-2 transition-all ${instantTab === "reqs" ? 'border-brand text-brand' : 'border-transparent text-stone-500 hover:text-stone-850'}`}
                  >
                    2. 提炼制式硬性要求表单 ({instantResult.tenderRequirements.length} 条)
                  </button>
                  <button 
                    type="button"
                    onClick={() => setInstantTab("tasks")}
                    className={`pb-2 border-b-2 transition-all ${instantTab === "tasks" ? 'border-brand text-brand' : 'border-transparent text-stone-500 hover:text-stone-850'}`}
                  >
                    3. 拟启动协同任务包建议 ({instantResult.taskSuggestions.length} 项)
                  </button>
                </div>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  补充文档: {instantFile?.name}
                </span>
              </div>

              {/* Tab 1: Project Info updates */}
              {instantTab === "info" && (
                <div className="space-y-4 text-xs font-sans">
                  <div className="p-4 bg-amber-50 border border-amber-200 text-amber-950 rounded-lg mb-2">
                    <span className="font-bold">🚨 温馨提醒：</span>确认全案更新后，项目原来的主数据及工期值将被以下经分析订正过的新主数据直接覆盖。
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-stone-500 font-bold block mb-1">项目正式名称</span>
                      <input 
                        type="text" 
                        value={instantResult.projectInfo.projectName}
                        onChange={(e) => setInstantResult({
                          ...instantResult,
                          projectInfo: { ...instantResult.projectInfo, projectName: e.target.value }
                        })}
                        className="w-full p-2 bg-white border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-brand font-bold"
                      />
                    </div>
                    <div>
                      <span className="text-stone-500 font-bold block mb-1">发包业主名称</span>
                      <input 
                        type="text" 
                        value={instantResult.projectInfo.ownerName}
                        onChange={(e) => setInstantResult({
                          ...instantResult,
                          projectInfo: { ...instantResult.projectInfo, ownerName: e.target.value }
                        })}
                        className="w-full p-2 bg-white border border-stone-300 rounded focus:outline-none font-semibold"
                      />
                    </div>
                    <div>
                      <span className="text-stone-500 font-bold block mb-1">建设地点</span>
                      <input 
                        type="text" 
                        value={instantResult.projectInfo.projectLocation}
                        onChange={(e) => setInstantResult({
                          ...instantResult,
                          projectInfo: { ...instantResult.projectInfo, projectLocation: e.target.value }
                        })}
                        className="w-full p-2 bg-white border border-stone-300 rounded focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-stone-500 font-bold block mb-1">建筑大类</span>
                      <input 
                        type="text" 
                        value={instantResult.projectInfo.buildingType}
                        onChange={(e) => setInstantResult({
                          ...instantResult,
                          projectInfo: { ...instantResult.projectInfo, buildingType: e.target.value }
                        })}
                        className="w-full p-2 bg-white border border-stone-300 rounded focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-stone-500 font-bold block mb-1">总面积指标</span>
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          value={instantResult.projectInfo.grossFloorAreaValue}
                          onChange={(e) => setInstantResult({
                            ...instantResult,
                            projectInfo: { ...instantResult.projectInfo, grossFloorAreaValue: Number(e.target.value) }
                          })}
                          className="w-2/3 p-2 bg-white border border-stone-300 rounded font-mono font-bold"
                        />
                        <input 
                          type="text" 
                          value={instantResult.projectInfo.grossFloorAreaUnit}
                          onChange={(e) => setInstantResult({
                            ...instantResult,
                            projectInfo: { ...instantResult.projectInfo, grossFloorAreaUnit: e.target.value }
                          })}
                          className="w-1/3 p-2 bg-white border border-stone-300 rounded text-center"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-stone-500 font-bold block mb-1">总工期/历时包</span>
                      <div className="flex gap-2">
                        <input 
                          type="number" 
                          value={instantResult.projectInfo.totalDurationValue}
                          onChange={(e) => setInstantResult({
                            ...instantResult,
                            projectInfo: { ...instantResult.projectInfo, totalDurationValue: Number(e.target.value) }
                          })}
                          className="w-2/3 p-2 bg-white border border-stone-300 rounded font-mono font-bold"
                        />
                        <input 
                          type="text" 
                          value={instantResult.projectInfo.totalDurationUnit}
                          onChange={(e) => setInstantResult({
                            ...instantResult,
                            projectInfo: { ...instantResult.projectInfo, totalDurationUnit: e.target.value }
                          })}
                          className="w-1/3 p-2 bg-white border border-stone-300 rounded text-center"
                        />
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-stone-500 font-bold block mb-1">投标截止日期</span>
                      <input 
                        type="text" 
                        value={instantResult.projectInfo.bidDeadline}
                        onChange={(e) => setInstantResult({
                          ...instantResult,
                          projectInfo: { ...instantResult.projectInfo, bidDeadline: e.target.value }
                        })}
                        className="w-full p-2 bg-white border border-stone-300 rounded font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-stone-50 border-l-4 border-emerald-500 mt-4 leading-relaxed font-sans text-[11px] text-stone-600">
                    <div><b>📄 百炼官方文档定位来源引用:</b></div>
                    <p className="mt-1 italic">&ldquo;{instantResult.projectInfo.sourceText}&rdquo;</p>
                  </div>
                </div>
              )}

              {/* Tab 2: Requirements */}
              {instantTab === "reqs" && (
                <div className="space-y-3 font-sans text-xs">
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-950 rounded-lg">
                    确认更新后，以下提炼出的合规表单红线要求将会作为最新指标追加入到该项目的制式要求清单中（不会删除旧指标）。
                  </div>

                  <div className="overflow-x-auto pr-1">
                    <table className="w-full border border-stone-200 text-left">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200 font-bold text-stone-600">
                          <th className="p-2.5 w-1/4">红线大类</th>
                          <th className="p-2.5 w-1/4">关键要求名称</th>
                          <th className="p-2.5 w-2/5">具体指标规范值</th>
                          <th className="p-2.5 w-1/6">合规状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-150">
                        {instantResult.tenderRequirements.map((r) => (
                          <tr key={r.id} className="hover:bg-stone-50/55">
                            <td className="p-2">
                              <select 
                                value={r.category}
                                onChange={(e) => handleUpdateInstantRequirement(r.id, "category", e.target.value)}
                                className="w-full p-1.5 bg-white border border-stone-300 rounded"
                              >
                                <option value="资质业绩要求">资质业绩要求</option>
                                <option value="人员资格要求">人员资格要求</option>
                                <option value="工期与质量">工期与质量</option>
                                <option value="技术规范">技术规范</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <input 
                                type="text"
                                value={r.requirementName}
                                onChange={(e) => handleUpdateInstantRequirement(r.id, "requirementName", e.target.value)}
                                className="w-full p-1.5 bg-white border border-stone-300 rounded font-semibold text-stone-900"
                              />
                            </td>
                            <td className="p-2">
                              <textarea 
                                rows={2}
                                value={r.requiredValue}
                                onChange={(e) => handleUpdateInstantRequirement(r.id, "requiredValue", e.target.value)}
                                className="w-full p-1.5 bg-white border border-stone-300 rounded leading-normal"
                              />
                            </td>
                            <td className="p-2">
                              <select 
                                value={r.complianceStatus}
                                onChange={(e) => handleUpdateInstantRequirement(r.id, "complianceStatus", e.target.value)}
                                className="w-full p-1.5 bg-white border border-stone-300 rounded font-bold text-stone-850"
                              >
                                <option value="满足">满足</option>
                                <option value="待确认">待确认</option>
                                <option value="不满足">不满足</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 3: Tasks suggestions */}
              {instantTab === "tasks" && (
                <div className="space-y-4 font-sans text-xs">
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-950 rounded-lg">
                    确认更新后，以下建议工作包任务将自动分解派生并调度入盘，同步委任给相应真实负责人（按截标日期倒排启动与截止）。
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {instantResult.taskSuggestions.map((t, idx) => (
                      <div key={idx} className="p-4 border border-stone-200 rounded-lg bg-stone-50 hover:border-stone-400 space-y-3">
                        <div>
                          <label className="text-[10px] text-stone-500 font-bold block mb-1">编制技术方案名称</label>
                          <input 
                            type="text" 
                            value={t.taskName} 
                            onChange={(e) => handleUpdateInstantTask(idx, "taskName", e.target.value)}
                            className="w-full p-2 bg-white border border-stone-300 rounded font-bold text-stone-900"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="text-[10px] text-stone-500 font-bold block mb-1">对应投标领域</label>
                            <select 
                              value={t.bidPhase} 
                              onChange={(e) => handleUpdateInstantTask(idx, "bidPhase", e.target.value)}
                              className="w-full p-2 bg-white border border-stone-300 rounded font-medium"
                            >
                              <option value="TenderParse">TenderParse (招标解析)</option>
                              <option value="Design">Design (设计编制)</option>
                              <option value="Estimation">Estimation (造价估算)</option>
                              <option value="Construction">Construction (施工方案)</option>
                              <option value="Review">Review (总监审核)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-stone-500 font-bold block mb-1">分配真实担当</label>
                            <select 
                              value={t.suggestedAssignee} 
                              onChange={(e) => handleUpdateInstantTask(idx, "suggestedAssignee", e.target.value)}
                              className="w-full p-2 bg-white border border-stone-300 rounded text-stone-850 font-bold"
                            >
                              <option value="张三 (营业官)">张三 (营业官)</option>
                              <option value="李四 (项目负责人)">李四 (项目负责人)</option>
                              <option value="陈七 (施工总工)">陈七 (施工总工)</option>
                              <option value="赵六 (概算负责人)">赵六 (概算负责人)</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="text-[10px] text-stone-500 font-bold block mb-1">建议工时天数</label>
                            <input 
                              type="number" 
                              value={t.durationDays} 
                              onChange={(e) => handleUpdateInstantTask(idx, "durationDays", Number(e.target.value))}
                              className="w-full p-2 bg-white border border-stone-300 rounded font-mono font-bold"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-stone-500 font-bold block mb-1">工作交付指引及编制标准</label>
                          <textarea 
                            rows={3}
                            value={t.description} 
                            onChange={(e) => handleUpdateInstantTask(idx, "description", e.target.value)}
                            className="w-full p-2 bg-white border border-stone-300 rounded leading-normal text-stone-600"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons footer */}
              <div className="flex justify-end gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setInstantResult(null);
                    setInstantFile(null);
                  }}
                  className="px-4 py-2 border border-stone-300 hover:bg-stone-50 rounded-lg text-stone-600 text-xs font-bold"
                >
                  放弃补充
                </button>
                <button
                  type="button"
                  onClick={handleInstantConfirmAndSave}
                  disabled={instantSubmitting}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-sans font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {instantSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>更新入盘中...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>整合无误，一键核准更新项目数据</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== MODE B: CLASSIC MANUAL DUAL VIEW COMPARATOR ===================== */}
      {panelMode === "classic" && (
        <div className="space-y-6 animate-fadeIn">
          {/* 1. Upload box and file manager panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Upload controller card */}
            <div className="pmd-card bg-white p-5 lg:col-span-1 flex flex-col justify-between border border-stone-250 rounded-lg">
              <div>
                <h3 className="font-sans text-xs font-bold text-stone-800 uppercase tracking-wide mb-3 flex items-center gap-1.5 border-b pb-2">
                  <Upload className="w-4 h-4 text-[#EA580C]" /> 
                  项目补充资料上传
                </h3>
                <p className="font-sans text-xs text-stone-500 mb-4 leading-normal">
                  支持上传 PDF、DOCX 格式文件。上传入库后，点按“确认解析”来拆分子段并在下方进行对照查看。
                </p>

                {/* Config parameters */}
                <div className="space-y-3 p-3.5 bg-stone-50 border border-stone-200 rounded-sm mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isSensitiveUpload}
                      onChange={(e) => {
                        setIsSensitiveUpload(e.target.checked);
                        if (e.target.checked) setAllowAIReadUpload(false);
                      }}
                      className="rounded border-stone-200 text-[#EA580C] focus:ring-[#EA580C] w-4 h-4" 
                    />
                    <span className="text-xs font-sans font-bold text-gray-700">
                      标记为敏感高密文件
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={allowAIReadUpload}
                      disabled={isSensitiveUpload}
                      onChange={(e) => setAllowAIReadUpload(e.target.checked)}
                      className="rounded border-stone-200 text-[#EA580C] focus:ring-[#EA580C] w-4 h-4" 
                    />
                    <span className="text-xs font-sans font-bold text-gray-700">
                      允许大模型辅助分析
                    </span>
                  </label>
                </div>

                {/* Standard Dropzone */}
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg py-8 px-4 text-center cursor-pointer transition-colors ${
                    dragActive ? "border-[#EA580C] bg-orange-50" : "border-stone-200 hover:border-[#EA580C] bg-stone-50"
                  }`}
                >
                  <Upload className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="font-sans font-bold text-xs text-stone-700">
                    拖拽文件到此处
                  </p>
                  <p className="text-[10px] text-stone-400 mt-1">
                    支持 PDF、DOCX 格式
                  </p>
                  
                  <div className="relative mt-3">
                    <input 
                      type="file" 
                      onChange={handleManualInput} 
                      accept=".pdf,.docx,.doc" 
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <button type="button" className="pmd-btn px-4 py-1.5 bg-white border border-stone-300 hover:bg-stone-50 text-stone-900 text-[10px] font-bold rounded-md uppercase mx-auto">
                      选择文件
                    </button>
                  </div>
                </div>
              </div>

              {/* Error & Info prompts */}
              <div className="mt-4">
                {uploadError && (
                  <div className="p-3 border border-rose-200 bg-rose-50 text-rose-900 font-sans text-xs rounded-lg">
                    <b>上传失败:</b> {uploadError}
                  </div>
                )}
              </div>
            </div>

            {/* Existing Documents listing */}
            <div className="pmd-card bg-white p-5 lg:col-span-2 border border-stone-250 rounded-lg">
              <h3 className="font-sans text-xs font-bold text-stone-850 uppercase tracking-wide mb-4 flex items-center gap-1.5 border-b pb-2.5">
                <FileText className="w-4 h-4 text-[#EA580C]" />
                该项目已归档资料库
              </h3>

              {loadingDocs ? (
                <div className="py-12 flex justify-center items-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-brand" />
                </div>
              ) : documents.length === 0 ? (
                <div className="py-12 text-center text-stone-400 font-sans text-xs">
                  当前项目尚未上传招标文件
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {documents.map((doc) => (
                    <div 
                      key={doc.id}
                      onClick={() => loadDocDetails(doc)}
                      className={`p-3 border cursor-pointer transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-3 rounded-lg ${
                        selectedDoc?.id === doc.id 
                        ? "border-brand bg-brand/5 shadow-2xs" 
                        : "border-border bg-white hover:border-brand/40"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={`px-2 py-1 text-white text-[9px] font-bold leading-none rounded-md ${doc.file_type === 'pdf' ? 'bg-rose-500' : 'bg-blue-500'}`}>
                          {doc.file_type.toUpperCase()}
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-stone-850 truncate max-w-xs">{doc.file_name}</h4>
                          <span className="text-[10px] text-stone-400 font-mono block mt-1">
                            归档人：{doc.uploaded_by} • 编号：{doc.current_version_id.slice(-8)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 text-[9.5px] font-bold rounded-full ${
                          doc.parse_status === "parsed" 
                          ? "bg-emerald-100 text-emerald-800" 
                          : "bg-amber-100 text-amber-800"
                        }`}>
                          {doc.parse_status === "parsed" ? "已句读分类" : "待解析"}
                        </span>
                        <ChevronRight className="w-4 h-4 text-stone-300" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* DUAL COMPARATOR CONTAINER */}
          {selectedDoc && (
            <div className="pmd-card bg-white p-5 border border-stone-250 rounded-lg space-y-4 animate-fadeIn">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="font-sans text-xs text-stone-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand" />
                  <span>当前局部选定：<b>{selectedDoc.file_name}</b></span>
                </div>
                
                <div className="flex gap-2.5">
                  {selectedDoc.parse_status !== "parsed" && (
                    <button
                      onClick={() => handleParseDocument(selectedDoc.id)}
                      disabled={parsingProgress}
                      className="px-4 py-1.5 text-xs font-bold border border-stone-300 bg-white hover:bg-stone-50 rounded text-stone-800 flex items-center gap-1.5"
                    >
                      {parsingProgress ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 执行句读拆分中...
                        </>
                      ) : (
                        <>
                          <BookOpen className="w-3.5 h-3.5" /> 1. 开始段落切片
                        </>
                      )}
                    </button>
                  )}

                  {selectedDoc.parse_status === "parsed" && (
                    <button
                      onClick={() => handleAIExtract(selectedDoc.id)}
                      disabled={extractingProgress}
                      className="px-4 py-1.5 text-xs font-bold bg-amber-550 hover:bg-amber-600 text-stone-900 rounded flex items-center gap-1.5 shadow-2xs"
                    >
                      {extractingProgress ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 模型抽取中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" /> 2. 局部要素对比
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[400px]">
                {/* L-Col: BOOK CHUNK LIST */}
                <div className="border border-stone-200 bg-stone-50 p-4 rounded-lg max-h-[500px] overflow-y-auto space-y-3.5">
                  <span className="text-[10px] text-stone-550 block font-bold uppercase tracking-wider">
                    拆分切片段落 (共 {chunks.length} 段)
                  </span>

                  {selectedDoc.parse_status !== "parsed" ? (
                    <div className="py-20 text-center text-stone-400 italic font-sans text-xs">
                      请先点按右上角【1. 开始段落切片】。
                    </div>
                  ) : chunks.length === 0 ? (
                    <div className="py-20 text-center">
                      <RefreshCw className="w-6 h-6 animate-spin text-stone-400 mx-auto" />
                    </div>
                  ) : (
                    chunks.map(ch => {
                      const isActive = activePage === ch.pageNumber && activeParagraph === ch.paragraphIndex;
                      return (
                        <div 
                          key={ch.id}
                          ref={(el) => {
                            chunkRefs.current[`${ch.pageNumber}_${ch.paragraphIndex}`] = el;
                          }}
                          className={`p-3 border-l-4 transition-all rounded bg-white shadow-2xs ${isActive ? 'border-brand bg-amber-50/50' : 'border-stone-300 hover:border-brand/40'}`}
                        >
                          <div className="flex justify-between items-center text-[9px] text-stone-400 mb-1">
                            <span>第 {ch.pageNumber} 页 • 第 {ch.paragraphIndex} 段</span>
                            {isActive && <span className="text-brand font-bold">定位引用中</span>}
                          </div>
                          <p className="text-xs leading-relaxed text-stone-700 font-sans">{ch.textContent}</p>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* R-Col: CITATED DETAILS COMPARATOR */}
                <div className="border border-stone-200 bg-stone-50 p-4 rounded-lg max-h-[500px] overflow-y-auto space-y-3.5">
                  <span className="text-[10px] text-stone-550 block font-bold uppercase tracking-wider">
                    AI 因子详情与定位对照
                  </span>

                  {extractions.length === 0 ? (
                    <div className="py-20 text-center text-stone-400 italic font-sans text-xs">
                      无局部提取项，请先点按右上角【2. 局部要素对比】。
                    </div>
                  ) : (
                    extractions.map(item => (
                      <div 
                        key={item.id}
                        className={`p-3.5 bg-white border border-stone-200 rounded-lg space-y-2.5 shadow-2xs relative ${item.status === 'confirmed' ? 'border-emerald-300 bg-emerald-50/10' : ''}`}
                      >
                        <div className="flex justify-between items-start text-xs border-b pb-2">
                          <div>
                            <span className="font-bold text-stone-900 block">{item.fieldLabel}</span>
                            <span className="text-[10px] text-stone-400 font-mono">字段: {item.fieldKey}</span>
                          </div>
                          
                          <div className="flex flex-col items-end">
                            <span className="text-[9px] text-[#EA580C] bg-[#EA580C]/5 px-2 py-0.5 rounded font-bold font-mono">
                              置信度: {(item.confidence * 100).toFixed(0)}%
                            </span>
                            <span className={`text-[9px] mt-1 px-1.5 rounded uppercase font-bold ${
                              item.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {item.status === 'confirmed' ? '已核准' : '待确认'}
                            </span>
                          </div>
                        </div>

                        {/* Extracted value text area or view */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] text-stone-500 font-bold block mb-1">提取信息：</span>
                          
                          {editingFieldId === item.id ? (
                            <div className="flex gap-2">
                              <input 
                                type="text" 
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                className="flex-1 p-2 border border-stone-300 rounded text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-brand font-medium"
                              />
                              <button 
                                onClick={() => handleSaveEdit(item)}
                                className="px-3 bg-brand text-white text-[10px] font-bold rounded"
                              >
                                存
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-between items-start gap-4">
                              <p className="text-xs font-semibold text-stone-800 font-sans leading-relaxed">
                                {item.extractedValue || <span className="text-stone-350 italic">（空值）</span>}
                              </p>
                              {item.status !== 'confirmed' && (
                                <button 
                                  onClick={() => {
                                    setEditingFieldId(item.id);
                                    setEditingValue(item.extractedValue);
                                  }}
                                  className="text-[10px] text-brand font-bold underline cursor-pointer hover:text-brand-hover"
                                >
                                  修改
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Citation jumping controller */}
                        {item.sourcePage > 0 && (
                          <div className="text-[10.5px] border border-dashed border-stone-150 p-2 bg-stone-50 rounded text-stone-500 font-sans flex items-center justify-between">
                            <div className="truncate max-w-[200px]">
                              参考第 <b>{item.sourcePage}</b> 页 • 第 <b>{item.sourceParagraph}</b> 段
                            </div>
                            <button 
                              onClick={() => handleCitationJump(item.sourcePage, Number(item.sourceParagraph || 1))}
                              className="text-[10.5px] text-indigo-600 font-bold flex items-center gap-0.5"
                            >
                              <span>跳转定位</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {/* Singular Confirm and write controls */}
                        {item.status !== 'confirmed' && (
                          <div className="flex gap-2 justify-end border-t border-dashed pt-2 text-[10px]">
                            <button 
                              onClick={() => handleIgnoreField(item)}
                              disabled={ignoringFieldId === item.id}
                              className="px-2.5 py-1 text-stone-500 hover:bg-stone-100 rounded border border-stone-200 transition-colors"
                            >
                              忽略此项
                            </button>
                            <button 
                              onClick={() => handleConfirmField(item)}
                              disabled={syncingFieldId === item.id}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded flex items-center gap-1 shadow-2xs transition-colors"
                            >
                              {syncingFieldId === item.id ? "写入..." : "人工核准并覆盖项目主数据"}
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
