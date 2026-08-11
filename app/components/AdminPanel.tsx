"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MaterialIcon } from "./MaterialIcon";

type Student = { id: number; fullName: string; email: string; level: string; placementScore: number; status: string; createdAt: string };
type Artwork = { imageKey?: string; imageFit?: "cover" | "contain" | "fill"; imageZoom?: number; imageOverlay?: number; imagePositionX?: number; imagePositionY?: number };
type Module = Artwork & { id: number; title: string; level: string; description: string; status: string; position: number };
type Section = Artwork & { id: number; moduleId: number; title: string; description: string; status: string; position: number };
type Lesson = Artwork & { id: number; sectionId: number; title: string; description: string; duration: string; lessonType: string; status: string; position: number; videoKey?: string; videoName?: string; videoSize?: number };
type Exercise = { id: number; lessonId: number; exerciseType: string; category: string; title: string; prompt: string; optionsJson?: string; correctAnswer: string; acceptedAnswersJson?: string; explanation: string; speech?: string; skillsJson?: string; status: string; position: number };
type Exam = { id: number; sectionId: number; title: string; description: string; status: string; passScore: number; position: number };
type ExamQuestion = { id: number; examId: number; questionType: string; category: string; prompt: string; optionsJson?: string; correctAnswer: string; acceptedAnswersJson?: string; explanation: string; status: string; position: number };
type Data = { students: Student[]; modules: Module[]; sections: Section[]; lessons: Lesson[]; exercises: Exercise[]; exams: Exam[]; examQuestions: ExamQuestion[] };
type Entity = "student" | "module" | "section" | "lesson" | "exercise" | "exam" | "examQuestion";

const emptyData: Data = { students: [], modules: [], sections: [], lessons: [], exercises: [], exams: [], examQuestions: [] };
const VIDEO_CHUNK_SIZE = 8 * 1024 * 1024;
const ARTWORK_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_ARTWORK_SOURCE_SIZE = 25 * 1024 * 1024;
const MAX_ARTWORK_DIMENSION = 2400;
const TARGET_ARTWORK_SIZE = 2.5 * 1024 * 1024;

async function imageBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

async function optimizeArtwork(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("O arquivo precisa ser uma imagem.");
  if (file.size > MAX_ARTWORK_SOURCE_SIZE) throw new Error("A imagem original deve ter no máximo 25 MB.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Não foi possível abrir essa imagem. Use JPG, PNG, WebP ou AVIF."));
      element.src = objectUrl;
    });
    const scale = Math.min(1, MAX_ARTWORK_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Seu navegador não conseguiu preparar a imagem.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let optimized: Blob | null = null;
    for (const quality of [0.86, 0.76, 0.66, 0.56]) {
      optimized = await imageBlob(canvas, quality);
      if (optimized && optimized.size <= TARGET_ARTWORK_SIZE) break;
    }
    if (!optimized) throw new Error("Seu navegador não conseguiu otimizar a imagem.");
    const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 100) || "capa";
    return new File([optimized], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function fileSizeLabel(size?: number) {
  if (!size) return "Vídeo";
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function moduleLessons(data: Data, moduleId: number) {
  const sectionIds = data.sections.filter((section) => section.moduleId === moduleId).map((section) => section.id);
  return data.lessons.filter((lesson) => sectionIds.includes(lesson.sectionId)).sort((left, right) => left.position - right.position || left.id - right.id);
}

function statusClass(status: string) {
  return status === "Publicado" ? "status-live" : "status-draft";
}

async function securedFetch(input: RequestInfo | URL, init?: RequestInit) {
  let response = await fetch(input, init);
  if (response.status === 401) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST" });
    if (refreshed.ok) response = await fetch(input, init);
  }
  return response;
}

function ArtworkPreview({ item, className = "", icon = "school" }: { item: Artwork; className?: string; icon?: string }) {
  const imageUrl = item.imageKey ? `/api/media?key=${encodeURIComponent(item.imageKey)}` : "";
  return <div className={`artwork-preview ${className}`.trim()}>
    {imageUrl ? <img src={imageUrl} alt="" style={{ objectFit: item.imageFit ?? "cover", objectPosition: `${item.imagePositionX ?? 50}% ${item.imagePositionY ?? 50}%`, transform: `scale(${(item.imageZoom ?? 100) / 100})` }} /> : <div className="artwork-fallback"><MaterialIcon name={icon} /><span>RIGHT WAY</span></div>}
    <span className="artwork-overlay" style={{ opacity: (item.imageOverlay ?? 22) / 100 }} />
  </div>;
}

export function AdminPanel() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ entity: Entity; values: Record<string, string | number> } | null>(null);
  const [previewing, setPreviewing] = useState<Lesson | null>(null);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [practiceLessonId, setPracticeLessonId] = useState<number | null>(null);
  const [examSectionId, setExamSectionId] = useState<number | null>(null);
  const [editorTab, setEditorTab] = useState("geral");
  const [uploadLesson, setUploadLesson] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [artworkEditor, setArtworkEditor] = useState<{ entity: "module" | "section" | "lesson"; item: (Module | Section | Lesson) & { title: string } } | null>(null);
  const [artworkDevice, setArtworkDevice] = useState<"desktop" | "mobile">("desktop");
  const [artworkUploading, setArtworkUploading] = useState(false);
  const [artworkUploadProgress, setArtworkUploadProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const artworkFileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await securedFetch("/api/admin");
      if (!response.ok) throw new Error("Não foi possível carregar o painel.");
      setData(await response.json());
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    securedFetch("/api/admin").then(async (response) => {
      if (!response.ok) throw new Error("Não foi possível carregar o painel.");
      return response.json() as Promise<Data>;
    }).then((result) => {
      if (!cancelled) { setData(result); setError(""); }
    }).catch((loadError) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Erro ao carregar.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  async function remove(entity: Entity, id: number) {
    if (!window.confirm("Deseja realmente excluir este item?")) return;
    await securedFetch(`/api/admin?entity=${entity}&id=${id}`, { method: "DELETE" });
    await load();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const hasId = Boolean(editing.values.id);
    const response = await securedFetch("/api/admin", { method: hasId ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: editing.entity, ...editing.values }) });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      setError(result.error ?? "Não foi possível salvar.");
      return;
    }
    setEditing(null);
    setEditorTab("geral");
    await load();
  }

  async function readResponse(response: Response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as { error?: string; [key: string]: unknown };
    } catch {
      return { error: text };
    }
  }

  function newLessonValues(moduleId?: number, sectionId?: number) {
    const section = sectionId ? data.sections.find((item) => item.id === sectionId) : data.sections.find((item) => item.moduleId === moduleId) ?? data.sections[0];
    const lessonCount = section ? data.lessons.filter((lesson) => lesson.sectionId === section.id).length : data.lessons.length;
    return { title: "", description: "", sectionId: section?.id ?? 0, duration: "10 min", lessonType: "Vídeo + prática", status: "Rascunho", position: lessonCount + 1 };
  }

  async function reorderLessons(sectionId: number, lessonId: number, direction: -1 | 1) {
    const lessons = data.lessons.filter((lesson) => lesson.sectionId === sectionId).sort((left, right) => left.position - right.position || left.id - right.id);
    const current = lessons.findIndex((lesson) => lesson.id === lessonId);
    const next = current + direction;
    if (current < 0 || next < 0 || next >= lessons.length) return;
    const ordered = lessons.slice();
    [ordered[current], ordered[next]] = [ordered[next], ordered[current]];
    const response = await securedFetch("/api/admin", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reorder", entity: "lesson", orderedIds: ordered.map((lesson) => lesson.id) }) });
    if (!response.ok) setError((await readResponse(response)).error ?? "Não foi possível reordenar.");
    await load();
  }

  function newExerciseValues(lessonId: number) {
    const count = data.exercises.filter((exercise) => exercise.lessonId === lessonId).length;
    return { lessonId, exerciseType: "choice", category: "Compreensão", title: "", prompt: "", optionsJson: "[]", correctAnswer: "", acceptedAnswersJson: "[]", explanation: "", speech: "", skillsJson: "[]", status: "Rascunho", position: count + 1 };
  }

  function newExamQuestionValues(examId: number) {
    const count = data.examQuestions.filter((question) => question.examId === examId).length;
    return { examId, questionType: "choice", category: "Avaliação", prompt: "", optionsJson: "[]", correctAnswer: "", acceptedAnswersJson: "[]", explanation: "", status: "Rascunho", position: count + 1 };
  }

  async function reorderExamQuestions(examId: number, questionId: number, direction: -1 | 1) {
    const questions = data.examQuestions.filter((question) => question.examId === examId).sort((left, right) => left.position - right.position || left.id - right.id);
    const current = questions.findIndex((question) => question.id === questionId);
    const next = current + direction;
    if (current < 0 || next < 0 || next >= questions.length) return;
    const ordered = questions.slice();
    [ordered[current], ordered[next]] = [ordered[next], ordered[current]];
    const response = await securedFetch("/api/admin", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reorder", entity: "examQuestion", orderedIds: ordered.map((question) => question.id) }) });
    if (!response.ok) setError((await readResponse(response)).error ?? "Não foi possível reordenar as questões.");
    await load();
  }

  async function reorderExercises(exerciseId: number, direction: -1 | 1) {
    if (!practiceLessonId) return;
    const exercises = data.exercises.filter((exercise) => exercise.lessonId === practiceLessonId).sort((left, right) => left.position - right.position || left.id - right.id);
    const current = exercises.findIndex((exercise) => exercise.id === exerciseId);
    const next = current + direction;
    if (current < 0 || next < 0 || next >= exercises.length) return;
    const ordered = exercises.slice();
    [ordered[current], ordered[next]] = [ordered[next], ordered[current]];
    const response = await securedFetch("/api/admin", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reorder", entity: "exercise", orderedIds: ordered.map((exercise) => exercise.id) }) });
    if (!response.ok) setError((await readResponse(response)).error ?? "Não foi possível reordenar os exercícios.");
    await load();
  }

  async function duplicateLesson(lessonId: number) {
    const response = await securedFetch("/api/admin", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "duplicateLesson", id: lessonId }) });
    if (!response.ok) setError((await readResponse(response)).error ?? "Não foi possível duplicar a aula.");
    setOpenMenu(null);
    await load();
  }

  async function toggleLessonStatus(lesson: Lesson) {
    const nextStatus = lesson.status === "Publicado" ? "Rascunho" : "Publicado";
    const response = await securedFetch("/api/admin", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: "lesson", ...lesson, status: nextStatus }) });
    if (!response.ok) setError((await readResponse(response)).error ?? "Não foi possível alterar o status.");
    setOpenMenu(null);
    await load();
  }

  async function uploadArtwork(file?: File) {
    if (!file || !artworkEditor) return;
    setArtworkUploading(true);
    setArtworkUploadProgress(2);
    setError("");
    let pendingUpload: { key: string; uploadId: string } | null = null;
    try {
      const optimized = await optimizeArtwork(file);
      setArtworkUploadProgress(12);
      const entity = artworkEditor.entity;
      const id = artworkEditor.item.id;
      const init = await securedFetch("/api/media", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "init", entity, id, name: optimized.name, type: optimized.type, size: optimized.size }) });
      const initResult = await readResponse(init) as { key?: string; uploadId?: string; chunkSize?: number; error?: string };
      if (!init.ok || !initResult.key || !initResult.uploadId) throw new Error(init.status === 413 ? "A imagem ainda está grande demais. Escolha uma imagem de até 25 MB." : initResult.error ?? "Não foi possível iniciar o envio da capa.");
      pendingUpload = { key: initResult.key, uploadId: initResult.uploadId };
      const chunkSize = Number(initResult.chunkSize) || ARTWORK_CHUNK_SIZE;
      const parts: { partNumber: number; etag: string }[] = [];

      for (let start = 0, partNumber = 1; start < optimized.size; start += chunkSize, partNumber += 1) {
        const chunk = optimized.slice(start, Math.min(start + chunkSize, optimized.size));
        const response = await securedFetch(`/api/media?action=part&key=${encodeURIComponent(initResult.key)}&uploadId=${encodeURIComponent(initResult.uploadId)}&partNumber=${partNumber}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: chunk });
        const result = await readResponse(response) as { part?: { partNumber: number; etag: string }; error?: string };
        if (!response.ok || !result.part) throw new Error(response.status === 413 ? "Uma parte da imagem ultrapassou o limite de envio." : result.error ?? "Falha ao enviar uma parte da imagem.");
        parts.push(result.part);
        setArtworkUploadProgress(12 + Math.round((Math.min(start + chunkSize, optimized.size) / optimized.size) * 78));
      }

      const complete = await securedFetch("/api/media", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete", entity, id, key: initResult.key, uploadId: initResult.uploadId, parts }) });
      const completeResult = await readResponse(complete) as { key?: string; error?: string };
      if (!complete.ok || !completeResult.key) throw new Error(completeResult.error ?? "Não foi possível finalizar a capa.");
      pendingUpload = null;
      setArtworkUploadProgress(100);
      setArtworkEditor((current) => current ? { ...current, item: { ...current.item, imageKey: completeResult.key } } : null);
      setData((current) => {
        if (entity === "module") return { ...current, modules: current.modules.map((item) => item.id === id ? { ...item, imageKey: completeResult.key } : item) };
        if (entity === "section") return { ...current, sections: current.sections.map((item) => item.id === id ? { ...item, imageKey: completeResult.key } : item) };
        return { ...current, lessons: current.lessons.map((item) => item.id === id ? { ...item, imageKey: completeResult.key } : item) };
      });
    } catch (uploadError) {
      if (pendingUpload) {
        await securedFetch("/api/media", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "abort", key: pendingUpload.key, uploadId: pendingUpload.uploadId }) }).catch(() => undefined);
      }
      setError(uploadError instanceof Error ? uploadError.message : "Não foi possível enviar a capa.");
    } finally {
      setArtworkUploading(false);
      setTimeout(() => setArtworkUploadProgress(0), 500);
      if (artworkFileRef.current) artworkFileRef.current.value = "";
    }
  }

  async function saveArtwork() {
    if (!artworkEditor) return;
    const response = await securedFetch("/api/admin", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "updateArtwork", entity: artworkEditor.entity, id: artworkEditor.item.id, imageFit: artworkEditor.item.imageFit ?? "cover", imageZoom: artworkEditor.item.imageZoom ?? 100, imageOverlay: artworkEditor.item.imageOverlay ?? 22, imagePositionX: artworkEditor.item.imagePositionX ?? 50, imagePositionY: artworkEditor.item.imagePositionY ?? 50 }) });
    if (!response.ok) { setError((await readResponse(response)).error ?? "Não foi possível salvar a capa."); return; }
    setArtworkEditor(null);
    await load();
  }

  function openArtworkEditor(entity: "module" | "section" | "lesson", item: (Module | Section | Lesson) & { title: string }) {
    setArtworkDevice("desktop");
    setArtworkEditor({ entity, item });
  }

  async function upload(file?: File) {
    if (!file || !uploadLesson) { setUploadMessage("Selecione a aula e o arquivo de vídeo."); return; }
    setUploading(true);
    setUploadProgress(0);
    setUploadMessage("");
    try {
      if (!file.type.startsWith("video/")) throw new Error("O arquivo precisa ser um vídeo.");
      const init = await securedFetch("/api/videos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "init", lessonId: Number(uploadLesson), name: file.name, type: file.type, size: file.size }) });
      const initResult = await readResponse(init) as { key?: string; uploadId?: string; chunkSize?: number; error?: string };
      if (!init.ok || !initResult.key || !initResult.uploadId) throw new Error(initResult.error ?? "Não foi possível iniciar o upload.");
      const chunkSize = Number(initResult.chunkSize) || VIDEO_CHUNK_SIZE;
      const parts: { partNumber: number; etag: string }[] = [];
      for (let start = 0, partNumber = 1; start < file.size; start += chunkSize, partNumber += 1) {
        const chunk = file.slice(start, Math.min(start + chunkSize, file.size));
        const response = await securedFetch(`/api/videos?action=part&key=${encodeURIComponent(initResult.key)}&uploadId=${encodeURIComponent(initResult.uploadId)}&partNumber=${partNumber}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: chunk });
        const result = await readResponse(response) as { part?: { partNumber: number; etag: string }; error?: string };
        if (!response.ok || !result.part) throw new Error(result.error ?? "Falha ao enviar uma parte do vídeo.");
        parts.push(result.part);
        setUploadProgress(Math.round((Math.min(start + chunkSize, file.size) / file.size) * 100));
      }
      const complete = await securedFetch("/api/videos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "complete", lessonId: Number(uploadLesson), key: initResult.key, uploadId: initResult.uploadId, parts, name: file.name, size: file.size }) });
      const completeResult = await readResponse(complete);
      if (!complete.ok) throw new Error(completeResult.error ?? "Não foi possível finalizar o upload.");
      setUploadMessage("Vídeo enviado e vinculado à aula com sucesso.");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (uploadError) {
      setUploadMessage(uploadError instanceof Error ? uploadError.message : "Falha no upload.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  const publishedLessons = useMemo(() => data.lessons.filter((lesson) => lesson.status === "Publicado").length, [data.lessons]);
  const averageScore = data.students.length ? Math.round(data.students.reduce((sum, student) => sum + student.placementScore, 0) / data.students.length * 10) / 10 : 0;
  const selectedVideoLesson = data.lessons.find((lesson) => String(lesson.id) === uploadLesson);
  const orderedModules = data.modules.slice().sort((left, right) => left.position - right.position || left.id - right.id);

  return (
    <div className="admin-page page-view">
      <div className="admin-header"><div><span className="eyebrow">RIGHT WAY CONTROL CENTER</span><h1>Painel administrativo</h1><p>Gerencie alunos, trilhas, aulas e vídeos em um só lugar.</p></div><button className="primary-button icon-button" onClick={() => setEditing({ entity: "student", values: { fullName: "", email: "", level: "Básico", status: "Ativo", placementScore: 0 } })}><MaterialIcon name="person_add" />Novo aluno</button></div>
      <nav className="admin-tabs">{[["overview", "Visão geral", "dashboard"], ["students", "Alunos", "group"], ["content", "Conteúdo", "video_library"], ["videos", "Vídeos", "smart_display"]].map(([key, label, icon]) => <button className={tab === key ? "active" : ""} onClick={() => { setTab(key); if (key !== "content") setSelectedModuleId(null); }} key={key}><MaterialIcon name={icon} filled={tab === key} />{label}</button>)}</nav>
      {error && <div className="admin-alert">{error}<button onClick={load}>Tentar novamente</button></div>}
      {loading ? <div className="admin-loading">Carregando dados...</div> : <>
        {tab === "overview" && <div className="admin-overview"><div className="admin-metrics"><article><span>ALUNOS ATIVOS</span><strong>{data.students.filter((student) => student.status === "Ativo").length}</strong><small>Perfis cadastrados</small></article><article><span>AULAS PUBLICADAS</span><strong>{publishedLessons}</strong><small>Em {data.modules.length} módulos</small></article><article><span>VÍDEOS ENVIADOS</span><strong>{data.lessons.filter((lesson) => lesson.videoKey).length}</strong><small>Armazenamento seguro</small></article><article><span>MÉDIA DE NÍVEL</span><strong>{averageScore}</strong><small>Pontos no teste</small></article></div><div className="admin-grid"><section><div className="panel-title"><h2>Alunos recentes</h2><button onClick={() => setTab("students")}>Ver todos →</button></div>{data.students.slice(0, 5).map((student) => <div className="recent-row" key={student.id}><span>{student.fullName.split(" ").map((part) => part[0]).slice(0,2).join("")}</span><div><strong>{student.fullName}</strong><small>{student.email}</small></div><b>{student.level}</b></div>)}{!data.students.length && <p className="empty-state">Os novos cadastros aparecerão aqui.</p>}</section><section><div className="panel-title"><h2>Conteúdo</h2><button onClick={() => setTab("content")}>Gerenciar →</button></div>{data.modules.map((module) => <div className="content-health" key={module.id}><span>{module.position}</span><div><strong>{module.title}</strong><small>{module.level} · {data.sections.filter((section) => section.moduleId === module.id).length} seções</small></div><b>{module.status}</b></div>)}</section></div></div>}

        {tab === "students" && <section className="admin-table-panel"><div className="panel-title"><div><h2>Alunos</h2><p>{data.students.length} cadastros na plataforma</p></div><button className="outline-button" onClick={() => setEditing({ entity: "student", values: { fullName: "", email: "", level: "Básico", status: "Ativo", placementScore: 0 } })}>+ Adicionar aluno</button></div><div className="admin-table-wrap"><table><thead><tr><th>Aluno</th><th>Nível</th><th>Teste</th><th>Status</th><th>Cadastro</th><th /></tr></thead><tbody>{data.students.map((student) => <tr key={student.id}><td><div className="student-cell"><span>{student.fullName.slice(0,2).toUpperCase()}</span><div><strong>{student.fullName}</strong><small>{student.email}</small></div></div></td><td><b className="level-tag">{student.level}</b></td><td>{student.placementScore}/8</td><td><b className={student.status === "Ativo" ? "status-live" : "status-draft"}>{student.status}</b></td><td>{new Date(student.createdAt).toLocaleDateString("pt-BR")}</td><td><div className="row-actions"><button onClick={() => setEditing({ entity: "student", values: { ...student } })}>Editar</button><button className="delete" onClick={() => remove("student", student.id)}>Excluir</button></div></td></tr>)}</tbody></table>{!data.students.length && <p className="empty-state">Nenhum aluno cadastrado ainda.</p>}</div></section>}

        {tab === "content" && <section className="course-admin visual-course-admin">
          {!selectedModuleId ? <>
            <div className="course-admin-head">
              <div><span className="eyebrow">CONTEÚDO DO CURSO</span><h2>Biblioteca de módulos</h2><p>Veja toda a plataforma de uma vez e entre em um módulo para editar seções, aulas e capas.</p></div>
              <div><button className="outline-button icon-button" onClick={() => { window.location.href = "/"; }}><MaterialIcon name="visibility" />Ver como aluno</button><button className="primary-button icon-button" onClick={() => setEditing({ entity: "module", values: { title: "", level: "Básico", description: "", status: "Rascunho", position: orderedModules.length + 1 } })}><MaterialIcon name="add" />Novo módulo</button></div>
            </div>
            <div className="course-admin-summary"><div><MaterialIcon name="library_books" /><span><strong>{orderedModules.length}</strong><small>Módulos</small></span></div><div><MaterialIcon name="view_quilt" /><span><strong>{data.sections.length}</strong><small>Seções</small></span></div><div><MaterialIcon name="smart_display" /><span><strong>{data.lessons.length}</strong><small>Aulas</small></span></div><div><MaterialIcon name="public" /><span><strong>{publishedLessons}</strong><small>Publicadas</small></span></div></div>
            <div className="module-visual-grid">
              {orderedModules.map((module, moduleIndex) => {
                const sections = data.sections.filter((section) => section.moduleId === module.id);
                const lessons = moduleLessons(data, module.id);
                return <article className="module-visual-card" key={module.id}>
                  <ArtworkPreview item={module} className="module-cover" icon={moduleIndex === 0 ? "forum" : moduleIndex === 1 ? "travel_explore" : "psychology"} />
                  <div className="module-card-top"><span>{String(moduleIndex + 1).padStart(2, "0")}</span><b className={statusClass(module.status)}>{module.status}</b></div>
                  <div className="module-card-copy"><small>{module.level}</small><h3>{module.title}</h3><p>{module.description}</p><div><span><MaterialIcon name="view_quilt" />{sections.length} seções</span><span><MaterialIcon name="play_lesson" />{lessons.length} aulas</span></div></div>
                  <div className="module-card-actions"><button onClick={() => openArtworkEditor("module", module)} aria-label={`Editar capa de ${module.title}`}><MaterialIcon name="image" />Capa</button><button className="open-module" onClick={() => setSelectedModuleId(module.id)}>Gerenciar<MaterialIcon name="arrow_forward" /></button></div>
                </article>;
              })}
              <button className="module-create-card" onClick={() => setEditing({ entity: "module", values: { title: "", level: "Básico", description: "", status: "Rascunho", position: orderedModules.length + 1 } })}><span><MaterialIcon name="add" /></span><strong>Criar novo módulo</strong><small>Adicione um nível ou uma nova trilha.</small></button>
            </div>
          </> : (() => {
            const currentModule = data.modules.find((item) => item.id === selectedModuleId);
            if (!currentModule) return null;
            const sections = data.sections.filter((section) => section.moduleId === currentModule.id).sort((left, right) => left.position - right.position || left.id - right.id);
            const lessons = moduleLessons(data, currentModule.id);
            return <div className="module-detail-view">
              <button className="module-back-button" onClick={() => setSelectedModuleId(null)}><MaterialIcon name="arrow_back" />Voltar para módulos</button>
              <header className="module-detail-hero">
                <ArtworkPreview item={currentModule} className="module-detail-cover" icon="school" />
                <div className="module-detail-copy"><span className="eyebrow">{currentModule.level} · MÓDULO {String(currentModule.position).padStart(2, "0")}</span><h2>{currentModule.title}</h2><p>{currentModule.description}</p><div><b className={statusClass(currentModule.status)}>{currentModule.status}</b><span><MaterialIcon name="view_quilt" />{sections.length} seções</span><span><MaterialIcon name="play_lesson" />{lessons.length} aulas</span></div></div>
                <div className="module-detail-actions"><button onClick={() => openArtworkEditor("module", currentModule)}><MaterialIcon name="image" />Editar capa</button><button onClick={() => setEditing({ entity: "module", values: { ...currentModule } })}><MaterialIcon name="edit" />Editar módulo</button><button className="primary-button" onClick={() => setEditing({ entity: "section", values: { title: "", description: "", status: "Rascunho", moduleId: currentModule.id, position: sections.length + 1 } })}><MaterialIcon name="add" />Nova seção</button></div>
              </header>
              <div className="module-structure-head"><div><span className="eyebrow">ESTRUTURA DO MÓDULO</span><h3>Seções e aulas</h3></div><button className="outline-button icon-button" onClick={() => setEditing({ entity: "lesson", values: newLessonValues(currentModule.id) })}><MaterialIcon name="add" />Nova aula</button></div>
              <div className="section-manager-list">{sections.map((section, sectionIndex) => {
                const sectionLessons = data.lessons.filter((lesson) => lesson.sectionId === section.id).sort((left, right) => left.position - right.position || left.id - right.id);
                return <article className="section-manager-card" key={section.id}>
                  <header><ArtworkPreview item={section} className="section-cover" icon="collections_bookmark" /><div><small>SEÇÃO {String(sectionIndex + 1).padStart(2, "0")}</small><h4>{section.title}</h4><p>{sectionLessons.length} aulas · {data.exams.find((exam) => exam.sectionId === section.id) ? `${data.examQuestions.filter((question) => question.examId === data.exams.find((exam) => exam.sectionId === section.id)?.id).length} questões na prova` : "prova não configurada"}</p></div><div className="section-actions"><button onClick={() => setExamSectionId(section.id)} aria-label="Gerenciar prova"><MaterialIcon name="trophy" /></button><button onClick={() => openArtworkEditor("section", section)} aria-label="Editar capa da seção"><MaterialIcon name="image" /></button><button onClick={() => setEditing({ entity: "section", values: { ...section } })} aria-label="Editar seção"><MaterialIcon name="edit" /></button><button className="add-lesson" onClick={() => setEditing({ entity: "lesson", values: newLessonValues(currentModule.id, section.id) })}><MaterialIcon name="add" />Aula</button></div></header>
                  <div className="admin-lesson-rail">
                    {sectionLessons.map((lesson, lessonIndex) => <article className="admin-lesson-card" key={lesson.id}>
                      <ArtworkPreview item={lesson} className="admin-lesson-thumb" icon={lesson.videoKey ? "play_arrow" : "school"} />
                      <div className="lesson-card-number"><small>AULA {String(lessonIndex + 1).padStart(2, "0")}</small><span>{lesson.duration}</span></div>
                      <h5>{lesson.title}</h5><p>{lesson.lessonType}</p>
                      <div className="admin-card-meta"><b className={statusClass(lesson.status)}>{lesson.status}</b><span><MaterialIcon name={lesson.videoKey ? "check_circle" : "videocam_off"} />{lesson.videoKey ? "Vídeo pronto" : "Sem vídeo"}</span><span><MaterialIcon name="quiz" />{data.exercises.filter((exercise) => exercise.lessonId === lesson.id).length} exercícios</span></div>
                      <div className="admin-card-footer"><div className="order-buttons"><button disabled={lessonIndex === 0} onClick={() => reorderLessons(section.id, lesson.id, -1)} aria-label="Mover aula para a esquerda"><MaterialIcon name="arrow_back" /></button><button disabled={lessonIndex === sectionLessons.length - 1} onClick={() => reorderLessons(section.id, lesson.id, 1)} aria-label="Mover aula para a direita"><MaterialIcon name="arrow_forward" /></button></div><button className="lesson-menu-trigger" onClick={() => setOpenMenu(openMenu === lesson.id ? null : lesson.id)} aria-label="Mais ações"><MaterialIcon name="more_horiz" /></button></div>
                      {openMenu === lesson.id && <div className="lesson-menu"><button onClick={() => { setEditing({ entity: "lesson", values: { ...lesson } }); setOpenMenu(null); }}><MaterialIcon name="edit" />Editar aula</button><button onClick={() => { setPracticeLessonId(lesson.id); setOpenMenu(null); }}><MaterialIcon name="quiz" />Gerenciar exercícios</button><button onClick={() => { openArtworkEditor("lesson", lesson); setOpenMenu(null); }}><MaterialIcon name="image" />Editar thumbnail</button><button onClick={() => { setPreviewing(lesson); setOpenMenu(null); }}><MaterialIcon name="visibility" />Visualizar</button><button onClick={() => toggleLessonStatus(lesson)}><MaterialIcon name={lesson.status === "Publicado" ? "visibility_off" : "publish"} />{lesson.status === "Publicado" ? "Despublicar" : "Publicar"}</button><button onClick={() => duplicateLesson(lesson.id)}><MaterialIcon name="content_copy" />Duplicar</button><button className="delete" onClick={() => { setOpenMenu(null); remove("lesson", lesson.id); }}><MaterialIcon name="delete" />Excluir</button></div>}
                    </article>)}
                    <button className="admin-add-card" onClick={() => setEditing({ entity: "lesson", values: newLessonValues(currentModule.id, section.id) })}><MaterialIcon name="add" /><span>Adicionar aula</span><small>Crie o próximo conteúdo desta seção</small></button>
                  </div>
                </article>;
              })}{!sections.length && <button className="empty-section-card" onClick={() => setEditing({ entity: "section", values: { title: "", description: "", status: "Rascunho", moduleId: currentModule.id, position: 1 } })}><MaterialIcon name="add_box" /><strong>Crie a primeira seção</strong><span>Organize as aulas deste módulo em blocos claros.</span></button>}</div>
            </div>;
          })()}
        </section>}

        {tab === "videos" && <div className="video-manager"><section className="upload-panel"><span className="eyebrow">BIBLIOTECA DE VÍDEOS</span><h2>Enviar nova videoaula</h2><p>O arquivo vai para o armazenamento de vídeos, e o banco salva apenas o vínculo com a aula. Arquivos grandes são enviados em partes para evitar limite de payload.</p><label>Aula<select value={uploadLesson} onChange={(event) => setUploadLesson(event.target.value)}><option value="">Selecione uma aula</option>{data.lessons.map((lesson) => <option value={lesson.id} key={lesson.id}>{lesson.title}</option>)}</select></label><button className="upload-drop" disabled={uploading} onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); upload(event.dataTransfer.files[0]); }}><span>↑</span><strong>{uploading ? `Enviando vídeo... ${uploadProgress}%` : "Arraste o vídeo aqui ou clique para selecionar"}</strong><small>MP4, MOV ou WebM · upload em partes</small>{uploading && <div className="upload-progress"><span style={{ width: `${uploadProgress}%` }} /></div>}</button><input ref={fileRef} hidden type="file" accept="video/*" onChange={(event) => upload(event.target.files?.[0])} />{uploadMessage && <p className={uploadMessage.includes("sucesso") ? "upload-message" : "upload-message error"}>{uploadMessage}</p>}</section><section className="video-library"><div className="panel-title"><div><h2>Vídeos das aulas</h2><p>{data.lessons.filter((lesson) => lesson.videoKey).length} arquivos enviados</p></div></div>{data.lessons.filter((lesson) => lesson.videoKey).map((lesson) => <article key={lesson.id}><video controls preload="metadata" src={`/api/videos?key=${encodeURIComponent(lesson.videoKey ?? "")}`} /><div><strong>{lesson.title}</strong><small>{lesson.videoName} · {fileSizeLabel(lesson.videoSize)}</small></div><span>Publicado</span></article>)}{!data.lessons.some((lesson) => lesson.videoKey) && <div className="video-empty"><span>▶</span><strong>Nenhum vídeo enviado</strong><p>Selecione uma aula ao lado para fazer o primeiro upload.</p></div>}{selectedVideoLesson?.videoKey && <p className="selected-video-note">A aula selecionada já possui um vídeo. Um novo upload substituirá o vínculo atual.</p>}</section></div>}
      </>}

      {previewing && <div className="admin-editor-backdrop"><div className="admin-editor lesson-preview-modal"><div className="editor-head"><div><span className="eyebrow">PRÉ-VISUALIZAÇÃO</span><h2>{previewing.title}</h2></div><button type="button" onClick={() => setPreviewing(null)}><MaterialIcon name="close" /></button></div><div className="preview-video-box">{previewing.videoKey ? <video controls src={`/api/videos?key=${encodeURIComponent(previewing.videoKey)}`} /> : <span>Vídeo ainda não enviado</span>}</div><p>{previewing.lessonType} · {previewing.duration}</p><button className="primary-button" onClick={() => setPreviewing(null)}>Fechar prévia</button></div></div>}
      {practiceLessonId && (() => {
        const lesson = data.lessons.find((item) => item.id === practiceLessonId);
        const exercises = data.exercises.filter((exercise) => exercise.lessonId === practiceLessonId).sort((left, right) => left.position - right.position || left.id - right.id);
        if (!lesson) return null;
        return <div className="admin-editor-backdrop"><section className="admin-editor exercise-manager"><div className="editor-head"><div><span className="eyebrow">PRÁTICA DA AULA</span><h2>{lesson.title}</h2><p>{exercises.length} exercícios vinculados</p></div><button type="button" onClick={() => setPracticeLessonId(null)}><MaterialIcon name="close" /></button></div><div className="exercise-manager-summary"><div><MaterialIcon name="quiz" filled /><span><strong>{exercises.length}</strong><small>Questões</small></span></div><div><MaterialIcon name="publish" /><span><strong>{exercises.filter((exercise) => exercise.status === "Publicado").length}</strong><small>Publicadas</small></span></div><button className="primary-button icon-button" onClick={() => setEditing({ entity: "exercise", values: newExerciseValues(lesson.id) })}><MaterialIcon name="add" />Novo exercício</button></div><div className="exercise-admin-list">{exercises.map((exercise, index) => <article key={exercise.id}><span className="exercise-order">{String(index + 1).padStart(2, "0")}</span><div><small>{exercise.category} · {exercise.exerciseType}</small><strong>{exercise.title}</strong><p>{exercise.prompt}</p></div><b className={statusClass(exercise.status)}>{exercise.status}</b><div className="exercise-row-actions"><button disabled={index === 0} onClick={() => reorderExercises(exercise.id, -1)} aria-label="Mover exercício para cima"><MaterialIcon name="arrow_upward" /></button><button disabled={index === exercises.length - 1} onClick={() => reorderExercises(exercise.id, 1)} aria-label="Mover exercício para baixo"><MaterialIcon name="arrow_downward" /></button><button onClick={() => setEditing({ entity: "exercise", values: { ...exercise } })} aria-label="Editar exercício"><MaterialIcon name="edit" /></button><button className="delete" onClick={() => remove("exercise", exercise.id)} aria-label="Excluir exercício"><MaterialIcon name="delete" /></button></div></article>)}{!exercises.length && <div className="exercise-empty"><MaterialIcon name="quiz" /><strong>Esta aula ainda não tem prática</strong><p>Crie exercícios compactos de compreensão, listening, correção ou produção.</p><button onClick={() => setEditing({ entity: "exercise", values: newExerciseValues(lesson.id) })}>Criar primeiro exercício</button></div>}</div></section></div>;
      })()}
      {examSectionId && (() => {
        const section = data.sections.find((item) => item.id === examSectionId);
        const exam = data.exams.find((item) => item.sectionId === examSectionId);
        const questions = exam ? data.examQuestions.filter((question) => question.examId === exam.id).sort((left, right) => left.position - right.position || left.id - right.id) : [];
        if (!section) return null;
        return <div className="admin-editor-backdrop"><section className="admin-editor exercise-manager exam-manager"><div className="editor-head"><div><span className="eyebrow">PROVA DA MATÉRIA</span><h2>{section.title}</h2><p>{exam ? `${questions.length} questões · aprovação com ${exam.passScore}%` : "Avaliação ainda não configurada"}</p></div><button type="button" onClick={() => setExamSectionId(null)}><MaterialIcon name="close" /></button></div>{exam ? <><div className="exercise-manager-summary"><div><MaterialIcon name="trophy" filled /><span><strong>{questions.length}</strong><small>Questões</small></span></div><div><MaterialIcon name="publish" /><span><strong>{questions.filter((question) => question.status === "Publicado").length}</strong><small>Publicadas</small></span></div><button className="outline-button icon-button" onClick={() => setEditing({ entity: "exam", values: { ...exam } })}><MaterialIcon name="settings" />Configurar prova</button><button className="primary-button icon-button" onClick={() => setEditing({ entity: "examQuestion", values: newExamQuestionValues(exam.id) })}><MaterialIcon name="add" />Nova questão</button></div><div className="exercise-admin-list">{questions.map((question, index) => <article key={question.id}><span className="exercise-order">{String(index + 1).padStart(2, "0")}</span><div><small>{question.category} · {question.questionType}</small><strong>{question.prompt}</strong><p>Resposta: {question.correctAnswer}</p></div><b className={statusClass(question.status)}>{question.status}</b><div className="exercise-row-actions"><button disabled={index === 0} onClick={() => reorderExamQuestions(exam.id, question.id, -1)}><MaterialIcon name="arrow_upward" /></button><button disabled={index === questions.length - 1} onClick={() => reorderExamQuestions(exam.id, question.id, 1)}><MaterialIcon name="arrow_downward" /></button><button onClick={() => setEditing({ entity: "examQuestion", values: { ...question } })}><MaterialIcon name="edit" /></button><button className="delete" onClick={() => remove("examQuestion", question.id)}><MaterialIcon name="delete" /></button></div></article>)}</div></> : <div className="exercise-empty"><MaterialIcon name="trophy" /><strong>Crie a prova desta matéria</strong><p>Defina o nome, a nota de aprovação e depois cadastre as questões.</p><button onClick={() => setEditing({ entity: "exam", values: { sectionId: section.id, title: `Prova — ${section.title}`, description: "", status: "Rascunho", passScore: 70, position: 1 } })}>Configurar prova</button></div>}</section></div>;
      })()}
      {artworkEditor && <div className="admin-editor-backdrop"><div className="admin-editor artwork-editor">
        <div className="editor-head"><div><span className="eyebrow">EDITOR VISUAL</span><h2>Capa de {artworkEditor.item.title}</h2></div><button type="button" onClick={() => setArtworkEditor(null)}><MaterialIcon name="close" /></button></div>
        <div className="artwork-device-tabs"><button className={artworkDevice === "desktop" ? "active" : ""} onClick={() => setArtworkDevice("desktop")}><MaterialIcon name="desktop_windows" />Desktop</button><button className={artworkDevice === "mobile" ? "active" : ""} onClick={() => setArtworkDevice("mobile")}><MaterialIcon name="smartphone" />Mobile</button></div>
        <ArtworkPreview item={artworkEditor.item} className={`artwork-editor-preview ${artworkDevice}`} icon={artworkEditor.entity === "lesson" ? "play_arrow" : "school"} />
        <button className="artwork-upload-button" disabled={artworkUploading} onClick={() => artworkFileRef.current?.click()}><MaterialIcon name="upload" />{artworkUploading ? artworkUploadProgress < 12 ? "Otimizando imagem..." : `Enviando imagem · ${artworkUploadProgress}%` : artworkEditor.item.imageKey ? "Trocar imagem" : "Enviar imagem de capa"}</button>
        <input ref={artworkFileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => uploadArtwork(event.target.files?.[0])} />
        <p className="artwork-upload-hint"><MaterialIcon name="speed" /> JPG, PNG, WebP ou AVIF até 25 MB. A imagem é otimizada automaticamente para carregar rápido no celular.</p>
        <div className="artwork-controls"><label>Modo de exibição<select value={artworkEditor.item.imageFit ?? "cover"} onChange={(event) => setArtworkEditor({ ...artworkEditor, item: { ...artworkEditor.item, imageFit: event.target.value as Artwork["imageFit"] } })}><option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option></select></label><label>Zoom <span>{artworkEditor.item.imageZoom ?? 100}%</span><input type="range" min="100" max="180" value={artworkEditor.item.imageZoom ?? 100} onChange={(event) => setArtworkEditor({ ...artworkEditor, item: { ...artworkEditor.item, imageZoom: Number(event.target.value) } })} /></label><label>Overlay <span>{artworkEditor.item.imageOverlay ?? 22}%</span><input type="range" min="0" max="75" value={artworkEditor.item.imageOverlay ?? 22} onChange={(event) => setArtworkEditor({ ...artworkEditor, item: { ...artworkEditor.item, imageOverlay: Number(event.target.value) } })} /></label><div className="form-row"><label>Posição horizontal <span>{artworkEditor.item.imagePositionX ?? 50}%</span><input type="range" min="0" max="100" value={artworkEditor.item.imagePositionX ?? 50} onChange={(event) => setArtworkEditor({ ...artworkEditor, item: { ...artworkEditor.item, imagePositionX: Number(event.target.value) } })} /></label><label>Posição vertical <span>{artworkEditor.item.imagePositionY ?? 50}%</span><input type="range" min="0" max="100" value={artworkEditor.item.imagePositionY ?? 50} onChange={(event) => setArtworkEditor({ ...artworkEditor, item: { ...artworkEditor.item, imagePositionY: Number(event.target.value) } })} /></label></div></div>
        <div className="editor-actions"><button type="button" onClick={() => setArtworkEditor(null)}>Cancelar</button><button type="button" onClick={saveArtwork}>Salvar aparência</button></div>
      </div></div>}
      {editing && <div className="admin-editor-backdrop"><form className={`admin-editor ${editing.entity === "exercise" || editing.entity === "examQuestion" ? "exercise-editor" : ""}`} onSubmit={save}>
        <div className="editor-head"><div><span className="eyebrow">{editing.values.id ? "EDITAR" : "NOVO ITEM"}</span><h2>{editing.entity === "student" ? "Aluno" : editing.entity === "module" ? "Módulo" : editing.entity === "section" ? "Matéria / seção" : editing.entity === "exercise" ? "Exercício" : editing.entity === "exam" ? "Prova da matéria" : editing.entity === "examQuestion" ? "Questão da prova" : "Aula"}</h2></div><button type="button" onClick={() => { setEditing(null); setEditorTab("geral"); }}><MaterialIcon name="close" /></button></div>
        {(editing.entity === "lesson" || editing.entity === "section") && <nav className="admin-editor-tabs">{(editing.entity === "lesson" ? [["geral","Geral","edit_note"],["video","Vídeo","smart_display"],["exercicios","Exercícios","quiz"],["config","Configurações","settings"]] : [["geral","Geral","edit_note"],["aulas","Aulas","video_library"],["prova","Prova","trophy"]]).map(([key,label,icon]) => <button type="button" className={editorTab === key ? "active" : ""} onClick={() => setEditorTab(key)} key={key}><MaterialIcon name={icon} />{label}</button>)}</nav>}
        {editing.entity === "student" && <><label>Nome completo<input required value={String(editing.values.fullName ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, fullName: event.target.value } })} /></label><label>E-mail<input required type="email" value={String(editing.values.email ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, email: event.target.value } })} /></label><div className="form-row"><label>Nível<select value={String(editing.values.level)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, level: event.target.value } })}><option>Começando do zero</option><option>Básico</option><option>Intermediário</option><option>Avançado</option></select></label><label>Status<select value={String(editing.values.status)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Ativo</option><option>Pausado</option></select></label></div></>}
        {editing.entity === "module" && <><label>Título<input required value={String(editing.values.title ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, title: event.target.value } })} /></label><label>Descrição<textarea value={String(editing.values.description ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, description: event.target.value } })} /></label><div className="form-row"><label>Nível<select value={String(editing.values.level)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, level: event.target.value } })}><option>Básico</option><option>Intermediário</option><option>Avançado</option></select></label><label>Status<select value={String(editing.values.status)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Rascunho</option><option>Publicado</option></select></label></div></>}
        {editing.entity === "section" && <>{editorTab === "geral" && <><label>Nome da matéria<input required value={String(editing.values.title ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, title: event.target.value } })} /></label><label>Descrição<textarea value={String(editing.values.description ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, description: event.target.value } })} /></label><div className="form-row"><label>Módulo<select value={String(editing.values.moduleId)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, moduleId: Number(event.target.value) } })}>{data.modules.map((module) => <option value={module.id} key={module.id}>{module.title}</option>)}</select></label><label>Status<select value={String(editing.values.status ?? "Rascunho")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Rascunho</option><option>Publicado</option></select></label></div></>}{editorTab === "aulas" && <div className="editor-linked-panel"><MaterialIcon name="video_library" /><div><strong>{data.lessons.filter((lesson) => lesson.sectionId === Number(editing.values.id)).length} aulas nesta matéria</strong><p>Adicione e ordene as aulas na visualização hierárquica do módulo.</p></div><button type="button" onClick={() => { setEditing(null); }}>Voltar à estrutura</button></div>}{editorTab === "prova" && <div className="editor-linked-panel"><MaterialIcon name="trophy" /><div><strong>{data.exams.find((exam) => exam.sectionId === Number(editing.values.id)) ? "Prova configurada" : "Prova não configurada"}</strong><p>Gerencie questões, publicação e nota mínima da avaliação.</p></div><button type="button" onClick={() => { setExamSectionId(Number(editing.values.id)); setEditing(null); }}>Gerenciar prova</button></div>}</>}
        {editing.entity === "lesson" && <>{editorTab === "geral" && <><label>Título<input required value={String(editing.values.title ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, title: event.target.value } })} /></label><label>Descrição da aula<textarea value={String(editing.values.description ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, description: event.target.value } })} /></label><label>Matéria / seção<select value={String(editing.values.sectionId)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, sectionId: Number(event.target.value) } })}>{data.sections.map((section) => <option value={section.id} key={section.id}>{section.title}</option>)}</select></label><div className="form-row"><label>Duração<input value={String(editing.values.duration ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, duration: event.target.value } })} /></label><label>Status<select value={String(editing.values.status)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Rascunho</option><option>Publicado</option></select></label></div><label>Tipo de aula<input value={String(editing.values.lessonType ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, lessonType: event.target.value } })} /></label>{editing.values.id && <button className="artwork-upload-button" type="button" onClick={() => { const lesson = data.lessons.find((item) => item.id === Number(editing.values.id)); if (lesson) openArtworkEditor("lesson", lesson); }}><MaterialIcon name="image" />Editar thumbnail</button>}</>}{editorTab === "video" && <div className="editor-linked-panel video"><MaterialIcon name={editing.values.videoKey ? "check_circle" : "videocam_off"} /><div><strong>{editing.values.videoKey ? "Vídeo vinculado à aula" : "Nenhum vídeo enviado"}</strong><p>{String(editing.values.videoName ?? "Envie ou substitua o arquivo na biblioteca de vídeos.")}</p></div><button type="button" onClick={() => { setUploadLesson(String(editing.values.id ?? "")); setTab("videos"); setEditing(null); }}>Gerenciar vídeo</button></div>}{editorTab === "exercicios" && <div className="editor-linked-panel"><MaterialIcon name="quiz" /><div><strong>{data.exercises.filter((exercise) => exercise.lessonId === Number(editing.values.id)).length} exercícios vinculados</strong><p>Crie, edite, ordene e publique a prática desta aula.</p></div><button type="button" onClick={() => { setPracticeLessonId(Number(editing.values.id)); setEditing(null); }}>Gerenciar exercícios</button></div>}{editorTab === "config" && <><div className="form-row"><label>Ordem<input type="number" value={String(editing.values.position ?? 0)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, position: Number(event.target.value) } })} /></label><label>Publicação<select value={String(editing.values.status)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Rascunho</option><option>Publicado</option></select></label></div><div className="editor-info-note"><MaterialIcon name="account_tree" /><p>O requisito acadêmico é centralizado: esta aula libera quando a etapa anterior estiver concluída.</p></div></>}</>}
        {editing.entity === "exercise" && <><div className="form-row"><label>Tipo<select value={String(editing.values.exerciseType)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, exerciseType: event.target.value } })}><option value="choice">Múltipla escolha</option><option value="listening">Listening</option><option value="correction">Correção</option><option value="fill">Completar</option><option value="writing">Produção escrita</option></select></label><label>Categoria<input required value={String(editing.values.category ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, category: event.target.value } })} /></label></div><label>Título<input required value={String(editing.values.title ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, title: event.target.value } })} /></label><label>Enunciado<textarea required value={String(editing.values.prompt ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, prompt: event.target.value } })} /></label><label>Opções em JSON <small>Ex.: [&quot;Opção A&quot;,&quot;Opção B&quot;]</small><textarea value={String(editing.values.optionsJson ?? "[]")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, optionsJson: event.target.value } })} /></label><label>Resposta correta<input required value={String(editing.values.correctAnswer ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, correctAnswer: event.target.value } })} /></label><label>Outras respostas aceitas em JSON<textarea value={String(editing.values.acceptedAnswersJson ?? "[]")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, acceptedAnswersJson: event.target.value } })} /></label><label>Explicação da correção<textarea required value={String(editing.values.explanation ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, explanation: event.target.value } })} /></label><label>Texto do áudio <small>Somente para listening</small><input value={String(editing.values.speech ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, speech: event.target.value } })} /></label><div className="form-row"><label>Habilidades em JSON<input value={String(editing.values.skillsJson ?? "[]")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, skillsJson: event.target.value } })} /></label><label>Status<select value={String(editing.values.status)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Rascunho</option><option>Publicado</option></select></label></div></>}
        {editing.entity === "exam" && <><label>Título da prova<input required value={String(editing.values.title ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, title: event.target.value } })} /></label><label>Descrição<textarea value={String(editing.values.description ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, description: event.target.value } })} /></label><div className="form-row"><label>Nota mínima (%)<input type="number" min="0" max="100" required value={String(editing.values.passScore ?? 70)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, passScore: Number(event.target.value) } })} /></label><label>Status<select value={String(editing.values.status ?? "Rascunho")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Rascunho</option><option>Publicado</option></select></label></div></>}
        {editing.entity === "examQuestion" && <><div className="form-row"><label>Tipo<select value={String(editing.values.questionType)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, questionType: event.target.value } })}><option value="choice">Múltipla escolha</option><option value="fill">Completar</option><option value="writing">Escrita</option></select></label><label>Categoria<input value={String(editing.values.category ?? "Avaliação")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, category: event.target.value } })} /></label></div><label>Enunciado<textarea required value={String(editing.values.prompt ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, prompt: event.target.value } })} /></label><label>Opções em JSON<textarea value={String(editing.values.optionsJson ?? "[]")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, optionsJson: event.target.value } })} /></label><label>Resposta correta<input required value={String(editing.values.correctAnswer ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, correctAnswer: event.target.value } })} /></label><label>Outras respostas aceitas em JSON<textarea value={String(editing.values.acceptedAnswersJson ?? "[]")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, acceptedAnswersJson: event.target.value } })} /></label><label>Explicação<textarea value={String(editing.values.explanation ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, explanation: event.target.value } })} /></label><label>Status<select value={String(editing.values.status ?? "Rascunho")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Rascunho</option><option>Publicado</option></select></label></>}
        <div className="editor-actions"><button type="button" onClick={() => { setEditing(null); setEditorTab("geral"); }}>Cancelar</button><button type="submit">Salvar alterações</button></div>
      </form></div>}
    </div>
  );
}
