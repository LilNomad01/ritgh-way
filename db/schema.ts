import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const lessons = sqliteTable("lessons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sectionId: integer("section_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
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

export const lessonExercises = sqliteTable("lesson_exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lessonId: integer("lesson_id").notNull(),
  exerciseType: text("exercise_type").notNull().default("choice"),
  category: text("category").notNull().default("Compreensão"),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  optionsJson: text("options_json"),
  correctAnswer: text("correct_answer").notNull(),
  acceptedAnswersJson: text("accepted_answers_json"),
  explanation: text("explanation").notNull().default(""),
  speech: text("speech"),
  skillsJson: text("skills_json"),
  status: text("status").notNull().default("Publicado"),
  position: integer("position").notNull().default(0),
}, (table) => [index("lesson_exercises_lesson_status_position_idx").on(table.lessonId, table.status, table.position)]);

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
  lessonId: integer("lesson_id"),
  lessonSlug: text("lesson_slug").notNull(),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  answersJson: text("answers_json"),
  createdAt: text("created_at").notNull(),
});

export const practiceSessions = sqliteTable("practice_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  lessonId: integer("lesson_id").notNull(),
  currentIndex: integer("current_index").notNull().default(0),
  answersJson: text("answers_json").notNull().default("[]"),
  score: integer("score").notNull().default(0),
  total: integer("total").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("practice_sessions_user_lesson_unique").on(table.userId, table.lessonId)]);

export const videoProgress = sqliteTable("video_progress", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  lessonId: integer("lesson_id").notNull(),
  positionSeconds: integer("position_seconds").notNull().default(0),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  progressPercent: integer("progress_percent").notNull().default(0),
  status: text("status").notNull().default("not_started"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("video_progress_user_lesson_unique").on(table.userId, table.lessonId)]);

export const sectionExams = sqliteTable("section_exams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sectionId: integer("section_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("Rascunho"),
  passScore: integer("pass_score").notNull().default(70),
  position: integer("position").notNull().default(1),
}, (table) => [uniqueIndex("section_exams_section_unique").on(table.sectionId)]);

export const sectionExamQuestions = sqliteTable("section_exam_questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examId: integer("exam_id").notNull(),
  questionType: text("question_type").notNull().default("choice"),
  category: text("category").notNull().default("Avaliação"),
  prompt: text("prompt").notNull(),
  optionsJson: text("options_json"),
  correctAnswer: text("correct_answer").notNull(),
  acceptedAnswersJson: text("accepted_answers_json"),
  explanation: text("explanation").notNull().default(""),
  status: text("status").notNull().default("Rascunho"),
  position: integer("position").notNull().default(0),
}, (table) => [index("section_exam_questions_exam_status_position_idx").on(table.examId, table.status, table.position)]);

export const sectionExamAttempts = sqliteTable("section_exam_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  examId: integer("exam_id").notNull(),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  percentage: integer("percentage").notNull(),
  passed: integer("passed", { mode: "boolean" }).notNull().default(false),
  answersJson: text("answers_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("section_exam_attempts_user_exam_idx").on(table.userId, table.examId)]);
