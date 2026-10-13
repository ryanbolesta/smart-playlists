import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getLostAndFoundPreview, PreviewInputError } from "../../../../../lib/lost-and-found-preview";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to preview Lost & Found." }, { status: 401 });
  try {
    return Response.json(await getLostAndFoundPreview(user.userId, request));
  } catch (error) {
    const status = error instanceof PreviewInputError ? 409 : 502;
    console.error("Lost & Found preview failed", { message: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: error instanceof Error ? error.message : "Could not preview Lost & Found." }, { status });
  }
}
