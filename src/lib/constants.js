export const STORE = "toeic-recall-v1";
export const VOICE_KEY = "toeic-recall-voice";
export const RATE_KEY = "toeic-recall-rate";
export const MODE_KEY = "toeic-recall-voice-mode";
export const AUTO_KEY = "toeic-recall-auto-speak-v2"; // v2: mặc định BẬT
export const THEME_KEY = "toeic-recall-theme";
export const AUDIO_STORE = "toeic-recall-audio-v1";

export const QUIZ_LEN = 10; // số câu mỗi lượt "điền từ"
export const DAY = 86400000;
export const PRACTICE_MAX = 50; // mỗi lượt "ôn ngẫu nhiên" tối đa bấy nhiêu thẻ
export const SWIPE_AT = 110; // kéo quá ngưỡng này (px) thì tính là đã chọn
export const EASE_BACK = "transform .32s cubic-bezier(.2,.9,.3,1.15)";
export const EASE_OUT = "transform .24s cubic-bezier(.3,.7,.4,1)";

// Lịch ôn
export const AGAIN_DAYS = 1;
export const MAX_DAYS = 180;
// "Từ khó"
export const HARD_LAPSES = 3;
export const HARD_REPS = 3;

export const RATINGS = [
  { key: "again", label: "Chưa nhớ" },
  { key: "good", label: "Đã nhớ" },
];
