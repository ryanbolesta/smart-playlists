CREATE TABLE `spotify_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`access_token_ciphertext` text NOT NULL,
	`refresh_token_ciphertext` text NOT NULL,
	`token_expires_at` text NOT NULL,
	`scopes` text NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
