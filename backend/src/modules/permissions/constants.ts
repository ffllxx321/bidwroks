/**
 * BidWorks RBAC User Roles
 */
export enum UserRoleType {
  SystemAdmin = "SystemAdmin", // IT/系统管理员
  ProjectManager = "ProjectManager", // 项目负责人 (李四)
  Sales = "Sales", // 营业专员/商务 (张三)
  Design = "Design", // 设计负责人 (王五)
  Cost = "Cost", // 概算负责人 (赵六)
  Pricing = "Pricing", // 报价专员
  Construction = "Construction", // 施工技术总工 (陈七)
  VECD = "VECD", // VECD深化专家
  Reviewer = "Reviewer", // 审核领导 (钱八)
  DocumentCoordinator = "DocumentCoordinator", // 资料汇总归档员 (周十)
  Viewer = "Viewer", // 只能查看的访客
}

/**
 * BidWorks Functional Action Permissions
 */
export enum PermissionType {
  CanViewProject = "canViewProject",
  CanCreateProject = "canCreateProject",
  CanEditProjectMasterData = "canEditProjectMasterData",
  CanViewProjectMasterData = "canViewProjectMasterData",
  CanViewAuditLogs = "canViewAuditLogs",
  CanUploadFile = "canUploadFile",
  CanDownloadFile = "canDownloadFile",
  CanReviewDocument = "canReviewDocument",
  CanReadSensitiveFile = "canReadSensitiveFile",
  CanUseAIOnFile = "canUseAIOnFile",
}

/**
 * Basic Role Permission Mapping Registry (Default ACL policy)
 */
export const ROLE_PERMISSIONS: Record<UserRoleType, PermissionType[]> = {
  [UserRoleType.SystemAdmin]: [
    PermissionType.CanViewProject,
    PermissionType.CanViewProjectMasterData,
    PermissionType.CanViewAuditLogs,
  ],
  [UserRoleType.ProjectManager]: [
    PermissionType.CanViewProject,
    PermissionType.CanCreateProject,
    PermissionType.CanEditProjectMasterData,
    PermissionType.CanViewProjectMasterData,
    PermissionType.CanViewAuditLogs,
    PermissionType.CanUploadFile,
    PermissionType.CanDownloadFile,
    PermissionType.CanReviewDocument,
    PermissionType.CanReadSensitiveFile,
    PermissionType.CanUseAIOnFile,
  ],
  [UserRoleType.Sales]: [
    PermissionType.CanViewProject,
    PermissionType.CanCreateProject,
    PermissionType.CanEditProjectMasterData,
    PermissionType.CanViewProjectMasterData,
    PermissionType.CanViewAuditLogs, // Let Sales view logs for project sync
    PermissionType.CanUploadFile,
    PermissionType.CanDownloadFile,
    PermissionType.CanUseAIOnFile,
  ],
  [UserRoleType.Design]: [
    PermissionType.CanViewProject,
    PermissionType.CanViewProjectMasterData,
    PermissionType.CanUploadFile,
    PermissionType.CanDownloadFile,
    PermissionType.CanUseAIOnFile,
  ],
  [UserRoleType.Cost]: [
    PermissionType.CanViewProject,
    PermissionType.CanViewProjectMasterData,
    PermissionType.CanUploadFile,
    PermissionType.CanDownloadFile,
    PermissionType.CanReadSensitiveFile,
  ],
  [UserRoleType.Pricing]: [
    PermissionType.CanViewProject,
    PermissionType.CanViewProjectMasterData,
    PermissionType.CanUploadFile,
    PermissionType.CanDownloadFile,
  ],
  [UserRoleType.Construction]: [
    PermissionType.CanViewProject,
    PermissionType.CanViewProjectMasterData,
    PermissionType.CanUploadFile,
    PermissionType.CanDownloadFile,
    PermissionType.CanUseAIOnFile,
  ],
  [UserRoleType.VECD]: [
    PermissionType.CanViewProject,
    PermissionType.CanViewProjectMasterData,
    PermissionType.CanUploadFile,
    PermissionType.CanDownloadFile,
    PermissionType.CanUseAIOnFile,
  ],
  [UserRoleType.Reviewer]: [
    PermissionType.CanViewProject,
    PermissionType.CanViewProjectMasterData,
    PermissionType.CanReviewDocument,
    PermissionType.CanDownloadFile,
  ],
  [UserRoleType.DocumentCoordinator]: [
    PermissionType.CanViewProject,
    PermissionType.CanViewProjectMasterData,
    PermissionType.CanUploadFile,
    PermissionType.CanDownloadFile,
  ],
  [UserRoleType.Viewer]: [
    PermissionType.CanViewProject,
    PermissionType.CanViewProjectMasterData,
  ],
};
