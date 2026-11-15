import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio, ResizeMode, Video } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { font, lightTheme as t } from '@together/ui/tokens';
import { formatDuration, type Message } from '../lib/chat';

const MAX_W = 230;

// Зургийн хэмжээ: өргөн 230, өндөр харьцаагаар (140–300).
function boxSize(m: Message) {
  const w = m.media_width ?? 4;
  const h = m.media_height ?? 3;
  const height = Math.max(140, Math.min(300, (MAX_W * h) / w));
  return { width: MAX_W, height };
}

// Зураг: дарахад бүтэн дэлгэцээр.
export function ImageBubble({ message, url, mine, pending }: { message: Message; url?: string; mine: boolean; pending?: boolean }) {
  const [open, setOpen] = useState(false);
  const size = boxSize(message);
  const src = message.local_uri ?? url;
  return (
    <>
      <Pressable onPress={() => src && !pending && setOpen(true)} accessibilityRole="imagebutton" style={[styles.media, size, mine ? styles.mineCorner : styles.otherCorner]}>
        {src ? <Image source={{ uri: src }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <ActivityIndicator color={t.text} />}
        {pending && (
          <View style={styles.pendingOverlay}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        )}
      </Pressable>
      {!!src && <Viewer visible={open} onClose={() => setOpen(false)} kind="image" uri={src} />}
    </>
  );
}

// Видео: тоглуулах тэмдэг + үргэлжлэх хугацаа; дарахад бүтэн дэлгэцээр тоглоно.
export function VideoBubble({ message, url, mine, pending }: { message: Message; url?: string; mine: boolean; pending?: boolean }) {
  const { t: tr } = useTranslation();
  const [open, setOpen] = useState(false);
  const size = boxSize({ ...message, media_width: message.media_width ?? 16, media_height: message.media_height ?? 9 });
  const src = message.local_uri ?? url;
  return (
    <>
      <Pressable onPress={() => src && !pending && setOpen(true)} accessibilityRole="button" accessibilityLabel={tr('chat.kind.video')} style={[styles.media, size, mine ? styles.mineCorner : styles.otherCorner]}>
        <LinearGradient colors={['#2A1F55', '#120D26']} style={StyleSheet.absoluteFill} />
        {pending ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <View style={styles.play}>
            <Ionicons name="play" size={26} color="#FFFFFF" style={{ marginLeft: 3 }} />
          </View>
        )}
        <View style={styles.durationTag}>
          <Ionicons name="videocam" size={11} color="#FFFFFF" />
          <Text style={styles.durationText}>{formatDuration(message.media_duration_ms)}</Text>
        </View>
      </Pressable>
      {!!src && <Viewer visible={open} onClose={() => setOpen(false)} kind="video" uri={src} />}
    </>
  );
}

// Дуут мессеж: тоглуулах/зогсоох, долгионы дүрс дээр явц.
export function AudioBubble({ message, url, mine, pending }: { message: Message; url?: string; mine: boolean; pending?: boolean }) {
  const { t: tr } = useTranslation();
  const sound = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const duration = message.media_duration_ms ?? 0;
  const src = message.local_uri ?? url;

  useEffect(
    () => () => {
      sound.current?.unloadAsync().catch(() => {});
    },
    [],
  );

  const toggle = async () => {
    if (!src || pending) return;
    try {
      if (!sound.current) {
        setLoading(true);
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
        const { sound: s } = await Audio.Sound.createAsync({ uri: src }, { shouldPlay: true, progressUpdateIntervalMillis: 200 }, (st) => {
          if (!st.isLoaded) return;
          setPosition(st.positionMillis);
          setPlaying(st.isPlaying);
          if (st.didJustFinish) {
            setPlaying(false);
            setPosition(0);
            s.setPositionAsync(0).catch(() => {});
            s.pauseAsync().catch(() => {});
          }
        });
        sound.current = s;
        setLoading(false);
        return;
      }
      const st = await sound.current.getStatusAsync();
      if (st.isLoaded && st.isPlaying) await sound.current.pauseAsync();
      else await sound.current.playAsync();
    } catch {
      setLoading(false);
    }
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const bars = WAVE.length;
  const body = (
    <View style={styles.audioRow}>
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={playing ? tr('chat.pause') : tr('chat.play')} style={[styles.audioBtn, mine && { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
        {loading || pending ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#FFFFFF" style={{ marginLeft: playing ? 0 : 2 }} />
        )}
      </Pressable>
      <View style={styles.wave}>
        {WAVE.map((h, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              { height: 6 + h * 18, backgroundColor: i / bars <= progress ? '#FFFFFF' : mine ? 'rgba(255,255,255,0.45)' : 'rgba(196,181,253,0.45)' },
            ]}
          />
        ))}
      </View>
      <Text style={styles.audioTime}>{formatDuration(playing || position > 0 ? position : duration)}</Text>
    </View>
  );
  return mine ? (
    <LinearGradient colors={['#A855F7', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.audio, styles.mineCorner]}>
      {body}
    </LinearGradient>
  ) : (
    <View style={[styles.audio, styles.audioOther, styles.otherCorner]}>{body}</View>
  );
}

// Долгионы тогтмол хэлбэр (бичлэгийн жинхэнэ долгионыг тооцохгүй, харагдах байдалд).
const WAVE = [0.3, 0.6, 0.9, 0.5, 0.75, 1, 0.55, 0.35, 0.8, 0.6, 0.95, 0.45, 0.7, 0.4, 0.85, 0.5, 0.3, 0.65, 0.9, 0.4, 0.6, 0.35];

function Viewer({ visible, onClose, kind, uri }: { visible: boolean; onClose: () => void; kind: 'image' | 'video'; uri: string }) {
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        {kind === 'image' ? (
          <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
        ) : (
          visible && (
            <Video source={{ uri }} style={{ width, height: height * 0.8 }} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay />
          )
        )}
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={tr('common.close')} style={[styles.close, { top: insets.top + 12 }]}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  media: { overflow: 'hidden', borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surfaceSolid },
  mineCorner: { borderBottomRightRadius: 6 },
  otherCorner: { borderBottomLeftRadius: 6 },
  pendingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,10,28,0.45)', alignItems: 'center', justifyContent: 'center' },
  play: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center',
  },
  durationTag: {
    position: 'absolute', left: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8,
  },
  durationText: { fontFamily: font.bold, fontSize: 11, color: '#FFFFFF' },
  audio: { borderRadius: 20, paddingVertical: 10, paddingHorizontal: 10, minWidth: 220 },
  audioOther: { backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: t.border },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  audioBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(139,92,246,0.55)', alignItems: 'center', justifyContent: 'center' },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 26 },
  bar: { width: 3, borderRadius: 2 },
  audioTime: { fontFamily: font.semibold, fontSize: 12, color: '#FFFFFF', minWidth: 34, textAlign: 'right' },
  viewer: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  close: {
    position: 'absolute', right: 16, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
});

