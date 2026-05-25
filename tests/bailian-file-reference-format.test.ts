import assert from "node:assert/strict";
import { buildBailianFileReference } from "../backend/src/modules/ai/bailian-file-service.ts";

function run() {
  assert.equal(
    buildBailianFileReference("file-fe-abc123"),
    "fileid://file-fe-abc123",
    "Qwen-Long file references must use DashScope's fileid:// scheme"
  );

  console.log("Bailian file reference format test passed.");
}

run();
