import { Download, Monitor, Moon, Sun } from "lucide-react";

const OPTIONS = [
  ["auto", "Tự động", Monitor],
  ["light", "Sáng", Sun],
  ["dark", "Tối", Moon],
];

export default function ThemePanel({ theme, setTheme, pwa }) {
  const { installed, installEvt, isIOS, installApp } = pwa;
  return (
    <div className="panel wide">
      <h3>Giao diện</h3>
      <div className="seg">
        {OPTIONS.map(([k, label, Icon]) => (
          <button
            key={k}
            className={theme === k ? "on" : ""}
            onClick={() => setTheme(k)}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      <p className="muted">“Tự động” theo cài đặt sáng/tối của thiết bị.</p>
      <h3>Cài thành ứng dụng</h3>
      {installed ? (
        <p className="muted">
          Bạn đang dùng bản đã cài. Dữ liệu học vẫn nằm trên máy này nên mở được
          cả khi mất mạng.
        </p>
      ) : installEvt ? (
        <button className="solid" onClick={installApp}>
          <Download size={15} /> Cài ứng dụng
        </button>
      ) : isIOS ? (
        <p className="muted">
          Trên iPhone/iPad: mở bằng Safari, bấm nút Chia sẻ (ô vuông có mũi tên)
          rồi chọn “Thêm vào Màn hình chính”. Mở từ biểu tượng đó, app chạy toàn
          màn hình, không còn thanh Safari và không bị vuốt-quay-lại.
        </p>
      ) : (
        <p className="muted">
          Trên Chrome/Edge: bấm biểu tượng cài đặt ở cuối thanh địa chỉ, hoặc
          menu ⋮ → “Cài đặt ứng dụng”. (Nút cài chỉ hiện trên bản đã deploy,
          không hiện khi chạy dev.)
        </p>
      )}
    </div>
  );
}
