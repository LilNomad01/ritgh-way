import { RightWayApp } from "../../page";

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  return <RightWayApp initialView="Aulas" lessonId={Number(lessonId)} />;
}
