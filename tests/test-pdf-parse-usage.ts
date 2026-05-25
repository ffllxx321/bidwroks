import { createRequire } from "module";

const requireHelper = createRequire(import.meta.url);
const { PDFParse } = requireHelper("pdf-parse");

async function run() {
  try {
    const dummyBuffer = Buffer.from("%PDF-1.4..."); // not a real pdf, but let's see construct
    const pdfParserObj = new PDFParse({ data: dummyBuffer });
    console.log("PDFParse instanced successfully!");
    // text extract
    const textResult = await pdfParserObj.getText();
    console.log("Got textResult:", typeof textResult);
  } catch (err: any) {
    console.log("Caught standard error as expected:", err.message);
  }
}

run();
