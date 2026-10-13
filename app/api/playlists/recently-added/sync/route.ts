import { getChatGPTUser } from "../../../../chatgpt-auth";
import { SyncInProgressError, SyncInputError, syncRecentlyLikedForUser } from "../../../../../lib/recently-liked-sync";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to sync your playlist." }, { status: 401 });

  try {
    return Response.json(await syncRecentlyLikedForUser(user.userId, request));
  } catch (error) {
    const status = error instanceof SyncInputError || error instanceof SyncInProgressError ? 409 : 502;
    console.error("Recently Liked sync failed", { message: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: error instanceof Error ? error.message : "Could not sync Recently Liked." }, { status });
  }
}
