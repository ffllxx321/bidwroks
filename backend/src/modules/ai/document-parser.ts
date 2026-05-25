import fs from "fs";
import mammoth from "mammoth";
import { createRequire } from "module";

// Safe Require helper to support ES bundle and CommonJS environments seamlessly
let pdfParse: any;
try {
  if (typeof require !== "undefined") {
    pdfParse = require("pdf-parse");
  } else {
    const metaUrl = (typeof import.meta !== "undefined" && import.meta.url) || "file:///";
    pdfParse = createRequire(metaUrl)("pdf-parse");
  }
} catch (err) {
  const metaUrl = (typeof import.meta !== "undefined" && import.meta.url) || "file:///";
  pdfParse = createRequire(metaUrl)("pdf-parse");
}

import db from "../../database/db.ts";

export interface ParsedChunk {
  pageNumber: number;
  paragraphIndex: number;
  textContent: string;
}

/**
 * Parses tender document files and segments text into page/paragraph chunks
 */
export async function parseDocumentToChunks(
  filePath: string,
  fileType: "pdf" | "docx"
): Promise<ParsedChunk[]> {
  const buffer = fs.readFileSync(filePath);
  const chunks: ParsedChunk[] = [];

  try {
    if (fileType === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      const rawText = result.value || "";
      // Docx does not have explicit physical page breaks, so segment into paragraphs as page 1
      const paragraphs = rawText
        .split(/\r?\n/)
        .map(p => p.trim())
        .filter(p => p.length > 0);

      paragraphs.forEach((para, idx) => {
        chunks.push({
          pageNumber: 1,
          paragraphIndex: idx + 1,
          textContent: para
        });
      });
    } else if (fileType === "pdf") {
      let extractedWithNewClass = false;

      if (pdfParse && typeof pdfParse.PDFParse === "function") {
        console.log("[DOCUMENT-PARSER] Invoking new class-based PDFParse extracted pages flow...");
        const parser = new pdfParse.PDFParse({ data: buffer });
        try {
          const textResult = await parser.getText();
          if (textResult && Array.isArray(textResult.pages)) {
            for (const page of textResult.pages) {
              const paragraphs = page.text
                .split(/\r?\n/)
                .map(p => p.trim())
                .filter(p => p.length > 0);

              let paraIdx = 1;
              for (const para of paragraphs) {
                chunks.push({
                  pageNumber: page.num,
                  paragraphIndex: paraIdx,
                  textContent: para
                });
                paraIdx++;
              }
            }
            extractedWithNewClass = true;
          }
        } finally {
          await parser.destroy().catch(() => {});
        }
      }

      if (!extractedWithNewClass) {
        console.log("[DOCUMENT-PARSER] Falling back to standard/legacy pdfParse function flow...");
        let rawText = "";
        let parsedData: any;

        if (typeof pdfParse === "function") {
          parsedData = await pdfParse(buffer);
        } else if (pdfParse && typeof pdfParse.default === "function") {
          parsedData = await pdfParse.default(buffer);
        } else {
          throw new Error("Cannot find a valid pdf-parse function or constructor.");
        }

        rawText = parsedData?.text || "";
        const pages = rawText.split("\u000c");
        let pageNum = 1;

        for (const pageText of pages) {
          const paragraphs = pageText
            .split(/\r?\n/)
            .map(p => p.trim())
            .filter(p => p.length > 0);

          let paraIdx = 1;
          for (const para of paragraphs) {
            chunks.push({
              pageNumber: pageNum,
              paragraphIndex: paraIdx,
              textContent: para
            });
            paraIdx++;
          }
          pageNum++;
        }
      }
    }
  } catch (error: any) {
    console.error(`[DOCUMENT_PARSER_ERROR] Failed parsing ${fileType} file:`, error);
    throw new Error(`文件解析失败: ${error.message}`);
  }

  return chunks;
}
