CREATE TABLE `report_ticks` (
	`report_id` text NOT NULL,
	`box` integer NOT NULL,
	`ticked_at` text NOT NULL,
	PRIMARY KEY (`report_id`, `box`),
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE cascade
);
