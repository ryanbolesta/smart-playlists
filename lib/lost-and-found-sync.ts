import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "../db";
import { managedPlaylists, playlistPreferences, spotifyConnections } from "../db/schema";
import { decryptSpotifyToken, encryptSpotifyToken, getSpotifyConfig, refreshSpotifyAccessToken } from "./spotify";
import recentlyLikedCover from "../assets/recently-liked-cover.jpg?inline";

const PRESET_ID = "lost-and-found";
const PLAYLIST_NAME = "Lost & Found";
const PLAYLIST_DESCRIPTION = "Managed by Smart Playlists · older liked favorites resurfaced for another listen.";
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
const TOP_LIMIT = 50;
const RECENT_LIMIT = 50;
const SAVED_PAGE_SIZE = 50;
const PREVIEW_SIZE = 30;
const PLAYLIST_BATCH_SIZE = 100;
const SYNC_LEASE_MS = 10 * 60 * 1000;
const FAILURE_ALERT_THRESHOLD = 3;

type Track = { id?: string; uri?: string; artists?: Array<{ id?: string; name?: string }>; album?: { id?: string; name?: string }; };
type TopResponse = { items?: Track[] };
type SavedResponse = { items?: Array<{ added_at?: string; track?: Track | null }>; next?: string | null };
type RecentResponse = { items?: Array<{ track?: Track | null }> };
type CreatedPlaylist = { id?: string; external_urls?: { spotify?: string } };

export type LostAndFoundSyncResult = { created: boolean; trackCount: number; syncedAt: string; playlistUrl: string | null };

export async function syncLostAndFoundForUser(userId: string, request: Request): Promise<LostAndFoundSyncResult> {
  const db = getDb();
  const [connection, preferences] = await Promise.all([
    db.query.spotifyConnections.findFirst({ where: eq(spotifyConnections.userId, userId) }),
    db.query.playlistPreferences.findFirst({ where: eq(playlistPreferences.userId, userId) }),
  ]);
  if (!connection) throw new SyncInputError("Connect Spotify before syncing.");
  if (!includesLostAndFound(preferences?.selectedPlaylistIds)) throw new SyncInputError("Add Lost & Found to your selection before syncing.");

  let playlist = await db.query.managedPlaylists.findFirst({ where: and(eq(managedPlaylists.userId, userId), eq(managedPlaylists.presetId, PRESET_ID)) });
  if (playlist && !(await acquireLease(userId))) throw new SyncInProgressError();

  try {
    const accessToken = await getAccessToken(connection, request);
    const uris = await getLostAndFoundUris(accessToken);
    let created = false;
    if (!playlist) {
      const response = await spotifyFetch("https://api.spotify.com/v1/me/playlists", accessToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: PLAYLIST_NAME, description: PLAYLIST_DESCRIPTION, public: false, collaborative: false }) });
      const createdPlaylist = (await response.json()) as CreatedPlaylist;
      if (!createdPlaylist.id) throw new Error("Spotify did not return the new playlist.");
      await uploadPlaylistCover(createdPlaylist.id, accessToken);
      const now = new Date().toISOString();
      playlist = { userId, presetId: PRESET_ID, spotifyPlaylistId: createdPlaylist.id, spotifyPlaylistUrl: createdPlaylist.external_urls?.spotify ?? null, lastSyncedAt: null, syncLeaseExpiresAt: null, lastSyncError: null, consecutiveFailureCount: 0, trackCount: 0, createdAt: now, updatedAt: now };
      await db.insert(managedPlaylists).values(playlist);
      created = true;
    }
    await replacePlaylistItems(playlist.spotifyPlaylistId, uris, accessToken);
    const syncedAt = new Date().toISOString();
    await db.update(managedPlaylists).set({ lastSyncedAt: syncedAt, syncLeaseExpiresAt: null, lastSyncError: null, consecutiveFailureCount: 0, trackCount: uris.length, updatedAt: syncedAt }).where(and(eq(managedPlaylists.userId, userId), eq(managedPlaylists.presetId, PRESET_ID)));
    return { created, trackCount: uris.length, syncedAt, playlistUrl: playlist.spotifyPlaylistUrl };
  } catch (error) {
    if (playlist) {
      const message = error instanceof Error ? error.message : "Could not sync Lost & Found.";
      const consecutiveFailureCount = (playlist.consecutiveFailureCount ?? 0) + 1;
      await db.update(managedPlaylists).set({ syncLeaseExpiresAt: null, lastSyncError: message, consecutiveFailureCount, updatedAt: new Date().toISOString() }).where(and(eq(managedPlaylists.userId, userId), eq(managedPlaylists.presetId, PRESET_ID)));
      throw new SyncFailureError(message, consecutiveFailureCount);
    }
    throw error;
  }
}

export async function syncScheduledLostAndFound(request: Request) {
  const db = getDb();
  const candidates = await db.select({ userId: managedPlaylists.userId, selectedPlaylistIds: playlistPreferences.selectedPlaylistIds }).from(managedPlaylists).innerJoin(playlistPreferences, eq(managedPlaylists.userId, playlistPreferences.userId)).where(eq(managedPlaylists.presetId, PRESET_ID));
  const userIds = [...new Set(candidates.filter((candidate) => includesLostAndFound(candidate.selectedPlaylistIds)).map((candidate) => candidate.userId))];
  const results = await Promise.allSettled(userIds.map((userId) => syncLostAndFoundForUser(userId, request)));
  const synced = results.filter((result) => result.status === "fulfilled").length;
  const skipped = results.filter((result) => result.status === "rejected" && result.reason instanceof SyncInProgressError).length;
  const failed = results.length - synced - skipped;
  const alerts = results.flatMap((result) => {
    if (result.status === "rejected" && result.reason instanceof SyncFailureError && result.reason.consecutiveFailureCount >= FAILURE_ALERT_THRESHOLD) {
      return [`Lost & Found: ${result.reason.message}`];
    }
    return [];
  });
  return { checked: userIds.length, synced, skipped, failed, alerted: alerts.length, alerts };
}

async function getLostAndFoundUris(accessToken: string) {
  const [medium, longTerm, recent] = await Promise.all([
    spotifyFetch(`https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=${TOP_LIMIT}`, accessToken).then((response) => response.json() as Promise<TopResponse>),
    spotifyFetch(`https://api.spotify.com/v1/me/top/tracks?time_range=long_term&limit=${TOP_LIMIT}`, accessToken).then((response) => response.json() as Promise<TopResponse>),
    spotifyFetch(`https://api.spotify.com/v1/me/player/recently-played?limit=${RECENT_LIMIT}`, accessToken).then((response) => response.json() as Promise<RecentResponse>),
  ]);
  const ranked = rankTopTracks(medium.items ?? [], longTerm.items ?? []);
  const recentIds = new Set((recent.items ?? []).map((item) => item.track?.id).filter((id): id is string => Boolean(id)));
  const topIds = new Set(ranked.map((item) => item.track.id!));
  const candidates = await findLikedTopTracks(accessToken, topIds);
  const eligible = candidates.filter((candidate) => !recentIds.has(candidate.track.id!));
  return selectDiverseTracks(eligible, ranked).slice(0, PREVIEW_SIZE).map((candidate) => candidate.track.uri).filter((uri): uri is string => typeof uri === "string" && uri.startsWith("spotify:track:"));
}

function rankTopTracks(medium: Track[], longTerm: Track[]) {
  const ranked = new Map<string, { track: Track; score: number }>();
  medium.forEach((track, index) => { if (track.id) ranked.set(track.id, { track, score: 1000 - index }); });
  longTerm.forEach((track, index) => { if (!track.id || ranked.has(track.id)) return; ranked.set(track.id, { track, score: 500 - index }); });
  return [...ranked.values()].sort((a, b) => b.score - a.score);
}

async function findLikedTopTracks(accessToken: string, topIds: Set<string>) {
  const matches: Array<{ track: Track; addedAt: string }> = [];
  const cutoff = Date.now() - SIX_MONTHS_MS;
  let offset = 0;
  while (topIds.size && offset < 10_000) {
    const page = (await spotifyFetch(`https://api.spotify.com/v1/me/tracks?limit=${SAVED_PAGE_SIZE}&offset=${offset}`, accessToken).then((response) => response.json())) as SavedResponse;
    const items = page.items ?? [];
    for (const item of items) {
      const track = item.track;
      const addedAt = Date.parse(item.added_at ?? "");
      if (!track?.id || !track.uri || !Number.isFinite(addedAt) || addedAt >= cutoff || !topIds.has(track.id)) continue;
      matches.push({ track, addedAt: item.added_at! });
      topIds.delete(track.id);
    }
    if (!page.next || items.length === 0) break;
    offset += items.length;
  }
  return matches;
}

function selectDiverseTracks(candidates: Array<{ track: Track; addedAt: string }>, ranked: Array<{ track: Track; score: number }>) {
  const scores = new Map(ranked.map((item) => [item.track.id, item.score]));
  const sorted = [...candidates].sort((a, b) => (scores.get(b.track.id) ?? 0) - (scores.get(a.track.id) ?? 0));
  const artists = new Map<string, number>();
  const albums = new Set<string>();
  const selected: Array<{ track: Track; addedAt: string }> = [];
  for (const candidate of sorted) {
    const artistIds = (candidate.track.artists ?? []).map((artist) => artist.id ?? artist.name ?? "unknown");
    const albumId = candidate.track.album?.id ?? candidate.track.album?.name ?? candidate.track.id;
    if (albums.has(albumId) || artistIds.some((artistId) => (artists.get(artistId) ?? 0) >= 2)) continue;
    selected.push(candidate);
    albums.add(albumId);
    artistIds.forEach((artistId) => artists.set(artistId, (artists.get(artistId) ?? 0) + 1));
  }
  return selected;
}

async function replacePlaylistItems(playlistId: string, uris: string[], accessToken: string) {
  const [firstBatch, ...remainingBatches] = chunk(uris, PLAYLIST_BATCH_SIZE);
  await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, accessToken, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uris: firstBatch ?? [] }) });
  for (const batch of remainingBatches) await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, accessToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uris: batch }) });
}

function chunk<T>(items: T[], size: number) { const batches: T[][] = []; for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size)); return batches; }

async function uploadPlaylistCover(playlistId: string, accessToken: string) {
  const coverData = recentlyLikedCover.split(",", 2)[1];
  if (!coverData) throw new Error("The playlist cover image is unavailable.");
  await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlistId}/images`, accessToken, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: coverData });
}

async function acquireLease(userId: string) {
  const now = new Date();
  const result = await getDb().update(managedPlaylists).set({ syncLeaseExpiresAt: new Date(now.getTime() + SYNC_LEASE_MS).toISOString(), updatedAt: now.toISOString() }).where(and(eq(managedPlaylists.userId, userId), eq(managedPlaylists.presetId, PRESET_ID), or(isNull(managedPlaylists.syncLeaseExpiresAt), lt(managedPlaylists.syncLeaseExpiresAt, now.toISOString()))));
  return result.meta.changes > 0;
}

async function getAccessToken(connection: typeof spotifyConnections.$inferSelect, request: Request) {
  const expiresAt = Date.parse(connection.tokenExpiresAt);
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) return decryptSpotifyToken(connection.accessTokenCiphertext);
  const refreshToken = await decryptSpotifyToken(connection.refreshTokenCiphertext);
  const refreshed = await refreshSpotifyAccessToken(refreshToken, getSpotifyConfig(request));
  const now = new Date().toISOString();
  await getDb().update(spotifyConnections).set({ accessTokenCiphertext: await encryptSpotifyToken(refreshed.access_token!), refreshTokenCiphertext: await encryptSpotifyToken(refreshed.refresh_token ?? refreshToken), tokenExpiresAt: new Date(Date.now() + refreshed.expires_in! * 1000).toISOString(), updatedAt: now }).where(eq(spotifyConnections.userId, connection.userId));
  return refreshed.access_token!;
}

async function spotifyFetch(url: string, accessToken: string, init?: RequestInit) {
  const headers = new Headers(init?.headers); headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) throw new Error(`Spotify request failed (${response.status}).`);
  return response;
}

function includesLostAndFound(value: string | undefined) { if (!value) return false; try { const selected = JSON.parse(value); return Array.isArray(selected) && selected.includes(PRESET_ID); } catch { return false; } }
export class SyncInputError extends Error {}
export class SyncInProgressError extends Error { constructor() { super("A sync is already in progress."); } }
export class SyncFailureError extends Error { constructor(message: string, public consecutiveFailureCount: number) { super(message); } }
