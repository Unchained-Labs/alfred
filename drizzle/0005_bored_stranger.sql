CREATE TABLE `handbooks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`application_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`parts` integer DEFAULT 0 NOT NULL,
	`provider` text,
	`model` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handbooks_application_idx` ON `handbooks` (`application_id`);--> statement-breakpoint
CREATE INDEX `handbooks_user_idx` ON `handbooks` (`user_id`);