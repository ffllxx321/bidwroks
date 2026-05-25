import React, { useState, useEffect } from "react";
import { 
  FileText, Plus, Check, AlertTriangle, AlertCircle, Clock, 
  ArrowRight, Download, History, ShieldAlert, Lock, Trash2, 
  RefreshCw, CheckCircle, FileUp, Filter, Eye, ChevronRight, MessageSquare 
} from "lucide-react";

interface FileWorkflowPanelProps {
  projectId: string;
  currentUser: { username: string; role: string };
  taskId?: string; // Optional: if passed, scope to task-level file workflow
}

export default function FileWorkflowPanel({ projectId, currentUser, taskId }: FileWorkflowPanelProps) {
  const [documents, setDocuments] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<any | null>(null);
  const [versionsList, setVersionsList] = useState<any[]>([]);
  const [checkRunsList, setCheckRunsList] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  const [runIssues, setRunIssues] = useState<any[]>([]);
  
  // Filtering & Query States (for project scope)
  const [filterTaskId, setFilterTaskId] = useState<string>(taskId || "");
  const [filterFileType, setFilterFileType] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  // Upload States
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isSensitive, setIsSensitive] = useState<boolean>(false);
  const [allowAIRead, setAllowAIRead] = useState<boolean>(true);
  const [documentType, setDocumentType] = useState<string>("technical_scheme");
  const [uploadLoading, setUploadLoading] = useState<boolean>(false);

  // Selfchecking Settings
  const [tolerance, setTolerance] = useState<number>(0);
  const [checkLoading, setCheckLoading] = useState<boolean>(false);

  // Ignore Issue dialog state
  const [ignoringIssueId, setIgnoringIssueId] = useState<string | null>(null);
  const [ignoreReason, setIgnoreReason] = useState<string>("");
  const [ignoreError, setIgnoreError] = useState<string | null>(null);

  // Finalizing State
  const [finalizingVerId, setFinalizingVerId] = useState<string | null>(null);
  const [forceReason, setForceReason] = useState<string>("");
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  // General Status Flags
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Iteration 5 Review Workflow & Structured Comments States
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState<boolean>(false);
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<any | null>(null);
  const [expandedDetailsLoading, setExpandedDetailsLoading] = useState<boolean>(false);
  
  // Create comment form state
  const [isCreatingComment, setIsCreatingComment] = useState<boolean>(false);
  const [newCommentType, setNewCommentType] = useState<string>("content_issue");
  const [newSeverity, setNewSeverity] = useState<string>("medium");
  const [newCommentContent, setNewCommentContent] = useState<string>("");
  const [newPageNum, setNewPageNum] = useState<number>(1);
  const [newParagraphNum, setNewParagraphNum] = useState<number>(1);
  const [newTextSnippet, setNewTextSnippet] = useState<string>("");
  const [newAssignedTo, setNewAssignedTo] = useState<string>("user-const");

  // Reply form state
  const [replyText, setReplyText] = useState<string>("");
  const [replyLinkNewVersionId, setReplyLinkNewVersionId] = useState<string>("");

  const headers = {
    "x-user-role": currentUser.role,
    "x-user-id": currentUser.username,
    "x-username": currentUser.username
  };

  const showTempSuccess = (text: string) => {
    setSuccessMsg(text);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  // 1. Fetch data from backend
  const loadWorkspaceData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Load tasks list first for the scope selector
      const tasksRes = await fetch(`/api/projects/${projectId}/tasks`, { headers });
      if (tasksRes.ok) {
        setTasks(await tasksRes.json());
      }

      // Load files
      let docsUrl = `/api/projects/${projectId}/documents`;
      // Append matching search filters
      const qParams: string[] = [];
      if (filterTaskId) qParams.push(`taskId=${filterTaskId}`);
      if (filterFileType) qParams.push(`fileType=${filterFileType}`);
      if (filterStatus) qParams.push(`status=${filterStatus}`);
      if (qParams.length > 0) docsUrl += "?" + qParams.join("&");

      const docRes = await fetch(docsUrl, { headers });
      if (!docRes.ok) throw new Error("加载项目底图文件失败");
      const docsData = await docRes.json();
      setDocuments(docsData);

      // If we had a document selected previously, refresh its context
      if (selectedDoc) {
        const refreshedDoc = docsData.find((d: any) => d.id === selectedDoc.id);
        if (refreshedDoc) {
          setSelectedDoc(refreshedDoc);
          await loadDocumentVersions(refreshedDoc.id);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "请求服务器档案数据错误");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaceData();
  }, [projectId, filterTaskId, filterFileType, filterStatus]);

  // Handle specific document selected
  const handleSelectDoc = async (doc: any) => {
    setSelectedDoc(doc);
    setSelectedVersion(null);
    setSelectedRun(null);
    setRunIssues([]);
    setCheckRunsList([]);
    await loadDocumentVersions(doc.id);
  };

  // 2. Fetch versions under document ID
  const loadDocumentVersions = async (docId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${docId}/versions`, { headers });
      if (res.ok) {
        const vers = await res.json();
        setVersionsList(vers);
        
        // Auto select latest version for ease of operations
        const latest = vers.find((v: any) => v.is_latest === 1 || v.is_latest === true) || vers[0];
        if (latest) {
          handleSelectVersion(latest);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle selected version
  const handleSelectVersion = async (ver: any) => {
    setSelectedVersion(ver);
    setSelectedRun(null);
    setRunIssues([]);
    setExpandedCommentId(null);
    setExpandedDetails(null);
    await loadSelfCheckRuns(ver.id);
    await loadComments(ver.id);
  };

  // --- REVIEW COMMENTS API CLIENT INTEGRATIONS (Iteration 5) ---
  
  // 3a. Fetch review comments for current version
  const loadComments = async (verId: string) => {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/review-comments`, { headers });
      if (res.ok) {
        const list = await res.json();
        const verComments = list.filter((rc: any) => rc.documentVersionId === verId);
        setComments(verComments);
      }
    } catch (err) {
      console.error("Failed to load review comments", err);
    } finally {
      setCommentsLoading(false);
    }
  };

  // 3b. Fetch single comment thread with nested replies and log tracking
  const loadCommentThread = async (commentId: string) => {
    setExpandedDetailsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/review-comments/${commentId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setExpandedDetails(data);
      }
    } catch (err) {
      console.error("Failed to load comment details", err);
    } finally {
      setExpandedDetailsLoading(false);
    }
  };

  // 3c. Submit version into pending_review (review workflow)
  const handleSubmitToReview = async () => {
    if (!selectedDoc || !selectedVersion) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${selectedDoc.id}/versions/${selectedVersion.id}/submit-review`, {
        method: "POST",
        headers
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "提交质量把关失败");
      }
      showTempSuccess("✓ 设计图纸草稿已提报质量把关审核！流转状态：[待审核]。");
      await loadWorkspaceData();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3d. Create a new structured comment thread
  const handleCreateComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoc || !selectedVersion) return;
    if (!newCommentContent.trim()) {
      alert("请录入审查意见具体内容！");
      return;
    }

    try {
      const payload = {
        taskId: selectedDoc.task_id || filterTaskId || "",
        documentId: selectedDoc.id,
        documentVersionId: selectedVersion.id,
        commentType: newCommentType,
        severity: newSeverity,
        content: newCommentContent,
        sourcePage: newPageNum || 1,
        sourceParagraph: newParagraphNum || 1,
        sourceTextSnippet: newTextSnippet || "",
        assignedTo: newAssignedTo,
        status: "open"
      };

      const res = await fetch(`/api/projects/${projectId}/review-comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify(payload)
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "创建审核意见失败");
      }

      showTempSuccess("✓ 已登记并分派结构化质量整改意见，自动发送待办通知。");
      setIsCreatingComment(false);
      setNewCommentContent("");
      setNewTextSnippet("");
      await loadComments(selectedVersion.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // 3e. Reply to a comment thread
  const handleReplyComment = async (commentId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) {
      alert("请输入回复修正在案文本！");
      return;
    }

    try {
      const payload = {
        replyContent: replyText,
        newDocumentVersionId: replyLinkNewVersionId || null
      };

      const res = await fetch(`/api/projects/${projectId}/review-comments/${commentId}/replies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify(payload)
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "添加回复失败");
      }

      showTempSuccess("✓ 回复登记成功！");
      setReplyText("");
      setReplyLinkNewVersionId("");
      await loadCommentThread(commentId);
      await loadComments(selectedVersion.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // 3f. Close a comment thread (reviewer or admin action)
  const handleCloseComment = async (commentId: string) => {
    if (!window.confirm("确认要关闭此项整改意见吗？")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/review-comments/${commentId}/close`, {
        method: "POST",
        headers
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "关闭意见失败");
      }

      showTempSuccess("✓ 整改意见已合规关闭 (Closed)。");
      if (expandedCommentId === commentId) {
        await loadCommentThread(commentId);
      }
      await loadComments(selectedVersion.id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // 3. Fetch runs for version
  const loadSelfCheckRuns = async (verId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${selectedDoc ? selectedDoc.id : ""}/versions/${verId}/self-check-runs`, { headers });
      if (res.ok) {
        const runs = await res.json();
        setCheckRunsList(runs);
        
        // Auto-load issues for latest check run
        if (runs.length > 0) {
          handleSelectRun(runs[0]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle selected run
  const handleSelectRun = async (run: any) => {
    setSelectedRun(run);
    try {
      const res = await fetch(`/api/projects/${projectId}/self-check-runs/${run.id}/issues`, { headers });
      if (res.ok) {
        setRunIssues(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 4. File selection and upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadFile(e.target.files[0]);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setErrorMsg("请首先选中本地需要提报的文件草稿！");
      return;
    }

    const tId = filterTaskId || taskId;
    if (!tId) {
      setErrorMsg("上传文件必须选择归属的具体业务模块任务！");
      return;
    }

    setUploadLoading(true);
    setErrorMsg(null);

    // Read local file as Base64 payload
    const reader = new FileReader();
    reader.readAsDataURL(uploadFile);
    reader.onload = async () => {
      try {
        const base64Content = reader.result as string;
        const uploadBody = {
          fileName: uploadFile.name,
          fileType: uploadFile.name.split(".").pop()?.toLowerCase() || "docx",
          fileData: base64Content,
          isSensitive: isSensitive ? 1 : 0,
          allowAIRead: allowAIRead ? 1 : 0,
          documentType: documentType
        };

        const uploadRes = await fetch(`/api/projects/${projectId}/tasks/${tId}/documents`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers
          },
          body: JSON.stringify(uploadBody)
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData.error || "提报上传遭拦截，校验失败");
        }

        showTempSuccess(`✓ [${uploadFile.name}] 方案上传并流转成功！已自动完成页与段切段索引并进行持久化。`);
        setUploadFile(null);
        // Clear file input value
        const fileInput = document.getElementById("file-picker") as HTMLInputElement;
        if (fileInput) fileInput.value = "";

        await loadWorkspaceData();
      } catch (err: any) {
        setErrorMsg(err.message || "上传解析通道故障");
      } finally {
        setUploadLoading(false);
      }
    };
    reader.onerror = () => {
      setErrorMsg("读取本地文件失败");
      setUploadLoading(false);
    };
  };

  // 5. Trigger desktop checking
  const handleTriggerSelfCheck = async () => {
    if (!selectedDoc || !selectedVersion) return;
    setCheckLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${selectedDoc.id}/versions/${selectedVersion.id}/self-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({ tolerance })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "合规性自测系统阻断");
      }

      showTempSuccess(`🔧 自检合规性分析完成！最终扫描分析状态: [${data.status === 'passed' ? '自检绿灯通过' : '发现一致性问题'}].`);
      await loadWorkspaceData();
    } catch (err: any) {
      setErrorMsg(err.message || "自检底层通信阻断");
    } finally {
      setCheckLoading(false);
    }
  };

  // 6. Ignore check problem
  const handleIgnoreIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ignoringIssueId) return;
    if (ignoreReason.trim().length < 5) {
      setIgnoreError("忽略理由长度不足 5 个字符，请录入真实有效的业务放行理由！");
      return;
    }

    setIgnoreError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/self-check-issues/${ignoringIssueId}/ignore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({ ignoredReason: ignoreReason })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "网络写入失败");
      }

      showTempSuccess(`✓ 问题已作忽略标注并生成审计日志。`);
      setIgnoringIssueId(null);
      setIgnoreReason("");
      await loadWorkspaceData();
    } catch (err: any) {
      setIgnoreError(err.message);
    }
  };

  // 7. Mark final version
  const handleMarkFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoc || !selectedVersion) return;
    setFinalizeError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${selectedDoc.id}/versions/${selectedVersion.id}/mark-final`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({ forceReason })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "定稿提交失败");
      }

      showTempSuccess(`🎉 v${selectedVersion.version_number} 已成功定稿，并签署为本项目最终印标版！`);
      setFinalizingVerId(null);
      setForceReason("");
      await loadWorkspaceData();
    } catch (err: any) {
      setFinalizeError(err.message);
    }
  };

  // Obsolete version helper
  const handleMarkObsolete = async (verId: string) => {
    if (!selectedDoc) return;
    if (!window.confirm("核实：您确定要废弃此历史迭代版本吗？")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${selectedDoc.id}/versions/${verId}/mark-obsolete`, {
        method: "POST",
        headers
      });
      if (res.ok) {
        showTempSuccess("✓ 特定历史版本已标识废弃 (obsolete)。");
        await loadWorkspaceData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // UI helper for statuses translation
  const renderDocStatus = (status: string) => {
    const map: Record<string, string> = {
      pending_self_check: "🟡 待自检",
      self_check_failed: "🔴 自检未过",
      self_check_passed: "🟢 自检通过",
      completed: "🔒 已定稿(最终版)"
    };
    return map[status] || status;
  };

  // Severity labels style helper
  const severityStyle = (sev: string) => {
    switch (sev) {
      case "high": return "bg-red-50 text-red-700 border-red-200 font-extrabold";
      case "medium": return "bg-amber-50 text-amber-600 border-amber-200 font-bold";
      default: return "bg-slate-50 text-slate-500 border-slate-200";
    }
  };

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* ⚠️ Notifications & Alerts Banner */}
      {errorMsg && (
        <div className="p-4 border-4 border-[#EA580C] bg-amber-50 text-stone-900 font-bold flex items-start gap-3 rounded-sm">
          <AlertTriangle className="w-5 h-5 text-[#EA580C] mt-0.5 flex-shrink-0" />
          <div className="flex-grow">
            <h5 className="font-mono uppercase tracking-wide">系统校验和权限拦截</h5>
            <p className="mt-1 font-semibold font-sans">{errorMsg}</p>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-stone-500 hover:text-black">✕</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 border border-[#22C55E]/50 bg-[#F0FDF4] text-emerald-900 font-bold flex items-start gap-2 rounded-lg shadow-xs">
          <CheckCircle className="w-5 h-5 text-[#22C55E] mt-0.5 flex-shrink-0" />
          <div className="flex-grow">
            <h5 className="font-sans font-bold">处理成功</h5>
            <p className="mt-1 font-medium font-sans text-xs">{successMsg}</p>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-950">✕</button>
        </div>
      )}

      {/* Grid: 2 columns layout. Left is upload & files, Right is checking panel and versions drill down */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* ========================================================== */}
        {/* LEFT COLUMN: UPLOAD & DOCUMENTS LIST TRACE */}
        {/* ========================================================== */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Section: File upload card */}
          <div className="border border-border bg-white p-5 rounded-lg shadow-xs">
            <div className="flex items-center gap-2 mb-4 border-b border-stone-100 pb-2.5">
              <FileUp className="w-5 h-5 text-brand" />
              <h3 className="text-sm font-bold text-stone-900">
                方案编制文件提交
              </h3>
            </div>

            <form onSubmit={handleFileUpload} className="space-y-4 font-sans">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Task Selection (Required if not task scoped) */}
                <div>
                  <label className="text-[10px] text-stone-400 block font-bold mb-1">编制归属业务任务 *</label>
                  {taskId ? (
                    <input 
                      type="text" 
                      value={tasks.find(t => t.id === taskId)?.taskName || taskId} 
                      disabled 
                      className="w-full p-2 bg-stone-50 border border-stone-200 rounded-lg text-xs text-stone-500"
                    />
                  ) : (
                    <select
                      value={filterTaskId}
                      onChange={(e) => setFilterTaskId(e.target.value)}
                      required
                      className="w-full p-2 bg-white border border-border rounded-lg text-xs text-stone-700 focus:ring-1 focus:ring-brand"
                    >
                      <option value="">-- 请选择对应编制任务 --</option>
                      {tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.taskName} ({t.responsibleUsername || "待指派"})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Doc Type Selection */}
                <div>
                  <label className="text-[10px] text-stone-400 block font-bold mb-1">文件类目类别</label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="w-full p-2 bg-white border border-border rounded-lg text-xs text-stone-700 focus:ring-1 focus:ring-brand"
                  >
                    <option value="technical_scheme">技术标方案草案 (Technical Scheme)</option>
                    <option value="commercial_terms">商务偏离表及应答表 (Commercial)</option>
                    <option value="pricing_detail">测算及明细报价说明 (Pricing)</option>
                    <option value="tender_document">招标文件原始复件 (Tender Archive)</option>
                  </select>
                </div>
              </div>

              {/* Real Input Select File */}
              <div className="p-4 border border-dashed border-stone-300 bg-stone-50 hover:bg-stone-100/55 rounded-lg cursor-pointer transition-colors relative flex flex-col items-center justify-center py-6">
                <input 
                  type="file" 
                  id="file-picker" 
                  accept=".docx,.pdf"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <FileText className="w-8 h-8 text-stone-400 mb-2" />
                <span className="text-xs font-bold text-stone-700">
                  {uploadFile ? `已选中: ${uploadFile.name}` : "拖拽或点击此处，上传本地编制的 *.docx, *.pdf 技术方案草案"}
                </span>
                <span className="text-[9px] text-stone-400 mt-1 block">
                  (新版本提报后，系统会自动保存历史记录不覆盖)
                </span>
              </div>

              {/* Sensitive Toggle configs */}
              <div className="bg-stone-50 p-3 border border-stone-200 rounded-lg flex flex-col sm:flex-row gap-4 items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSensitive}
                    onChange={(e) => {
                      setIsSensitive(e.target.checked);
                      if (e.target.checked) setAllowAIRead(false);
                    }}
                    className="w-4 h-4 border border-stone-300 rounded-sm accent-brand"
                  />
                  <div>
                    <span className="font-bold text-stone-850 text-xs block">标记为敏感文件</span>
                    <span className="text-[9px] text-stone-400 font-normal">安全隔离下载，限制解析权限</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowAIRead}
                    disabled={isSensitive}
                    onChange={(e) => setAllowAIRead(e.target.checked)}
                    className="w-4 h-4 border border-stone-300 rounded-sm accent-brand"
                  />
                  <div>
                    <span className="font-bold text-stone-850 text-xs block">允许AI助手解析审查</span>
                    <span className="text-[9px] text-stone-400 font-normal">同意要素自动解析和辅助自检</span>
                  </div>
                </label>
              </div>

              {/* Submit trigger button */}
              <button
                type="submit"
                disabled={uploadLoading || !uploadFile}
                className={`w-full py-2.5 rounded-lg text-xs font-semibold flex justify-center items-center gap-2 transition-colors ${
                  uploadFile ? "bg-stone-900 text-white hover:bg-stone-850" : "bg-stone-100 text-stone-400 cursor-not-allowed"
                }`}
              >
                {uploadLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    正在上传文件...
                  </>
                ) : (
                  <>
                    <FileUp className="w-4 h-4" />
                    上传文件
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Section: Documents List Table */}
          <div className="border border-border bg-white p-5 rounded-lg shadow-xs">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 border-b border-stone-100 pb-2.5">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-brand" />
                <h3 className="text-sm font-bold text-stone-900">
                  文件列表
                </h3>
              </div>
              <button 
                onClick={loadWorkspaceData}
                className="p-1 px-2.5 bg-stone-100 hover:bg-stone-250 border border-stone-300 font-bold flex items-center gap-1 hover:text-black"
                title="刷新数据"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>刷新列表</span>
              </button>
            </div>

            {/* Query Filters - Hidden if component is task scoped */}
            {!taskId && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 bg-stone-50 p-3 border border-stone-205 rounded-sm">
                <div>
                  <label className="text-[9px] text-stone-400 block font-bold mb-1">过滤归属任务</label>
                  <select
                    value={filterTaskId}
                    onChange={(e) => setFilterTaskId(e.target.value)}
                    className="w-full p-1.5 bg-white border border-stone-300 text-[11px] font-sans"
                  >
                    <option value="">-- 全部任务件 --</option>
                    {tasks.map(t => (
                      <option key={t.id} value={t.id}>{t.taskName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[9px] text-stone-400 block font-bold mb-1">文件格式后缀</label>
                  <select
                    value={filterFileType}
                    onChange={(e) => setFilterFileType(e.target.value)}
                    className="w-full p-1.5 bg-white border border-stone-300 text-[11px] font-sans"
                  >
                    <option value="">-- 全部格式 (docx/pdf) --</option>
                    <option value="docx">Microsoft Word (*.docx)</option>
                    <option value="pdf">Adobe PDF (*.pdf)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[9px] text-stone-400 block font-bold mb-1">比对自检状态</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full p-1.5 bg-white border border-stone-300 text-[11px] font-sans"
                  >
                    <option value="">-- 全部状态 --</option>
                    <option value="pending_self_check">🟡 待发起自检</option>
                    <option value="self_check_failed">🔴 自检含有问题</option>
                    <option value="self_check_passed">🟢 绿灯校验通过</option>
                    <option value="completed">🔒 审计终审定稿</option>
                  </select>
                </div>
              </div>
            )}

            {/* Documents List Rendering */}
            {documents.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-stone-200 text-center text-stone-400 font-sans">
                列表空，未上传挂载任何方案文件，请于上方录单提领或切换任务过滤。
              </div>
            ) : (
              <div className="divide-y divide-stone-200">
                {documents.map((doc) => {
                  const isCurSelected = selectedDoc && selectedDoc.id === doc.id;
                  return (
                    <div 
                      key={doc.id}
                      onClick={() => handleSelectDoc(doc)}
                      className={`p-3.5 transition-colors cursor-pointer flex justify-between items-center gap-4 ${
                        isCurSelected ? "bg-orange-50/70 border-l-4 border-[#EA580C]" : "hover:bg-stone-50"
                      }`}
                    >
                      <div className="space-y-1 flex-grow overflow-hidden">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`p-1 px-1.5 text-[9px] leading-none uppercase font-extrabold ${
                            doc.file_type === 'pdf' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {doc.file_type}
                          </span>
                          <h4 className="font-bold text-stone-900 truncate max-w-xs font-sans text-xs">
                            {doc.file_name}
                          </h4>
                          {doc.is_sensitive === 1 && (
                            <span className="p-0.5 px-1 bg-rose-600 text-white border border-rose-800 text-[8px] leading-tight font-extrabold flex items-center gap-0.5">
                              <Lock className="w-2.5 h-2.5" /> 密
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 text-[10px] text-stone-400 font-sans mt-1">
                          <span>
                            归属: <b className="text-stone-700 font-mono text-[10px]">{doc.task_name || "公共招标文件"}</b>
                          </span>
                          <span>•</span>
                          <span>主版: v{doc.version_number}</span>
                          <span>•</span>
                          <span>上传: {doc.uploaded_by}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        <span className="px-2 py-0.5 border text-[9px] font-bold rounded-sm">
                          {renderDocStatus(doc.status)}
                        </span>
                        <ChevronRight className="w-4 h-4 text-stone-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================== */}
        {/* RIGHT COLUMN: DRIL-DOWN ITERATIONS & SELFcheck WORKSPACE */}
        {/* ========================================================== */}
        <div className="lg:col-span-5 space-y-6">
          
          {selectedDoc ? (
            <>
              {/* Card 1: Revision iterations list */}
              <div className="border border-border bg-white p-5 rounded-lg shadow-xs">
                <div className="flex justify-between items-center mb-4 border-b border-stone-100 pb-2.5">
                  <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-brand" />
                    历史版本与变更记录
                  </h4>
                  <span className="text-[10px] bg-stone-100 px-1.5 py-0.5 font-bold text-stone-600 truncate max-w-[150px]">
                    {selectedDoc.file_name}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {versionsList.map((ver) => {
                    const isVerActive = selectedVersion && selectedVersion.id === ver.id;
                    const isFinalState = ver.is_final === 1 || ver.is_final === true;
                    return (
                      <div 
                        key={ver.id}
                        onClick={() => handleSelectVersion(ver)}
                        className={`p-3 border text-xs cursor-pointer rounded-lg hover:border-brand/50 transition-all ${
                          isVerActive 
                            ? "border-brand bg-stone-50 shadow-xs border-l-2 border-l-brand" 
                            : "border-stone-200"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-stone-900">版本 v{ver.version_number}</span>
                              {ver.is_latest === 1 && (
                                <span className="p-0.5 px-1 bg-stone-900 text-white text-[8px] scale-90 leading-none">最新</span>
                              )}
                              {isFinalState && (
                                <span className="p-0.5 px-1 bg-emerald-600 text-white text-[8px] scale-90 leading-none flex items-center gap-0.5 font-bold">
                                  定稿终版
                                </span>
                              )}
                              {ver.status === 'obsolete' && (
                                <span className="p-0.5 px-1 bg-stone-300 text-stone-600 text-[8px] scale-90 leading-none">已作废</span>
                              )}
                            </div>
                            <div className="text-[10px] text-stone-400 mt-1 font-sans">
                              制作人: <strong className="text-stone-600">{ver.uploaded_by}</strong> | 大小: {(ver.file_size / 1024).toFixed(1)} KB
                            </div>
                            <div className="text-[9px] text-stone-400 font-sans mt-0.5">
                              提草时间: {new Date(ver.uploaded_at).toLocaleString()}
                            </div>
                          </div>

                          {/* Action elements */}
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <a 
                              href={`/api/projects/${projectId}/documents/${selectedDoc.id}/versions/${ver.id}/download?role=${currentUser.role}&username=${currentUser.username}`}
                              onClick={(e) => {
                                // Sensitive file access check
                                if (selectedDoc.is_sensitive === 1 && currentUser.role !== "ProjectManager" && currentUser.role !== "SystemAdmin" && currentUser.role !== "Cost") {
                                  e.preventDefault();
                                  alert("权限限制：该文件包含敏感涉密内容，当前角色暂不具备导出下载权限。如需下载，请联系项目经理或安全审计员。");
                                }
                              }}
                              className="p-1 px-1.5 border border-stone-8 pmd-btn text-[9px] font-bold bg-white text-stone-800 flex items-center gap-0.5"
                              title="下载导出"
                            >
                              <Download className="w-3 h-3 text-[#EA580C]" /> 下载
                            </a>
                            
                            {userCanManageFiles() && ver.status !== 'obsolete' && !isFinalState && ver.is_latest !== 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkObsolete(ver.id);
                                }}
                                className="p-0.5 px-1 border border-stone-200 text-stone-400 hover:text-stone-900 hover:border-stone-800 text-[9px] mt-1"
                                title="废弃此版"
                              >
                                废弃
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Card 2: Selfcheck Panel & Tolerance configurations */}
              {selectedVersion && (
                <div className="border border-border bg-white p-5 rounded-lg shadow-xs space-y-4">
                  <div className="flex justify-between items-center border-b border-stone-100 pb-2.5">
                    <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-brand" />
                      合规一致性分析
                    </h4>
                    <span className="p-0.5 px-1 bg-stone-100 text-stone-500 font-bold">v{selectedVersion.version_number}</span>
                  </div>

                  {/* Tolerance setting bar */}
                  <div className="bg-stone-50 p-3.5 border border-stone-200 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-stone-700 block text-[10px]">规划面积偏差允差设定:</span>
                      <span className="font-sans text-xs text-brand font-bold">{tolerance}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="15"
                      step="1"
                      value={tolerance}
                      onChange={(e) => setTolerance(Number(e.target.value))}
                      className="w-full h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-brand"
                    />
                    <span className="text-[9px] text-stone-400 block mt-1 font-sans">
                      如果由于计量误差导致面积拼读有微调偏离，在此设定偏离允差率，允差以内不发生冲突提示。
                    </span>
                  </div>

                  {/* Action triggers */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleTriggerSelfCheck}
                      disabled={checkLoading || selectedVersion.status === 'obsolete'}
                      className={`flex-grow pmd-btn py-2.5 flex justify-center items-center gap-1.5 font-black text-xs uppercase ${
                        selectedVersion.status === 'obsolete' 
                          ? "bg-stone-200 text-stone-450 cursor-not-allowed" 
                          : "bg-stone-900 text-white hover:scale-[1.01]"
                      }`}
                    >
                      {checkLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          桌面自控对准扫描中...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          运行文件自检 (Run Consistency Check)
                        </>
                      )}
                    </button>

                    {/* PM FINALIZING TRIGGER BUTTON */}
                    {currentUser.role === "ProjectManager" && selectedVersion.status !== 'obsolete' && selectedVersion.is_final !== 1 && (
                      <button
                        onClick={() => {
                          setFinalizingVerId(selectedVersion.id);
                          setForceReason("");
                          setFinalizeError(null);
                        }}
                        className="pmd-btn px-4 bg-emerald-600 text-white hover:scale-[1.01] flex items-center justify-center gap-1 font-bold text-xs"
                      >
                        <Lock className="w-3.5 h-3.5" /> 签署定稿
                      </button>
                    )}
                  </div>

                  {/* Historical checks List trigger selectors */}
                  {checkRunsList.length > 0 && (
                    <div>
                      <label className="text-[10px] text-stone-400 block font-bold mb-1 uppercase">自检历史记录 (Runs):</label>
                      <select
                        value={selectedRun ? selectedRun.id : ""}
                        onChange={(e) => {
                          const run = checkRunsList.find(r => r.id === e.target.value);
                          if (run) handleSelectRun(run);
                        }}
                        className="w-full p-2 bg-white border border-stone-300 font-sans text-xs"
                      >
                        {checkRunsList.map(r => (
                          <option key={r.id} value={r.id}>
                            次: {r.id.substring(4)} • [{r.status === 'passed' ? '🟢 通过' : '🔴 发现问题'}] • {r.executed_by}在 {new Date(r.executed_at).toLocaleString()}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Run Issues breakdown */}
                  {selectedRun && (
                    <div className="space-y-3.5 mt-4">
                      <div className="p-2 border border-stone-200 bg-stone-50 rounded-sm">
                        <span className="text-[9px] text-stone-405 block font-bold font-mono">核查纲要 (Check Result Summary):</span>
                        <p className="text-stone-800 text-[10px] mt-0.5 leading-tight">{selectedRun.summary || "未录入概要"}</p>
                      </div>

                      <div className="border-t pt-3">
                        <h5 className="font-extrabold text-[10px] text-stone-900 mb-2 uppercase flex justify-between items-center">
                          <span>问题列表 (Issues: {runIssues.length})</span>
                          {runIssues.length === 0 && <span className="text-emerald-600">✓ 全文验证通过</span>}
                        </h5>

                        <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                          {runIssues.map((issue) => {
                            const isIgnored = issue.status === "ignored";
                            
                            return (
                              <div 
                                key={issue.id}
                                className={`p-2.5 border rounded-sm space-y-1.5 transition-all text-[11px] ${
                                  isIgnored 
                                    ? "bg-slate-50 border-slate-200 opacity-60 line-through" 
                                    : "border-stone-250 bg-white"
                                }`}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <span className={`p-0.5 px-1.5 border text-[9px] scale-90 leading-none ${severityStyle(issue.severity)}`}>
                                    {issue.issue_type} ({issue.severity})
                                  </span>
                                  
                                  {/* Ignore button controls */}
                                  {!isIgnored && !selectedVersion.is_final && (
                                    <button
                                      onClick={() => {
                                        setIgnoringIssueId(issue.id);
                                        setIgnoreReason("");
                                        setIgnoreError(null);
                                      }}
                                      className="p-0.5 px-1.5 border text-[9px] font-bold text-amber-700 border-amber-300 hover:bg-amber-50"
                                      title="忽略该警告并记取专业原因"
                                    >
                                      忽略
                                    </button>
                                  )}
                                </div>

                                <p className="text-stone-850 font-sans tracking-tight font-semibold text-[10px] leading-relaxed">
                                  {issue.message}
                                </p>

                                {issue.source_text_snippet && (
                                  <div className="bg-stone-50 p-1.5 border border-stone-200 rounded-sm text-[9.5px] font-sans text-stone-500 leading-snug">
                                    <strong>原文引用段落 (位置: 第 {issue.source_page} 页, 第 {issue.source_paragraph} 段):</strong>
                                    <blockquote className="mt-0.5 border-l-2 border-stone-400 pl-2 text-stone-605 italic">
                                      {issue.source_text_snippet}
                                    </blockquote>
                                  </div>
                                )}

                                <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-stone-500 border-t pt-1">
                                  <span>预期对准: <b className="text-emerald-600 truncate block">{issue.expected_value || "-"}</b></span>
                                  <span>正文读取: <b className="text-rose-600 truncate block">{issue.actual_value || "-"}</b></span>
                                </div>

                                {isIgnored && (
                                  <div className="bg-slate-100 p-1.5 text-[9px] text-stone-500 font-sans mt-1">
                                    👤 忽略处理人: <strong>{issue.ignored_by}</strong><br />
                                    事由: <span className="italic">“{issue.ignored_reason}”</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Card 3: Review Center & Structured Comments Panel */}
              {selectedVersion && (
                <div className="border border-border bg-white p-5 rounded-lg shadow-xs space-y-4">
                  <div className="flex justify-between items-center border-b border-stone-100 pb-2.5">
                    <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-brand" />
                      质量审核与意见中心
                    </h4>
                    <span className="p-0.5 px-1.5 bg-indigo-50 text-indigo-700 font-semibold text-[9px] rounded-md">
                      本版本意见数: {comments.length}
                    </span>
                  </div>

                  {/* Submit to review control */}
                  {selectedVersion.status === "draft" && (
                    <div className="p-3 bg-amber-50 border border-amber-305 rounded-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
                      <div className="text-[10px] text-amber-800 font-sans">
                        <span className="font-extrabold uppercase block">🔍 当前版本处于 "草稿" 状态:</span>
                        若要邀请质量把关领导/其他模块负责人开展审查质检，请先发起提审。
                      </div>
                      <button
                        onClick={handleSubmitToReview}
                        className="pmd-btn px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10px] whitespace-nowrap"
                      >
                        提交质量把关审查
                      </button>
                    </div>
                  )}

                  {selectedVersion.status === "pending_review" && (
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-sm">
                      <span className="text-[10px] text-indigo-850 font-bold block uppercase">⏱️ 审核流转中 (Pending Quality Review):</span>
                      <p className="text-[10px] text-indigo-700 font-sans">当前版本正在进行领导把关，审查意见及整改内容会在此实时呈现。</p>
                    </div>
                  )}

                  {/* Actions to initiate new review comment */}
                  {userCanReview() && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => setIsCreatingComment(!isCreatingComment)}
                        className="pmd-btn px-3 py-1 bg-stone-900 text-white font-bold text-[10px]"
                      >
                        {isCreatingComment ? "收起面板 ✕" : "+ 新增结构高质量意见"}
                      </button>
                    </div>
                  )}

                  {/* Create structured comment form */}
                  {isCreatingComment && (
                    <form onSubmit={handleCreateComment} className="bg-stone-50 p-4 border border-border shadow-2xs rounded-lg space-y-3.5 animate-in slide-in-from-top duration-150">
                      <h5 className="font-extrabold text-[10px] uppercase text-stone-950 border-b pb-1 flex justify-between items-center">
                        <span>新建审查整改派件 (New Comment Thread)</span>
                        <span className="text-[9px] bg-red-100 text-red-700 px-1 font-mono font-black">质量把关</span>
                      </h5>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] text-stone-400 block font-bold mb-1">意见类型</label>
                          <select
                            value={newCommentType}
                            onChange={(e) => setNewCommentType(e.target.value)}
                            className="w-full p-2 bg-white border border-stone-300 font-sans text-xs"
                          >
                            <option value="content_issue">🔴 内容偏离 (Content Issue)</option>
                            <option value="consistency_conflict">🟡 一致性冲突 (Consistency Conflict)</option>
                            <option value="safety_hazard">⚠️ 安全技术规范偏离 (Safety Hazard)</option>
                            <option value="standard_deviation">⚪ 常规文本缺陷 (Standard Deviation)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] text-stone-400 block font-bold mb-1">问题严重度</label>
                          <select
                            value={newSeverity}
                            onChange={(e) => setNewSeverity(e.target.value)}
                            className="w-full p-2 bg-white border border-stone-300 font-sans text-xs font-bold text-[#EA580C]"
                          >
                            <option value="low">低 (Low)</option>
                            <option value="medium">中 (Medium)</option>
                            <option value="high">高 (High - Blockers)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[9px] text-stone-400 block font-bold mb-1">具体关联页</label>
                          <input
                            type="number"
                            min="1"
                            value={newPageNum}
                            onChange={(e) => setNewPageNum(Number(e.target.value))}
                            className="w-full p-1.5 bg-white border border-stone-300 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-stone-400 block font-bold mb-1">具体关联段</label>
                          <input
                            type="number"
                            min="1"
                            value={newParagraphNum}
                            onChange={(e) => setNewParagraphNum(Number(e.target.value))}
                            className="w-full p-1.5 bg-white border border-stone-300 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-stone-400 block font-bold mb-1">被分派人角色</label>
                          <select
                            value={newAssignedTo}
                            onChange={(e) => setNewAssignedTo(e.target.value)}
                            className="w-full p-1.5 bg-white border border-stone-300 text-xs font-sans"
                          >
                            <option value="user-const">张三 (施工技术方案人)</option>
                            <option value="user-pm">李四 (项目经理主管)</option>
                            <option value="user-review">钱八 (质量副总把关)</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[9px] text-stone-400 block font-bold mb-1">引用的缺陷正文片段 (Snippet)</label>
                        <input
                          type="text"
                          value={newTextSnippet}
                          onChange={(e) => setNewTextSnippet(e.target.value)}
                          placeholder="例如: 第九条抗弯强度计算 320MPa ..."
                          className="w-full p-2 bg-white border border-stone-300 font-sans text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] text-stone-400 block font-bold mb-1">审核意见描述 (Comment Description) *</label>
                        <textarea
                          value={newCommentContent}
                          onChange={(e) => setNewCommentContent(e.target.value)}
                          placeholder="请输入符合工程项目规范的精准整改意见描述..."
                          required
                          rows={3}
                          className="w-full p-2 bg-white border border-stone-300 font-sans text-xs"
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setIsCreatingComment(false)}
                          className="pmd-btn px-3 py-1.5 bg-white border border-stone-300 text-stone-500 uppercase font-bold text-[10px]"
                        >
                          取消
                        </button>
                        <button
                          type="submit"
                          className="pmd-btn px-4 py-1.5 bg-stone-900 text-white font-black text-[10px] uppercase"
                        >
                          发布派件
                        </button>
                      </div>
                    </form>
                  )}

                  {/* List of comments under this version */}
                  <div className="space-y-3">
                    {commentsLoading ? (
                      <div className="text-center py-4 text-stone-400 font-mono text-[10px]">正在读写评论档案库...</div>
                    ) : comments.length === 0 ? (
                      <div className="text-center py-6 bg-stone-50 border border-stone-200">
                        <p className="font-sans text-[11px] text-stone-450 font-bold">✓ 暂时没有待处理或未毕的审查意见，图件质量符合标准。</p>
                      </div>
                    ) : (
                      comments.map((comment) => {
                        const isExpanded = expandedCommentId === comment.id;
                        const isClosed = comment.status === "closed";

                        return (
                          <div 
                            key={comment.id}
                            className={`border rounded-sm transition-all overflow-hidden ${
                              isClosed 
                                ? "bg-slate-50 border-slate-200 opacity-70" 
                                : "border-stone-250 bg-white"
                            }`}
                          >
                            {/* Summary header of the comment */}
                            <div 
                              onClick={() => {
                                if (isExpanded) {
                                  setExpandedCommentId(null);
                                  setExpandedDetails(null);
                                } else {
                                  setExpandedCommentId(comment.id);
                                  loadCommentThread(comment.id);
                                }
                              }}
                              className="p-3 cursor-pointer hover:bg-stone-50 flex justify-between items-start gap-3 transition-colors"
                            >
                              <div className="space-y-1 flex-grow">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`px-1 py-0.5 text-[8.5px] scale-95 font-bold uppercase leading-none border ${
                                    comment.severity === 'high' 
                                      ? 'bg-red-50 text-red-700 border-red-350' 
                                      : 'bg-stone-50 text-stone-600 border-stone-300'
                                  }`}>
                                    {comment.severity === 'high' ? '🔥 阻断' : '常规'}
                                  </span>
                                  <span className="font-mono text-[9px] text-[#EA580C] font-black">
                                    意见: {comment.id.substring(8) || comment.id}
                                  </span>
                                  <span className={`px-1 rounded-xs text-[8.5px] leading-none ${
                                    isClosed ? "bg-stone-200 text-stone-605" : "bg-emerald-100 text-emerald-805 font-bold"
                                  }`}>
                                    {isClosed ? "已关闭" : "整改中"}
                                  </span>
                                </div>
                                <p className="font-sans font-bold text-stone-850 text-[10.5px] leading-tight">
                                  {comment.content}
                                </p>
                                <div className="text-[9px] text-stone-450 font-sans flex items-center gap-2 flex-wrap">
                                  <span>具体位置: <strong className="text-stone-700">第 {comment.sourcePage} 页, 第 {comment.sourceParagraph} 段</strong></span>
                                  <span>分配给: <strong className="text-indigo-600 font-bold">{comment.assignedToName || comment.assignedTo}</strong></span>
                                </div>
                              </div>
                              <div className="text-[9px] font-mono text-stone-400 text-right flex-shrink-0">
                                编人: {comment.createdByName || comment.createdBy}<br />
                                {new Date(comment.createdAt).toLocaleDateString()}
                              </div>
                            </div>

                            {/* Expanded replies and logs details section */}
                            {isExpanded && (
                              <div className="bg-stone-50 border-t p-3.5 space-y-4 animate-in slide-in-from-top duration-155">
                                {expandedDetailsLoading ? (
                                  <div className="text-center font-mono text-[9px] py-4 text-stone-400 animate-pulse">
                                    正在连结云端意见线程档案...
                                  </div>
                                ) : expandedDetails ? (
                                  <div className="space-y-4">
                                    {/* 1. Audit status logs trajectory */}
                                    <div className="space-y-1.5">
                                      <span className="text-[9px] text-stone-400 block font-bold uppercase">📊 意见流转历程轨迹 (Transition History):</span>
                                      <div className="space-y-1 bg-white p-2.5 border border-stone-200 rounded-sm">
                                        {expandedDetails.logs.length === 0 ? (
                                          <p className="text-[9px] text-stone-400">目前暂无此意见的审核流转记录。</p>
                                        ) : (
                                          expandedDetails.logs.map((lg: any, idx: number) => (
                                            <div key={idx} className="text-[9px] font-mono flex justify-between text-stone-500">
                                              <span>{idx + 1}. [{lg.oldStatus || "初始"} ➡️ {lg.newStatus}] 由 {lg.changedBy}: <span className="text-stone-700 italic">“{lg.reason}”</span></span>
                                              <span>{new Date(lg.changedAt).toLocaleTimeString()}</span>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>

                                    {/* 2. List of modification responses replies */}
                                    <div className="space-y-2">
                                      <span className="text-[9px] text-stone-400 block font-bold uppercase">💬 修改回复 (Team Replies):</span>
                                      {expandedDetails.replies.length === 0 ? (
                                        <div className="p-3 border border-stone-200 bg-white text-stone-400 text-center rounded-sm">
                                          目前暂无修改回复，待分派整改编制人反馈。
                                        </div>
                                      ) : (
                                        <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                                          {expandedDetails.replies.map((rp: any) => (
                                            <div key={rp.id} className="p-2.5 border border-stone-200 bg-white rounded-sm space-y-1">
                                              <div className="flex justify-between items-center text-[9px] text-[#EA580C] font-bold">
                                                <span>👤 {rp.repliedByName || rp.repliedBy}：</span>
                                                <span className="text-stone-400 font-mono font-normal">{new Date(rp.repliedAt).toLocaleString()}</span>
                                              </div>
                                              <p className="text-[10px] text-stone-800 font-sans font-semibold">
                                                {rp.replyContent}
                                              </p>
                                              {rp.newDocumentVersionId && (
                                                <div className="mt-1 bg-emerald-50 text-emerald-800 p-1 px-1.5 border border-emerald-200 rounded-xs text-[9px] font-mono inline-flex items-center gap-1 font-bold">
                                                  <span>🔗 关联新证明草稿版本:</span>
                                                  <span className="underline leading-none">v{versionsList.find(v => v.id === rp.newDocumentVersionId)?.version_number || "新版本"}</span>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* 3. Action inputs for adding reply */}
                                    {!isClosed && (
                                      <form onSubmit={(e) => handleReplyComment(comment.id, e)} className="space-y-2.5 border-t pt-3">
                                        <div>
                                          <span className="text-[9px] text-stone-400 font-bold uppercase block mb-1">📝 追加修改/整改回复 * (Reply Content):</span>
                                          <textarea
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                            placeholder="请描述已更正的内容(例如：已按照地方安全抗震技术标准在第七页修改为360MPa...)"
                                            required
                                            rows={2}
                                            className="w-full p-2 bg-white border border-stone-300 font-sans text-xs font-semibold text-stone-900"
                                          />
                                        </div>

                                        {/* Optional Link to newly uploaded version */}
                                        <div>
                                          <span className="text-[9px] text-stone-400 font-bold uppercase block mb-1">🔗 关联最新的已核对文件版本说明 (Associate New Version):</span>
                                          <select
                                            value={replyLinkNewVersionId}
                                            onChange={(e) => setReplyLinkNewVersionId(e.target.value)}
                                            className="w-full p-1.5 bg-white border border-stone-300 font-mono text-[10px]"
                                          >
                                            <option value="">-- 常规文字回复（不关联合规证明文件） --</option>
                                            {versionsList.map(v => (
                                              <option key={v.id} value={v.id}>
                                                版本 v{v.version_number} • {new Date(v.uploaded_at).toLocaleDateString()} {v.is_latest ? "(最新版)" : ""}
                                              </option>
                                            ))}
                                          </select>
                                        </div>

                                        <div className="flex gap-2 justify-end">
                                          {userCanReview() && (
                                            <button
                                              type="button"
                                              onClick={() => handleCloseComment(comment.id)}
                                              className="pmd-btn px-3 py-1 bg-emerald-600 text-white hover:bg-emerald-700 font-black text-[9px] mr-auto"
                                            >
                                              ✓ 确认整改并关闭意见 (Close Thread)
                                            </button>
                                          )}
                                          <button
                                            type="submit"
                                            className="pmd-btn px-4 py-1.5 bg-stone-900 text-white font-bold text-[9px] uppercase hover:scale-[1.01]"
                                          >
                                            提交修改回复
                                          </button>
                                        </div>
                                      </form>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-center text-[9px] text-stone-405 font-mono py-2">意见线程加载失败</div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="border-4 border-dashed border-stone-300 rounded-sm text-center py-24 text-stone-400 font-sans bg-white pmd-shadow-sm flex flex-col items-center justify-center">
              <RefreshCw className="w-8 h-8 text-stone-300 mb-2 animate-bounce" />
              <span>请在左侧列表中选择任意文件查看详情</span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================== */}
      {/* IGNORE ISSUE DIALOG MODAL */}
      {/* ========================================================== */}
      {ignoringIssueId && (
        <div className="fixed inset-0 z-100 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-border max-w-md w-full p-6 shadow-xl space-y-4 rounded-lg animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-2.5">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              <h4 className="text-sm font-bold text-stone-900">确认忽略该问题原因</h4>
            </div>

            {ignoreError && (
              <div className="p-3 bg-rose-50 border border-rose-250 text-rose-800 text-[11px] rounded-md font-medium">
                ⚠️ {ignoreError}
              </div>
            )}

            <form onSubmit={handleIgnoreIssue} className="space-y-4">
              <div>
                <span className="text-[11px] text-stone-500 font-bold block mb-1.5">填写忽略该问题的主要技术或商务原因 (至少五个字) *</span>
                <textarea
                  value={ignoreReason}
                  onChange={(e) => setIgnoreReason(e.target.value)}
                  placeholder="请输入真实的现场/合同偏离说明（示例：本项目由于是中试配套工程，在澄清函第 4 条中业主特批不作常规消防 BIM 三维碰撞，故不提交该章，情况属实，请PM审核核实。）"
                  required
                  rows={4}
                  className="w-full p-2.5 bg-stone-50 border border-border rounded-lg font-sans text-xs focus:ring-1 focus:ring-brand"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIgnoringIssueId(null)}
                  className="px-4 py-2 bg-white border border-border hover:bg-stone-50 text-stone-600 rounded-md text-xs font-semibold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-stone-950 text-white hover:bg-stone-850 rounded-md text-xs font-semibold"
                >
                  确认忽略该问题
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* PM FINALIZING REASON MODAL DIALOG */}
      {/* ========================================================== */}
      {finalizingVerId && (
        <div className="fixed inset-0 z-100 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-border max-w-md w-full p-6 shadow-xl space-y-4 rounded-lg animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 border-b border-stone-100 pb-2.5">
              <Lock className="w-5 h-5 text-emerald-600" />
              <h4 className="text-sm font-bold text-stone-900">项目经理确认方案定稿</h4>
            </div>

            {finalizeError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-[11px] rounded-md font-medium">
                🔒 拦截提示: {finalizeError}
              </div>
            )}

            <div className="p-3 bg-[#EFF6FF] border border-blue-200 rounded-lg text-[11px] text-blue-800 font-sans space-y-1">
              <p className="font-bold">🚨 签署前合规审查温馨提示:</p>
              <p>1. 如果自检报告存在任何未更正或者未被申报忽略的合规警告，系统会发起检验，并拒绝签署定稿。</p>
              <p>2. 如果有不可避免的偏离，您可以在下方录入五个字以上的 **“特批定稿原由说明”** 进行强制放行签署。</p>
            </div>

            <form onSubmit={handleMarkFinal} className="space-y-4">
              <div>
                <span className="text-[11px] text-stone-500 font-bold block mb-1.5 font-sans">签署理由/特批或放行定稿凭证 *</span>
                <textarea
                  value={forceReason}
                  onChange={(e) => setForceReason(e.target.value)}
                  placeholder="请输入特批签署凭证事由（示例：技术方案已经通过全员总装审查，其各章节参数与澄清函第2版已在上海评审会议一致商定，现签署发布此最终印标定稿版方案。）"
                  required
                  rows={4}
                  className="w-full p-2.5 bg-stone-50 border border-border rounded-lg font-sans text-xs focus:ring-1 focus:ring-brand"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setFinalizingVerId(null)}
                  className="px-4 py-2 bg-white border border-border text-stone-600 rounded-md text-xs font-semibold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold"
                >
                  确认并签署方案定稿
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  // Checks if the active simulation role allows managing documents operations
  function userCanManageFiles() {
    const permRoles = ["ProjectManager", "Sales", "Design", "Cost", "Pricing", "Construction", "VECD", "DocumentCoordinator", "SystemAdmin"];
    return permRoles.includes(currentUser.role);
  }

  // Checks if the active simulation role allows reviewing and writing structured comments
  function userCanReview() {
    const reviewRoles = ["ProjectManager", "Cost", "Design", "Construction", "VECD", "DocumentCoordinator", "SystemAdmin"];
    return reviewRoles.includes(currentUser.role);
  }
}
