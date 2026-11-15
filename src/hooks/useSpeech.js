import { useEffect, useRef, useState } from "react";
import {
  VOICE_KEY,
  RATE_KEY,
  MODE_KEY,
  AUTO_KEY,
} from "../lib/constants";
import {
  audioEls,
  getHumanAudio,
  pickVoice,
  scoreVoice,
  unlockAudio,
} from "../lib/audio";

export function useSpeech() {
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState(
    () => localStorage.getItem(VOICE_KEY) || ""
  );
  const [rate, setRate] = useState(
    () => +(localStorage.getItem(RATE_KEY) || 0.9)
  );
  const [voiceMode, setVoiceMode] = useState(
    () => localStorage.getItem(MODE_KEY) || "human"
  );
  const [autoSpeak, setAutoSpeak] = useState(
    () => localStorage.getItem(AUTO_KEY) !== "0"
  );
  const audioRef = useRef(null);
  const speakSeq = useRef(0); // đánh số lần đọc để bỏ qua lần cũ đến muộn

  useEffect(() => {
    localStorage.setItem(VOICE_KEY, voiceURI);
    localStorage.setItem(RATE_KEY, String(rate));
    localStorage.setItem(MODE_KEY, voiceMode);
    localStorage.setItem(AUTO_KEY, autoSpeak ? "1" : "0");
  }, [voiceURI, rate, voiceMode, autoSpeak]);

  // Mở khóa âm thanh ở lần chạm / phím đầu tiên trên trang
  useEffect(() => {
    const h = () => unlockAudio();
    window.addEventListener("pointerdown", h, { once: true });
    window.addEventListener("keydown", h, { once: true });
    return () => {
      window.removeEventListener("pointerdown", h);
      window.removeEventListener("keydown", h);
    };
  }, []);

  // Danh sách giọng nạp muộn trên Chrome/Edge: phải nghe voiceschanged
  useEffect(() => {
    const sy = window.speechSynthesis;
    if (!sy) return;
    const load = () =>
      setVoices(sy.getVoices().filter((v) => scoreVoice(v) >= 0));
    load();
    sy.addEventListener?.("voiceschanged", load);
    return () => sy.removeEventListener?.("voiceschanged", load);
  }, []);

  const speakBrowser = (text) => {
    const sy = window.speechSynthesis;
    if (!sy) return;
    sy.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(voices, voiceURI);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = "en-US";
    u.rate = rate;
    sy.speak(u);
  };

  // Phát ngay nếu âm thanh đã tải sẵn; chưa có thì hỏi từ điển.
  // Chờ quá 0,8 giây thì đọc tạm bằng giọng trình duyệt.
  const speak = (text) => {
    const seq = ++speakSeq.current;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    if (voiceMode !== "human") return speakBrowser(text);
    const key = text.toLowerCase().trim();
    const play = (a) => {
      try {
        a.currentTime = 0;
      } catch {
        /* chưa tải xong metadata */
      }
      a.playbackRate = rate;
      audioRef.current = a;
      a.play().catch(() => {
        if (seq === speakSeq.current) speakBrowser(text);
      });
    };
    const el = audioEls.get(key);
    if (el) return play(el);
    Promise.race([
      getHumanAudio(text),
      new Promise((r) => setTimeout(() => r("__slow__"), 800)),
    ]).then((url) => {
      if (seq !== speakSeq.current) return;
      if (!url || url === "__slow__") return speakBrowser(text);
      const a = new Audio(url);
      audioEls.set(key, a);
      play(a);
    });
  };

  return {
    voices,
    voiceURI,
    setVoiceURI,
    rate,
    setRate,
    voiceMode,
    setVoiceMode,
    autoSpeak,
    setAutoSpeak,
    speak,
    speakBrowser,
  };
}
