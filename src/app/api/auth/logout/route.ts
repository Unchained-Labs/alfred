import { destroySession } from "@/lib/auth";
import { failed, ok } from "@/lib/api";

export async function POST() {
  try {
    await destroySession();
    return ok({ signedOut: true });
  } catch (error) {
    return failed(error);
  }
}
