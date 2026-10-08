CREATE TABLE `managed_playlists` (
	`user_id` text NOT NULL,
	`preset_id` text NOT NULL,
	`spotify_playlist_id` text NOT NULL,
	`spotify_playlist_url` text,
	`last_synced_at` text,
	`track_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	PRIMARY KEY(`user_id`, `preset_id`)
);
