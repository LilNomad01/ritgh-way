import { getD1 } from '../../db';
export type LessonVideo = { id: number; lessonId: number; videoKey: string; title: string; size: number; position: number; startSeconds: number; endSeconds: number | null; savedPosition?: number; completed?: number; updatedAt?: string };
export async function lessonVideos(lessonId: number, userId: number) {
  const db = getD1();
  const rows = await db.prepare('SELECT v.id, v.lesson_id AS lessonId, v.video_key AS videoKey, v.title, v.size, v.position, v.start_seconds AS startSeconds, v.end_seconds AS endSeconds, p.position_seconds AS savedPosition, p.completed, p.updated_at AS updatedAt FROM lesson_videos v LEFT JOIN video_item_progress p ON p.video_id = v.id AND p.user_id = ? WHERE v.lesson_id = ? ORDER BY v.position, v.id').bind(userId, lessonId).all<LessonVideo>();
  if (rows.results.length) return rows.results;
  const legacy = await db.prepare('SELECT id AS lessonId, video_key AS videoKey, video_name AS title, video_size AS size FROM lessons WHERE id = ? AND video_key IS NOT NULL').bind(lessonId).first<LessonVideo>();
  return legacy ? [{ ...legacy, id: 0, position: 0, startSeconds: 0, endSeconds: null }] : [];
}
export async function importLegacyVideo(lessonId: number) {
  const db = getD1();
  await db.prepare('INSERT INTO lesson_videos (lesson_id, video_key, title, size, position) SELECT id, video_key, COALESCE(video_name, title), COALESCE(video_size, 0), 0 FROM lessons WHERE id = ? AND video_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lesson_videos WHERE lesson_id = ?)').bind(lessonId, lessonId).run();
  await db.prepare("INSERT OR IGNORE INTO video_item_progress (user_id, video_id, position_seconds, duration_seconds, completed, updated_at) SELECT p.user_id, v.id, p.position_seconds, p.duration_seconds, CASE WHEN p.status = 'completed' THEN 1 ELSE 0 END, p.updated_at FROM video_progress p JOIN lesson_videos v ON v.lesson_id = p.lesson_id JOIN lessons l ON l.id = v.lesson_id AND l.video_key = v.video_key WHERE p.lesson_id = ? AND NOT EXISTS (SELECT 1 FROM video_item_progress ip JOIN lesson_videos iv ON iv.id = ip.video_id WHERE ip.user_id = p.user_id AND iv.lesson_id = p.lesson_id)").bind(lessonId).run();
}
