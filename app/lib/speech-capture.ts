import { encodePcmWav, inspectWav, recordingDuration } from "./speech-audio";

/** Decode locally so the backend measures real samples without a transcoding service. */
export async function normalizeRecording(recording: Blob) {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer());
    const duration = recordingDuration(decoded.duration);
    const offline = new OfflineAudioContext(1, Math.ceil(duration * 24000), 24000);
    const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
    const normalized = await offline.startRendering();
    const bytes = encodePcmWav(normalized.getChannelData(0), 24000);
    const facts = inspectWav(bytes);
    return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "audio/wav" }), duration: facts.durationSeconds };
  } finally { await context.close(); }
}
