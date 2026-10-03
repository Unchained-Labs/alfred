CREATE TABLE `actionables` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`detail` text,
	`rationale` text,
	`difficulty` text,
	`pattern` text,
	`est_minutes` integer,
	`url` text,
	`tags` text DEFAULT '[]',
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` integer DEFAULT 2 NOT NULL,
	`due_at` integer,
	`ai_generated` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `actionables_application_idx` ON `actionables` (`application_id`);--> statement-breakpoint
CREATE INDEX `actionables_status_idx` ON `actionables` (`status`);--> statement-breakpoint
CREATE INDEX `actionables_kind_idx` ON `actionables` (`kind`);--> statement-breakpoint
CREATE TABLE `analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`fit_score` integer NOT NULL,
	`verdict` text NOT NULL,
	`summary` text NOT NULL,
	`skills` text DEFAULT '[]',
	`strengths` text DEFAULT '[]',
	`gaps` text DEFAULT '[]',
	`interview_focus` text DEFAULT '[]',
	`salary_insight` text,
	`positioning` text,
	`provider` text NOT NULL,
	`model` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `analyses_application_idx` ON `analyses` (`application_id`);--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`location` text,
	`work_mode` text,
	`seniority` text,
	`salary_min` integer,
	`salary_max` integer,
	`currency` text DEFAULT 'USD',
	`job_url` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`stage` text DEFAULT 'wishlist' NOT NULL,
	`priority` integer DEFAULT 2 NOT NULL,
	`board_order` real DEFAULT 0 NOT NULL,
	`contact_name` text,
	`contact_email` text,
	`notes` text,
	`tags` text DEFAULT '[]',
	`applied_at` integer,
	`next_action_at` integer,
	`next_action_label` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `applications_stage_idx` ON `applications` (`stage`);--> statement-breakpoint
CREATE INDEX `applications_company_idx` ON `applications` (`company`);--> statement-breakpoint
CREATE INDEX `applications_next_action_idx` ON `applications` (`next_action_at`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`metadata` text,
	`occurred_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_application_idx` ON `events` (`application_id`);--> statement-breakpoint
CREATE INDEX `events_occurred_idx` ON `events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `mail_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`folder` text DEFAULT 'INBOX' NOT NULL,
	`from_address` text,
	`from_name` text,
	`subject` text,
	`snippet` text,
	`body` text,
	`received_at` integer NOT NULL,
	`classification` text,
	`confidence` real,
	`detected_company` text,
	`detected_title` text,
	`suggested_stage` text,
	`application_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_message_id_idx` ON `mail_messages` (`message_id`);--> statement-breakpoint
CREATE INDEX `mail_status_idx` ON `mail_messages` (`status`);--> statement-breakpoint
CREATE INDEX `mail_received_idx` ON `mail_messages` (`received_at`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text,
	`actionable_id` text,
	`question` text NOT NULL,
	`category` text DEFAULT 'technical' NOT NULL,
	`probing` text,
	`suggested_answer` text,
	`user_answer` text,
	`confidence` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actionable_id`) REFERENCES `actionables`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `questions_application_idx` ON `questions` (`application_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
