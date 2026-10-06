CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`actionable_id` text NOT NULL,
	`kind` text NOT NULL,
	`brief` text NOT NULL,
	`language` text DEFAULT 'python' NOT NULL,
	`starter_code` text,
	`examples` text DEFAULT '[]',
	`tests` text DEFAULT '[]',
	`reference_solution` text,
	`hints` text DEFAULT '[]',
	`rubric` text DEFAULT '[]',
	`self_check_passed` integer,
	`self_check_detail` text,
	`provider` text,
	`model` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actionable_id`) REFERENCES `actionables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_actionable_idx` ON `exercises` (`actionable_id`);--> statement-breakpoint
CREATE INDEX `exercises_user_idx` ON `exercises` (`user_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`exercise_id` text NOT NULL,
	`body` text NOT NULL,
	`passed` integer DEFAULT false NOT NULL,
	`results` text,
	`feedback` text,
	`duration_ms` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `submissions_exercise_idx` ON `submissions` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `submissions_user_idx` ON `submissions` (`user_id`);--> statement-breakpoint
ALTER TABLE `actionables` ADD `verified_at` integer;