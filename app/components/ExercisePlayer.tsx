"use client";

import { useMemo, useState } from "react";

type Exercise = {
  type: "choice" | "listening" | "order" | "fill";
  category: string;
  title: string;
  prompt: string;
  options?: string[];
  words?: string[];
  correct: string;
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
    type: "order",
    category: "ESTRUTURA · DAILY ROUTINE",
    title: "Put the sentence in order.",
    prompt: "Monte uma pergunta natural sobre frequência.",
    words: ["practice", "How", "English?", "you", "often", "do"],
    correct: "How often do you practice English?",
    explanation: "Em perguntas de frequência, usamos “How often + do + sujeito + verbo”.",
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
    type: "choice",
    category: "GRAMMAR · CONDITIONALS",
    title: "Choose the correct continuation.",
    prompt: "If I had more time...",
    options: ["I will travel more.", "I would travel more.", "I traveled more."],
    correct: "I would travel more.",
    explanation: "No second conditional usamos “if + past” e “would + verbo”.",
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
  const exercise = exercises[current];
  const orderedWords = selected ? selected.split("|") : [];
  const orderedAnswer = orderedWords.join(" ");
  const answerValue = exercise.type === "order" ? orderedAnswer : selected;
  const isCorrect = normalize(answerValue) === normalize(exercise.correct);
  const canConfirm = exercise.type === "order" ? orderedWords.length === exercise.words?.length : Boolean(selected.trim());
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

  function addWord(word: string) {
    if (!confirmed && !orderedWords.includes(word)) setSelected([...orderedWords, word].join("|"));
  }

  function removeWord(index: number) {
    if (!confirmed) setSelected(orderedWords.filter((_, itemIndex) => itemIndex !== index).join("|"));
  }

  function primaryAction() {
    if (!confirmed) {
      const answerValue = exercise.type === "order" ? orderedAnswer : selected;
      const correct = normalize(answerValue) === normalize(exercise.correct);
      setConfirmed(true);
      if (correct) setScore((value) => value + 1);
      return;
    }
    if (current === exercises.length - 1) {
      setFinished(true);
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

              {(exercise.type === "choice" || exercise.type === "listening") && (
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

              {exercise.type === "fill" && <div className="fill-answer"><span>I've lived here</span><input autoFocus value={selected} disabled={confirmed} onChange={(event) => setSelected(event.target.value)} placeholder="digite aqui" /><span>2022.</span></div>}

              {exercise.type === "order" && (
                <div className="order-exercise">
                  <div className="order-dropzone">{orderedWords.length ? orderedWords.map((word, index) => <button disabled={confirmed} onClick={() => removeWord(index)} key={`${word}-${index}`}>{word}</button>) : <span>Toque nas palavras para montar a frase</span>}</div>
                  <div className="word-bank">{exercise.words?.map((word) => <button key={word} disabled={confirmed || orderedWords.includes(word)} onClick={() => addWord(word)}>{word}</button>)}</div>
                </div>
              )}

              {confirmed && <div className={isCorrect ? "feedback success" : "feedback error"}><strong>{isCorrect ? "Mandou bem!" : "Quase lá!"}</strong><p>{exercise.explanation}</p>{!isCorrect && <small>Resposta correta: <b>{exercise.correct}</b></small>}</div>}
            </div>
            <div className="modal-footer"><span>{confirmed && isCorrect ? "+20 XP conquistados" : "A resposta só será revelada após confirmar"}</span><button disabled={!canConfirm} onClick={primaryAction}>{confirmed ? (current === exercises.length - 1 ? "Ver resultado" : "Próxima") : "Confirmar resposta"} <span>→</span></button></div>
          </>
        )}
      </section>
    </div>
  );
}
