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
import recentlyLikedCover from "../../../../../assets/recently-liked-cover.jpg?inline";

const PRESET_ID = "recently-added";
const PLAYLIST_NAME = "Recently Liked";
const PLAYLIST_DESCRIPTION = "Managed by Smart Playlists · your liked songs from the last 30 days.";
const RECENT_DAYS = 30;
const SPOTIFY_PAGE_SIZE = 50;
const SPOTIFY_PLAYLIST_BATCH_SIZE = 100;

type SavedTracksResponse = {
  items?: Array<{ added_at?: string; track?: { uri?: string | null } | null }>;
  next?: string | null;
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
      return Response.json({ error: "Add Recently Liked to your selection before syncing." }, { status: 409 });
    }

    const accessToken = await getAccessToken(connection, request);
    const uris = await getRecentlyLikedUris(accessToken);

    let playlist = await db.query.managedPlaylists.findFirst({
      where: and(eq(managedPlaylists.userId, user.userId), eq(managedPlaylists.presetId, PRESET_ID)),
    });
    let created = false;

    if (!playlist) {
      const createResponse = await spotifyFetch("https://api.spotify.com/v1/me/playlists", accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: PLAYLIST_NAME,
          description: PLAYLIST_DESCRIPTION,
          public: false,
          collaborative: false,
        }),
      });
      const createdPlaylist = (await createResponse.json()) as CreatedPlaylist;
      if (!createdPlaylist.id) throw new Error("Spotify did not return the new playlist.");

      await uploadPlaylistCover(createdPlaylist.id, accessToken);

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

    await replacePlaylistItems(playlist.spotifyPlaylistId, uris, accessToken);

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
    console.error("Recently Liked sync failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not sync Recently Liked." },
      { status: 502 },
    );
  }
}

async function getRecentlyLikedUris(accessToken: string) {
  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const uris: string[] = [];
  let offset = 0;

  while (true) {
    const response = await spotifyFetch(
      `https://api.spotify.com/v1/me/tracks?limit=${SPOTIFY_PAGE_SIZE}&offset=${offset}`,
      accessToken,
    );
    const page = (await response.json()) as SavedTracksResponse;
    const items = page.items ?? [];
    const hasOlderTrack = items.some((item) => {
      const addedAt = Date.parse(item.added_at ?? "");
      return Number.isFinite(addedAt) && addedAt < cutoff;
    });

    uris.push(
      ...items
        .filter((item) => Date.parse(item.added_at ?? "") >= cutoff)
        .map((item) => item.track?.uri)
        .filter((uri): uri is string => typeof uri === "string" && uri.startsWith("spotify:track:")),
    );

    if (hasOlderTrack || !page.next || items.length === 0) return uris;
    offset += items.length;
  }
}

async function replacePlaylistItems(playlistId: string, uris: string[], accessToken: string) {
  const [firstBatch, ...remainingBatches] = chunk(uris, SPOTIFY_PLAYLIST_BATCH_SIZE);
  await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, accessToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uris: firstBatch ?? [] }),
  });

  for (const batch of remainingBatches) {
    await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, accessToken, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris: batch }),
    });
  }
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function uploadPlaylistCover(playlistId: string, accessToken: string) {
  const coverData = recentlyLikedCover.split(",", 2)[1];
  if (!coverData) throw new Error("The Recently Liked cover image is unavailable.");

  await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/images`, accessToken, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: coverData,
  });
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
