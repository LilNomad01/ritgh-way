"use client";

import { useMemo, useState } from "react";

type Exercise = {
  type: "choice" | "listening" | "correction" | "fill" | "writing";
  category: string;
  title: string;
  prompt: string;
  options?: string[];
  correct: string;
  accepted?: string[];
  explanation: string;
  speech?: string;
};

const exercises: Exercise[] = [
  {
    type: "choice",
    category: "COMPREENSÃO · COFFEE SHOP",
    title: "Choose the most natural phrase.",
    prompt: "Você quer pedir um café com leite de maneira educada. O que diria?",
    options: ["Give me a latte.", "Could I have a latte, please?", "I want latte now."],
    correct: "Could I have a latte, please?",
    explanation: "“Could I have...” soa natural e educado para fazer pedidos.",
  },
  {
    type: "listening",
    category: "LISTENING · TRAVEL",
    title: "Listen and choose the right time.",
    prompt: "Ouça o anúncio e selecione o horário correto.",
    options: ["6:13", "6:30", "7:30"],
    correct: "6:30",
    speech: "The train to London leaves at half past six from platform four.",
    explanation: "“Half past six” significa seis e meia: 6:30.",
  },
  {
    type: "correction",
    category: "ESTRUTURA · DAILY ROUTINE",
    title: "Find the mistake.",
    prompt: "Na frase “I've been working here since three years”, qual trecho precisa mudar?",
    options: ["I've been working", "here since", "three years"],
    correct: "here since",
    explanation: "Usamos “for” com duração. A forma correta é: “I've been working here for three years.”",
  },
  {
    type: "fill",
    category: "WRITING · PRESENT PERFECT",
    title: "Complete the sentence.",
    prompt: "I've lived here ___ 2022.",
    correct: "since",
    explanation: "Use “since” com o ponto exato em que a ação começou.",
  },
  {
    type: "writing",
    category: "GRAMMAR · CONDITIONALS",
    title: "Write it naturally.",
    prompt: "Traduza: “Eu gostaria de ter mais tempo.”",
    correct: "I wish I had more time.",
    accepted: ["I wish I had more time", "I would like to have more time", "I'd like to have more time"],
    explanation: "“I wish I had...” expressa um desejo sobre uma situação atual que você gostaria que fosse diferente.",
  },
];

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function ExercisePlayer({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [responses, setResponses] = useState<string[]>([]);
  const exercise = exercises[current];
  const normalizedSelection = normalize(selected).replace(/[.!?]$/g, "");
  const acceptedAnswers = [exercise.correct, ...(exercise.accepted ?? [])].map((answer) => normalize(answer).replace(/[.!?]$/g, ""));
  const isCorrect = acceptedAnswers.includes(normalizedSelection);
  const canConfirm = Boolean(selected.trim());
  const progress = useMemo(() => ((finished ? exercises.length : current + 1) / exercises.length) * 100, [current, finished]);

  function speak() {
    if (!exercise.speech || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(exercise.speech);
    utterance.lang = "en-US";
    utterance.rate = 0.88;
    window.speechSynthesis.speak(utterance);
  }

  function choose(value: string) {
    if (!confirmed) setSelected(value);
  }

  function primaryAction() {
    if (!confirmed) {
      const correct = isCorrect;
      setConfirmed(true);
      setResponses((values) => [...values, selected]);
      if (correct) setScore((value) => value + 1);
      return;
    }
    if (current === exercises.length - 1) {
      setFinished(true);
      void fetch("/api/progress", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lessonSlug: "coffee-shop-practice", score, total: exercises.length, answers: responses }) });
      return;
    }
    setCurrent((value) => value + 1);
    setSelected("");
    setConfirmed(false);
  }

  function restart() {
    setCurrent(0);
    setSelected("");
    setConfirmed(false);
    setScore(0);
    setFinished(false);
    setResponses([]);
  }

  return (
    <div className="lesson-overlay" role="dialog" aria-modal="true" aria-labelledby="lesson-title">
      <section className="lesson-modal">
        <div className="modal-top">
          <button onClick={onClose} aria-label="Fechar aula">×</button>
          <div className="modal-progress"><span style={{ width: `${progress}%` }} /></div>
          <small>{finished ? exercises.length : current + 1} / {exercises.length}</small>
        </div>

        {finished ? (
          <div className="exercise-finish">
            <div className="finish-medal">★</div>
            <span className="eyebrow">SESSÃO CONCLUÍDA</span>
            <h2>Você ganhou {score * 20} XP!</h2>
            <p>Acertou <strong>{score} de {exercises.length}</strong> atividades. Seu progresso foi salvo.</p>
            <div className="finish-stats"><div><small>DESEMPENHO</small><strong>{Math.round((score / exercises.length) * 100)}%</strong></div><div><small>SEQUÊNCIA</small><strong>6 dias 🔥</strong></div></div>
            <div className="finish-actions"><button className="secondary-button" onClick={restart}>Refazer prática</button><button className="primary-button" onClick={onClose}>Voltar ao painel</button></div>
          </div>
        ) : (
          <>
            <div className="modal-content">
              <div className="maya-tip"><div className="coach-avatar small">M</div><p><strong>Dica da Maya</strong>{exercise.type === "listening" ? "Você pode ouvir quantas vezes precisar antes de confirmar." : "Escolha com calma. A correção só aparece depois que você confirmar."}</p></div>
              <span className="eyebrow">{exercise.category}</span>
              <h2 id="lesson-title">{exercise.title}</h2>
              <p>{exercise.prompt}</p>

              {exercise.type === "listening" && <button className="listen-button" onClick={speak}><span>▶</span><div><strong>Ouvir áudio</strong><small>Toque para reproduzir em inglês</small></div><i>0:06</i></button>}

              {(exercise.type === "choice" || exercise.type === "listening" || exercise.type === "correction") && (
                <div className="answers">
                  {exercise.options?.map((option, index) => {
                    const isSelected = selected === option;
                    const revealCorrect = confirmed && option === exercise.correct;
                    const revealWrong = confirmed && isSelected && option !== exercise.correct;
                    return (
                      <button key={option} disabled={confirmed} className={`${isSelected && !confirmed ? "selected" : ""} ${revealCorrect ? "correct" : ""} ${revealWrong ? "wrong" : ""}`} onClick={() => choose(option)}>
                        <span>{String.fromCharCode(65 + index)}</span>{option}
                        {confirmed && (revealCorrect || revealWrong) && <b>{revealCorrect ? "✓" : "×"}</b>}
                      </button>
                    );
                  })}
                </div>
              )}

              {exercise.type === "fill" && <div className="fill-answer"><span>I&apos;ve lived here</span><input autoFocus value={selected} disabled={confirmed} onChange={(event) => setSelected(event.target.value)} placeholder="digite aqui" /><span>2022.</span></div>}
              {exercise.type === "writing" && <div className="writing-answer"><label>Sua resposta em inglês</label><textarea autoFocus value={selected} disabled={confirmed} onChange={(event) => setSelected(event.target.value)} placeholder="Escreva a frase completa..." /><small>Pense na intenção da frase, não traduza palavra por palavra.</small></div>}

              {confirmed && <div className={isCorrect ? "feedback success" : "feedback error"}><strong>{isCorrect ? "Mandou bem!" : "Quase lá!"}</strong><p>{exercise.explanation}</p>{!isCorrect && <small>Resposta correta: <b>{exercise.correct}</b></small>}</div>}
            </div>
            <div className="modal-footer"><span>{confirmed && isCorrect ? "+20 XP conquistados" : "A resposta só será revelada após confirmar"}</span><button disabled={!canConfirm} onClick={primaryAction}>{confirmed ? (current === exercises.length - 1 ? "Ver resultado" : "Próxima") : "Confirmar resposta"} <span>→</span></button></div>
          </>
        )}
      </section>
    </div>
  );
}
