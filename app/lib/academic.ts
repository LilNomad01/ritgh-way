import { assertSupabase, getSupabase } from "../../db/supabase";
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
  const db = getSupabase();
  const [moduleResult, sectionResult, lessonResult, videoResult, attemptResult, exerciseResult, examResult, questionResult, examAttemptResult, videoItemsResult, videoItemProgressResult] = await Promise.all([
    db.from("course_modules").select("id,position").eq("status", "Publicado").order("position").order("id"),
    db.from("course_sections").select("id,moduleId:module_id,position").eq("status", "Publicado").order("module_id").order("position").order("id"),
    db.from("lessons").select("id,sectionId:section_id,position,videoKey:video_key").eq("status", "Publicado").order("section_id").order("position").order("id"),
    db.from("video_progress").select("lessonId:lesson_id,status,progressPercent:progress_percent,positionSeconds:position_seconds,durationSeconds:duration_seconds").eq("user_id", userId),
    db.from("exercise_attempts").select("lessonId:lesson_id,score,total,answersJson:answers_json").eq("user_id", userId).not("lesson_id", "is", null).order("created_at", { ascending: false }).order("id", { ascending: false }),
    db.from("lesson_exercises").select("lessonId:lesson_id").eq("status", "Publicado"),
    db.from("section_exams").select("id,sectionId:section_id,title,passScore:pass_score,position").eq("status", "Publicado").order("position").order("id"),
    db.from("section_exam_questions").select("examId:exam_id").eq("status", "Publicado"),
    db.from("section_exam_attempts").select("examId:exam_id,passed,percentage,answersJson:answers_json").eq("user_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false }),
    db.from("lesson_videos").select("id,lessonId:lesson_id,position").order("position").order("id"),
    db.from("video_item_progress").select("videoId:video_id,completed,positionSeconds:position_seconds,durationSeconds:duration_seconds,updatedAt:updated_at").eq("user_id", userId),
  ]);
  const modules = assertSupabase(moduleResult) as ModuleRow[];
  const sections = assertSupabase(sectionResult) as SectionRow[];
  const lessons = assertSupabase(lessonResult) as LessonRow[];
  const videos = new Map((assertSupabase(videoResult) as VideoRow[]).map((row) => [row.lessonId, row]));
  const itemProgress = new Map((assertSupabase(videoItemProgressResult) as { videoId: number; completed: number; positionSeconds: number; durationSeconds: number; updatedAt: string }[]).map((row) => [row.videoId, row]));
  const groups = new Map<number, { id: number; lessonId: number; completed: number | null; positionSeconds: number | null; durationSeconds: number | null; updatedAt: string | null }[]>();
  for (const video of assertSupabase(videoItemsResult) as { id: number; lessonId: number }[]) {
    const progress = itemProgress.get(video.id);
    const row = { id: video.id, lessonId: video.lessonId, completed: progress?.completed ?? null, positionSeconds: progress?.positionSeconds ?? null, durationSeconds: progress?.durationSeconds ?? null, updatedAt: progress?.updatedAt ?? null };
    groups.set(row.lessonId, [...(groups.get(row.lessonId) ?? []), row]);
  }
  for (const [lessonId, items] of groups) {
    const latest = items.filter(item => item.updatedAt).sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    const completed = items.filter(item => item.completed === 1).length;
    const percent = Math.round(items.reduce((sum, item) => sum + (item.completed ? 100 : item.durationSeconds ? Math.min(99, 100 * (item.positionSeconds ?? 0) / item.durationSeconds) : 0), 0) / items.length);
    videos.set(lessonId, { lessonId, status: completed === items.length ? "completed" : latest ? "watching" : "not_started", progressPercent: percent, positionSeconds: latest?.positionSeconds ?? 0, durationSeconds: latest?.durationSeconds ?? 0 });
  }
  const attempts = new Map<number, AttemptRow[]>();
  for (const row of assertSupabase(attemptResult) as AttemptRow[]) attempts.set(row.lessonId, [...(attempts.get(row.lessonId) ?? []), row]);
  const exerciseCounts = new Map<number, number>();
  for (const row of assertSupabase(exerciseResult) as { lessonId: number }[]) exerciseCounts.set(row.lessonId, (exerciseCounts.get(row.lessonId) ?? 0) + 1);
  const questionCounts = new Map<number, number>();
  for (const row of assertSupabase(questionResult) as { examId: number }[]) questionCounts.set(row.examId, (questionCounts.get(row.examId) ?? 0) + 1);
  const exams = new Map((assertSupabase(examResult) as Omit<ExamRow, "questionCount">[]).filter((row) => questionCounts.has(row.id)).map((row) => [row.sectionId, { ...row, questionCount: questionCounts.get(row.id) ?? 0 }]));
  const examAttempts = new Map<number, ExamAttemptRow[]>();
  for (const row of assertSupabase(examAttemptResult) as ExamAttemptRow[]) examAttempts.set(row.examId, [...(examAttempts.get(row.examId) ?? []), row]);
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
