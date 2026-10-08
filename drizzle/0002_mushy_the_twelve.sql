CREATE TABLE `playlist_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`selected_playlist_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
