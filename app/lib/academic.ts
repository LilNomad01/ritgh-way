import { getD1 } from "../../db";
import { getNextLearningStep, getWeakSkills, masteryReached, MASTERY_THRESHOLD, parseAnswerResults, scorePercentage, type SkillResult } from "./learning-progress";

export type LessonAcademicState = {
  lessonId: number;
  sectionId: number;
  unlocked: boolean;
  completed: boolean;
  videoStatus: "not_started" | "watching" | "completed";
  videoPercent: number;
  videoPosition: number;
  videoDuration: number;
  exerciseCount: number;
  exercisesCompleted: boolean;
  attemptsCount: number;
  lastPercentage?: number;
  bestPercentage?: number;
  masteryReached: boolean;
  reviewRecommended: boolean;
  weakSkills: SkillResult[];
  status: "locked" | "available" | "in_progress" | "completed";
};

export type SectionAcademicState = {
  sectionId: number;
  unlocked: boolean;
  completed: boolean;
  lessonCount: number;
  completedLessons: number;
  percent: number;
  examId?: number;
  examTitle?: string;
  examQuestionCount: number;
  examPassScore?: number;
  examUnlocked: boolean;
  examPassed: boolean;
  examAttempts: number;
  bestExamPercentage?: number;
  weakSkills: SkillResult[];
  status: "locked" | "available" | "in_progress" | "completed";
};

export type ModuleAcademicState = {
  moduleId: number;
  unlocked: boolean;
  completed: boolean;
  sectionCount: number;
  completedSections: number;
  percent: number;
  status: "locked" | "available" | "in_progress" | "completed";
};

type ModuleRow = { id: number; position: number };
type SectionRow = { id: number; moduleId: number; position: number };
type LessonRow = { id: number; sectionId: number; position: number; videoKey: string | null };
type VideoRow = { lessonId: number; status: LessonAcademicState["videoStatus"]; progressPercent: number; positionSeconds: number; durationSeconds: number };
type AttemptRow = { lessonId: number; score: number; total: number; answersJson: string | null };
type ExerciseCountRow = { lessonId: number; exerciseCount: number };
type ExamRow = { id: number; sectionId: number; title: string; passScore: number; questionCount: number };
type ExamAttemptRow = { examId: number; passed: number; percentage: number; answersJson: string };

export async function computeAcademicState(userId: number): Promise<{ lessonStates: LessonAcademicState[]; sectionStates: SectionAcademicState[]; moduleStates: ModuleAcademicState[] }> {
  const db = getD1();
  const [moduleResult, sectionResult, lessonResult, videoResult, attemptResult, exerciseResult, examResult, examAttemptResult, videoItemsResult] = await db.batch([
    db.prepare("SELECT id, position FROM course_modules WHERE status = 'Publicado' ORDER BY position, id"),
    db.prepare("SELECT id, module_id AS moduleId, position FROM course_sections WHERE status = 'Publicado' ORDER BY module_id, position, id"),
    db.prepare("SELECT id, section_id AS sectionId, position, video_key AS videoKey FROM lessons WHERE status = 'Publicado' ORDER BY section_id, position, id"),
    db.prepare("SELECT lesson_id AS lessonId, status, progress_percent AS progressPercent, position_seconds AS positionSeconds, duration_seconds AS durationSeconds FROM video_progress WHERE user_id = ?").bind(userId),
    db.prepare("SELECT lesson_id AS lessonId, score, total, answers_json AS answersJson FROM exercise_attempts WHERE user_id = ? AND lesson_id IS NOT NULL ORDER BY created_at DESC, id DESC").bind(userId),
    db.prepare("SELECT lesson_id AS lessonId, COUNT(*) AS exerciseCount FROM lesson_exercises WHERE status = 'Publicado' GROUP BY lesson_id"),
    db.prepare("SELECT e.id, e.section_id AS sectionId, e.title, e.pass_score AS passScore, COUNT(q.id) AS questionCount FROM section_exams e JOIN section_exam_questions q ON q.exam_id = e.id AND q.status = 'Publicado' WHERE e.status = 'Publicado' GROUP BY e.id ORDER BY e.position, e.id"),
    db.prepare("SELECT exam_id AS examId, passed, percentage, answers_json AS answersJson FROM section_exam_attempts WHERE user_id = ? ORDER BY created_at DESC, id DESC").bind(userId),
    db.prepare("SELECT v.id, v.lesson_id AS lessonId, p.completed, p.position_seconds AS positionSeconds, p.duration_seconds AS durationSeconds, p.updated_at AS updatedAt FROM lesson_videos v LEFT JOIN video_item_progress p ON p.video_id = v.id AND p.user_id = ? ORDER BY v.position, v.id").bind(userId),
  ]);
  const modules = moduleResult.results as ModuleRow[];
  const sections = sectionResult.results as SectionRow[];
  const lessons = lessonResult.results as LessonRow[];
  const videos = new Map((videoResult.results as VideoRow[]).map((row) => [row.lessonId, row]));
  const groups = new Map<number, { id: number; lessonId: number; completed: number | null; positionSeconds: number | null; durationSeconds: number | null; updatedAt: string | null }[]>();
  for (const row of videoItemsResult.results as { id: number; lessonId: number; completed: number | null; positionSeconds: number | null; durationSeconds: number | null; updatedAt: string | null }[]) groups.set(row.lessonId, [...(groups.get(row.lessonId) ?? []), row]);
  for (const [lessonId, items] of groups) {
    const latest = items.filter(item => item.updatedAt).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    const completed = items.filter(item => item.completed === 1).length;
    const percent = Math.round(items.reduce((sum, item) => sum + (item.completed ? 100 : item.durationSeconds ? Math.min(99, 100 * (item.positionSeconds ?? 0) / item.durationSeconds) : 0), 0) / items.length);
    videos.set(lessonId, { lessonId, status: completed === items.length ? "completed" : latest ? "watching" : "not_started", progressPercent: percent, positionSeconds: latest?.positionSeconds ?? 0, durationSeconds: latest?.durationSeconds ?? 0 });
  }
  const attempts = new Map<number, AttemptRow[]>();
  for (const row of attemptResult.results as AttemptRow[]) attempts.set(row.lessonId, [...(attempts.get(row.lessonId) ?? []), row]);
  const exerciseCounts = new Map((exerciseResult.results as ExerciseCountRow[]).map((row) => [row.lessonId, Number(row.exerciseCount)]));
  const exams = new Map((examResult.results as ExamRow[]).map((row) => [row.sectionId, { ...row, questionCount: Number(row.questionCount) }]));
  const examAttempts = new Map<number, ExamAttemptRow[]>();
  for (const row of examAttemptResult.results as ExamAttemptRow[]) examAttempts.set(row.examId, [...(examAttempts.get(row.examId) ?? []), row]);
  const lessonStates: LessonAcademicState[] = [];
  const sectionStates: SectionAcademicState[] = [];
  const moduleStates: ModuleAcademicState[] = [];
  let previousModuleCompleted = true;

  for (const courseModule of modules) {
    const moduleUnlocked = previousModuleCompleted;
    const moduleSections = sections.filter((section) => section.moduleId === courseModule.id);
    let previousSectionCompleted = true;
    const currentSectionStates: SectionAcademicState[] = [];
    for (const section of moduleSections) {
      const sectionUnlocked = moduleUnlocked && previousSectionCompleted;
      const sectionLessons = lessons.filter((lesson) => lesson.sectionId === section.id);
      let previousLessonCompleted = true;
      const currentLessonStates: LessonAcademicState[] = [];
      for (const lesson of sectionLessons) {
        const video = videos.get(lesson.id);
        const videoStatus = !video && !lesson.videoKey && !groups.has(lesson.id) ? "completed" : video?.status ?? "not_started";
        const exerciseCount = exerciseCounts.get(lesson.id) ?? 0;
        const lessonAttempts = attempts.get(lesson.id) ?? [];
        const attemptsCount = lessonAttempts.length;
        const exercisesCompleted = exerciseCount === 0 || attemptsCount > 0;
        const completed = videoStatus === "completed" && exercisesCompleted;
        const unlocked = sectionUnlocked && previousLessonCompleted;
        const started = (video?.progressPercent ?? 0) > 0 || attemptsCount > 0;
        const status: LessonAcademicState["status"] = completed ? "completed" : !unlocked ? "locked" : started ? "in_progress" : "available";
        const lastPercentage = attemptsCount ? scorePercentage(lessonAttempts[0].score, lessonAttempts[0].total) : undefined;
        const bestPercentage = attemptsCount ? Math.max(...lessonAttempts.map((attempt) => scorePercentage(attempt.score, attempt.total))) : undefined;
        const state: LessonAcademicState = { lessonId: lesson.id, sectionId: section.id, unlocked, completed, videoStatus, videoPercent: videoStatus === "completed" ? 100 : Number(video?.progressPercent ?? 0), videoPosition: Number(video?.positionSeconds ?? 0), videoDuration: Number(video?.durationSeconds ?? 0), exerciseCount, exercisesCompleted, attemptsCount, lastPercentage, bestPercentage, masteryReached: masteryReached(bestPercentage), reviewRecommended: completed && exerciseCount > 0 && !masteryReached(bestPercentage), weakSkills: getWeakSkills(parseAnswerResults(lessonAttempts[0]?.answersJson)), status };
        lessonStates.push(state);
        currentLessonStates.push(state);
        previousLessonCompleted = completed;
      }
      const completedLessons = currentLessonStates.filter((state) => state.completed).length;
      const allLessonsCompleted = currentLessonStates.length > 0 && completedLessons === currentLessonStates.length;
      const exam = exams.get(section.id);
      const sectionExamAttempts = exam ? examAttempts.get(exam.id) ?? [] : [];
      const examPassed = sectionExamAttempts.some((attempt) => Boolean(attempt.passed));
      const completed = allLessonsCompleted && Boolean(exam) && examPassed;
      const examUnlocked = sectionUnlocked && allLessonsCompleted && Boolean(exam);
      const rawPercent = currentLessonStates.length ? Math.round((completedLessons / currentLessonStates.length) * 85) : 0;
      const percent = completed ? 100 : Math.min(99, rawPercent + (examPassed ? 15 : 0));
      const started = currentLessonStates.some((state) => state.status === "in_progress" || state.completed) || sectionExamAttempts.length > 0;
      const status: SectionAcademicState["status"] = completed ? "completed" : !sectionUnlocked ? "locked" : started ? "in_progress" : "available";
      const latestExamResults = parseAnswerResults(sectionExamAttempts[0]?.answersJson);
      const lessonResults = currentLessonStates.flatMap((state) => parseAnswerResults(attempts.get(state.lessonId)?.[0]?.answersJson));
      const sectionState: SectionAcademicState = { sectionId: section.id, unlocked: sectionUnlocked, completed, lessonCount: currentLessonStates.length, completedLessons, percent, examId: exam?.id, examTitle: exam?.title, examQuestionCount: exam?.questionCount ?? 0, examPassScore: Math.max(MASTERY_THRESHOLD, exam?.passScore ?? MASTERY_THRESHOLD), examUnlocked, examPassed, examAttempts: sectionExamAttempts.length, bestExamPercentage: sectionExamAttempts.length ? Math.max(...sectionExamAttempts.map((attempt) => attempt.percentage)) : undefined, weakSkills: getWeakSkills(latestExamResults.length ? latestExamResults : lessonResults), status };
      sectionStates.push(sectionState);
      currentSectionStates.push(sectionState);
      previousSectionCompleted = completed;
    }
    const completedSections = currentSectionStates.filter((state) => state.completed).length;
    const completed = currentSectionStates.length > 0 && completedSections === currentSectionStates.length;
    const percent = currentSectionStates.length ? Math.round(currentSectionStates.reduce((sum, state) => sum + state.percent, 0) / currentSectionStates.length) : 0;
    const started = currentSectionStates.some((state) => state.status === "in_progress" || state.completed);
    const status: ModuleAcademicState["status"] = completed ? "completed" : !moduleUnlocked ? "locked" : started ? "in_progress" : "available";
    moduleStates.push({ moduleId: courseModule.id, unlocked: moduleUnlocked, completed, sectionCount: currentSectionStates.length, completedSections, percent, status });
    previousModuleCompleted = completed;
  }
  return { lessonStates, sectionStates, moduleStates };
}

export { getNextLearningStep };
