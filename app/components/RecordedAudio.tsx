"use client";
import { useRef, useState } from 'react';
import { MaterialIcon } from './MaterialIcon';

export function RecordedAudio({ exerciseId, available, version = '' }: { exerciseId: number; available: boolean; version?: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [error, setError] = useState('');
  async function play(rate: number) { if (!audio.current) return; audio.current.playbackRate = rate; audio.current.currentTime = 0; setError(''); try { await audio.current.play(); } catch { setError('Não foi possível ouvir. Confira o arquivo ou tente novamente.'); } }
  if (!available || !exerciseId) return <p className="practice-save-error">A professora ainda não enviou o áudio desta atividade.</p>;
  return <div className="listening-controls"><audio key={version} ref={audio} controls preload="metadata" src={`/api/audio?exerciseId=${exerciseId}&v=${encodeURIComponent(version)}`} onError={() => setError('Áudio indisponível. Peça à professora para verificar a gravação.')} /><button type="button" className="outline-button" onClick={() => void play(1)}><MaterialIcon name="volume_up" />Ouvir do início</button><button type="button" className="outline-button" onClick={() => void play(.75)}><MaterialIcon name="slow_motion_video" />Ouvir mais devagar</button>{error && <p role="alert">{error}</p>}</div>;
}
export function AudioUpload({ exerciseId, audioKey, audioName, onUploaded }: { exerciseId: number; audioKey: string; audioName: string; onUploaded: (key: string, name: string) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function upload(file?: File) {
    if (!file) return; if (file.size > 4 * 1024 * 1024) { setError('Use um áudio de até 4 MB. MP3 ocupa menos espaço.'); return; }
    setBusy(true); setError('');
    try { const response = await fetch(`/api/audio?exerciseId=${exerciseId}`, { method: 'POST', headers: { 'content-type': file.type || 'audio/mpeg', 'x-file-name': encodeURIComponent(file.name) }, body: file }); const text = await response.text(); let data; try { data = JSON.parse(text); } catch { throw new Error('O servidor não recebeu o arquivo. Tente um MP3 menor.'); } if (!response.ok) throw new Error(data.error); onUploaded(data.key, data.name); } catch (error) { setError(error instanceof Error ? error.message : 'Falha no envio.'); } finally { setBusy(false); }
  }
  return <section className="exercise-builder-step"><h3>Gravação da professora</h3><p>{exerciseId ? 'Envie a voz real que o aluno deve escutar. O áudio é salvo imediatamente neste exercício.' : 'Salve a atividade como rascunho e abra Editar para enviar a gravação.'}</p><label className="exercise-add">{busy ? 'Enviando áudio…' : audioKey ? 'Trocar gravação' : 'Enviar áudio'}<input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm" disabled={!exerciseId || busy} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label><small>MP3, M4A, WAV, OGG ou WebM · até 4 MB</small>{audioName && <p>Arquivo: {audioName}</p>}{error && <p role="alert" className="practice-save-error">{error}</p>}<RecordedAudio exerciseId={exerciseId} available={Boolean(audioKey)} version={audioKey} /></section>;
}
