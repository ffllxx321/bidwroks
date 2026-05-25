import fs from "fs";
import mammoth from "mammoth";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
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
      // pdf-parse options to identify sheet separators (form feed \u000c is standard)
      const data = await pdfParse(buffer);
      const rawText = data.text || "";
      
      // Page division using form feeds
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
  } catch (error: any) {
    console.error(`[DOCUMENT_PARSER_ERROR] Failed parsing ${fileType} file:`, error);
    throw new Error(`文件解析失败: ${error.message}`);
  }

  return chunks;
}
