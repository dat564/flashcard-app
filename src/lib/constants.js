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

// Lịch ôn — thuật toán FSRS (thư viện ts-fsrs)
export const FSRS_RETENTION = 0.9; // xác suất nhớ mục tiêu lúc đến hạn ôn
export const RETENTION_MIN = 0.8;
export const RETENTION_MAX = 0.97;
export const MAX_DAYS = 365; // khoảng ôn tối đa
export const RELEARN_GAP = 3; // thẻ "Chưa nhớ" được hỏi lại 1 lần sau chừng này thẻ trong cùng phiên
// "Từ khó"
export const HARD_LAPSES = 3;
export const HARD_REPS = 3;

export const RATINGS = [
  { key: "again", label: "Chưa nhớ" },
  { key: "good", label: "Đã nhớ" },
];
