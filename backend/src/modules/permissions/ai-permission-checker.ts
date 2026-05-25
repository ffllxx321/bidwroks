import db from "../../database/db.ts";
import { UserRoleType, PermissionType } from "./constants.ts";
import { hasPermission } from "./permission-checker.ts";

export interface AIPermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Checks if AI service is allowed to read a specific document in a project
 */
export function verifyAIPermission(
  projectId: string,
  documentId: string,
  userRole: string,
  userId: string
): AIPermissionCheckResult {
  // 1. Verify user's project access by checking if they are a project member
  // (SystemAdmin, ProjectManager, Sales, Reviewer have standard global view scope)
  const isGlobalRole = ["SystemAdmin", "ProjectManager", "Sales", "Reviewer"].includes(userRole);
  if (!isGlobalRole) {
    const member = db.prepare("SELECT * FROM project_members WHERE project_id = ? AND user_id = ?").get(projectId, userId);
    if (!member) {
      return { allowed: false, reason: "用户非本项目成员，无权加载本项目文档" };
    }
  }

  // 2. Fetch the target document metadata
  const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND project_id = ?").get(documentId, projectId) as any;
  if (!doc) {
    return { allowed: false, reason: "招标文件未被登记或查找不到" };
  }

  // 3. Check if document restricts AI access (allow_ai_read = 0)
  if (doc.allow_ai_read === 0 || doc.allow_ai_read === false) {
    return { allowed: false, reason: "该招标文件在设置里已被人工切断 AI 读取权限" };
  }

  // 4. Verify sensitivity boundaries
  if (doc.is_sensitive === 1 || doc.is_sensitive === true) {
    const aiEnableSensitiveRead = process.env.AI_ENABLE_SENSITIVE_READ === "true";
    if (!aiEnableSensitiveRead) {
      return { allowed: false, reason: "该招标文件包含涉敏或设计机密信息，已被物理切断 AI 分析服务（AI_ENABLE_SENSITIVE_READ = false）" };
    }
  }

  return { allowed: true };
}
