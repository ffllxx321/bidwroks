/**
 * Relational Database Schema Definitions
 * Supporting fully consistent migrations from SQLite (Local Dev) to PostgreSQL (Pilot Production)
 */

export interface DbUser {
  id: string; // BIGINT / UUID
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface DbRole {
  id: string;
  roleName: string; // e.g. SystemAdmin, ProjectManager, Sales
  description: string;
}

export interface DbUserRole {
  userId: string;
  roleId: string;
}

export interface DbProject {
  id: string;
  name: string;
  status: "Draft" | "Tendering" | "Submitted" | "Archived";
  createdAt: string;
  updatedAt: string;
}

export interface DbProjectMember {
  projectId: string;
  userId: string;
  roleName: string; // e.g. Design, Cost, Construction
  joinedAt: string;
}

/**
 * Project Master Data fields split into separate Value + Unit fields
 * Conforming strictly to Rule 1: Structural Numerics Storage
 */
export interface DbProjectMasterData {
  projectId: string; // PRIMARY KEY
  projectName: string;
  clientName: string;
  projectAddress: string;
  buildingType: string;

  // Rule 1: Structural storage of numerics
  grossFloorAreaValue: number; // REAL / NUMERIC in PostgreSQL, REAL in SQLite
  grossFloorAreaUnit: string; // e.g. "㎡" or "平方"
  
  totalDurationValue: number; // INTEGER
  totalDurationUnit: string; // e.g. "日历天" or "工作日"

  bidClosingDate: string; // DATE/ISO-string
  clarificationDue: string; // DATE/ISO-string
  siteVisitDate: string; // DATE/ISO-string

  tenderScope: string;
  constructScope: string;
  designScope: string;
  paymentTerms: string;
  bimRequirements: string;
  greenBuildings: string;
  safetyLevel: string;
  qualityGoal: string;
  vecdConstraints: string;

  updatedAt: string;
}

/**
 * DB structural audit log records
 */
export interface DbAuditLog {
  id: string; // BIGINT/UUID Primary Key
  projectId: string;
  operator: string;
  roleName: string;
  action: string; // Upload, Login, EditMaster, etc.
  details: string;
  timestamp: string;
  ipAddress: string;
}

/**
 * Audit log recording any field transitions on project_master_data
 */
export interface DbMasterDataChange {
  id: string; // BIGINT / UUID
  projectId: string;
  fieldName: string; // e.g. "grossFloorArea"
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
  source: string; // e.g. "AI Extraction", "Manual Input"
  impactLevel: "Low" | "Medium" | "High";
}

/**
 * Document & Version Structure (Rule 2: Never physically overwrite file paths)
 */
export interface DbDocument {
  id: string; // BIGINT / UUID
  projectId: string;
  fileName: string;
  isSensitive: boolean; // Flag isolating model access
  allowAIRead: boolean; // Flag managing RAG permission
  createdAt: string;
}

export interface DbDocumentVersion {
  id: string; // BIGINT / UUID
  documentId: string; // Link to DbDocument
  versionCode: string; // e.g. "v1", "v2", "v3"
  filePath: string; // Unique disk file path (e.g. storage/proj-01/v2.docx)
  uploadedBy: string;
  uploadedAt: string;
  status: "Draft" | "Uploaded" | "SelfChecking" | "ReviewPending" | "Reviewing" | "NeedsRevision" | "Approved" | "Final" | "Obsolete";
  checksum: string; // MD5/SHA256 to audit payload originality
}
