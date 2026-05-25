import fs from "fs";
import path from "path";

/**
 * UI Visual Style & Consistency Automated Scan Test
 */
async function runVisualScan() {
  console.log("=== [STARTING UI VISUAL STYLE & CONSISTENCY AUTOMATED SCAN] ===");

  const targetFiles = [
    "src/index.css",
    "src/App.tsx",
    "src/components/FileWorkflowPanel.tsx",
    "src/components/ProjectOverview.tsx",
    "src/components/RoleSwitcher.tsx",
    "src/components/TaskPlanningPanel.tsx",
    "src/components/TenderAnalysisPanel.tsx",
    "src/pages/ProjectMasterData/index.tsx",
    "src/pages/ProjectCreate/index.tsx",
    "src/pages/Login/index.tsx",
    "src/pages/Projects/index.tsx"
  ];

  // Forbidden styling classes or pattern indicators representing the previous "rough/brutalist orange" theme
  const forbiddenPatterns = [
    "border-black",
    "border-neutral-950",
    "shadow-[8px_8px",
    "shadow-[6px_6px"
  ];

  // Forbidden orange brand representation in CSS style variables or hex values
  const cssForbiddenColors = [
    "#E46A1A", // old brand color
  ];

  let totalViolations = 0;

  // 1. Scan target files for brutalist styled elements
  for (const relPath of targetFiles) {
    const absPath = path.join(process.cwd(), relPath);
    if (!fs.existsSync(absPath)) {
      console.warn(`⚠️ Warning: Scan target file not found: ${relPath}`);
      continue;
    }

    const content = fs.readFileSync(absPath, "utf-8");
    const cleaned = content
      .replace(/\/\*[\s\S]*?\*\//g, "") // remove /* comments */
      .replace(/\/\/.*$/gm, "")         // remove // comments
      .replace(/import\s+[\s\S]*?\s+from\s+['"].*?['"];?/g, ""); // remove imports

    // Check brutalist borders/shadows
    for (const pattern of forbiddenPatterns) {
      if (cleaned.includes(pattern)) {
        const lines = content.split("\n");
        const foundLines = lines
          .map((line, idx) => (line.includes(pattern) ? idx + 1 : -1))
          .filter(idx => idx !== -1);

        console.error(`❌ Visual Style Violation in ${relPath}:`);
        console.error(`   Found brutalist/rough pattern "${pattern}" on line(s): ${foundLines.join(", ")}`);
        totalViolations++;
      }
    }

    // Check for hardcoded old orange hexes
    if (relPath !== "src/index.css") {
      // Allow cssForbiddenColors inside index.css under specific contexts or comments but reject in general components
      for (const color of cssForbiddenColors) {
        if (cleaned.includes(color)) {
          console.error(`❌ Color Palette Violation in ${relPath}:`);
          console.error(`   Found hardcoded old orange hex color: "${color}"`);
          totalViolations++;
        }
      }
    }
  }

  // 2. Scan index.css contents to verify CSS variables are updated to Brand Blue (#1F5F8B)
  const cssPath = path.join(process.cwd(), "src/index.css");
  if (fs.existsSync(cssPath)) {
    const cssContent = fs.readFileSync(cssPath, "utf-8");
    if (cssContent.includes("--brand: #E46A1A") || cssContent.includes("--brand: #E46A1A")) {
      console.error(`❌ Style Variable Failure in src/index.css: --brand is still old orange.`);
      totalViolations++;
    }
    const hasNewBrandColor = cssContent.includes("#1F5F8B");
    if (!hasNewBrandColor) {
      console.error(`❌ Style Variable Failure in src/index.css: New blue-gray brand color (#1F5F8B) not defined.`);
      totalViolations++;
    }
  }

  if (totalViolations > 0) {
    throw new Error(`Rejected: Found ${totalViolations} UI visual style consistency violations. All brutalist borders or orange colors must be removed.`);
  }

  console.log("✅ SUCCESS: UI Visual Style consistency scan passed! Brand colors are blue-gray engineering corporate theme.");
  console.log("=== [UI VISUAL STYLE VERIFICATION COMPLETED] ===");
}

runVisualScan().catch(err => {
  console.error("❌ UI VISUAL STYLE VERIFICATION REJECTED:", err.message);
  process.exit(1);
});
