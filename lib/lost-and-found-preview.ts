import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { spotifyConnections } from "../db/schema";
import { decryptSpotifyToken, encryptSpotifyToken, getSpotifyConfig, refreshSpotifyAccessToken } from "./spotify";

const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
const TOP_LIMIT = 50;
const RECENT_LIMIT = 50;
const PREVIEW_SIZE = 30;

type Track = {
  id?: string;
  uri?: string;
  name?: string;
  artists?: Array<{ id?: string; name?: string }>;
  album?: { id?: string; name?: string; images?: Array<{ url?: string }> };
};

type TopResponse = { items?: Track[] };
type SavedResponse = { items?: Array<{ added_at?: string; track?: Track | null }>; next?: string | null };
type RecentResponse = { items?: Array<{ track?: Track | null; played_at?: string }> };

export type LostAndFoundCandidate = {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  album: string;
  imageUrl: string | null;
  spotifyUrl: string;
  addedAt: string;
};

export type LostAndFoundPreview = {
  tracks: LostAndFoundCandidate[];
  eligibleCount: number;
  excludedRecentlyPlayedCount: number;
};

export async function getLostAndFoundPreview(userId: string, request: Request): Promise<LostAndFoundPreview> {
  const connection = await getDb().query.spotifyConnections.findFirst({ where: eq(spotifyConnections.userId, userId) });
  if (!connection) throw new PreviewInputError("Connect Spotify before previewing Lost & Found.");

  const accessToken = await getAccessToken(connection, request);
  const [mediumTop, longTop, recent] = await Promise.all([
    spotifyFetch("https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=" + TOP_LIMIT, accessToken).then((response) => response.json() as Promise<TopResponse>),
    spotifyFetch("https://api.spotify.com/v1/me/top/tracks?time_range=long_term&limit=" + TOP_LIMIT, accessToken).then((response) => response.json() as Promise<TopResponse>),
    spotifyFetch("https://api.spotify.com/v1/me/player/recently-played?limit=" + RECENT_LIMIT, accessToken).then((response) => response.json() as Promise<RecentResponse>),
  ]);

  const topTracks = rankTopTracks(mediumTop.items ?? [], longTop.items ?? []);
  const recentIds = new Set((recent.items ?? []).map((item) => item.track?.id).filter((id): id is string => Boolean(id)));
  const candidates = await findLikedTopTracks(accessToken, new Set(topTracks.map((item) => item.track.id!)));
  const eligible = candidates.filter((candidate) => !recentIds.has(candidate.track.id!));
  const tracks = selectDiverseTracks(eligible, topTracks).slice(0, PREVIEW_SIZE).map(toCandidate);

  return {
    tracks,
    eligibleCount: candidates.length,
    excludedRecentlyPlayedCount: candidates.length - eligible.length,
  };
}

function rankTopTracks(medium: Track[], longTerm: Track[]) {
  const ranked = new Map<string, { track: Track; score: number }>();
  medium.forEach((track, index) => { if (track.id) ranked.set(track.id, { track, score: 1000 - index }); });
  longTerm.forEach((track, index) => {
    if (!track.id || ranked.has(track.id)) return;
    ranked.set(track.id, { track, score: 500 - index });
  });
  return [...ranked.values()].sort((a, b) => b.score - a.score);
}

async function findLikedTopTracks(accessToken: string, topIds: Set<string>) {
  const matches: Array<{ track: Track; addedAt: string }> = [];
  const cutoff = Date.now() - SIX_MONTHS_MS;
  let offset = 0;
  while (topIds.size && offset < 10_000) {
    const response = await spotifyFetch(`https://api.spotify.com/v1/me/tracks?limit=50&offset=${offset}`, accessToken);
    const page = (await response.json()) as SavedResponse;
    const items = page.items ?? [];
    for (const item of items) {
      const track = item.track;
      const addedAt = Date.parse(item.added_at ?? "");
      if (!track?.id || !Number.isFinite(addedAt) || addedAt >= cutoff || !topIds.has(track.id)) continue;
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

function toCandidate(item: { track: Track; addedAt: string }): LostAndFoundCandidate {
  const track = item.track;
  return {
    id: track.id!,
    uri: track.uri ?? `spotify:track:${track.id}`,
    name: track.name ?? "Unknown track",
    artists: (track.artists ?? []).map((artist) => artist.name ?? "Unknown artist"),
    album: track.album?.name ?? "Unknown album",
    imageUrl: track.album?.images?.[0]?.url ?? null,
    spotifyUrl: `https://open.spotify.com/track/${track.id}`,
    addedAt: item.addedAt,
  };
}

async function getAccessToken(connection: typeof spotifyConnections.$inferSelect, request: Request) {
  const expiresAt = Date.parse(connection.tokenExpiresAt);
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) return decryptSpotifyToken(connection.accessTokenCiphertext);
  const refreshToken = await decryptSpotifyToken(connection.refreshTokenCiphertext);
  const refreshed = await refreshSpotifyAccessToken(refreshToken, getSpotifyConfig(request));
  await getDb().update(spotifyConnections).set({
    accessTokenCiphertext: await encryptSpotifyToken(refreshed.access_token!),
    refreshTokenCiphertext: await encryptSpotifyToken(refreshed.refresh_token ?? refreshToken),
    tokenExpiresAt: new Date(Date.now() + refreshed.expires_in! * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  }).where(eq(spotifyConnections.userId, connection.userId));
  return refreshed.access_token!;
}

async function spotifyFetch(url: string, accessToken: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Spotify request failed (${response.status}).`);
  return response;
}

export class PreviewInputError extends Error {}
