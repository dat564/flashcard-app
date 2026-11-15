import { RotateCcw } from "lucide-react";
import { downloadBackup, freshProgress, mergeProgress } from "../../lib/storage";

export default function DataBackup({
  progress,
  setProgress,
  today,
  setToast,
  endSession,
}) {
  const exportProgress = () => {
    const lastExportAt = downloadBackup(progress, today);
    setProgress((p) => ({ ...p, lastExportAt }));
    setToast("Đã tải file sao lưu.");
  };

  const importProgress = (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const v = JSON.parse(reader.result);
        if (!v || typeof v.cards !== "object") throw Error();
        setProgress((p) => mergeProgress(p, v)); // luôn gộp: giữ bản ôn gần nhất của từng từ
        endSession();
        setToast("Đã nhập và gộp dữ liệu học.");
      } catch {
        alert("File tiến độ không hợp lệ.");
      }
      input.value = "";
    };
    reader.readAsText(file);
  };

  const resetProgress = () => {
    if (
      confirm(
        "Xóa toàn bộ lịch sử học và bắt đầu lại? (Các danh sách từ riêng của bạn vẫn được giữ.)"
      )
    ) {
      setProgress((p) => ({ ...freshProgress(), lists: p.lists || [] }));
      endSession();
    }
  };

  return (
    <div className="panel wide">
      <h3>Dữ liệu & sao lưu</h3>
      <p className="muted">
        Tiến độ và các danh sách từ riêng được lưu ngay trong trình duyệt của
        bạn (localStorage), chỉ trên máy và trình duyệt này, không gửi lên máy
        chủ nào. Xóa dữ liệu duyệt web, dùng chế độ ẩn danh hoặc đổi máy sẽ làm
        mất dữ liệu, nên hãy xuất file sao lưu định kỳ. Cài đặt giọng đọc được
        lưu riêng cho từng trình duyệt.
      </p>
      <p className="muted">
        {progress.lastExportAt
          ? `Sao lưu gần nhất: ${new Date(progress.lastExportAt).toLocaleString(
              "vi-VN"
            )}`
          : "Bạn chưa sao lưu lần nào."}
      </p>
      <div className="data-actions">
        <button className="secondary" onClick={exportProgress}>
          Xuất tiến độ (JSON)
        </button>
        <label className="secondary">
          Nhập tiến độ (JSON)
          <input
            type="file"
            accept="application/json"
            onChange={importProgress}
            hidden
          />
        </label>
        <button className="danger" onClick={resetProgress}>
          <RotateCcw size={15} /> Xóa toàn bộ tiến độ
        </button>
      </div>
    </div>
  );
}
