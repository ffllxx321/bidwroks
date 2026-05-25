import { createRequire } from "module";

const requireHelper = createRequire(import.meta.url);
const pdfCjs = requireHelper("pdf-parse");
console.log("CJS pdfCjs type:", typeof pdfCjs);
for (const key of Object.keys(pdfCjs)) {
  console.log(`- pdfCjs[${key}] type:`, typeof pdfCjs[key]);
}
