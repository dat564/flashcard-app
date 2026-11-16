import { RotateCcw } from "lucide-react";
import {
  clearReviews,
  downloadBackup,
  freshProgress,
  getReviews,
  importReviews,
  mergeProgress,
  storageInfo,
} from "../../lib/storage";

const WEEK = 7 * 24 * 3600 * 1000;

export default function DataBackup({
  progress,
  setProgress,
  today,
  setToast,
  endSession,
}) {
  const { backend } = storageInfo();
  const learned = Object.keys(progress.cards || {}).length;
  const stale =
    learned >= 30 &&
    (!progress.lastExportAt || Date.now() - progress.lastExportAt > WEEK);

  const exportProgress = async () => {
    const reviews = await getReviews(); // nhật ký ôn đi cùng file sao lưu
    const lastExportAt = downloadBackup(progress, today, reviews);
    setProgress((p) => ({ ...p, lastExportAt }));
    setToast("Đã tải file sao lưu.");
  };

  const importProgress = (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const v = JSON.parse(reader.result);
        if (!v || typeof v.cards !== "object") throw Error();
        setProgress((p) => mergeProgress(p, v)); // luôn gộp: giữ bản ôn gần nhất của từng từ
        const n = await importReviews(v.reviews); // nhật ký ôn: bỏ dòng trùng
        endSession();
        setToast(
          n
            ? `Đã nhập và gộp dữ liệu học (+${n} lượt ôn).`
            : "Đã nhập và gộp dữ liệu học."
        );
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
      clearReviews();
      endSession();
    }
  };

  return (
    <div className="panel wide">
      <h3>Dữ liệu & sao lưu</h3>
      <p className="muted">
        Tiến độ, nhật ký ôn và các danh sách từ riêng được lưu ngay trong trình
        duyệt của bạn ({backend === "idb" ? "IndexedDB" : "localStorage, vì IndexedDB không dùng được"}),
        chỉ trên máy và trình duyệt này, không gửi lên máy chủ nào. Xóa dữ liệu
        duyệt web, dùng chế độ ẩn danh hoặc đổi máy sẽ làm mất dữ liệu, nên hãy
        xuất file sao lưu định kỳ. Cài đặt giọng đọc được lưu riêng cho từng
        trình duyệt.
      </p>
      {stale && (
        <p className="warn">
          ⚠ {progress.lastExportAt ? "Đã hơn 7 ngày bạn chưa sao lưu." : "Bạn chưa sao lưu lần nào."}{" "}
          Hãy bấm "Xuất tiến độ" để không mất dữ liệu học.
        </p>
      )}
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
