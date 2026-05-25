import dotenv from "dotenv";
dotenv.config();

const rawProvider = (process.env.AI_PROVIDER || "").toLowerCase().trim();
const hasBailian = !!(process.env.BAILIAN_API_KEY || "").trim();
const hasDashscope = !!(process.env.DASHSCOPE_API_KEY || "").trim();
const hasAnyBailianKey = hasBailian || hasDashscope;

// Automatically promote to bailian if keys are supplied but provider is either empty or defaulted to mock
const resolvedProvider = (rawProvider === "bailian" || (rawProvider === "" && hasAnyBailianKey) || (rawProvider === "mock" && hasAnyBailianKey))
  ? "bailian"
  : (rawProvider || "bailian");

export const ENV = {
  APP_ENV: process.env.APP_ENV || "development",
  APP_PORT: Number(process.env.APP_PORT || 3000),
  DATABASE_URL: process.env.DATABASE_URL || "sqlite://:memory:",
  FILE_STORAGE_PATH: process.env.FILE_STORAGE_PATH || "./storage",
  JWT_SECRET: process.env.JWT_SECRET || "bidworks-secret-signature",
  AI_PROVIDER: resolvedProvider,
  MINIMAX_API_KEY: process.env.MINIMAX_API_KEY || "",
  AI_ENABLE_SENSITIVE_READ: process.env.AI_ENABLE_SENSITIVE_READ === "true",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  
  // Alibaba Model Studio (Bailian) Configurations
  BAILIAN_API_KEY: (process.env.BAILIAN_API_KEY || process.env.DASHSCOPE_API_KEY || "").trim(),
  BAILIAN_BASE_URL: process.env.BAILIAN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
  BAILIAN_MODEL: process.env.BAILIAN_MODEL || "qwen3.6-35b-a3b",
  BAILIAN_FALLBACK_MODEL: process.env.BAILIAN_FALLBACK_MODEL || "qwen3.6-plus",
  AI_REQUEST_TIMEOUT_MS: Number(process.env.AI_REQUEST_TIMEOUT_MS || 120000),
  AI_MAX_INPUT_CHUNKS: Number(process.env.AI_MAX_INPUT_CHUNKS || 20),
  AI_MAX_OUTPUT_TOKENS: Number(process.env.AI_MAX_OUTPUT_TOKENS || 4096),
};

// Console output desensitized config summary for real-time runtime diagnostics
console.log("\n[AI CONFIG]");
console.log(`AI_PROVIDER=${ENV.AI_PROVIDER}`);
console.log(`BAILIAN_API_KEY configured=${hasBailian}`);
console.log(`DASHSCOPE_API_KEY configured=${hasDashscope}`);
console.log(`resolvedApiKey configured=${hasAnyBailianKey}`);
console.log(`BAILIAN_BASE_URL=${ENV.BAILIAN_BASE_URL}`);
console.log(`BAILIAN_MODEL=${ENV.BAILIAN_MODEL}`);
console.log(`RUN_BAILIAN_LIVE_TEST=${process.env.RUN_BAILIAN_LIVE_TEST || "false"}`);
console.log(`APP_ENV=${ENV.APP_ENV}\n`);

