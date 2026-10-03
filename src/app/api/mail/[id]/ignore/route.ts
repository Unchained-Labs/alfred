import { failed, notFound, ok } from "@/lib/api";
import { ignoreMail } from "@/lib/mutations";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const mail = ignoreMail(id);
    if (!mail) return notFound("Email not found.");
    return ok({ mail });
  } catch (error) {
    return failed(error);
  }
}
