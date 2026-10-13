ALTER TABLE `managed_playlists` ADD `sync_lease_expires_at` text;--> statement-breakpoint
ALTER TABLE `managed_playlists` ADD `last_sync_error` text;