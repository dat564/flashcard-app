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
  // Mỗi lần đọc dùng MỘT phần tử Audio mới (phần tử tải sẵn chỉ dùng một lần): tái sử dụng phần tử đã
  // phát xong hoặc đã lỗi khiến từ lặp lại (thẻ hỏi lại, từ gặp lại) im lặng trên một số trình duyệt.
  // Nếu file lỗi hoặc không bắt đầu phát trong ~1,5 giây thì tự chuyển sang giọng trình duyệt.
  const speak = (text) => {
    const seq = ++speakSeq.current;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    if (voiceMode !== "human") return speakBrowser(text);
    const key = text.toLowerCase().trim();
    const current = () => seq === speakSeq.current;
    const play = (a) => {
      let started = false;
      const timer = setTimeout(() => {
        if (started || !current()) return;
        a.pause();
        speakBrowser(text);
      }, 1500);
      const giveUp = () => {
        clearTimeout(timer);
        if (!started && current()) speakBrowser(text);
      };
      a.playbackRate = rate;
      a.onplaying = () => {
        started = true;
        clearTimeout(timer);
      };
      a.onerror = giveUp;
      audioRef.current = a;
      try {
        a.play().catch(giveUp);
      } catch {
        giveUp();
      }
    };
    const pre = audioEls.get(key);
    audioEls.delete(key); // đã dùng: lần sau (từ lặp lại) sẽ tạo phần tử mới
    if (pre && !pre.error) return play(pre);
    Promise.race([
      getHumanAudio(text),
      new Promise((r) => setTimeout(() => r("__slow__"), 800)),
    ]).then((url) => {
      if (!current()) return;
      if (!url || url === "__slow__") return speakBrowser(text);
      play(new Audio(url));
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
