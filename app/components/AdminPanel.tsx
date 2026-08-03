"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Student = { id: number; fullName: string; email: string; level: string; placementScore: number; status: string; createdAt: string };
type Module = { id: number; title: string; level: string; description: string; status: string; position: number };
type Section = { id: number; moduleId: number; title: string; position: number };
type Lesson = { id: number; sectionId: number; title: string; duration: string; lessonType: string; status: string; position: number; videoKey?: string; videoName?: string; videoSize?: number };
type Data = { students: Student[]; modules: Module[]; sections: Section[]; lessons: Lesson[] };
type Entity = "student" | "module" | "section" | "lesson";

const emptyData: Data = { students: [], modules: [], sections: [], lessons: [] };

export function AdminPanel() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ entity: Entity; values: Record<string, string | number> } | null>(null);
  const [uploadLesson, setUploadLesson] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin");
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
    await fetch(`/api/admin?entity=${entity}&id=${id}`, { method: "DELETE" });
    await load();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const hasId = Boolean(editing.values.id);
    const response = await fetch("/api/admin", { method: hasId ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entity: editing.entity, ...editing.values }) });
    if (!response.ok) {
      const result = await response.json() as { error?: string };
      setError(result.error ?? "Não foi possível salvar.");
      return;
    }
    setEditing(null);
    await load();
  }

  async function upload(file?: File) {
    if (!file || !uploadLesson) { setUploadMessage("Selecione a aula e o arquivo de vídeo."); return; }
    setUploading(true);
    setUploadMessage("");
    const form = new FormData();
    form.append("file", file);
    form.append("lessonId", uploadLesson);
    try {
      const response = await fetch("/api/videos", { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Falha no upload.");
      setUploadMessage("Vídeo enviado e vinculado à aula com sucesso.");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (uploadError) {
      setUploadMessage(uploadError instanceof Error ? uploadError.message : "Falha no upload.");
    } finally {
      setUploading(false);
    }
  }

  const publishedLessons = useMemo(() => data.lessons.filter((lesson) => lesson.status === "Publicado").length, [data.lessons]);
  const averageScore = data.students.length ? Math.round(data.students.reduce((sum, student) => sum + student.placementScore, 0) / data.students.length * 10) / 10 : 0;
  const selectedVideoLesson = data.lessons.find((lesson) => String(lesson.id) === uploadLesson);

  return (
    <div className="admin-page page-view">
      <div className="admin-header"><div><span className="eyebrow">RIGHT WAY CONTROL CENTER</span><h1>Painel administrativo</h1><p>Gerencie alunos, trilhas, aulas e vídeos em um só lugar.</p></div><button className="primary-button" onClick={() => setEditing({ entity: "student", values: { fullName: "", email: "", level: "Básico", status: "Ativo", placementScore: 0 } })}>+ Novo aluno</button></div>
      <nav className="admin-tabs">{[["overview", "Visão geral"], ["students", "Alunos"], ["content", "Conteúdo"], ["videos", "Vídeos"]].map(([key, label]) => <button className={tab === key ? "active" : ""} onClick={() => setTab(key)} key={key}>{label}</button>)}</nav>
      {error && <div className="admin-alert">{error}<button onClick={load}>Tentar novamente</button></div>}
      {loading ? <div className="admin-loading">Carregando dados...</div> : <>
        {tab === "overview" && <div className="admin-overview"><div className="admin-metrics"><article><span>ALUNOS ATIVOS</span><strong>{data.students.filter((student) => student.status === "Ativo").length}</strong><small>Perfis cadastrados</small></article><article><span>AULAS PUBLICADAS</span><strong>{publishedLessons}</strong><small>Em {data.modules.length} módulos</small></article><article><span>VÍDEOS ENVIADOS</span><strong>{data.lessons.filter((lesson) => lesson.videoKey).length}</strong><small>Armazenamento seguro</small></article><article><span>MÉDIA DE NÍVEL</span><strong>{averageScore}</strong><small>Pontos no teste</small></article></div><div className="admin-grid"><section><div className="panel-title"><h2>Alunos recentes</h2><button onClick={() => setTab("students")}>Ver todos →</button></div>{data.students.slice(0, 5).map((student) => <div className="recent-row" key={student.id}><span>{student.fullName.split(" ").map((part) => part[0]).slice(0,2).join("")}</span><div><strong>{student.fullName}</strong><small>{student.email}</small></div><b>{student.level}</b></div>)}{!data.students.length && <p className="empty-state">Os novos cadastros aparecerão aqui.</p>}</section><section><div className="panel-title"><h2>Conteúdo</h2><button onClick={() => setTab("content")}>Gerenciar →</button></div>{data.modules.map((module) => <div className="content-health" key={module.id}><span>{module.position}</span><div><strong>{module.title}</strong><small>{module.level} · {data.sections.filter((section) => section.moduleId === module.id).length} seções</small></div><b>{module.status}</b></div>)}</section></div></div>}

        {tab === "students" && <section className="admin-table-panel"><div className="panel-title"><div><h2>Alunos</h2><p>{data.students.length} cadastros na plataforma</p></div><button className="outline-button" onClick={() => setEditing({ entity: "student", values: { fullName: "", email: "", level: "Básico", status: "Ativo", placementScore: 0 } })}>+ Adicionar aluno</button></div><div className="admin-table-wrap"><table><thead><tr><th>Aluno</th><th>Nível</th><th>Teste</th><th>Status</th><th>Cadastro</th><th /></tr></thead><tbody>{data.students.map((student) => <tr key={student.id}><td><div className="student-cell"><span>{student.fullName.slice(0,2).toUpperCase()}</span><div><strong>{student.fullName}</strong><small>{student.email}</small></div></div></td><td><b className="level-tag">{student.level}</b></td><td>{student.placementScore}/8</td><td><b className={student.status === "Ativo" ? "status-live" : "status-draft"}>{student.status}</b></td><td>{new Date(student.createdAt).toLocaleDateString("pt-BR")}</td><td><div className="row-actions"><button onClick={() => setEditing({ entity: "student", values: { ...student } })}>Editar</button><button className="delete" onClick={() => remove("student", student.id)}>Excluir</button></div></td></tr>)}</tbody></table>{!data.students.length && <p className="empty-state">Nenhum aluno cadastrado ainda.</p>}</div></section>}

        {tab === "content" && <div className="content-manager"><div className="content-column"><div className="panel-title"><div><h2>Módulos</h2><p>Níveis e grandes trilhas do curso</p></div><button onClick={() => setEditing({ entity: "module", values: { title: "", level: "Básico", description: "", status: "Rascunho", position: data.modules.length + 1 } })}>+ Módulo</button></div>{data.modules.map((module) => <article key={module.id}><span className="entity-order">{String(module.position).padStart(2,"0")}</span><div><strong>{module.title}</strong><small>{module.level} · {module.status}</small></div><button onClick={() => setEditing({ entity: "module", values: { ...module } })}>Editar</button><button className="icon-delete" onClick={() => remove("module", module.id)}>×</button></article>)}</div><div className="content-column"><div className="panel-title"><div><h2>Seções</h2><p>Organização dentro dos módulos</p></div><button onClick={() => setEditing({ entity: "section", values: { title: "", moduleId: data.modules[0]?.id ?? 0, position: data.sections.length + 1 } })}>+ Seção</button></div>{data.sections.map((section) => <article key={section.id}><span className="entity-order">§</span><div><strong>{section.title}</strong><small>{data.modules.find((module) => module.id === section.moduleId)?.title}</small></div><button onClick={() => setEditing({ entity: "section", values: { ...section } })}>Editar</button><button className="icon-delete" onClick={() => remove("section", section.id)}>×</button></article>)}</div><div className="content-column wide"><div className="panel-title"><div><h2>Aulas</h2><p>Vídeos e atividades de cada seção</p></div><button onClick={() => setEditing({ entity: "lesson", values: { title: "", sectionId: data.sections[0]?.id ?? 0, duration: "10 min", lessonType: "Vídeo + prática", status: "Rascunho", position: data.lessons.length + 1 } })}>+ Aula</button></div>{data.lessons.map((lesson) => <article key={lesson.id}><span className={lesson.videoKey ? "entity-order video" : "entity-order"}>▶</span><div><strong>{lesson.title}</strong><small>{data.sections.find((section) => section.id === lesson.sectionId)?.title} · {lesson.duration}</small></div><b className={lesson.status === "Publicado" ? "status-live" : "status-draft"}>{lesson.status}</b><button onClick={() => setEditing({ entity: "lesson", values: { ...lesson } })}>Editar</button><button className="icon-delete" onClick={() => remove("lesson", lesson.id)}>×</button></article>)}</div></div>}

        {tab === "videos" && <div className="video-manager"><section className="upload-panel"><span className="eyebrow">BIBLIOTECA DE VÍDEOS</span><h2>Enviar nova videoaula</h2><p>Selecione a aula e envie o arquivo. O vídeo ficará armazenado e vinculado automaticamente.</p><label>Aula<select value={uploadLesson} onChange={(event) => setUploadLesson(event.target.value)}><option value="">Selecione uma aula</option>{data.lessons.map((lesson) => <option value={lesson.id} key={lesson.id}>{lesson.title}</option>)}</select></label><button className="upload-drop" disabled={uploading} onClick={() => fileRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); upload(event.dataTransfer.files[0]); }}><span>↑</span><strong>{uploading ? "Enviando vídeo..." : "Arraste o vídeo aqui ou clique para selecionar"}</strong><small>MP4, MOV ou WebM</small></button><input ref={fileRef} hidden type="file" accept="video/*" onChange={(event) => upload(event.target.files?.[0])} />{uploadMessage && <p className="upload-message">{uploadMessage}</p>}</section><section className="video-library"><div className="panel-title"><div><h2>Vídeos das aulas</h2><p>{data.lessons.filter((lesson) => lesson.videoKey).length} arquivos enviados</p></div></div>{data.lessons.filter((lesson) => lesson.videoKey).map((lesson) => <article key={lesson.id}><video controls preload="metadata" src={`/api/videos?key=${encodeURIComponent(lesson.videoKey ?? "")}`} /><div><strong>{lesson.title}</strong><small>{lesson.videoName} · {lesson.videoSize ? `${(lesson.videoSize / 1024 / 1024).toFixed(1)} MB` : "Vídeo"}</small></div><span>Publicado</span></article>)}{!data.lessons.some((lesson) => lesson.videoKey) && <div className="video-empty"><span>▶</span><strong>Nenhum vídeo enviado</strong><p>Selecione uma aula ao lado para fazer o primeiro upload.</p></div>}{selectedVideoLesson?.videoKey && <p className="selected-video-note">A aula selecionada já possui um vídeo. Um novo upload substituirá o vínculo atual.</p>}</section></div>}
      </>}

      {editing && <div className="admin-editor-backdrop"><form className="admin-editor" onSubmit={save}><div className="editor-head"><div><span className="eyebrow">{editing.values.id ? "EDITAR" : "NOVO ITEM"}</span><h2>{editing.entity === "student" ? "Aluno" : editing.entity === "module" ? "Módulo" : editing.entity === "section" ? "Seção" : "Aula"}</h2></div><button type="button" onClick={() => setEditing(null)}>×</button></div>{editing.entity === "student" && <><label>Nome completo<input required value={String(editing.values.fullName ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, fullName: event.target.value } })} /></label><label>E-mail<input required type="email" value={String(editing.values.email ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, email: event.target.value } })} /></label><div className="form-row"><label>Nível<select value={String(editing.values.level)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, level: event.target.value } })}><option>Começando do zero</option><option>Básico</option><option>Intermediário</option><option>Avançado</option></select></label><label>Status<select value={String(editing.values.status)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Ativo</option><option>Pausado</option></select></label></div></>}{editing.entity === "module" && <><label>Título<input required value={String(editing.values.title ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, title: event.target.value } })} /></label><label>Descrição<textarea value={String(editing.values.description ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, description: event.target.value } })} /></label><div className="form-row"><label>Nível<select value={String(editing.values.level)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, level: event.target.value } })}><option>Básico</option><option>Intermediário</option><option>Avançado</option></select></label><label>Status<select value={String(editing.values.status)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Rascunho</option><option>Publicado</option></select></label></div></>}{editing.entity === "section" && <><label>Título<input required value={String(editing.values.title ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, title: event.target.value } })} /></label><label>Módulo<select value={String(editing.values.moduleId)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, moduleId: Number(event.target.value) } })}>{data.modules.map((module) => <option value={module.id} key={module.id}>{module.title}</option>)}</select></label></>}{editing.entity === "lesson" && <><label>Título<input required value={String(editing.values.title ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, title: event.target.value } })} /></label><label>Seção<select value={String(editing.values.sectionId)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, sectionId: Number(event.target.value) } })}>{data.sections.map((section) => <option value={section.id} key={section.id}>{section.title}</option>)}</select></label><div className="form-row"><label>Duração<input value={String(editing.values.duration ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, duration: event.target.value } })} /></label><label>Status<select value={String(editing.values.status)} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, status: event.target.value } })}><option>Rascunho</option><option>Publicado</option></select></label></div><label>Tipo de aula<input value={String(editing.values.lessonType ?? "")} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, lessonType: event.target.value } })} /></label></>}<div className="editor-actions"><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button type="submit">Salvar alterações</button></div></form></div>}
    </div>
  );
}
