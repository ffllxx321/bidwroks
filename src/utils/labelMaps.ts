export const roleLabelMap: Record<string, string> = {
  ProjectManager: "项目负责人",
  Sales: "营业",
  Design: "设计",
  Cost: "概算",
  Pricing: "报价",
  Construction: "施工技术",
  VECD: "VECD",
  Reviewer: "审核人",
  DocumentCoordinator: "资料统筹",
  Viewer: "查看者",
  SystemAdmin: "系统管理员",
};

export const taskStatusLabelMap: Record<string, string> = {
  not_started: "未开始",
  ready_to_start: "可先启动",
  waiting_input: "待输入资料",
  in_progress: "进行中",
  pending_self_check: "待自检",
  pending_review: "待审核",
  needs_revision: "需修改",
  needs_review: "需复核",
  completed: "已完成",
  at_risk: "有风险",
  cancelled: "已取消",
};

export const fileStatusLabelMap: Record<string, string> = {
  uploaded: "已上传",
  pending_review: "待审核",
  approved: "已批准",
  needs_revision: "需修改",
  completed: "已完成",
  obsolete: "历史版本",
};

export const reviewStatusLabelMap: Record<string, string> = {
  open: "开启中",
  replied: "已回复",
  closed: "已关闭",
};

export const issueStatusLabelMap: Record<string, string> = {
  open: "开启中",
  ignored: "已忽略",
  resolved: "已解决",
};

export const severityLabelMap: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
  High: "高",
  Medium: "中",
  Low: "低",
};

export const documentTypeLabelMap: Record<string, string> = {
  tender_document: "招标文件",
  construction_scheme: "施工技术方案",
  vecd_scheme: "VECD方案",
  cost_estimate: "概算深化件",
  pricing_scheme: "报价方案",
  design_scheme: "设计方案",
  other: "其他",
};

export const notificationTypeLabelMap: Record<string, string> = {
  pending_review: "待审核",
  needs_revision: "需修改",
  assigned: "已指派任务",
  comment_replied: "意见已回复",
};

export const impactLevelLabelMap: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
  High: "高",
  Medium: "中",
  Low: "低",
};

export const generalStatusLabelMap: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
  Low: "低",
  Medium: "中",
  High: "高",
  pending: "待处理",
  confirmed: "已确认",
  ignored: "已忽略",
  pending_review: "待审核",
  self_check_failed: "自检未通过",
  requires_review: "需复核",
  manual: "手工填报",
  system: "系统生成",
  "手工调准": "手工填报",
  "默认系统录入": "系统生成",
};

export function translateStatus(val: string | null | undefined): string {
  if (!val) return "";
  const key = String(val).trim();
  const lower = key.toLowerCase();
  if (generalStatusLabelMap[lower]) return generalStatusLabelMap[lower];
  if (generalStatusLabelMap[key]) return generalStatusLabelMap[key];
  return key;
}

