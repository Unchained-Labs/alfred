import { parseJobPosting } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { badRequest, failed, ok, readJson } from "@/lib/api";
import { runInteractive } from "@/lib/jobs/worker";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { raw } = await readJson<{ raw?: string }>(request);
    if (!raw || raw.trim().length < 40) {
      return badRequest("Paste more of the posting — Alfred needs the body text.");
    }

    // Through the queue's interactive lane: bounded like every other call, and
    // never behind a background pipeline.
    const { result, provider, model } = await runInteractive(
      { userId: user.id, kind: "parse_job", label: "Read a job posting" },
      () => parseJobPosting(user.id, raw),
    );
    return ok({ job: result, provider, model });
  } catch (error) {
    return failed(error);
  }
}
