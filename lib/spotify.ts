import { env } from "cloudflare:workers";

export const SPOTIFY_SCOPES = [
  "user-library-read",
  "user-read-recently-played",
  "playlist-read-private",
  "playlist-modify-private",
] as const;

type RuntimeValue = string | undefined;

export class SpotifyConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyConfigurationError";
  }
}

export function getSpotifyConfig(request: Request) {
  const clientId = getRuntimeValue("SPOTIFY_CLIENT_ID");
  const clientSecret = getRuntimeValue("SPOTIFY_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new SpotifyConfigurationError(
      "Spotify is not configured yet. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the Site runtime environment.",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri:
      getRuntimeValue("SPOTIFY_REDIRECT_URI") ??
      new URL("/api/spotify/callback", request.url).toString(),
  };
}

export function createSpotifyState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(bytes);
}

export function spotifyStateCookie(value: string, request: Request, maxAge = 600) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `spotify_oauth_state=${value}; HttpOnly; SameSite=Lax; Path=/api/spotify; Max-Age=${maxAge}${secure}`;
}

export async function encryptSpotifyToken(value: string) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );

  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

export async function decryptSpotifyToken(value: string) {
  const [encodedIv, encodedCiphertext] = value.split(".");
  if (!encodedIv || !encodedCiphertext) {
    throw new Error("Stored Spotify token is invalid.");
  }

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(encodedIv) },
    await getEncryptionKey(),
    fromBase64Url(encodedCiphertext),
  );

  return new TextDecoder().decode(decrypted);
}

export async function refreshSpotifyAccessToken(
  refreshToken: string,
  config: ReturnType<typeof getSpotifyConfig>,
) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const token = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!response.ok || !token.access_token || !token.expires_in) {
    throw new Error("Spotify could not refresh its connection. Reconnect Spotify and try again.");
  }

  return token;
}

function getRuntimeValue(name: string): RuntimeValue {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function getEncryptionKey() {
  const encoded = getRuntimeValue("TOKEN_ENCRYPTION_KEY");
  if (!encoded) {
    throw new SpotifyConfigurationError(
      "TOKEN_ENCRYPTION_KEY is missing. Set a base64-encoded 32-byte key in the Site runtime environment.",
    );
  }

  const raw = fromBase64Url(encoded);
  if (raw.byteLength !== 32) {
    throw new SpotifyConfigurationError(
      "TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.",
    );
  }

  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
