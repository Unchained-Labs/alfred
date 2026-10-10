import { badRequest, failed, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createJobBoard } from "@/lib/mutations";
import { listJobBoards } from "@/lib/queries";

const PROVIDERS = ["greenhouse", "ashby"] as const;
type Provider = (typeof PROVIDERS)[number];

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ boards: listJobBoards(user.id) });
  } catch (error) {
    return failed(error);
  }
}

/**
 * Starts watching an employer's own job board.
 *
 * The slug is checked against the live board before it is stored. A wrong slug
 * is the single most likely mistake here and it fails silently otherwise —
 * the board simply never contributes anything, and there is nothing in the UI
 * to explain why.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<Record<string, unknown>>(request);

    const provider = String(body.provider ?? "") as Provider;
    if (!PROVIDERS.includes(provider)) {
      return badRequest(`Unknown board provider: ${String(body.provider)}`);
    }

    const slug = String(body.slug ?? "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/.*\//, "");
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(slug)) {
      return badRequest(
        "That does not look like a board name. Use the identifier from the board's URL, e.g. `monzo`.",
      );
    }

    const { fetchBoard } = await import("@/lib/discovery/sources");
    const probe = await fetchBoard({ provider, slug, label: slug });
    if (probe.error) {
      return badRequest(
        `No ${provider} board answered for “${slug}” (${probe.error}). Check the identifier in the board's own URL.`,
      );
    }
    if (!probe.postings.length) {
      return badRequest(
        `The ${provider} board “${slug}” answered but has no open roles, so there is nothing to watch yet.`,
      );
    }

    // The board knows its own name better than the user typing a slug does.
    const label =
      String(body.label ?? "").trim() ||
      probe.postings[0].company ||
      slug.replace(/[-_]/g, " ");

    const board = createJobBoard(user.id, { provider, slug, label });
    if (!board) return badRequest("You are already watching that board.");
    return ok({ board, openRoles: probe.postings.length }, 201);
  } catch (error) {
    return failed(error);
  }
}
