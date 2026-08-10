"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Student = { id: number; fullName: string; email: string; level: string; placementScore: number; status: string; createdAt: string };
type Module = { id: number; title: string; level: string; description: string; status: string; position: number };
type Section = { id: number; moduleId: number; title: string; position: number };
type Lesson = { id: number; sectionId: number; title: string; duration: string; lessonType: string; status: string; position: number; videoKey?: string; videoName?: string; videoSize?: number };
type Data = { students: Student[]; modules: Module[]; sections: Section[]; lessons: Lesson[] };
type Entity = "student" | "module" | "section" | "lesson";

const emptyData: Data = { students: [], modules: [], sections: [], lessons: [] };
const VIDEO_CHUNK_SIZE = 8 * 1024 * 1024;

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

export function AdminPanel() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ entity: Entity; values: Record<string, string | number> } | null>(null);
  const [previewing, setPreviewing] = useState<Lesson | null>(null);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [uploadLesson, setUploadLesson] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function securedFetch(input: RequestInfo | URL, init?: RequestInit) {
    let response = await fetch(input, init);
    if (response.status === 401) {
      const refreshed = await fetch("/api/auth/refresh", { method: "POST" });
      if (refreshed.ok) response = await fetch(input, init);
    }
    return response;
  }

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

  useEffect(() => { load(); }, []);

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
    return { title: "", sectionId: section?.id ?? 0, duration: "10 min", lessonType: "Vídeo + prática", status: "Rascunho", position: lessonCount + 1 };
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
      <div className="admin-header"><div><span className="eyebrow">RIGHT WAY CONTROL CENTER</span><h1>Painel administrativo</h1><p>Gerencie alunos, trilhas, aulas e vídeos em um só lugar.</p></div><button className="primary-button" onClick={() => setEditing({ entity: "student", values: { fullName: "", email: "", level: "Básico", status: "Ativo", placementScore: 0 } })}>+ Novo aluno</button></div>
      <nav className="admin-tabs">{[["overview", "Visão geral"], ["students", "Alunos"], ["content", "Conteúdo"], ["videos", "Vídeos"]].map(([key, label]) => <button className={tab === key ? "active" : ""} onClick={() => setTab(key)} key={key}>{label}</button>)}</nav>
      {error && <div className="admin-alert">{error}<button onClick={load}>Tentar novamente</button></div>}
      {loading ? <div className="admin-loading">Carregando dados...</div> : <>
        {tab === "overview" && <div className="admin-overview"><div className="admin-metrics"><article><span>ALUNOS ATIVOS</span><strong>{data.students.filter((student) => student.status === "Ativo").length}</strong><small>Perfis cadastrados</small></article><article><span>AULAS PUBLICADAS</span><strong>{publishedLessons}</strong><small>Em {data.modules.length} módulos</small></article><article><span>VÍDEOS ENVIADOS</span><strong>{data.lessons.filter((lesson) => lesson.videoKey).length}</strong><small>Armazenamento seguro</small></article><article><span>MÉDIA DE NÍVEL</span><strong>{averageScore}</strong><small>Pontos no teste</small></article></div><div className="admin-grid"><section><div className="panel-title"><h2>Alunos recentes</h2><button onClick={() => setTab("students")}>Ver todos →</button></div>{data.students.slice(0, 5).map((student) => <div className="recent-row" key={student.id}><span>{student.fullName.split(" ").map((part) => part[0]).slice(0,2).join("")}</span><div><strong>{student.fullName}</strong><small>{student.email}</small></div><b>{student.level}</b></div>)}{!data.students.length && <p className="empty-state">Os novos cadastros aparecerão aqui.</p>}</section><section><div className="panel-title"><h2>Conteúdo</h2><button onClick={() => setTab("content")}>Gerenciar →</button></div>{data.modules.map((module) => <div className="content-health" key={module.id}><span>{module.position}</span><div><strong>{module.title}</strong><small>{module.level} · {data.sections.filter((section) => section.moduleId === module.id).length} seções</small></div><b>{module.status}</b></div>)}</section></div></div>}

        {tab === "students" && <section className="admin-table-panel"><div className="panel-title"><div><h2>Alunos</h2><p>{data.students.length} cadastros na plataforma</p></div><button className="outline-button" onClick={() => setEditing({ entity: "student", values: { fullName: "", email: "", level: "Básico", status: "Ativo", placementScore: 0 } })}>+ Adicionar aluno</button></div><div className="admin-table-wrap"><table><thead><tr><th>Aluno</th><th>Nível</th><th>Teste</th><th>Status</th><th>Cadastro</th><th /></tr></thead><tbody>{data.students.map((student) => <tr key={student.id}><td><div className="student-cell"><span>{student.fullName.slice(0,2).toUpperCase()}</span><div><strong>{student.fullName}</strong><small>{student.email}</small></div></div></td><td><b className="level-tag">{student.level}</b></td><td>{student.placementScore}/8</td><td><b className={student.status === "Ativo" ? "status-live" : "status-draft"}>{student.status}</b></td><td>{new Date(student.createdAt).toLocaleDateString("pt-BR")}</td><td><div className="row-actions"><button onClick={() => setEditing({ entity: "student", values: { ...student } })}>Editar</button><button className="delete" onClick={() => remove("student", student.id)}>Excluir</button></div></td></tr>)}</tbody></table>{!data.students.length && <p className="empty-state">Nenhum aluno cadastrado ainda.</p>}</div></section>}

        {tab === "content" && <section className="course-admin">
          <div className="course-admin-head">
            <div><span className="eyebrow">CONTEÚDO DO CURSO</span><h2>Estrutura das aulas</h2><p>Organize o curso como o aluno enxerga: nível, seção e aula.</p></div>
            <div><button className="outline-button" onClick={() => { window.location.href = "/"; }}>Pré-visualizar como aluno</button><button className="primary-button" onClick={() => setEditing({ entity: "lesson", values: newLessonValues() })}>+ Nova aula</button></div>
          </div>
          <div className="course-admin-levels">
            {orderedModules.map((module, moduleIndex) => {
              const sections = data.sections.filter((section) => section.moduleId === module.id).sort((left, right) => left.position - right.position || left.id - right.id);
              const lessons = moduleLessons(data, module.id);
              return <article className="admin-level-block" key={module.id}>
                <header>
                  <span>{String(moduleIndex + 1).padStart(2, "0")}</span>
                  <div><small>{module.level}</small><h3>{module.title}</h3><p>{module.description}</p></div>
                  <aside><b>{lessons.length} aulas</b><strong className={statusClass(module.status)}>{module.status}</strong></aside>
                  <div className="level-actions"><button onClick={() => setEditing({ entity: "lesson", values: newLessonValues(module.id) })}>+ Adicionar aula</button><button onClick={() => setEditing({ entity: "module", values: { ...module } })}>Editar nível</button><button onClick={() => setEditing({ entity: "section", values: { title: "", moduleId: module.id, position: sections.length + 1 } })}>+ Seção</button></div>
                </header>
                {sections.map((section) => {
                  const sectionLessons = data.lessons.filter((lesson) => lesson.sectionId === section.id).sort((left, right) => left.position - right.position || left.id - right.id);
                  return <div className="admin-section-rail" key={section.id}>
                    <div className="admin-section-title"><div><h4>{section.title}</h4><p>{sectionLessons.length} aulas nesta seção</p></div><button onClick={() => setEditing({ entity: "lesson", values: newLessonValues(module.id, section.id) })}>+ Aula</button></div>
                    <div className="admin-lesson-rail">
                      {sectionLessons.map((lesson, lessonIndex) => <article className="admin-lesson-card" key={lesson.id}>
                        <div className="admin-lesson-thumb"><span>{lesson.videoKey ? "▶" : "RW"}</span></div>
                        <small>Aula {String(lessonIndex + 1).padStart(2, "0")} · {lesson.duration}</small>
                        <h5>{lesson.title}</h5>
                        <div className="admin-card-meta"><b className={statusClass(lesson.status)}>{lesson.status}</b><span>{lesson.videoKey ? "Vídeo vinculado" : "Sem vídeo"}</span></div>
                        <div className="admin-card-footer">
                          <div className="order-buttons"><button disabled={lessonIndex === 0} onClick={() => reorderLessons(section.id, lesson.id, -1)}>↑</button><button disabled={lessonIndex === sectionLessons.length - 1} onClick={() => reorderLessons(section.id, lesson.id, 1)}>↓</button></div>
                          <button className="lesson-menu-trigger" onClick={() => setOpenMenu(openMenu === lesson.id ? null : lesson.id)}>•••</button>
                        </div>
                        {openMenu === lesson.id && <div className="lesson-menu">
                          <button onClick={() => { setEditing({ entity: "lesson", values: { ...lesson } }); setOpenMenu(null); }}>Editar</button>
                          <button onClick={() => { setPreviewing(lesson); setOpenMenu(null); }}>Visualizar</button>
                          <button onClick={() => toggleLessonStatus(lesson)}>{lesson.status === "Publicado" ? "Despublicar" : "Publicar"}</button>
                          <button onClick={() => duplicateLesson(lesson.id)}>Duplicar</button>
                          <button className="delete" onClick={() => { setOpenMenu(null); remove("lesson", lesson.id); }}>Excluir</button>
                        </div>}
                      </article>)}
                      <button className="admin-add-card" onClick={() => setEditing({ entity: "lesson", values: newLessonValues(module.id, section.id) })}>+<span>Adicionar aula</span></button>
                    </div>
                  </div>;
                })}
              </article>;
            })}
          </div>
        </section>}

        {tab === "videos" && <div className="video-manager"><section className="upload-panel"><span className="eyebrow">BIBLIOTECA DE VÍDEOS</span><h2>Enviar nova videoaula</h2><p>O arquivo vai para o armazenamento de vídeos, e o banco salva apenas o vínculo com a aula. Arquivos grandes são enviados em partes para evitar limite de payload.</p><label>Aula<select value={uploadLesson} onChange={(event) => setUploadLesson(event.target.value)}><option value="">Selecione uma aula</option>{data.lessons.map((lesson) => <option value={lesson.id} key={lesson.id}>{lesson.title}</option>)}</select></label><button className="upload-drop" disabled={uploading} onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); upload(event.dataTransfer.files[0]); }}><span>↑</span><strong>{uploading ? `Enviando vídeo... ${uploadProgress}%` : "Arraste o vídeo aqui ou clique para selecionar"}</strong><small>MP4, MOV ou WebM · upload em partes</small>{uploading && <div className="upload-progress"><span style={{ width: `${uploadProgress}%` }} /></div>}</button><input ref={fileRef} hidden type="file" accept="video/*" onChange={(event) => upload(event.target.files?.[0])} />{uploadMessage && <p className={uploadMessage.includes("sucesso") ? "upload-message" : "upload-message error"}>{uploadMessage}</p>}</section><section className="video-library"><div className="panel-title"><div><h2>Vídeos das aulas</h2><p>{data.lessons.filter((lesson) => lesson.videoKey).length} arquivos enviados</p></div></div>{data.lessons.filter((lesson) => lesson.videoKey).map((lesson) => <article key={lesson.id}><video controls preload="metadata" src={`/api/videos?key=${encodeURIComponent(lesson.videoKey ?? "")}`} /><div><strong>{lesson.title}</strong><small>{lesson.videoName} · {fileSizeLabel(lesson.videoSize)}</small></div><span>Publicado</span></article>)}{!data.lessons.some((lesson) => lesson.videoKey) && <div className="video-empty"><span>▶</span><strong>Nenhum vídeo enviado</strong><p>Selecione uma aula ao lado para fazer o primeiro upload.</p></div>}{selectedVideoLesson?.videoKey && <p className="selected-video-note">A aula selecionada já possui um vídeo. Um novo upload substituirá o vínculo atual.</p>}</section></div>}
      </>}

      {previewing && <div className="admin-editor-backdrop"><div className="admin-editor lesson-preview-modal"><div className="editor-head"><div><span className="eyebrow">PRÉ-VISUALIZAÇÃO</span><h2>{previewing.title}</h2></div><button type="button" onClick={() => setPreviewing(null)}>×</button></div><div className="preview-video-box">{previewing.videoKey ? <video controls src={`/api/videos?key=${encodeURIComponent(previewing.videoKey)}`} /> : <span>Vídeo ainda não enviado</span>}</div><p>{previewing.lessonType} · {previewing.duration}</p><button className="primary-button" onClick={() => setPreviewing(null)}>Fechar prévia</button></div></div>}
      {editing && <div className="admin-editor-backdrop"><form className="admin-editor" onSubmit={save}><div className="editor-head"><div><span className="eyebrow">{editing.values.id ? "EDITAR" : "NOVO ITEM"}</span><h2>{editing.entity === "student" ? "Aluno" : editing.entity === "module" ? "Módulo" : editing.entity === "section" ? "Seção" : "Aula"}</h2></div><button type="button" onClick={() => setEditing(null)}>×</button></div>{editing.entity === "student" && <><label>Nome completo<input required value={String(editing.values.fullName ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, fullName: event.target.value } })} /></label><label>E-mail<input required type="email" value={String(editing.values.email ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, email: event.target.value } })} /></label><div className="form-row"><label>Nível<select value={String(editing.values.level)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, level: event.target.value } })}><option>Começando do zero</option><option>Básico</option><option>Intermediário</option><option>Avançado</option></select></label><label>Status<select value={String(editing.values.status)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Ativo</option><option>Pausado</option></select></label></div></>}{editing.entity === "module" && <><label>Título<input required value={String(editing.values.title ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, title: event.target.value } })} /></label><label>Descrição<textarea value={String(editing.values.description ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, description: event.target.value } })} /></label><div className="form-row"><label>Nível<select value={String(editing.values.level)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, level: event.target.value } })}><option>Básico</option><option>Intermediário</option><option>Avançado</option></select></label><label>Status<select value={String(editing.values.status)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Rascunho</option><option>Publicado</option></select></label></div></>}{editing.entity === "section" && <><label>Título<input required value={String(editing.values.title ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, title: event.target.value } })} /></label><label>Módulo<select value={String(editing.values.moduleId)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, moduleId: Number(event.target.value) } })}>{data.modules.map((module) => <option value={module.id} key={module.id}>{module.title}</option>)}</select></label></>}{editing.entity === "lesson" && <><label>Título<input required value={String(editing.values.title ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, title: event.target.value } })} /></label><label>Seção<select value={String(editing.values.sectionId)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, sectionId: Number(event.target.value) } })}>{data.sections.map((section) => <option value={section.id} key={section.id}>{section.title}</option>)}</select></label><div className="form-row"><label>Duração<input value={String(editing.values.duration ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, duration: event.target.value } })} /></label><label>Status<select value={String(editing.values.status)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Rascunho</option><option>Publicado</option></select></label></div><label>Tipo de aula<input value={String(editing.values.lessonType ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, lessonType: event.target.value } })} /></label></>}<div className="editor-actions"><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button type="submit">Salvar alterações</button></div></form></div>}
    </div>
  );
}
