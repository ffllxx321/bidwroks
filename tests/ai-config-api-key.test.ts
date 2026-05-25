import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { upsertEnvValue, maskSecret } from "../backend/src/config/ai-runtime-config.ts";

function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bidworks-ai-config-"));
  const envPath = path.join(dir, ".env");

  fs.writeFileSync(envPath, "APP_ENV=development\nAI_PROVIDER=bailian\n", "utf8");
  upsertEnvValue(envPath, "DASHSCOPE_API_KEY", "sk-test-1234567890");

  const updated = fs.readFileSync(envPath, "utf8");
  assert.match(updated, /^APP_ENV=development$/m);
  assert.match(updated, /^AI_PROVIDER=bailian$/m);
  assert.match(updated, /^DASHSCOPE_API_KEY=sk-test-1234567890$/m);
  assert.equal(maskSecret("sk-test-1234567890"), "sk-t**********7890");
  assert.equal(maskSecret(""), "");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log("AI config API key helper test passed.");
}

run();
