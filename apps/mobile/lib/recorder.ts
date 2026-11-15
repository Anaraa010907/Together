import { useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';

export const MAX_VOICE_MS = 2 * 60 * 1000; // дуут мессеж 2 минут хүртэл

export type VoiceClip = { uri: string; durationMs: number; mime: string };

// Дуут мессеж бичих: start → (stop | cancel). 2 минутад автоматаар зогсоно.
export function useVoiceRecorder(onAutoStop?: (clip: VoiceClip | null) => void) {
  const rec = useRef<Audio.Recording | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const autoStopRef = useRef(onAutoStop);
  autoStopRef.current = onAutoStop;

  useEffect(
    () => () => {
      rec.current?.stopAndUnloadAsync().catch(() => {});
    },
    [],
  );

  const start = async (): Promise<boolean> => {
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) return false;
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording: r } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY, (status) => {
      if (!status.isRecording) return;
      setElapsed(status.durationMillis);
      if (status.durationMillis >= MAX_VOICE_MS) {
        stop().then((clip) => autoStopRef.current?.(clip));
      }
    }, 250);
    rec.current = r;
    setElapsed(0);
    setRecording(true);
    return true;
  };

  const finish = async (): Promise<VoiceClip | null> => {
    const r = rec.current;
    rec.current = null;
    setRecording(false);
    if (!r) return null;
    const status = await r.getStatusAsync().catch(() => null);
    await r.stopAndUnloadAsync().catch(() => {});
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
    const uri = r.getURI();
    const durationMs = status && 'durationMillis' in status ? status.durationMillis : elapsed;
    if (!uri || durationMs < 700) return null; // хэт богино бол илгээхгүй
    // HIGH_QUALITY: Android/iOS аль алинд .m4a (AAC, MPEG-4).
    return { uri, durationMs, mime: 'audio/mp4' };
  };

  const stop = () => finish();
  const cancel = async () => {
    await finish();
  };

  return { recording, elapsed, start, stop, cancel };
}
