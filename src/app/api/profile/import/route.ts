import { parseResume } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { badRequest, failed, ok } from "@/lib/api";
import { extractResumeText, MAX_RESUME_BYTES } from "@/lib/resume";

// The PDF text layer is read in-process, so this needs the Node runtime.
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData().catch(() => null);
    if (!form) return badRequest("Send the CV as multipart form data.");

    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("No file was uploaded.");
    if (file.size > MAX_RESUME_BYTES) {
      return badRequest(
        `That file is too large. The limit is ${MAX_RESUME_BYTES / 1024 / 1024} MB.`,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractResumeText(bytes, file.name);

    const { result, provider, model } = await parseResume(user.id, extracted.text);

    return ok({
      profile: result,
      source: {
        filename: file.name,
        kind: extracted.kind,
        pages: extracted.pages,
        characters: extracted.text.length,
      },
      provider,
      model,
    });
  } catch (error) {
    return failed(error);
  }
}
