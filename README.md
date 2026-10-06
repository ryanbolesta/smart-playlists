# Smart Playlists

A Spotify-first web app for a small set of managed music playlists that stay useful without requiring people to learn a rule builder.

The first four presets are:

- **Recently Added** — the latest songs saved to Liked Songs.
- **Lost & Found** — liked songs added six or more months ago.
- **Time Capsule** — songs liked one, two, or five years ago.
- **Recently Played** — distinct recent tracks, newest first.

The interface and playlist concepts are provider-neutral. The first integration is Spotify; a provider boundary will be introduced before the sync engine is built so Apple Music can follow later.

## Current status

The private preview is live at [smart-playlists.ryanbolesta.chatgpt.site](https://smart-playlists.ryanbolesta.chatgpt.site). It currently includes:

- the interactive dashboard and preset selection flow;
- server-side Spotify OAuth routes;
- encrypted token storage design backed by Cloudflare D1; and
- the initial D1 migration for Spotify connections.

It does **not** yet fetch music, create Spotify playlists, or schedule refreshes. Connecting Spotify remains unavailable until runtime credentials are configured.

## Run locally

### Prerequisites

- Node.js **22.13.0 or newer** (`node -v`)
- npm

### Start the app

```bash
cd /Users/ryanbolesta/Documents/Codex/2026-10-06/i-x20/smart-playlists
npm run install:ci
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

Build the production Worker with:

```bash
npm run build
```

## Spotify configuration

Create a Spotify Developer app and register this exact redirect URI:

```text
https://smart-playlists.ryanbolesta.chatgpt.site/api/spotify/callback
```

Set the following values as hosted runtime variables, not in the repository:

```text
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
TOKEN_ENCRYPTION_KEY=
SPOTIFY_REDIRECT_URI=
```

`TOKEN_ENCRYPTION_KEY` must be a base64-encoded 32-byte key. It encrypts Spotify access and refresh tokens before they are stored in D1. `.env.example` documents the keys, while `.env*` files remain ignored.

The OAuth flow requests only the permissions required for this first release: read saved tracks, read recent plays, read private playlists, and manage private playlists. It does not request playback control or permission to modify Liked Songs.

## Project map

```text
app/page.tsx                 Dashboard UI
app/api/spotify/             OAuth start and callback endpoints
lib/spotify.ts               OAuth configuration and token encryption
db/schema.ts                 D1 table definitions
drizzle/                     Generated SQLite migrations
.openai/hosting.json         Site identity and D1 binding
```

Most files under `components/ui/`, `build/`, and `scripts/` are framework or hosting-starter support files. They are not core Smart Playlists product logic.

## Next milestones

1. Configure Spotify runtime credentials and complete one account connection.
2. Add provider-neutral connection and playlist models.
3. Build the first sync: **Recently Added**.
4. Store managed playlist IDs and sync history.
5. Add scheduled refreshes, then the remaining presets.
