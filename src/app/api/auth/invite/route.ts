import { createInvite, listInvites, requireOwner, revokeInvite } from "@/lib/auth";
import { badRequest, failed, ok, readJson } from "@/lib/api";

export async function GET() {
  try {
    await requireOwner();
    return ok({ invites: listInvites() });
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requireOwner();
    const body = await readJson<{ email?: string; role?: "owner" | "member" }>(
      request,
    );
    if (!body.email?.trim()) return badRequest("An email address is required.");

    const { token, expiresAt } = createInvite({
      email: body.email,
      role: body.role === "owner" ? "owner" : "member",
      invitedBy: owner.id,
    });

    // The token is returned once and never stored in plaintext; the owner
    // passes the link on however they like.
    return ok({ token, expiresAt, path: `/invite/${token}` }, 201);
  } catch (error) {
    return failed(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireOwner();
    const { id } = await readJson<{ id?: string }>(request);
    if (!id) return badRequest("Which invitation?");
    revokeInvite(id);
    return ok({ revoked: true });
  } catch (error) {
    return failed(error);
  }
}
