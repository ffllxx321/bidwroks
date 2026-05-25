import db from "../../database/db.ts";

export interface AuditRecord {
  id: string;
  projectId: string; // can be null for non-project actions (like login)
  operator: string;
  role: string;
  action: string;
  details: string;
  timestamp: string;
  ipAddress?: string;
}

export interface AITokenUsageRecord {
  id: string;
  projectId: string;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  timestamp: string;
}

class AuditLogger {
  private tokenLogs: AITokenUsageRecord[] = [];

  /**
   * Safe persistent sink logging crucial user interactions.
   */
  public logAction(record: Omit<AuditRecord, "id" | "timestamp">): AuditRecord {
    const id = `audit-${Date.now()}-${Math.random().toString(36).substring(3, 7)}`;
    const timestamp = new Date().toISOString();
    const fullRecord: AuditRecord = {
      ...record,
      id,
      timestamp,
    };
    
    let finalProjectId: string | null = null;
    if (record.projectId && typeof record.projectId === "string" && record.projectId !== "N/A" && record.projectId.trim() !== "" && record.projectId !== "all") {
      try {
        const row = db.prepare("SELECT id FROM projects WHERE id = ?").get(record.projectId);
        if (row) {
          finalProjectId = record.projectId;
        }
      } catch (e) {
        finalProjectId = null;
      }
    }

    try {
      const stmt = db.prepare(`
        INSERT INTO audit_logs (id, project_id, operator, role_name, action, details, timestamp, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        finalProjectId,
        record.operator,
        record.role,
        record.action,
        record.details,
        timestamp,
        record.ipAddress || null
      );
    } catch (err) {
      console.error("[AUDIT-LOG] Database error persisting audit log:", err);
    }

    console.log(`[AUDIT-LOG] [${fullRecord.action}] By [${fullRecord.operator}] Details: ${fullRecord.details}`);
    return fullRecord;
  }

  /**
   * Captures AI Gateway call token spend details.
   */
  public logAITokenUsage(log: Omit<AITokenUsageRecord, "id" | "timestamp">): AITokenUsageRecord {
    const fullLog: AITokenUsageRecord = {
      ...log,
      id: `token-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };

    this.tokenLogs.push(fullLog);
    console.log(`[AI-TOKEN-AUDIT] Model [${fullLog.modelName}] Used Total Tokens [${fullLog.totalTokens}] in ${fullLog.durationMs}ms`);
    return fullLog;
  }

  /**
   * Retrieves log histories for project-level reporting dashboards.
   */
  public getLogsForProject(projectId: string): AuditRecord[] {
    try {
      const rows = db.prepare(`
        SELECT id, project_id as projectId, operator, role_name as role, action, details, timestamp, ip_address as ipAddress
        FROM audit_logs
        WHERE project_id = ?
        ORDER BY timestamp DESC
      `).all(projectId) as any[];
      return rows;
    } catch (err) {
      console.error("[AUDIT-LOG] Database error retrieving audit logs:", err);
      return [];
    }
  }

  /**
   * Retrieves all logs across the system
   */
  public getAllLogs(): AuditRecord[] {
    try {
      const rows = db.prepare(`
        SELECT id, project_id as projectId, operator, role_name as role, action, details, timestamp, ip_address as ipAddress
        FROM audit_logs
        ORDER BY timestamp DESC
      `).all() as any[];
      return rows;
    } catch (err) {
      console.error("[AUDIT-LOG] Database error retrieving audit logs:", err);
      return [];
    }
  }

  public getAILogs(): AITokenUsageRecord[] {
    return this.tokenLogs;
  }
}

export const auditLogger = new AuditLogger();
