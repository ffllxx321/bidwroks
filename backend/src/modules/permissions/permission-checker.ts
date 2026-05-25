import { UserRoleType, PermissionType, ROLE_PERMISSIONS } from "./constants.ts";

export interface Subject {
  userId: string;
  role: UserRoleType;
}

export interface ResourceFile {
  id: string;
  fileName: string;
  isSensitive: boolean;
  allowAIRead: boolean;
}

/**
 * Checks if the standard user subject has a specific permission.
 */
export function hasPermission(subject: Subject, permission: PermissionType): boolean {
  const permissions = ROLE_PERMISSIONS[subject.role] || [];
  return permissions.includes(permission);
}

/**
 * Performs AI-specific file access validation checks before passing contents to LLM slicing/RAG engine.
 * Rule: Sensitive files are default NOT readable by AI (must throw exclusion).
 */
export function checkAIAccessToFile(resource: ResourceFile, enableSensitiveReadEnv: boolean): {
  allowed: boolean;
  reason?: string;
} {
  // If the file is physically classified as sensitive
  if (resource.isSensitive) {
    // If explicit environmental toggle or flag overrides sensitive files parsing, we can check.
    if (!resource.allowAIRead && !enableSensitiveReadEnv) {
      return {
        allowed: false,
        reason: "AI_PERMISSION_DENIED_EXCLUSION: File is classified as SENSITIVE and AI access is disabled.",
      };
    }
  }

  // Check general AI permissibility
  if (!resource.allowAIRead) {
    return {
      allowed: false,
      reason: "AI_PERMISSION_DENIED: User or administrator has disabled AI reading capability for this non-sensitive file.",
    };
  }

  return { allowed: true };
}
