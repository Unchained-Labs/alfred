import { failed, notFound } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { asHandbookContent, renderHandbook } from "@/lib/handbook/render";
import { getApplication, getHandbook } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

/**
 * Serves the handbook itself.
 *
 * A route handler rather than a page, because a handbook is a whole HTML
 * document — its own stylesheet, its own script, its own typography — and
 * wrapping it in the app's layout would put a sidebar around a study guide.
 * The same bytes serve the browser and the download, so what the reader keeps
 * is exactly what they read.
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const row = getHandbook(user.id, id);
    if (!row) return notFound("No handbook for this application yet.");

    const content = asHandbookContent(row.content);
    if (!content) {
      return notFound(
        "This handbook's content could not be read. Generate it again.",
      );
    }

    const app = getApplication(user.id, id);
    const html = renderHandbook(content, {
      id: row.id,
      company: app?.company ?? "Alfred",
      role: app?.title ?? "this role",
      generatedAt: row.createdAt ?? new Date(),
      provider: row.provider,
      model: row.model,
    });

    const download = new URL(request.url).searchParams.get("download") === "1";
    const slug = (app?.company ?? "handbook")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Never cached by a shared cache: it is one account's study notes.
        "cache-control": "private, no-store",
        ...(download
          ? {
              "content-disposition": `attachment; filename="${slug || "handbook"}-handbook.html"`,
            }
          : {}),
      },
    });
  } catch (error) {
    return failed(error);
  }
}
