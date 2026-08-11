import { useState, useCallback, useRef, useEffect } from 'react';
import { transcribeAudio, fetchSpeechHealth } from '../lib/api';
import { registerAnalyser, unregisterAnalyser } from '../lib/audio-reactive';

export type SpeechState = 'idle' | 'recording' | 'transcribing';

export function useSpeech() {
  const [state, setState] = useState<SpeechState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Analysis graph feeding the orb. Context and analyser outlive a single
  // recording — only the per-stream source node is rebuilt each time.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Check if speech backend is available on mount
  useEffect(() => {
    fetchSpeechHealth()
      .then((health) => setAvailable(health.available))
      .catch(() => setAvailable(false));
  }, []);

  /** Tap the mic stream so the orb pulses to the real voice. Best-effort: a
   * failure here must never cost the user their recording. */
  const attachAnalyser = useCallback((stream: MediaStream) => {
    try {
      let ctx = audioCtxRef.current;
      if (!ctx) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === 'suspended') void ctx.resume();

      let analyser = analyserRef.current;
      if (!analyser) {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.3;
        analyserRef.current = analyser;
      }

      // Terminates at the analyser on purpose: connecting through to
      // ctx.destination would play the mic back through the speakers.
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      micSourceRef.current = source;
      registerAnalyser(analyser);
    } catch {
      // Orb keeps its synthetic envelope; recording is unaffected.
    }
  }, []);

  const detachAnalyser = useCallback(() => {
    try {
      micSourceRef.current?.disconnect();
      micSourceRef.current = null;
      if (analyserRef.current) unregisterAnalyser(analyserRef.current);
    } catch {
      // Already torn down.
    }
  }, []);

  useEffect(
    () => () => {
      detachAnalyser();
      try {
        void audioCtxRef.current?.close();
      } catch {
        // Context was never opened, or is already closed.
      }
      audioCtxRef.current = null;
      analyserRef.current = null;
    },
    [detachAnalyser],
  );

  const startRecording = useCallback(async (): Promise<void> => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not supported in this browser');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      attachAnalyser(stream);

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setState('recording');
    } catch (err) {
      detachAnalyser();
      setError('Microphone access denied');
      setState('idle');
    }
  }, [attachAnalyser, detachAnalyser]);

  const stopRecording = useCallback(async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== 'recording') {
        reject(new Error('Not recording'));
        return;
      }

      recorder.onstop = async () => {
        setState('transcribing');

        // Unhook the orb before the tracks die, or it reads a dead node.
        detachAnalyser();

        // Stop all audio tracks
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];

        try {
          const result = await transcribeAudio(blob);
          setState('idle');
          resolve(result.text);
        } catch (err) {
          setState('idle');
          const msg = err instanceof Error ? err.message : 'Transcription failed';
          setError(msg);
          reject(err);
        }
      };

      recorder.stop();
    });
  }, [detachAnalyser]);

  return {
    state,
    error,
    available,
    startRecording,
    stopRecording,
    isRecording: state === 'recording',
    isTranscribing: state === 'transcribing',
  };
}
