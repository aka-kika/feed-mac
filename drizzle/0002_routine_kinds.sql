CREATE TABLE `routine_kinds` (
	`owner` text NOT NULL,
	`source` text NOT NULL,
	`routine` text NOT NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('news', 'report')),
	PRIMARY KEY (`owner`, `source`, `routine`)
);
