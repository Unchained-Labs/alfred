import { extractText, getDocumentProxy } from "unpdf";
import { InputError } from "@/lib/errors";

/** Upload ceiling. A CV that exceeds this is not a CV. */
export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

const PDF_MAGIC = "%PDF-";

export type ExtractedResume = {
  text: string;
  pages: number;
  /** What the file turned out to be, for the message shown to the user. */
  kind: "pdf" | "text";
};

/**
 * Collapses the artefacts a PDF text layer leaves behind: hyphenated line
 * breaks, single newlines inside a wrapped paragraph, and the blank-line
 * drifts that come from multi-column layouts.
 */
function tidy(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, "\n")
      .replace(/ /g, " ")
      // A word split across a line break by hyphenation.
      .replace(/(\w)-\n(\w)/g, "$1$2")
      // Bullet glyphs the text layer renders as isolated symbols.
      .replace(/^[•●▪·∙]\s*/gm, "- ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .trim()
  );
}

/** True when the buffer really is a PDF, whatever the filename claims. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 5)).toString("latin1") === PDF_MAGIC;
}

/**
 * Pulls text out of an uploaded CV.
 *
 * Only the text layer is read — a CV that is a scan or an exported image has no
 * text to extract, and that is reported rather than silently producing an empty
 * profile. OCR is deliberately out of scope.
 */
export async function extractResumeText(
  bytes: Uint8Array,
  filename: string,
): Promise<ExtractedResume> {
  if (bytes.byteLength === 0) {
    throw new InputError("That file is empty.");
  }
  if (bytes.byteLength > MAX_RESUME_BYTES) {
    throw new InputError(
      `That file is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_RESUME_BYTES / 1024 / 1024} MB.`,
    );
  }

  if (!looksLikePdf(bytes)) {
    // Plain text and markdown are useful enough to accept directly.
    if (/\.(txt|md|markdown)$/i.test(filename)) {
      const text = tidy(Buffer.from(bytes).toString("utf8"));
      if (text.length < 120) {
        throw new InputError("That file has almost no text in it.");
      }
      return { text, pages: 1, kind: "text" };
    }
    throw new InputError(
      "That does not look like a PDF. Upload a PDF, or paste the text into the résumé field.",
    );
  }

  let text: string;
  let pages: number;
  try {
    const pdf = await getDocumentProxy(bytes);
    pages = pdf.numPages;
    const extracted = await extractText(pdf, { mergePages: true });
    text = tidy(
      Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text,
    );
  } catch (error) {
    throw new InputError(
      `That PDF could not be read: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  // A scanned CV parses fine and yields nothing. Say so, rather than handing
  // the model an empty string and returning a blank profile.
  if (text.length < 200) {
    throw new InputError(
      pages > 0 && text.length === 0
        ? "That PDF has no text layer — it is probably a scan or an exported image. Export it as a text PDF, or paste the text in instead."
        : "There was almost no readable text in that PDF.",
    );
  }

  return { text, pages, kind: "pdf" };
}
