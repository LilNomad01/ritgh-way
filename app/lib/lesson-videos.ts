import { assertSupabase, getSupabase } from '../../db/supabase';
export type LessonVideo = { id: number; lessonId: number; videoKey: string; title: string; size: number; position: number; startSeconds: number; endSeconds: number | null; savedPosition?: number; completed?: number; updatedAt?: string };
export async function lessonVideos(lessonId: number, userId: number) {
  const db = getSupabase();
  const videoResult = await db.from('lesson_videos').select('id,lessonId:lesson_id,videoKey:video_key,title,size,position,startSeconds:start_seconds,endSeconds:end_seconds').eq('lesson_id', lessonId).order('position').order('id');
  const videos = assertSupabase(videoResult) as LessonVideo[];
  if (videos.length) {
    const progressResult = await db.from('video_item_progress').select('videoId:video_id,savedPosition:position_seconds,completed,updatedAt:updated_at').eq('user_id', userId).in('video_id', videos.map(video => video.id));
    const progress = new Map((assertSupabase(progressResult) as ({ videoId: number } & Partial<LessonVideo>)[]).map(row => [row.videoId, row]));
    return videos.map(video => ({ ...video, ...progress.get(video.id) }));
  }
  const legacyResult = await db.from('lessons').select('lessonId:id,videoKey:video_key,title:video_name,size:video_size').eq('id', lessonId).not('video_key', 'is', null).maybeSingle();
  const legacy = assertSupabase(legacyResult) as LessonVideo | null;
  return legacy ? [{ ...legacy, id: 0, position: 0, startSeconds: 0, endSeconds: null }] : [];
}
export async function importLegacyVideo(lessonId: number) {
  const db = getSupabase();
  const [existingResult, lessonResult] = await Promise.all([
    db.from('lesson_videos').select('id,video_key').eq('lesson_id', lessonId).limit(1),
    db.from('lessons').select('id,title,video_key,video_name,video_size').eq('id', lessonId).not('video_key', 'is', null).maybeSingle(),
  ]);
  let video = (assertSupabase(existingResult) as { id: number; video_key: string }[])[0];
  const lesson = assertSupabase(lessonResult) as { id: number; title: string; video_key: string; video_name: string | null; video_size: number | null } | null;
  if (!video && lesson) {
    const inserted = assertSupabase(await db.from('lesson_videos').insert({ lesson_id: lesson.id, video_key: lesson.video_key, title: lesson.video_name || lesson.title, size: lesson.video_size || 0, position: 0 }).select('id,video_key').single()) as { id: number; video_key: string };
    video = inserted;
  }
  if (!video || !lesson || video.video_key !== lesson.video_key) return;
  const progress = assertSupabase(await db.from('video_progress').select('user_id,position_seconds,duration_seconds,status,updated_at').eq('lesson_id', lessonId)) as { user_id: number; position_seconds: number; duration_seconds: number; status: string; updated_at: string }[];
  if (progress.length) await db.from('video_item_progress').upsert(progress.map(row => ({ user_id: row.user_id, video_id: video.id, position_seconds: row.position_seconds, duration_seconds: row.duration_seconds, completed: row.status === 'completed' ? 1 : 0, updated_at: row.updated_at })), { onConflict: 'user_id,video_id', ignoreDuplicates: true }).throwOnError();
}
