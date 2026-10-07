import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { spotifyConnections } from "../../../../db/schema";
import {
  encryptSpotifyToken,
  getSpotifyConfig,
  SpotifyConfigurationError,
  spotifyStateCookie,
} from "../../../../lib/spotify";

export const dynamic = "force-dynamic";

type SpotifyTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const closeStateCookie = spotifyStateCookie("", request, 0);

  if (requestUrl.searchParams.get("error")) {
    return redirectHome(request, "denied", closeStateCookie);
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const storedState = (await cookies()).get("spotify_oauth_state")?.value;
  const user = await getChatGPTUser();

  if (!code || !state || !storedState || state !== storedState || !user) {
    return redirectHome(request, "failed", closeStateCookie);
  }

  try {
    const config = getSpotifyConfig(request);
    const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirectUri,
      }),
    });
    const token = (await tokenResponse.json()) as SpotifyTokenResponse;

    if (!tokenResponse.ok || !token.access_token || !token.refresh_token || !token.expires_in) {
      return redirectHome(request, "failed", closeStateCookie);
    }

    const now = new Date().toISOString();
    await getDb()
      .insert(spotifyConnections)
      .values({
        userId: user.userId,
        accessTokenCiphertext: await encryptSpotifyToken(token.access_token),
        refreshTokenCiphertext: await encryptSpotifyToken(token.refresh_token),
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
        scopes: token.scope ?? "",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: spotifyConnections.userId,
        set: {
          accessTokenCiphertext: await encryptSpotifyToken(token.access_token),
          refreshTokenCiphertext: await encryptSpotifyToken(token.refresh_token),
          tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
          scopes: token.scope ?? "",
          updatedAt: now,
        },
      });

    return redirectHome(request, "connected", closeStateCookie);
  } catch (error) {
    if (error instanceof SpotifyConfigurationError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    return redirectHome(request, "failed", closeStateCookie);
  }
}

function redirectHome(request: Request, status: string, stateCookie: string) {
  const location = new URL("/", request.url);
  location.searchParams.set("spotify", status);
  return new Response(null, {
    status: 302,
    headers: {
      Location: location.toString(),
      "Set-Cookie": stateCookie,
    },
  });
}
