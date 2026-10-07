import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * One Spotify authorization per Smart Playlists user. Tokens are encrypted
 * before they reach D1; only server code ever decrypts them.
 */
export const spotifyConnections = sqliteTable("spotify_connections", {
  userId: text("user_id").primaryKey(),
  accessTokenCiphertext: text("access_token_ciphertext").notNull(),
  refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
  tokenExpiresAt: text("token_expires_at").notNull(),
  scopes: text("scopes").notNull(),
  spotifyUserId: text("spotify_user_id"),
  spotifyDisplayName: text("spotify_display_name"),
  spotifyProfileImageUrl: text("spotify_profile_image_url"),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
  updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
});
