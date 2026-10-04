import { requireUser } from "@/lib/auth";
import { failed, notFound, ok } from "@/lib/api";
import { ignoreMail } from "@/lib/mutations";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const mail = ignoreMail(user.id, id);
    if (!mail) return notFound("Email not found.");
    return ok({ mail });
  } catch (error) {
    return failed(error);
  }
}
