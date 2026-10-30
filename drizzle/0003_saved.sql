ALTER TABLE `reports` ADD `saved_at` text;--> statement-breakpoint
CREATE INDEX `reports_owner_saved` ON `reports` (`owner`,`saved_at`);
