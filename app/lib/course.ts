export type Artwork = {
  imageKey?: string;
  imageFit?: "cover" | "contain" | "fill";
  imageZoom?: number;
  imageOverlay?: number;
  imagePositionX?: number;
  imagePositionY?: number;
};

export type CourseModule = Artwork & {
  id: number;
  title: string;
  level: string;
  description: string;
  status: string;
  position: number;
};

export type CourseSection = Artwork & {
  id: number;
  moduleId: number;
  title: string;
  position: number;
};

export type CourseLesson = Artwork & {
  id: number;
  sectionId: number;
  title: string;
  duration: string;
  lessonType: string;
  status: string;
  position: number;
  videoKey?: string;
};

export type CourseProgress = {
  lessonId?: number;
  lessonSlug: string;
  progressPercent: number;
  bestScore?: number;
  attemptsCount?: number;
  completedAt?: string;
};

export type CourseData = {
  modules: CourseModule[];
  sections: CourseSection[];
  lessons: CourseLesson[];
};

export function slugLesson(lesson: CourseLesson) {
  return lesson.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function progressForLesson(lesson: CourseLesson, progress: CourseProgress[]) {
  return progress.find((item) => item.lessonId === lesson.id || item.lessonSlug === slugLesson(lesson) || item.lessonSlug === `${slugLesson(lesson)}-practice` || item.lessonSlug === `lesson-${lesson.id}-practice`)?.progressPercent ?? 0;
}

export function orderedCourse(data: CourseData) {
  return {
    modules: data.modules.slice().sort((left, right) => left.position - right.position || left.id - right.id),
    sections: data.sections.slice().sort((left, right) => left.position - right.position || left.id - right.id),
    lessons: data.lessons.slice().sort((left, right) => left.position - right.position || left.id - right.id),
  };
}
