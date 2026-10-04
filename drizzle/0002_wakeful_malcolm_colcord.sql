DROP INDEX `mail_message_id_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `mail_message_id_idx` ON `mail_messages` (`user_id`,`message_id`);