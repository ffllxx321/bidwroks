import fs from "fs";
import path from "path";

/**
 * UI Language Consistency Automated Scan Test
 */
async function runLanguageScan() {
  console.log("=== [STARTING UI LANGUAGE CONSISTENCY AUTOMATED SCAN] ===");

  const targetFiles = [
    "src/components/FileWorkflowPanel.tsx",
    "src/components/ProjectOverview.tsx",
    "src/components/RoleSwitcher.tsx",
    "src/components/TaskPlanningPanel.tsx",
    "src/components/TenderAnalysisPanel.tsx",
    "src/pages/ProjectMasterData/index.tsx",
    "src/pages/ProjectCreate/index.tsx"
  ];

  const forbiddenPatterns = [
    "(RFP NAME)",
    "(OWNER/CLIENT)",
    "(LOCATION)",
    "(STRUCTURAL/CATEGORY)",
    "RULE 1",
    "Status Tracker",
    "Area Source",
    "Duration Source",
    "Manual Integration Testing",
    "MILESTONES & TECHNICAL SCOPE CLAUSES",
    "(Sensitive)",
    "(Allow AI Read)",
    "(Parsing Text)",
    "(Run Parser)",
    "(AI Extraction)",
    "MASTER PROJECT CENSUS"
  ];

  let totalViolations = 0;

  for (const relPath of targetFiles) {
    const absPath = path.join(process.cwd(), relPath);
    if (!fs.existsSync(absPath)) {
      console.warn(`⚠️ Warning: Scan target file not found: ${relPath}`);
      continue;
    }

    const content = fs.readFileSync(absPath, "utf-8");
    
    // Clean out multi-line and single line comments to avoid throwing error for comments or imports
    const cleaned = content
      .replace(/\/\*[\s\S]*?\*\//g, "") // remove /* comments */
      .replace(/\/\/.*$/gm, "")         // remove // comments
      .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, ""); // remove imports

    for (const pattern of forbiddenPatterns) {
      if (cleaned.toLowerCase().includes(pattern.toLowerCase())) {
        // Find line number of the pattern in original content to help developers find it
        const lines = content.split("\n");
        const foundLines = lines
          .map((line, idx) => (line.toLowerCase().includes(pattern.toLowerCase()) ? idx + 1 : -1))
          .filter(idx => idx !== -1);

        console.error(`❌ Language Consistency Violation in ${relPath}:`);
        console.error(`   Found forbidden pattern: "${pattern}" on line(s): ${foundLines.join(", ")}`);
        totalViolations++;
      }
    }
  }

  if (totalViolations > 0) {
    throw new Error(`Rejected: Found ${totalViolations} UI language consistency violations. Please localize all unrequested English and mixed subtitles.`);
  }

  console.log("✅ SUCCESS: UI Language Consistency scan passed! All target views are compliant with Chinese user interface requirements.");
  console.log("=== [UI LANGUAGE CONSISTENCY CHECK COMPLETED] ===");
}

runLanguageScan().catch(err => {
  console.error("❌ UI LANGUAGE CONSISTENCY VERIFICATION REJECTED:", err.message);
  process.exit(1);
});
