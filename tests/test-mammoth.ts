import mammoth from "mammoth";
import fs from "fs";

async function testMammoth() {
  console.log("=== [TESTING MAMMOTH DOCX EXTRACTOR] ===");
  try {
    // Check if mammoth can run on an empty buffer or simple word buffer
    const dummyBuffer = Buffer.from("");
    const result = await mammoth.extractRawText({ buffer: dummyBuffer });
    console.log("Mammoth run success:", result.value);
  } catch (err: any) {
    console.error("Mammoth failed:", err);
  }
}

testMammoth();
