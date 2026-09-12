CREATE TABLE `lesson_videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lesson_id` integer NOT NULL,
	`video_key` text NOT NULL,
	`title` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`start_seconds` integer DEFAULT 0 NOT NULL,
	`end_seconds` integer
);
--> statement-breakpoint
CREATE INDEX `lesson_videos_lesson_position_idx` ON `lesson_videos` (`lesson_id`,`position`);--> statement-breakpoint
CREATE TABLE `video_item_progress` (
	`user_id` integer NOT NULL,
	`video_id` integer NOT NULL,
	`position_seconds` integer DEFAULT 0 NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_item_progress_user_video_unique` ON `video_item_progress` (`user_id`,`video_id`);