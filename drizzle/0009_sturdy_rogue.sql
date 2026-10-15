CREATE TABLE `speaking_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`lesson_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`practice_session_id` integer NOT NULL,
	`attempt_number` integer DEFAULT 1 NOT NULL,
	`transcription` text NOT NULL,
	`expected_text` text NOT NULL,
	`conceptual_status` text NOT NULL,
	`conceptual_score` integer,
	`vocabulary_score` integer,
	`grammar_score` integer,
	`pronunciation_score` integer,
	`fluency_score` integer,
	`result_json` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `speaking_attempts_user_exercise_idx` ON `speaking_attempts` (`user_id`,`exercise_id`);--> statement-breakpoint
CREATE INDEX `speaking_attempts_session_idx` ON `speaking_attempts` (`practice_session_id`);--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `speaking_attempt_ids_json` text DEFAULT '{}' NOT NULL;