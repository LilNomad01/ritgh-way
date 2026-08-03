CREATE TABLE `course_modules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`level` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Publicado' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `course_sections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`module_id` integer NOT NULL,
	`title` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`section_id` integer NOT NULL,
	`title` text NOT NULL,
	`duration` text DEFAULT '10 min' NOT NULL,
	`lesson_type` text DEFAULT 'Vídeo + prática' NOT NULL,
	`status` text DEFAULT 'Publicado' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`video_key` text,
	`video_name` text,
	`video_size` integer
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`level` text DEFAULT 'Básico' NOT NULL,
	`placement_score` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Ativo' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_email_unique` ON `students` (`email`);