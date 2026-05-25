import fs from "fs";
import path from "path";
import { ENV } from "./env.ts";

export function isDevelopmentRuntime(): boolean {
  return ENV.APP_ENV === "development" || process.env.APP_ENV === "development" || !ENV.APP_ENV;
}

export function getAiConfigDiagnostics() {
  const hasBailian = !!(process.env.BAILIAN_API_KEY || "").trim();
  const hasDashscope = !!(process.env.DASHSCOPE_API_KEY || "").trim();
  const resolvedApiKeyConfigured = !!(ENV.BAILIAN_API_KEY || process.env.BAILIAN_API_KEY || process.env.DASHSCOPE_API_KEY || "").trim();

  return {
    aiProvider: ENV.AI_PROVIDER,
    bailianApiKeyConfigured: hasBailian,
    dashscopeApiKeyConfigured: hasDashscope,
    resolvedApiKeyConfigured,
    baseUrl: ENV.BAILIAN_BASE_URL,
    model: ENV.BAILIAN_MODEL,
    runtime: "server"
  };
}

export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "*".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}${"*".repeat(Math.min(10, trimmed.length - 8))}${trimmed.slice(-4)}`;
}

export function upsertEnvValue(envPath: string, key: string, value: string): void {
  const normalizedValue = value.trim();
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const nextLine = `${key}=${normalizedValue}`;
  let replaced = false;

  const updatedLines = lines.map(line => {
    if (line.trim().startsWith(`${key}=`)) {
      replaced = true;
      return nextLine;
    }
    return line;
  });

  if (!replaced) {
    if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1] !== "") {
      updatedLines.push(nextLine);
    } else if (updatedLines.length > 0) {
      updatedLines[updatedLines.length - 1] = nextLine;
    } else {
      updatedLines.push(nextLine);
    }
  }

  const output = `${updatedLines.filter((line, index, arr) => !(line === "" && index === arr.length - 1)).join("\n")}\n`;
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, output, "utf8");
}

export function saveDashscopeApiKey(apiKey: string, envPath = path.join(process.cwd(), ".env")) {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) {
    throw new Error("API key is required.");
  }

  upsertEnvValue(envPath, "AI_PROVIDER", "bailian");
  upsertEnvValue(envPath, "DASHSCOPE_API_KEY", normalizedKey);

  process.env.AI_PROVIDER = "bailian";
  process.env.DASHSCOPE_API_KEY = normalizedKey;
  ENV.AI_PROVIDER = "bailian";
  ENV.BAILIAN_API_KEY = normalizedKey;

  return {
    configured: true,
    maskedKey: maskSecret(normalizedKey),
    diagnostics: getAiConfigDiagnostics()
  };
}
