"use client";

import { useRef, useState } from "react";
import { MaterialIcon } from "./MaterialIcon";
import { RecordedAudio, AudioUpload } from "./RecordedAudio";
import { AnswerComparison } from "./AnswerComparison";
import { assessAnswer, exerciseTypes, isListening } from "../lib/exercise-answers";
import { exerciseExamples } from "../lib/exercise-examples";

type Values = Record<string, string | number>;
type RotationVariant = { title?: string; prompt: string; options?: string[]; correct: string; accepted?: string[]; explanation?: string };
const formats = {
  listening_transcription: { icon: "headphones", description: "O aluno ouve e escreve o que entendeu.", prompt: "Instrução antes do áudio", placeholder: "Escute e escreva a frase que você ouvir.", answer: "Transcrição do áudio", sample: "Nice to meet you.", help: "Escreva exatamente o que é dito na gravação. Esta é a referência para corrigir a transcrição." },
  choice: { icon: "radio_button_checked", description: "O aluno escolhe uma resposta para uma situação.", prompt: "Pergunta ou situação", placeholder: "Você quer pedir água com educação. O que diria?", answer: "Resposta correta", sample: "", help: "Marque o círculo ao lado da alternativa correta." },
  correction: { icon: "edit_note", description: "O aluno encontra o erro e reescreve a frase.", prompt: "Frase com erro que o aluno vai corrigir", placeholder: "She don't like coffee.", answer: "Frase corrigida", sample: "She doesn't like coffee.", help: "Escreva a frase completa já corrigida, não apenas a palavra alterada." },
  fill: { icon: "space_bar", description: "O aluno escreve o trecho que está faltando.", prompt: "Frase com lacuna", placeholder: "I ___ from Brazil.", answer: "Palavra ou trecho que completa a lacuna", sample: "am", help: "Use ___ na frase acima. Aqui, coloque somente o que falta." },
  writing: { icon: "stylus_note", description: "O aluno produz uma resposta curta em inglês.", prompt: "O que o aluno deve escrever?", placeholder: "Escreva uma frase dizendo que você é do Brasil.", answer: "Resposta de referência", sample: "I am from Brazil.", help: "Cadastre também outras formas válidas de responder, abaixo." },
  situational: { icon: "forum", description: "O aluno responde como faria numa conversa real.", prompt: "Contexto da conversa e tarefa", placeholder: "Você está numa cafeteria. Peça um café usando Could I…", answer: "Resposta esperada na conversa", sample: "Could I have a coffee, please?", help: "Dê uma orientação clara e inclua outras respostas válidas." },
  teacher_prompt: { icon: "school", description: "A professora pergunta e o aluno responde.", prompt: "Pergunta da professora", placeholder: "Como você pergunta o nome de alguém em inglês?", answer: "Resposta esperada", sample: "What is your name?", help: "Prefira perguntas curtas e específicas que possam ser corrigidas com clareza." },
} as const;

function list(value: string | number | undefined): string[] {
  try { const parsed: unknown = JSON.parse(String(value ?? "[]")); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

function variants(value: string | number | undefined): RotationVariant[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is RotationVariant => Boolean(item && typeof item === "object")) : [];
  } catch {
    return [];
  }
}

function TextList({ title, hint, values, onChange }: { title: string; hint: string; values: string[]; onChange: (values: string[]) => void }) {
  return <fieldset className="exercise-text-list"><legend>{title}</legend><p>{hint}</p>
    {values.map((value, index) => <div className="exercise-list-row" key={index}><input aria-label={`${title} ${index + 1}`} value={value} onChange={event => onChange(values.map((item, i) => i === index ? event.target.value : item))} placeholder="Digite outra resposta válida" /><button type="button" aria-label={`Remover resposta ${index + 1}`} onClick={() => onChange(values.filter((_, i) => i !== index))}><MaterialIcon name="close" /></button></div>)}
    <button type="button" className="exercise-add" onClick={() => onChange([...values, ""])}><MaterialIcon name="add" />Adicionar resposta aceita</button>
  </fieldset>;
}

function RotationVariants({ type, value, onChange }: { type: keyof typeof formats; value: string | number | undefined; onChange: (value: string) => void }) {
  const items = variants(value);
  const update = (index: number, changes: Partial<RotationVariant>) => onChange(JSON.stringify(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item)));
  const add = () => onChange(JSON.stringify([...items, { title: "", prompt: "", correct: "", accepted: [], explanation: "", options: type === "choice" ? ["", ""] : [] }]));
  return <section className="exercise-rotation-builder"><div className="exercise-rotation-heading"><span><MaterialIcon name="autorenew" filled /></span><div><h3>Variações para a rotação inteligente</h3><p>Cadastre outras formas de cobrar o mesmo conhecimento. Em cada nova tentativa, o aplicativo evita repetir a versão anterior.</p></div><b>{items.length} {items.length === 1 ? "variação" : "variações"}</b></div>
    {items.map((item, index) => { const variantOptions = item.options?.length ? item.options : ["", ""]; return <article className="exercise-variant-card" key={index}><header><span>VARIAÇÃO {String(index + 1).padStart(2, "0")}</span><button type="button" onClick={() => onChange(JSON.stringify(items.filter((_, itemIndex) => itemIndex !== index)))}><MaterialIcon name="delete" />Remover</button></header><label>Nome curto <input value={item.title ?? ""} onChange={event => update(index, { title: event.target.value })} placeholder="Ex.: Pedido no restaurante" /></label><label>Novo enunciado <textarea rows={2} value={item.prompt ?? ""} onChange={event => update(index, { prompt: event.target.value })} placeholder="Crie uma situação diferente que exija o mesmo raciocínio." /></label>
      {type === "choice" ? <fieldset className="exercise-alternatives compact"><legend>Alternativas desta variação</legend>{variantOptions.map((option, optionIndex) => <div className="exercise-alternative" key={optionIndex}><label className="exercise-correct-choice"><input type="radio" name={`variant-${index}-correct`} checked={Boolean(option.trim()) && option === item.correct} onChange={() => update(index, { correct: option })} disabled={!option.trim()} /><span>{String.fromCharCode(65 + optionIndex)}</span></label><input value={option} onChange={event => { const next = variantOptions.map((current, currentIndex) => currentIndex === optionIndex ? event.target.value : current); update(index, { options: next, ...(item.correct === option ? { correct: event.target.value } : {}) }); }} placeholder={`Alternativa ${optionIndex + 1}`} /><button type="button" disabled={variantOptions.length <= 2} onClick={() => update(index, { options: variantOptions.filter((_, currentIndex) => currentIndex !== optionIndex), ...(item.correct === option ? { correct: "" } : {}) })}><MaterialIcon name="close" /></button></div>)}<button type="button" className="exercise-add" onClick={() => update(index, { options: [...variantOptions, ""] })}><MaterialIcon name="add" />Adicionar alternativa</button></fieldset> : <label>Resposta correta <textarea rows={2} value={item.correct ?? ""} onChange={event => update(index, { correct: event.target.value })} placeholder="Resposta esperada para esta variação" /></label>}
      <TextList title="Outras respostas aceitas nesta variação" hint="Opcional. Cadastre formas equivalentes que também devem ser consideradas corretas." values={item.accepted ?? []} onChange={accepted => update(index, { accepted })} /><label>Explicação específica <textarea rows={2} value={item.explanation ?? ""} onChange={event => update(index, { explanation: event.target.value })} placeholder="Opcional. Se ficar vazio, será usada a explicação principal." /></label></article>; })}
    <button type="button" className="exercise-add rotation-add" onClick={add}><MaterialIcon name="add_circle" />Adicionar nova variação</button>
  </section>;
}

function Preview({ values, type }: { values: Values; type: keyof typeof formats }) {
  const [answer, setAnswer] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const result = confirmed ? assessAnswer(answer, String(values.correctAnswer ?? ""), list(values.acceptedAnswersJson)) : null;
  return <section className="exercise-preview"><div className="exercise-preview-heading"><MaterialIcon name="visibility" /><strong>Como o aluno vai ver</strong><span>Prévia · não salva respostas</span></div>
    <h3>{String(values.title || exerciseTypes[type])}</h3><p>{type === "correction" ? "Corrija a frase: " : type === "fill" ? "Complete: " : ""}{String(values.prompt || formats[type].placeholder)}</p>
    {isListening(type) ? <RecordedAudio exerciseId={Number(values.id)} available={Boolean(values.audioKey)} version={String(values.audioKey || "")} /> : null}
    {type === "choice" ? <div className="exercise-preview-options">{list(values.optionsJson).map((option, i) => <button type="button" disabled={confirmed} key={i} aria-pressed={answer === option} className={answer === option ? "selected" : ""} onClick={() => setAnswer(option)}>{String.fromCharCode(65 + i)} · {option || "Alternativa ainda vazia"}</button>)}</div> : <label>Sua resposta<input value={answer} disabled={confirmed} onChange={event => setAnswer(event.target.value)} placeholder="Experimente responder em inglês" /></label>}
    {confirmed ? <div role="status" className="exercise-preview-result"><strong>{result?.status === "correct" ? "Resposta correta!" : result?.status === "almost" ? "Quase!" : "Vamos revisar."}</strong><p>{String(values.explanation || "A explicação da professora aparecerá aqui.")}</p><AnswerComparison answer={answer} correct={String(values.correctAnswer || "")} accepted={list(values.acceptedAnswersJson)} /></div> : null}
    <button type="button" className="exercise-add" disabled={!answer.trim() || !values.correctAnswer} onClick={() => { if (confirmed) { setAnswer(""); setConfirmed(false); } else setConfirmed(true); }}>{confirmed ? "Tentar novamente" : "Confirmar resposta na prévia"}</button>
  </section>;
}

export function ExerciseEditor({ values, onChange, exam = false }: { values: Values; onChange: (values: Values) => void; exam?: boolean }) {
  const field = exam ? "questionType" : "exerciseType";
  const rawType = String(values[field] || "choice");
  const type = (isListening(rawType) ? "listening_transcription" : rawType in formats ? rawType : "writing") as keyof typeof formats;
  const config = formats[type];
  const [preview, setPreview] = useState(false);
  const drafts = useRef<Partial<Record<keyof typeof formats, Values>>>({});
  const update = (changes: Values) => onChange({ ...values, ...changes });
  const options = list(values.optionsJson);
  const visibleOptions = options.length ? options : ["", ""];
  const skills = list(values.skillsJson);
  const availableSkills = Array.from(new Set(["Listening", "Vocabulário", "Gramática", "Escrita", "Compreensão", ...skills]));

  function changeType(next: keyof typeof formats) {
    if (next === type) return;
    drafts.current[type] = { ...values };
    const previous = drafts.current[next];
    onChange(previous ? { ...previous, [field]: next } : { ...values, [field]: next, prompt: "", correctAnswer: "", speech: "", optionsJson: "[]", acceptedAnswersJson: "[]", rotationVariantsJson: "[]", explanation: "" });
    setPreview(false);
  }

  return <div className="exercise-builder">
    <section className="exercise-builder-step"><div className="exercise-step-title"><span>1</span><div><h3>Como o aluno vai praticar?</h3><p>Escolha o formato. Os campos se adaptam à atividade.</p></div></div>
      <div className="exercise-format-grid">{(Object.keys(formats) as (keyof typeof formats)[]).filter(key => !exam || ["choice", "fill", "writing", "correction", "situational", "teacher_prompt"].includes(key)).map(key => <button type="button" key={key} aria-pressed={type === key} className={type === key ? "active" : ""} onClick={() => changeType(key)}><MaterialIcon name={formats[key].icon} /><span><strong>{exerciseTypes[key]}</strong><small>{formats[key].description}</small></span>{type === key ? <MaterialIcon name="check_circle" /> : null}</button>)}</div>
    </section>
    {exam && <section className="exercise-builder-step"><h3>Avalie a aplicação, não a memorização</h3><p>Use situações novas relacionadas às aulas, frases com erros para corrigir e perguntas que peçam uma resposta construída. Informe a estrutura que será avaliada e cadastre variações válidas.</p><p>A correção automática compara com as respostas cadastradas. Ela não avalia livremente argumentos, criatividade ou pronúncia.</p></section>}
    <section className="exercise-builder-step"><div className="exercise-step-title"><span>2</span><div><h3>Prepare a atividade</h3><p>{config.description}</p></div></div>
      {!exam && <label className="exercise-template">Quer um ponto de partida?<select value="" onChange={event => { if (!event.target.value) return; const example = exerciseExamples[Number(event.target.value)]; update({ ...example, acceptedAnswersJson: "[]", optionsJson: "[]", status: "Rascunho" }); }}><option value="">Escrever minha atividade</option>{exerciseExamples.map((example, index) => example.exerciseType === type ? <option key={index} value={index}>{example.level} · {example.title}</option> : null)}</select><small>O modelo preenche o conteúdo deste formato para você adaptar.</small></label>}
      {!exam && <label>Nome da atividade<input required value={String(values.title ?? "")} onChange={event => update({ title: event.target.value })} placeholder="Ex.: Pedindo um café" /></label>}
      <label>{config.prompt}<textarea required value={String(values.prompt ?? "")} onChange={event => update({ prompt: event.target.value })} placeholder={config.placeholder} rows={3} /></label>
      {type === "choice" ? <fieldset className="exercise-alternatives"><legend>Alternativas</legend><p>{config.help}</p>{visibleOptions.map((option, index) => <div className="exercise-alternative" key={index}><label className="exercise-correct-choice"><input type="radio" name="exercise-correct" required checked={Boolean(option.trim()) && option === values.correctAnswer} onChange={() => update({ correctAnswer: option })} disabled={!option.trim()} aria-label={`Marcar alternativa ${index + 1} como correta`} /><span>{String.fromCharCode(65 + index)}</span></label><input required aria-label={`Texto da alternativa ${index + 1}`} value={option} placeholder={`Alternativa ${index + 1}`} onChange={event => { const next = visibleOptions.map((item, i) => i === index ? event.target.value : item); update({ optionsJson: JSON.stringify(next), ...(option && values.correctAnswer === option ? { correctAnswer: event.target.value } : {}) }); }} /><button type="button" disabled={visibleOptions.length <= 2} aria-label={`Remover alternativa ${index + 1}`} onClick={() => update({ optionsJson: JSON.stringify(visibleOptions.filter((_, i) => i !== index)), ...(values.correctAnswer === option ? { correctAnswer: "" } : {}) })}><MaterialIcon name="delete" /></button></div>)}<button type="button" className="exercise-add" onClick={() => update({ optionsJson: JSON.stringify([...visibleOptions, ""]) })}><MaterialIcon name="add" />Adicionar alternativa</button></fieldset> : <><label>{config.answer}<textarea required maxLength={1000} value={String(values.correctAnswer ?? "")} onChange={event => update({ correctAnswer: event.target.value, ...(isListening(type) ? { speech: event.target.value } : {}) })} placeholder={config.sample} rows={2} /><small>{config.help}</small></label>{isListening(type) && values.correctAnswer ? <AudioUpload exerciseId={Number(values.id || 0)} audioKey={String(values.audioKey || "")} audioName={String(values.audioName || "")} onUploaded={(audioKey, audioName) => update({ audioKey, audioName })} /> : null}<TextList title="Outras respostas que você aceita" hint="Opcional. Adicione cada variação válida em um campo separado." values={list(values.acceptedAnswersJson)} onChange={items => update({ acceptedAnswersJson: JSON.stringify(items) })} /></>}
    </section>
    {!exam && !isListening(type) ? <RotationVariants type={type} value={values.rotationVariantsJson} onChange={rotationVariantsJson => update({ rotationVariantsJson })} /> : null}
    {!exam && isListening(type) ? <div className="exercise-rotation-note"><MaterialIcon name="graphic_eq" /><div><strong>Rotação de listening</strong><p>Para trocar também a voz, crie outras atividades de listening e envie uma gravação para cada uma. A rotação inteligente mudará a ordem entre elas.</p></div></div> : null}
    <section className="exercise-builder-step"><div className="exercise-step-title"><span>3</span><div><h3>Ensine com a correção</h3><p>Esta explicação aparece depois que o aluno responde.</p></div></div><label>O que o aluno precisa entender?<textarea required value={String(values.explanation ?? "")} onChange={event => update({ explanation: event.target.value })} placeholder="Ex.: Com she, usamos doesn't. O verbo principal continua na forma base: like." rows={3} /></label>
      {!exam && <fieldset className="exercise-skills"><legend>Habilidades trabalhadas</legend>{availableSkills.map(skill => <label key={skill}><input type="checkbox" checked={skills.includes(skill)} onChange={event => update({ skillsJson: JSON.stringify(event.target.checked ? [...skills, skill] : skills.filter(item => item !== skill)) })} />{skill}</label>)}</fieldset>}
      <div className="form-row"><label>Tema<input value={String(values.category ?? "")} onChange={event => update({ category: event.target.value })} placeholder="Ex.: Apresentações" /></label><label>Visibilidade<select value={String(values.status || "Rascunho")} onChange={event => update({ status: event.target.value })}><option value="Rascunho">Rascunho · só administradores</option><option value="Publicado">Publicado · disponível aos alunos</option></select></label></div>
    </section>
    <button type="button" className="exercise-preview-toggle" aria-expanded={preview} onClick={() => setPreview(!preview)}><MaterialIcon name="visibility" />{preview ? "Fechar prévia do aluno" : "Testar como aluno"}<MaterialIcon name={preview ? "expand_less" : "expand_more"} /></button>
    {preview ? <Preview key={JSON.stringify(values)} values={values} type={type} /> : null}
  </div>;
}
