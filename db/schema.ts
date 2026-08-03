import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const students = sqliteTable("students", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  level: text("level").notNull().default("Básico"),
  placementScore: integer("placement_score").notNull().default(0),
  status: text("status").notNull().default("Ativo"),
  createdAt: text("created_at").notNull(),
});

export const courseModules = sqliteTable("course_modules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  level: text("level").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("Publicado"),
  position: integer("position").notNull().default(0),
});

export const courseSections = sqliteTable("course_sections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  moduleId: integer("module_id").notNull(),
  title: text("title").notNull(),
  position: integer("position").notNull().default(0),
});

export const lessons = sqliteTable("lessons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sectionId: integer("section_id").notNull(),
  title: text("title").notNull(),
  duration: text("duration").notNull().default("10 min"),
  lessonType: text("lesson_type").notNull().default("Vídeo + prática"),
  status: text("status").notNull().default("Publicado"),
  position: integer("position").notNull().default(0),
  videoKey: text("video_key"),
  videoName: text("video_name"),
  videoSize: integer("video_size"),
});
