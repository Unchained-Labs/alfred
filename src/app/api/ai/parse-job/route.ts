import { parseJobPosting } from "@/lib/ai";
import { badRequest, failed, ok, readJson } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const { raw } = await readJson<{ raw?: string }>(request);
    if (!raw || raw.trim().length < 40) {
      return badRequest("Paste more of the posting — Alfred needs the body text.");
    }

    const { result, provider, model } = await parseJobPosting(raw);
    return ok({ job: result, provider, model });
  } catch (error) {
    return failed(error);
  }
}
