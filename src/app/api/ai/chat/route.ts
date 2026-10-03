import { chatStream } from "@/lib/ai";
import { badRequest, failed, readJson } from "@/lib/api";
import { getApplication, getLatestAnalysis } from "@/lib/queries";

type ChatTurn = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      applicationId?: string;
      question?: string;
      history?: ChatTurn[];
    }>(request);

    const question = body.question?.trim();
    if (!question) return badRequest("Ask Alfred something.");

    const application = body.applicationId
      ? (getApplication(body.applicationId) ?? null)
      : null;
    const analysis = application ? getLatestAnalysis(application.id) : null;

    const chunks = chatStream(
      application,
      analysis,
      body.history ?? [],
      question,
    );

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (error) {
          // The response has already begun, so the only way to report a
          // mid-stream failure is to write it into the body.
          const message =
            error instanceof Error ? error.message : "The provider failed.";
          controller.enqueue(encoder.encode(`\n\n_Alfred stopped: ${message}_`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return failed(error);
  }
}
