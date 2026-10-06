import { getChatGPTUser } from "../../../chatgpt-auth";
import {
  createSpotifyState,
  getSpotifyConfig,
  SPOTIFY_SCOPES,
  SpotifyConfigurationError,
  spotifyStateCookie,
} from "../../../../lib/spotify";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.redirect(new URL("/signin-with-chatgpt?return_to=/", request.url), 302);

  try {
    const config = getSpotifyConfig(request);
    const state = createSpotifyState();
    const authorizationUrl = new URL("https://accounts.spotify.com/authorize");
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: config.redirectUri,
      state,
      scope: SPOTIFY_SCOPES.join(" "),
    }).toString();

    const response = Response.redirect(authorizationUrl, 302);
    response.headers.append("Set-Cookie", spotifyStateCookie(state, request));
    return response;
  } catch (error) {
    const message =
      error instanceof SpotifyConfigurationError
        ? error.message
        : "Spotify could not start authorization.";
    return Response.json({ error: message }, { status: 503 });
  }
}
