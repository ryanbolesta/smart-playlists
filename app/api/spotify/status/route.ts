import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { spotifyConnections } from "../../../../db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ connected: false }, { status: 401 });

  try {
    const connection = await getDb().query.spotifyConnections.findFirst({
      columns: { userId: true },
      where: eq(spotifyConnections.userId, user.userId),
    });

    return Response.json({ connected: Boolean(connection) });
  } catch {
    return Response.json(
      { connected: false, error: "Connection status is temporarily unavailable." },
      { status: 503 },
    );
  }
}
