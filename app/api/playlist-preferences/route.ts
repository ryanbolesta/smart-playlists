import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { playlistPreferences } from "../../../db/schema";

const PLAYLIST_IDS = new Set([
  "recently-added",
  "lost-and-found",
  "time-capsule",
  "recently-played",
]);

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to save your playlist choices." }, { status: 401 });

  try {
    const body = (await request.json()) as { selectedPlaylistIds?: unknown };
    const selectedPlaylistIds = Array.isArray(body.selectedPlaylistIds)
      ? [...new Set(body.selectedPlaylistIds.filter((id): id is string => typeof id === "string" && PLAYLIST_IDS.has(id)))]
      : [];

    if (selectedPlaylistIds.length === 0) {
      return Response.json({ error: "Choose at least one playlist." }, { status: 400 });
    }

    const now = new Date().toISOString();
    await getDb()
      .insert(playlistPreferences)
      .values({
        userId: user.userId,
        selectedPlaylistIds: JSON.stringify(selectedPlaylistIds),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: playlistPreferences.userId,
        set: { selectedPlaylistIds: JSON.stringify(selectedPlaylistIds), updatedAt: now },
      });

    return Response.json({ selectedPlaylistIds });
  } catch {
    return Response.json({ error: "Could not save playlist choices." }, { status: 503 });
  }
}
