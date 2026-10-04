import { createSession, findUserByEmail } from "@/lib/auth";
import { failed, ok, readJson } from "@/lib/api";
import { verifyPassword } from "@/lib/passwords";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ email?: string; password?: string }>(request);
    const user = findUserByEmail(body.email ?? "");

    // Verify even when the account is missing, so a wrong address and a wrong
    // password take the same time and cannot be told apart.
    const hash =
      user?.passwordHash ??
      "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
    const valid = await verifyPassword(body.password ?? "", hash);

    if (!user || !valid || user.disabledAt) {
      return NextResponse.json(
        { error: "Those details do not match an account.", code: "unauthorized" },
        { status: 401 },
      );
    }

    await createSession(user.id, request.headers.get("user-agent"));
    return ok({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    return failed(error);
  }
}
