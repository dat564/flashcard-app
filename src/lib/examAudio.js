// Phát phần nghe: đọc transcript bằng giọng trình duyệt (nhiều giọng cho hội thoại)
// hoặc phát file audio nếu đề có sẵn "audio".
import { LETTERS } from "./examSchema";
import { scoreVoice } from "./audio";

// Script cần đọc của một đơn vị: [{ speaker, text }]
export function buildScript(unit) {
  const opts = unit.questions[0]?.options || [];
  const spoken = (o, i) => ({ speaker: "", text: `${LETTERS[i]}. ${o}` });
  if (unit.part === 1) return opts.map(spoken);
  if (unit.part === 2) return [...unit.transcript, ...opts.map(spoken)];
  return unit.transcript;
}

const FEMALE = /aria|jenny|ava|emma|michelle|samantha|allison|zira|susan|karen|moira|female|woman/i;
const MALE = /guy|andrew|brian|alex|daniel|david|mark|fred|tom|male|\bman\b/i;

// Chọn 2 giọng khác nhau (ưu tiên khác giới) cho hai người nói
export function pickSpeakerVoices(voices, preferredURI) {
  const en = voices.filter((v) => scoreVoice(v) >= 0).sort((a, b) => scoreVoice(b) - scoreVoice(a));
  if (!en.length) return [null, null];
  const first = en.find((v) => v.voiceURI === preferredURI) || en[0];
  const isF = FEMALE.test(first.name || "");
  const isM = MALE.test(first.name || "");
  const other =
    en.find((v) => v !== first && (isF ? MALE.test(v.name || "") : isM ? FEMALE.test(v.name || "") : false)) ||
    en.find((v) => v !== first) ||
    null;
  return [first, other];
}

// Người nói thứ i dùng giọng chẵn/lẻ; chỉ có một giọng thì đổi cao độ để phân biệt
export function voiceFor(speakerIndex, voices, preferredURI) {
  const [a, b] = pickSpeakerVoices(voices, preferredURI);
  if (speakerIndex % 2 === 0 || !a) return { voice: a, pitch: 1 };
  return b ? { voice: b, pitch: 1 } : { voice: a, pitch: 0.8 };
}

export function createTtsPlayer({ voices = [], voiceURI = "", rate = 1, onState = () => {}, onLine = () => {} }) {
  const sy = typeof window !== "undefined" ? window.speechSynthesis : null;
  let token = 0;
  let keep = []; // giữ tham chiếu để trình duyệt không thu gom trước khi đọc xong
  return {
    kind: "tts",
    play(script) {
      if (!sy || !script.length) return onState("done");
      const my = ++token;
      sy.cancel();
      const order = [];
      keep = script.map((line, i) => {
        const key = line.speaker || "";
        if (!order.includes(key)) order.push(key);
        const u = new SpeechSynthesisUtterance(line.text);
        const { voice, pitch } = voiceFor(order.indexOf(key), voices, voiceURI);
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        } else u.lang = "en-US";
        u.rate = rate;
        u.pitch = pitch;
        u.onstart = () => my === token && onLine(i);
        u.onend = () => {
          if (my === token && i === script.length - 1) onState("done");
        };
        u.onerror = (e) => {
          if (my === token && e.error !== "canceled" && e.error !== "interrupted") onState("done");
        };
        return u;
      });
      onState("playing");
      keep.forEach((u) => sy.speak(u));
    },
    pause() {
      sy?.pause();
      onState("paused");
    },
    resume() {
      sy?.resume();
      onState("playing");
    },
    stop() {
      token++;
      sy?.cancel();
      keep = [];
    },
  };
}

export function createFilePlayer(url, { rate = 1, onState = () => {}, onLine = () => {} } = {}) {
  const a = new Audio(url);
  a.playbackRate = rate;
  a.onended = () => onState("done");
  a.onerror = () => onState("done");
  return {
    kind: "file",
    play() {
      onLine(-1);
      a.currentTime = 0;
      onState("playing");
      a.play().catch(() => onState("done"));
    },
    pause() {
      a.pause();
      onState("paused");
    },
    resume() {
      a.play().catch(() => onState("done"));
      onState("playing");
    },
    stop() {
      a.pause();
      a.removeAttribute("src");
      a.load();
    },
  };
}
