import { RightWayApp } from "../../page";

export default async function PracticeDetailPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  return <RightWayApp initialView="Praticar" practiceLessonId={Number(lessonId)} />;
}
