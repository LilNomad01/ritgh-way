CREATE TABLE `lesson_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lesson_id` integer NOT NULL,
	`exercise_type` text DEFAULT 'choice' NOT NULL,
	`category` text DEFAULT 'Compreensão' NOT NULL,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`options_json` text,
	`correct_answer` text NOT NULL,
	`accepted_answers_json` text,
	`explanation` text DEFAULT '' NOT NULL,
	`speech` text,
	`skills_json` text,
	`status` text DEFAULT 'Publicado' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lesson_exercises_lesson_status_position_idx` ON `lesson_exercises` (`lesson_id`,`status`,`position`);--> statement-breakpoint
CREATE TABLE `practice_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`lesson_id` integer NOT NULL,
	`current_index` integer DEFAULT 0 NOT NULL,
	`answers_json` text DEFAULT '[]' NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `practice_sessions_user_lesson_unique` ON `practice_sessions` (`user_id`,`lesson_id`);--> statement-breakpoint
ALTER TABLE `exercise_attempts` ADD `lesson_id` integer;