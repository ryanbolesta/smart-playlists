# Smart Playlists

A Spotify-first web app for a small set of managed music playlists that stay useful without requiring people to learn a rule builder.

The current presets are:

- **Recently Liked** — songs liked in the last 30 days, kept in the order you found them.
- **Lost & Found** — older favorites, resurfaced using listening history and a diversity-aware ranking.

The interface and playlist concepts are intended to stay provider-neutral. Spotify is the first integration; the sync engine currently uses Spotify-specific saved-track and listening-history data.

## Current status

The private preview is live at [smart-playlists.ryanbolesta.chatgpt.site](https://smart-playlists.ryanbolesta.chatgpt.site). It currently includes:

- the interactive dashboard and first-connection preset selection flow;
- server-side Spotify OAuth with profile display;
- Recently Liked and Lost & Found playlist creation and synchronization;
- encrypted Spotify token storage and managed-playlist metadata in Cloudflare D1; and
- hourly background synchronization with transient-failure suppression and persistent-failure alerts.

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

The OAuth flow requests only the permissions required for this first release: read saved tracks, recent plays, and top tracks; read private playlists; and manage private playlists. It does not request playback control or permission to modify Liked Songs.

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

## Migration history

Keep the existing applied migration filenames unchanged. The hosted D1 deployment runner treats those filenames as part of migration history.

When this project intentionally resets its D1 database, replace the old migration history with a single descriptive baseline migration (for example, `0000_initial_schema.sql`) that represents the then-current schema.

## Next milestones

1. Configure Spotify runtime credentials and complete one account connection.
2. Add provider-neutral connection and playlist models.
3. Add the next managed preset after its algorithm and Spotify data requirements are defined.
4. Introduce a provider adapter boundary before adding Apple Music.
5. Improve sync observability and user-facing recovery states.
