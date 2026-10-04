import { acceptInvite, createSession } from "@/lib/auth";
import { badRequest, failed, ok, readJson } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      token?: string;
      name?: string;
      password?: string;
    }>(request);
    if (!body.token) return badRequest("That invitation link is incomplete.");

    const user = await acceptInvite({
      token: body.token,
      name: body.name ?? "",
      password: body.password ?? "",
    });

    await createSession(user.id, request.headers.get("user-agent"));
    return ok({ user: { id: user.id, email: user.email } }, 201);
  } catch (error) {
    return failed(error);
  }
}
