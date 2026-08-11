import { RightWayApp } from "../../../page";

export default async function ExamSessionPage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  return <RightWayApp initialView="Aulas" examSectionId={Number(sectionId)} examSession />;
}
