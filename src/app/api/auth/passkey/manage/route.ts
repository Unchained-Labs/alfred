import { failed, ok, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { deletePasskey, listPasskeys, renamePasskey } from "@/lib/passkeys";

/** The passkeys on the signed-in account. Never anybody else's. */
export async function GET() {
  try {
    const user = await requireUser();
    return ok({ passkeys: listPasskeys(user.id) });
  } catch (error) {
    return failed(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ id?: string; name?: string }>(request);
    if (!body.id) throw new Error("Missing passkey id");
    renamePasskey(user.id, body.id, body.name ?? "");
    return ok({ passkeys: listPasskeys(user.id) });
  } catch (error) {
    return failed(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ id?: string }>(request);
    if (!body.id) throw new Error("Missing passkey id");
    deletePasskey(user, body.id);
    return ok({ passkeys: listPasskeys(user.id) });
  } catch (error) {
    return failed(error);
  }
}
