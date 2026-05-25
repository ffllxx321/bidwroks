import { upsertEnvValue, maskSecret, buildBailianFileReference } from "../backend/src/config/ai-runtime-config.ts";

/**
 * AI Runtime Configuration & Util Security Verification Test Suite
 */
async function runAiConfigTests() {
  console.log("=== [STARTING AI RUNTIME ENVIRONMENT & UTIL TEST SUITE] ===");

  // 1. Test upsertEnvValue does not break other .env entries and successfully adds/replaces DASHSCOPE_API_KEY
  console.log("Testing upsertEnvValue helper function...");
  const initialEnv = [
    "# Pre-existing variables",
    "APP_ENV=development",
    "APP_PORT=3000",
    "DASHSCOPE_API_KEY=old-api-key",
    "OTHER_CONFIG=true",
    "# End of configuration"
  ].join("\n");

  const expectedEnvWithNewKey = [
    "# Pre-existing variables",
    "APP_ENV=development",
    "APP_PORT=3000",
    "DASHSCOPE_API_KEY=new-configured-secret-key-123456",
    "OTHER_CONFIG=true",
    "# End of configuration"
  ].join("\n");

  const outputEnv1 = upsertEnvValue(initialEnv, "DASHSCOPE_API_KEY", "new-configured-secret-key-123456");
  
  if (outputEnv1.trim() !== expectedEnvWithNewKey.trim()) {
    throw new Error(`upsertEnvValue replacement failure!\nExpected:\n${expectedEnvWithNewKey}\nGot:\n${outputEnv1}`);
  }

  // Testing creating a fresh key-value pair if it doesn't exist
  const envWithoutKey = [
    "APP_ENV=development",
    "APP_PORT=3000"
  ].join("\n");

  const outputEnv2 = upsertEnvValue(envWithoutKey, "DASHSCOPE_API_KEY", "secret-key-xyz");
  if (!outputEnv2.includes("DASHSCOPE_API_KEY=secret-key-xyz")) {
    throw new Error(`upsertEnvValue fail to append new key. Got:\n${outputEnv2}`);
  }
  if (!outputEnv2.includes("APP_ENV=development") || !outputEnv2.includes("APP_PORT=3000")) {
    throw new Error("upsertEnvValue core structural preservation failure: other values destroyed.");
  }
  console.log("✅ upsertEnvValue tests completed successfully.");

  // 2. Test maskSecret does not return the full secret API key
  console.log("Testing maskSecret helper function...");
  const testKey = "sk-dash-1234567890abcdef";
  const masked = maskSecret(testKey);
  console.log(`- Test Key: "${testKey}" -> Masked: "${masked}"`);

  if (masked === testKey) {
    throw new Error("Security check failed: maskSecret returned the full unmasked key.");
  }
  if (!masked.startsWith("sk-d") || !masked.endsWith("cdef") || !masked.includes("****")) {
    throw new Error("Security check failed: masked pattern is malformed.");
  }

  const shortKey = "1234";
  const shortMasked = maskSecret(shortKey);
  if (shortMasked === shortKey) {
    throw new Error("Security check failed: short key maskSecret returned the full key.");
  }
  console.log("✅ maskSecret tests completed successfully.");

  // 3. Test buildBailianFileReference returns official protocol URI
  console.log("Testing buildBailianFileReference URI conversion helper...");
  const sampleFileId = "file-fe-abc1234abcd";
  const uri = buildBailianFileReference(sampleFileId);
  console.log(`- fileId: "${sampleFileId}" -> URI: "${uri}"`);

  if (uri !== `fileid://${sampleFileId}`) {
    throw new Error(`buildBailianFileReference failure! Expected: "fileid://${sampleFileId}", Got: "${uri}"`);
  }
  console.log("✅ buildBailianFileReference tests completed successfully.");

  console.log("=== [ALL AI RUNTIME ENVIRONMENT & UTIL TESTS PASSED!] ===");
}

runAiConfigTests().catch(err => {
  console.error("❌ Test Suite Aborted due to an assertion error:", err);
  process.exit(1);
});
