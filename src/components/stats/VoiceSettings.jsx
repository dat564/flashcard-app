import { pickVoice } from "../../lib/audio";

export default function VoiceSettings({ speech }) {
  const {
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
  } = speech;

  return (
    <div className="panel">
      <h3>Giọng đọc</h3>
      <label className="switch-row">
        <input
          type="checkbox"
          checked={autoSpeak}
          onChange={(e) => setAutoSpeak(e.target.checked)}
        />
        <span>Tự đọc từ khi hiện thẻ</span>
      </label>
      <p className="muted">
        Một số trình duyệt (nhất là trên iPhone) chỉ cho tự phát âm sau khi bạn
        đã chạm vào trang.
      </p>
      <label className="field">
        Nguồn phát âm
        <select value={voiceMode} onChange={(e) => setVoiceMode(e.target.value)}>
          <option value="human">
            Giọng người thật (giống nhau trên Edge và Chrome)
          </option>
          <option value="browser">Giọng của trình duyệt</option>
        </select>
      </label>
      <label className="field">
        Giọng trình duyệt (dùng cho cụm từ và khi thiếu âm thanh)
        <select
          value={voiceURI}
          onChange={(e) => setVoiceURI(e.target.value)}
          disabled={!voices.length}
        >
          <option value="">
            Tự động ({pickVoice(voices, "")?.name || "mặc định"})
          </option>
          {voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      </label>
      <div className="goal">
        <span>Tốc độ đọc</span>
        <b>{rate.toFixed(2)}x</b>
      </div>
      <input
        className="range"
        type="range"
        min="0.6"
        max="1.2"
        step="0.05"
        value={rate}
        onChange={(e) => setRate(+e.target.value)}
      />
      <div
        className="data-actions"
        style={{ flexDirection: "row", flexWrap: "wrap" }}
      >
        <button className="solid" onClick={() => speak("agenda")}>
          Nghe thử từ “agenda”
        </button>
        <button
          className="secondary"
          onClick={() =>
            speakBrowser("Please review the agenda before the meeting.")
          }
        >
          Nghe thử giọng trình duyệt
        </button>
      </div>
      <p className="muted">
        Edge có giọng “Online (Natural)” tự nhiên nhất; Chrome thường dùng
        “Google US English”. Hai trình duyệt có bộ giọng khác nhau nên chế độ
        “người thật” là cách để nghe giống nhau ở cả hai.
      </p>
    </div>
  );
}
