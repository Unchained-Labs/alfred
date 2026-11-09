CREATE TABLE `ai_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`application_id` text,
	`kind` text NOT NULL,
	`lane` text DEFAULT 'background' NOT NULL,
	`payload` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 5 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`run_after` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`depends_on` text DEFAULT '[]' NOT NULL,
	`dedupe_key` text,
	`label` text,
	`error` text,
	`permanent` integer DEFAULT false NOT NULL,
	`result` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_jobs_claim_idx` ON `ai_jobs` (`status`,`lane`,`priority`,`run_after`);--> statement-breakpoint
CREATE INDEX `ai_jobs_application_idx` ON `ai_jobs` (`application_id`);--> statement-breakpoint
CREATE INDEX `ai_jobs_user_idx` ON `ai_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_jobs_dedupe_pending_idx` ON `ai_jobs` (`dedupe_key`) WHERE status in ('queued', 'running') and dedupe_key is not null;