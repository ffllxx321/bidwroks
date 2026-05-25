import { execSync } from "child_process";

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${message}`);
  }
}

async function runPostgresPolicyTests() {
  console.log("====================================================================");
  console.log("🚀 [START] POSTGRESQL ENVIRONMENT CONNECTION POLICY TESTS");
  console.log("====================================================================\n");

  // TestCase 1: APP_ENV=pilot and empty/missing DATABASE_URL
  console.log("--> TestCase 1: pilot environment with NO DATABASE_URL should throw fatal error...");
  try {
    execSync("npx tsx backend/src/database/db.ts", {
      env: { ...process.env, APP_ENV: "pilot", DATABASE_URL: "" },
      stdio: "pipe"
    });
    assert(false, "Should have thrown a fatal error in pilot environment!");
  } catch (error: any) {
    const stderr = error.stderr?.toString() || "";
    const stdout = error.stdout?.toString() || "";
    const message = error.message || "";
    const combinedOutput = stderr + "\n" + stdout + "\n" + message;
    
    assert(
      combinedOutput.includes("启动失败：试点和生产环境必须使用 PostgreSQL，请检查 DATABASE_URL。"),
      `Expected specific error message, got: ${combinedOutput}`
    );
    console.log("  ✓ Correctly threw the expected PostgreSQL requirement error.");
  }

  // TestCase 2: APP_ENV=production and SQLite DATABASE_URL
  console.log("--> TestCase 2: production environment with SQLite DATABASE_URL should throw fatal error...");
  try {
    execSync("npx tsx backend/src/database/db.ts", {
      env: { ...process.env, APP_ENV: "production", DATABASE_URL: "sqlite://./foo.db" },
      stdio: "pipe"
    });
    assert(false, "Should have thrown a fatal error in production environment with sqlite!");
  } catch (error: any) {
    const stderr = error.stderr?.toString() || "";
    const stdout = error.stdout?.toString() || "";
    const message = error.message || "";
    const combinedOutput = stderr + "\n" + stdout + "\n" + message;
    
    assert(
      combinedOutput.includes("启动失败：试点和生产环境必须使用 PostgreSQL，请检查 DATABASE_URL。"),
      `Expected specific error message under production-sqlite, got: ${combinedOutput}`
    );
    console.log("  ✓ Correctly blocked SQLite in production environment.");
  }

  // TestCase 3: APP_ENV=development and empty DATABASE_URL
  console.log("--> TestCase 3: development environment with NO DATABASE_URL should log SQLite fallback successfully...");
  try {
    const result = execSync("npx tsx backend/src/database/db.ts", {
      env: { ...process.env, APP_ENV: "development", DATABASE_URL: "" },
      stdio: "pipe"
    });
    const stdout = result.toString();
    assert(
      stdout.includes("当前为 development 环境，正在使用 SQLite 作为本地开发数据库。"),
      `Expected SQLite fallback message in development, got: ${stdout}`
    );
    console.log("  ✓ Correctly allowed SQLite log message in development.");
  } catch (error: any) {
    const stderr = error.stderr?.toString() || "";
    const stdout = error.stdout?.toString() || "";
    assert(false, `Should NOT have thrown an error in development fallback! Stderr: ${stderr}, Stdout: ${stdout}`);
  }

  console.log("\n====================================================================");
  console.log("💚 [SUCCESS] ALL POSTGRESQL POLICY ENVIRONMENT TESTS PASSED VERIFIED!");
  console.log("====================================================================\n");
}

runPostgresPolicyTests().catch(error => {
  console.error("❌ Postgres Policy Test Failed:", error);
  process.exit(1);
});
