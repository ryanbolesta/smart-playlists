import { eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { spotifyConnections } from "../../../../db/schema";
import { decryptSpotifyToken } from "../../../../lib/spotify";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ connected: false }, { status: 401 });

  try {
    const db = getDb();
    const connection = await db.query.spotifyConnections.findFirst({
      where: eq(spotifyConnections.userId, user.userId),
    });

    if (!connection) return Response.json({ connected: false });

    let profile = {
      displayName: connection.spotifyDisplayName,
      imageUrl: connection.spotifyProfileImageUrl,
    };

    if (!connection.spotifyUserId) {
      try {
        const accessToken = await decryptSpotifyToken(connection.accessTokenCiphertext);
        const response = await fetch("https://api.spotify.com/v1/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.ok) {
          const spotifyProfile = (await response.json()) as {
            id?: string;
            display_name?: string | null;
            images?: Array<{ url?: string }>;
          };
          profile = {
            displayName: spotifyProfile.display_name ?? null,
            imageUrl: spotifyProfile.images?.find((image) => image.url)?.url ?? null,
          };
          await db
            .update(spotifyConnections)
            .set({
              spotifyUserId: spotifyProfile.id ?? null,
              spotifyDisplayName: profile.displayName,
              spotifyProfileImageUrl: profile.imageUrl,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(spotifyConnections.userId, user.userId));
        }
      } catch {
        // The connection remains valid even when profile enrichment is unavailable.
      }
    }

    return Response.json({ connected: true, ...profile });
  } catch {
    return Response.json(
      { connected: false, error: "Connection status is temporarily unavailable." },
      { status: 503 },
    );
  }
}
