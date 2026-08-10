ALTER TABLE `course_modules` ADD `cover_key` text;--> statement-breakpoint
ALTER TABLE `course_modules` ADD `cover_fit` text DEFAULT 'cover' NOT NULL;--> statement-breakpoint
ALTER TABLE `course_modules` ADD `cover_zoom` integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `course_modules` ADD `cover_overlay` integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE `course_modules` ADD `cover_position_x` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `course_modules` ADD `cover_position_y` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `course_sections` ADD `cover_key` text;--> statement-breakpoint
ALTER TABLE `course_sections` ADD `cover_fit` text DEFAULT 'cover' NOT NULL;--> statement-breakpoint
ALTER TABLE `course_sections` ADD `cover_zoom` integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `course_sections` ADD `cover_overlay` integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE `course_sections` ADD `cover_position_x` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `course_sections` ADD `cover_position_y` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `thumbnail_key` text;--> statement-breakpoint
ALTER TABLE `lessons` ADD `thumbnail_fit` text DEFAULT 'cover' NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `thumbnail_zoom` integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `thumbnail_overlay` integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `thumbnail_position_x` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `lessons` ADD `thumbnail_position_y` integer DEFAULT 50 NOT NULL;