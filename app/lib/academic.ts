import { getD1 } from "../../db";

export type LessonAcademicState = {
  lessonId: number;
  unlocked: boolean;
  completed: boolean;
  videoStatus: "not_started" | "watching" | "completed";
  videoPercent: number;
  videoPosition: number;
  videoDuration: number;
  exerciseCount: number;
  exercisesCompleted: boolean;
  attemptsCount: number;
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
type LessonRow = { id: number; sectionId: number; position: number };
type VideoRow = { lessonId: number; status: LessonAcademicState["videoStatus"]; progressPercent: number; positionSeconds: number; durationSeconds: number };
type AttemptRow = { lessonId: number; attemptsCount: number };
type ExerciseCountRow = { lessonId: number; exerciseCount: number };
type ExamRow = { id: number; sectionId: number; title: string; passScore: number; questionCount: number };
type ExamAttemptRow = { examId: number; attemptsCount: number; passed: number; bestPercentage: number };

export async function computeAcademicState(userId: number): Promise<{ lessonStates: LessonAcademicState[]; sectionStates: SectionAcademicState[]; moduleStates: ModuleAcademicState[] }> {
  const db = getD1();
  const [moduleResult, sectionResult, lessonResult, videoResult, attemptResult, exerciseResult, examResult, examAttemptResult] = await Promise.all([
    db.prepare("SELECT id, position FROM course_modules WHERE status = 'Publicado' ORDER BY position, id").all<ModuleRow>(),
    db.prepare("SELECT id, module_id AS moduleId, position FROM course_sections WHERE status = 'Publicado' ORDER BY module_id, position, id").all<SectionRow>(),
    db.prepare("SELECT id, section_id AS sectionId, position FROM lessons WHERE status = 'Publicado' ORDER BY section_id, position, id").all<LessonRow>(),
    db.prepare("SELECT lesson_id AS lessonId, status, progress_percent AS progressPercent, position_seconds AS positionSeconds, duration_seconds AS durationSeconds FROM video_progress WHERE user_id = ?").bind(userId).all<VideoRow>(),
    db.prepare("SELECT lesson_id AS lessonId, COUNT(*) AS attemptsCount FROM exercise_attempts WHERE user_id = ? AND lesson_id IS NOT NULL GROUP BY lesson_id").bind(userId).all<AttemptRow>(),
    db.prepare("SELECT lesson_id AS lessonId, COUNT(*) AS exerciseCount FROM lesson_exercises WHERE status = 'Publicado' GROUP BY lesson_id").all<ExerciseCountRow>(),
    db.prepare("SELECT e.id, e.section_id AS sectionId, e.title, e.pass_score AS passScore, COUNT(q.id) AS questionCount FROM section_exams e JOIN section_exam_questions q ON q.exam_id = e.id AND q.status = 'Publicado' WHERE e.status = 'Publicado' GROUP BY e.id ORDER BY e.position, e.id").all<ExamRow>(),
    db.prepare("SELECT exam_id AS examId, COUNT(*) AS attemptsCount, MAX(passed) AS passed, MAX(percentage) AS bestPercentage FROM section_exam_attempts WHERE user_id = ? GROUP BY exam_id").bind(userId).all<ExamAttemptRow>(),
  ]);
  const modules = moduleResult.results as ModuleRow[];
  const sections = sectionResult.results as SectionRow[];
  const lessons = lessonResult.results as LessonRow[];
  const videos = new Map((videoResult.results as VideoRow[]).map((row) => [row.lessonId, row]));
  const attempts = new Map((attemptResult.results as AttemptRow[]).map((row) => [row.lessonId, Number(row.attemptsCount)]));
  const exerciseCounts = new Map((exerciseResult.results as ExerciseCountRow[]).map((row) => [row.lessonId, Number(row.exerciseCount)]));
  const exams = new Map((examResult.results as ExamRow[]).map((row) => [row.sectionId, { ...row, questionCount: Number(row.questionCount) }]));
  const examAttempts = new Map((examAttemptResult.results as ExamAttemptRow[]).map((row) => [row.examId, { attemptsCount: Number(row.attemptsCount), passed: Boolean(row.passed), bestPercentage: Number(row.bestPercentage) }]));
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
        const videoStatus = video?.status ?? "not_started";
        const exerciseCount = exerciseCounts.get(lesson.id) ?? 0;
        const attemptsCount = attempts.get(lesson.id) ?? 0;
        const exercisesCompleted = exerciseCount > 0 && attemptsCount > 0;
        const completed = videoStatus === "completed" && exercisesCompleted;
        const unlocked = sectionUnlocked && previousLessonCompleted;
        const started = (video?.progressPercent ?? 0) > 0 || attemptsCount > 0;
        const status: LessonAcademicState["status"] = completed ? "completed" : !unlocked ? "locked" : started ? "in_progress" : "available";
        const state: LessonAcademicState = { lessonId: lesson.id, unlocked, completed, videoStatus, videoPercent: Number(video?.progressPercent ?? 0), videoPosition: Number(video?.positionSeconds ?? 0), videoDuration: Number(video?.durationSeconds ?? 0), exerciseCount, exercisesCompleted, attemptsCount, status };
        lessonStates.push(state);
        currentLessonStates.push(state);
        previousLessonCompleted = completed;
      }
      const completedLessons = currentLessonStates.filter((state) => state.completed).length;
      const allLessonsCompleted = currentLessonStates.length > 0 && completedLessons === currentLessonStates.length;
      const exam = exams.get(section.id);
      const examAttempt = exam ? examAttempts.get(exam.id) : undefined;
      const examPassed = Boolean(examAttempt?.passed);
      const completed = allLessonsCompleted && Boolean(exam) && examPassed;
      const examUnlocked = sectionUnlocked && allLessonsCompleted && Boolean(exam);
      const rawPercent = currentLessonStates.length ? Math.round((completedLessons / currentLessonStates.length) * 85) : 0;
      const percent = completed ? 100 : Math.min(99, rawPercent + (examPassed ? 15 : 0));
      const started = currentLessonStates.some((state) => state.status === "in_progress" || state.completed) || Boolean(examAttempt?.attemptsCount);
      const status: SectionAcademicState["status"] = completed ? "completed" : !sectionUnlocked ? "locked" : started ? "in_progress" : "available";
      const sectionState: SectionAcademicState = { sectionId: section.id, unlocked: sectionUnlocked, completed, lessonCount: currentLessonStates.length, completedLessons, percent, examId: exam?.id, examTitle: exam?.title, examQuestionCount: exam?.questionCount ?? 0, examPassScore: exam?.passScore, examUnlocked, examPassed, examAttempts: examAttempt?.attemptsCount ?? 0, bestExamPercentage: examAttempt?.bestPercentage, status };
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
