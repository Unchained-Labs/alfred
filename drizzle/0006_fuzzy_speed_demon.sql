CREATE TABLE `job_boards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`provider` text NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_boards_user_slug_idx` ON `job_boards` (`user_id`,`provider`,`slug`);--> statement-breakpoint
CREATE INDEX `job_boards_user_idx` ON `job_boards` (`user_id`);--> statement-breakpoint
CREATE TABLE `job_hits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`search_id` text,
	`source` text NOT NULL,
	`source_ref` text NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`location` text,
	`remote` integer,
	`url` text NOT NULL,
	`salary_text` text,
	`posted_at` integer,
	`snippet` text,
	`tags` text DEFAULT '[]',
	`status` text DEFAULT 'new' NOT NULL,
	`application_id` text,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`search_id`) REFERENCES `job_searches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_hits_ref_idx` ON `job_hits` (`user_id`,`source`,`source_ref`);--> statement-breakpoint
CREATE INDEX `job_hits_user_status_idx` ON `job_hits` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `job_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`label` text NOT NULL,
	`title_query` text NOT NULL,
	`location` text,
	`remote_only` integer DEFAULT false NOT NULL,
	`min_salary` integer,
	`sources` text DEFAULT '["boards"]' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`last_new_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_searches_user_idx` ON `job_searches` (`user_id`);