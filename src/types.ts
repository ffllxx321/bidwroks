export type UserRole =
  | "营业官 (张三)"
  | "项目负责人 (李四)"
  | "设计负责人 (王五)"
  | "概算负责人 (赵六)"
  | "施工技术总工 (陈七)"
  | "总监审核领导 (钱八)"
  | "资料汇总归档员 (周十)"
  | "Viewer"
  | string;

export interface MasterData {
  projectName: string;
  clientName: string;
  projectAddress: string;
  grossFloorArea: string | number;
  bidClosingDate: string;
  clarificationDue: string;
  siteVisitDate: string;
  totalDuration: string | number;
  paymentTerms: string;
  tenderScope: string;
  constructScope: string;
  vecdConstraints: string;
  buildingType?: string;
  grossFloorAreaValue?: string | number;
  grossFloorAreaUnit?: string;
  totalDurationValue?: string | number;
  totalDurationUnit?: string;
  designScope?: string;
  bimRequirements?: string;
  greenBuildings?: string;
  safetyLevel?: string;
  qualityGoal?: string;
}
