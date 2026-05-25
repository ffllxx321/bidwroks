import fs from "fs";
import path from "path";
import { ENV } from "./env.ts";

/**
 * Checks if the current environment is development
 */
export function isDevelopmentRuntime(): boolean {
  const env = ENV.APP_ENV || process.env.APP_ENV || "development";
  return env.toLowerCase().trim() === "development";
}

/**
 * Masks a secret key for telemetry/safe diagnostics
 */
export function maskSecret(value: string | undefined | null): string {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return "****" + trimmed.slice(-Math.min(2, trimmed.length));
  }
  return trimmed.slice(0, 4) + "****" + trimmed.slice(-4);
}

/**
 * Retrieves the current live diagnostic parameters
 */
export function getAiConfigDiagnostics() {
  const hasBailian = !!(process.env.BAILIAN_API_KEY || "").trim();
  const hasDashscope = !!(process.env.DASHSCOPE_API_KEY || "").trim();
  const hasGemini = !!(process.env.GEMINI_API_KEY || "").trim();
  const hasAnyKey = hasBailian || hasDashscope || hasGemini;

  return {
    aiProvider: hasGemini ? "gemini" : (ENV.AI_PROVIDER || "bailian"),
    bailianApiKeyConfigured: hasBailian,
    dashscopeApiKeyConfigured: hasDashscope,
    geminiApiKeyConfigured: hasGemini,
    resolvedApiKeyConfigured: hasAnyKey,
    baseUrl: hasGemini ? "https://generativelanguage.googleapis.com" : (ENV.BAILIAN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"),
    model: hasGemini ? "gemini-3.5-flash" : (ENV.BAILIAN_MODEL || "qwen-long"),
    runtime: "server"
  };
}

/**
 * Upserts a key-value pair in a .env format string without breaking other lines
 */
export function upsertEnvValue(envContent: string, key: string, value: string): string {
  const lines = envContent.split(/\r?\n/);
  let keyFound = false;
  const targetPrefix = `${key}=`;

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    // Match line starting with Key= (with optional spaces around equal sign)
    if (trimmed.startsWith(targetPrefix) || trimmed.replace(/\s*=\s*/, "=").startsWith(targetPrefix)) {
      keyFound = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!keyFound) {
    newLines.push(`${key}=${value}`);
  }

  return newLines.join("\n");
}

/**
 * Persists the user provided DashScope API Key to the .env file in development and updates active runtime properties
 */
export async function saveDashscopeApiKey(
  apiKey: string,
  envPath: string = path.join(process.cwd(), ".env")
): Promise<{ configured: boolean; maskedKey: string; diagnostics: any }> {
  const trimmedKey = (apiKey || "").trim();
  if (!trimmedKey) {
    throw new Error("API Key 不能为空！");
  }

  // 1. Read existing .env or start fresh
  let envContent = "";
  try {
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf-8");
    }
  } catch (err: any) {
    console.warn(`[Runtime-Config] Could not read existing .env at ${envPath}, seeding a new one.`);
  }

  // 2. Perform safe upsert of the variables
  let updatedEnv = envContent;
  updatedEnv = upsertEnvValue(updatedEnv, "AI_PROVIDER", "bailian");
  updatedEnv = upsertEnvValue(updatedEnv, "DASHSCOPE_API_KEY", trimmedKey);

  // 3. Save back to the file
  try {
    fs.writeFileSync(envPath, updatedEnv, "utf-8");
    console.log(`[Runtime-Config] Config successfully written to .env file path: ${envPath}`);
  } catch (err: any) {
    throw new Error(`无法写入环境配置文件: ${err.message}`);
  }

  // 4. Hot-reload the config variables in process.env and ENV
  process.env.DASHSCOPE_API_KEY = trimmedKey;
  process.env.AI_PROVIDER = "bailian";

  // Sync process.env.BAILIAN_API_KEY as well just to be thorough and fully aligned
  process.env.BAILIAN_API_KEY = trimmedKey;

  ENV.BAILIAN_API_KEY = trimmedKey;
  ENV.AI_PROVIDER = "bailian";

  // Log active state loaded
  console.log(`[Runtime-Config-Reload] Synchronously refreshed runtime with the new DashScope Key.`);
  console.log(`- process.env.AI_PROVIDER: ${process.env.AI_PROVIDER}`);
  console.log(`- ENV.AI_PROVIDER: ${ENV.AI_PROVIDER}`);
  console.log(`- ENV.BAILIAN_API_KEY loaded: ${maskSecret(ENV.BAILIAN_API_KEY)}`);

  const diagnostics = getAiConfigDiagnostics();
  return {
    configured: true,
    maskedKey: maskSecret(trimmedKey),
    diagnostics
  };
}

/**
 * Formats the fileId using the official Bailian compatible file reference protocol
 */
export function buildBailianFileReference(fileId: string): string {
  return `fileid://${fileId}`;
}
