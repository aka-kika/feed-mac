CREATE TABLE `agent_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`source` text NOT NULL,
	`label` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_keys_hash` ON `agent_keys` (`hash`);--> statement-breakpoint
CREATE INDEX `agent_keys_owner` ON `agent_keys` (`owner`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`object_key` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_report` ON `attachments` (`report_id`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`owner` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_report` ON `comments` (`report_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`source` text NOT NULL,
	`run_id` text NOT NULL,
	`routine` text NOT NULL,
	`title` text NOT NULL,
	`markdown` text NOT NULL,
	`payload_hash` text NOT NULL,
	`published_at` text NOT NULL,
	`received_at` text NOT NULL,
	`favourite` integer DEFAULT 0 NOT NULL,
	`is_read` integer DEFAULT 0 NOT NULL,
	`sample` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_delivery` ON `reports` (`owner`,`source`,`routine`,`run_id`);--> statement-breakpoint
CREATE INDEX `reports_owner_date` ON `reports` (`owner`,`published_at`);