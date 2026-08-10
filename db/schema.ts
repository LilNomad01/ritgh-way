import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  imageKey: text("cover_key"),
  imageFit: text("cover_fit").notNull().default("cover"),
  imageZoom: integer("cover_zoom").notNull().default(100),
  imageOverlay: integer("cover_overlay").notNull().default(24),
  imagePositionX: integer("cover_position_x").notNull().default(50),
  imagePositionY: integer("cover_position_y").notNull().default(50),
});

export const courseSections = sqliteTable("course_sections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  moduleId: integer("module_id").notNull(),
  title: text("title").notNull(),
  position: integer("position").notNull().default(0),
  imageKey: text("cover_key"),
  imageFit: text("cover_fit").notNull().default("cover"),
  imageZoom: integer("cover_zoom").notNull().default(100),
  imageOverlay: integer("cover_overlay").notNull().default(24),
  imagePositionX: integer("cover_position_x").notNull().default(50),
  imagePositionY: integer("cover_position_y").notNull().default(50),
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
  imageKey: text("thumbnail_key"),
  imageFit: text("thumbnail_fit").notNull().default("cover"),
  imageZoom: integer("thumbnail_zoom").notNull().default(100),
  imageOverlay: integer("thumbnail_overlay").notNull().default(20),
  imagePositionX: integer("thumbnail_position_x").notNull().default(50),
  imagePositionY: integer("thumbnail_position_y").notNull().default(50),
});

export const userAccounts = sqliteTable("user_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  role: text("role").notNull().default("student"),
  status: text("status").notNull().default("active"),
  level: text("level").notNull().default("Começando do zero"),
  placementScore: integer("placement_score").notNull().default(0),
  goal: text("goal"),
  dailyMinutes: integer("daily_minutes").notNull().default(10),
  tokenVersion: integer("token_version").notNull().default(1),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastLoginAt: text("last_login_at"),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  refreshTokenHash: text("refresh_token_hash").notNull(),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  revokedAt: text("revoked_at"),
});

export const loginAttempts = sqliteTable("login_attempts", {
  identifier: text("identifier").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  lockedUntil: text("locked_until"),
  updatedAt: text("updated_at").notNull(),
});

export const placementAttempts = sqliteTable("placement_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  score: integer("score").notNull(),
  totalQuestions: integer("total_questions").notNull(),
  resultingLevel: text("resulting_level").notNull(),
  answersJson: text("answers_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const lessonProgress = sqliteTable("lesson_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  lessonId: integer("lesson_id"),
  lessonSlug: text("lesson_slug").notNull(),
  progressPercent: integer("progress_percent").notNull().default(0),
  bestScore: integer("best_score").notNull().default(0),
  attemptsCount: integer("attempts_count").notNull().default(0),
  completedAt: text("completed_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("lesson_progress_user_slug_unique").on(table.userId, table.lessonSlug)]);

export const exerciseAttempts = sqliteTable("exercise_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  lessonSlug: text("lesson_slug").notNull(),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  answersJson: text("answers_json"),
  createdAt: text("created_at").notNull(),
});
