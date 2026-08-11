CREATE TABLE `section_exam_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`exam_id` integer NOT NULL,
	`score` integer NOT NULL,
	`total` integer NOT NULL,
	`percentage` integer NOT NULL,
	`passed` integer DEFAULT false NOT NULL,
	`answers_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `section_exam_attempts_user_exam_idx` ON `section_exam_attempts` (`user_id`,`exam_id`);--> statement-breakpoint
CREATE TABLE `section_exam_questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_id` integer NOT NULL,
	`question_type` text DEFAULT 'choice' NOT NULL,
	`category` text DEFAULT 'Avaliação' NOT NULL,
	`prompt` text NOT NULL,
	`options_json` text,
	`correct_answer` text NOT NULL,
	`accepted_answers_json` text,
	`explanation` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Rascunho' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `section_exam_questions_exam_status_position_idx` ON `section_exam_questions` (`exam_id`,`status`,`position`);--> statement-breakpoint
CREATE TABLE `section_exams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`section_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Rascunho' NOT NULL,
	`pass_score` integer DEFAULT 70 NOT NULL,
	`position` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `section_exams_section_unique` ON `section_exams` (`section_id`);--> statement-breakpoint
CREATE TABLE `video_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`lesson_id` integer NOT NULL,
	`position_seconds` integer DEFAULT 0 NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`progress_percent` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_progress_user_lesson_unique` ON `video_progress` (`user_id`,`lesson_id`);--> statement-breakpoint
ALTER TABLE `course_sections` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `course_sections` ADD `status` text DEFAULT 'Publicado' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `description` text DEFAULT '' NOT NULL;