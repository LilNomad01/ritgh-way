ALTER TABLE `lesson_exercises` ADD `rotation_variants_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `smart_rotation` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `exercise_plan_json` text DEFAULT '[]' NOT NULL;