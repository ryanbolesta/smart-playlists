import { and, eq } from "drizzle-orm";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { managedPlaylists, playlistPreferences, spotifyConnections } from "../../../../../db/schema";
import {
  decryptSpotifyToken,
  encryptSpotifyToken,
  getSpotifyConfig,
  refreshSpotifyAccessToken,
} from "../../../../../lib/spotify";

const PRESET_ID = "recently-added";

type SavedTracksResponse = {
  items?: Array<{ track?: { uri?: string | null } | null }>;
};

type CreatedPlaylist = {
  id?: string;
  external_urls?: { spotify?: string };
};

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in to sync your playlist." }, { status: 401 });

  try {
    const db = getDb();
    const [connection, preferences] = await Promise.all([
      db.query.spotifyConnections.findFirst({ where: eq(spotifyConnections.userId, user.userId) }),
      db.query.playlistPreferences.findFirst({ where: eq(playlistPreferences.userId, user.userId) }),
    ]);

    if (!connection) {
      return Response.json({ error: "Connect Spotify before syncing." }, { status: 409 });
    }
    if (!includesRecentlyAdded(preferences?.selectedPlaylistIds)) {
      return Response.json({ error: "Add Recently Added to your selection before syncing." }, { status: 409 });
    }

    const accessToken = await getAccessToken(connection, request);
    const tracksResponse = await spotifyFetch("https://api.spotify.com/v1/me/tracks?limit=50", accessToken);
    const savedTracks = (await tracksResponse.json()) as SavedTracksResponse;
    const uris = (savedTracks.items ?? [])
      .map((item) => item.track?.uri)
      .filter((uri): uri is string => typeof uri === "string" && uri.startsWith("spotify:track:"));

    let playlist = await db.query.managedPlaylists.findFirst({
      where: and(eq(managedPlaylists.userId, user.userId), eq(managedPlaylists.presetId, PRESET_ID)),
    });
    let created = false;

    if (!playlist) {
      const createResponse = await spotifyFetch("https://api.spotify.com/v1/me/playlists", accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Recently Added",
          description: "Managed by Smart Playlists · your 50 newest liked songs.",
          public: false,
          collaborative: false,
        }),
      });
      const createdPlaylist = (await createResponse.json()) as CreatedPlaylist;
      if (!createdPlaylist.id) throw new Error("Spotify did not return the new playlist.");

      const now = new Date().toISOString();
      playlist = {
        userId: user.userId,
        presetId: PRESET_ID,
        spotifyPlaylistId: createdPlaylist.id,
        spotifyPlaylistUrl: createdPlaylist.external_urls?.spotify ?? null,
        lastSyncedAt: null,
        trackCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(managedPlaylists).values(playlist);
      created = true;
    }

    await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlist.spotifyPlaylistId}/items`, accessToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris }),
    });

    const syncedAt = new Date().toISOString();
    await db
      .update(managedPlaylists)
      .set({ lastSyncedAt: syncedAt, trackCount: uris.length, updatedAt: syncedAt })
      .where(and(eq(managedPlaylists.userId, user.userId), eq(managedPlaylists.presetId, PRESET_ID)));

    return Response.json({
      created,
      trackCount: uris.length,
      syncedAt,
      playlistUrl: playlist.spotifyPlaylistUrl,
    });
  } catch (error) {
    console.error("Recently Added sync failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not sync Recently Added." },
      { status: 502 },
    );
  }
}

async function getAccessToken(
  connection: typeof spotifyConnections.$inferSelect,
  request: Request,
) {
  const expiresAt = Date.parse(connection.tokenExpiresAt);
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) {
    return decryptSpotifyToken(connection.accessTokenCiphertext);
  }

  const refreshToken = await decryptSpotifyToken(connection.refreshTokenCiphertext);
  const refreshed = await refreshSpotifyAccessToken(refreshToken, getSpotifyConfig(request));
  const now = new Date().toISOString();
  await getDb()
    .update(spotifyConnections)
    .set({
      accessTokenCiphertext: await encryptSpotifyToken(refreshed.access_token!),
      refreshTokenCiphertext: await encryptSpotifyToken(refreshed.refresh_token ?? refreshToken),
      tokenExpiresAt: new Date(Date.now() + refreshed.expires_in! * 1000).toISOString(),
      updatedAt: now,
    })
    .where(eq(spotifyConnections.userId, connection.userId));

  return refreshed.access_token!;
}

async function spotifyFetch(url: string, accessToken: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    throw new Error(`Spotify request failed (${response.status}).`);
  }
  return response;
}

function includesRecentlyAdded(value: string | undefined) {
  if (!value) return false;
  try {
    const selected = JSON.parse(value);
    return Array.isArray(selected) && selected.includes(PRESET_ID);
  } catch {
    return false;
  }
}
