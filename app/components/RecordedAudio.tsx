"use client";
import { useId, useRef, useState } from 'react';
import { MaterialIcon } from './MaterialIcon';
import { authenticatedFetch } from '../lib/client-data';
import styles from './RecordedAudio.module.css';

export function RecordedAudio({ exerciseId, available, version = '' }: { exerciseId: number; available: boolean; version?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState('');
  async function play(rate: number) { if (!audio.current) return; audio.current.playbackRate = rate; audio.current.currentTime = 0; setError(''); try { await audio.current.play(); } catch { setError('Não foi possível ouvir. Confira o arquivo ou tente novamente.'); } }
  if (!available || !exerciseId) return <p className="practice-save-error">A professora ainda não enviou o áudio desta atividade.</p>;
  return <div className="listening-controls"><audio key={version} ref={audio} controls preload="metadata" src={`/api/audio?exerciseId=${exerciseId}&v=${encodeURIComponent(version)}`} onError={() => setError('Áudio indisponível. Peça à professora para verificar a gravação.')} /><button type="button" className="outline-button" onClick={() => void play(1)}><MaterialIcon name="volume_up" />Ouvir do início</button><button type="button" className="outline-button" onClick={() => void play(.75)}><MaterialIcon name="slow_motion_video" />Ouvir mais devagar</button>{error && <p role="alert">{error}</p>}</div>;
}
export function AudioUpload({ exerciseId, audioKey, audioName, referenceText, onUploaded }: { exerciseId: number; audioKey: string; audioName: string; referenceText?: string; onUploaded: (key: string, name: string) => void }) {
  const uploadId = useId();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function upload(file?: File) {
    if (!file) return; if (file.size > 4 * 1024 * 1024) { setError('Use um áudio de até 4 MB. MP3 ocupa menos espaço.'); return; }
    setBusy(true); setError('');
    try { const response = await authenticatedFetch(`/api/audio?exerciseId=${exerciseId}`, { method: 'POST', headers: { 'content-type': file.type || 'audio/mpeg', 'x-file-name': encodeURIComponent(file.name), ...(referenceText ? { 'x-reference-text': encodeURIComponent(referenceText) } : {}) }, body: file }); const text = await response.text(); let data; try { data = JSON.parse(text); } catch { throw new Error('O servidor não recebeu o arquivo. Tente um MP3 menor.'); } if (!response.ok) throw new Error(data.error); onUploaded(data.key, data.name); } catch (error) { setError(error instanceof Error ? error.message : 'Falha no envio.'); } finally { setBusy(false); }
  }
  return <section className="exercise-builder-step" aria-busy={busy}><h3>Áudio de referência</h3><p>{exerciseId ? 'Envie sua gravação ou um áudio que você já gerou. O arquivo é salvo neste exercício e reutilizado por todos os alunos, sem geração automática.' : 'Salve a atividade como rascunho e abra Editar para enviar o áudio.'}</p><div className={styles.upload}><label className={styles.control} aria-disabled={!exerciseId || busy}><MaterialIcon name="upload_file" />{busy ? 'Enviando áudio…' : audioKey ? 'Trocar gravação' : 'Enviar áudio'}<input className={styles.input} type="file" aria-describedby={uploadId} accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm" disabled={!exerciseId || busy} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label><small id={uploadId} className={styles.formats}>MP3, M4A, WAV, OGG ou WebM · até 4 MB</small></div>{audioName && <p className={styles.file}><MaterialIcon name="check_circle" /><span>Arquivo: {audioName}</span></p>}{error && <p role="alert" className="practice-save-error">{error}</p>}{audioKey && <RecordedAudio exerciseId={exerciseId} available version={audioKey} />}</section>;
}
