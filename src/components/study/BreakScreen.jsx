import { Coffee } from "lucide-react";

// Màn hình nghỉ giữa phiên: hiện sau mỗi CHUNK_SIZE thẻ khi phiên còn dài
export default function BreakScreen({ pause, onContinue, onStop }) {
  return (
    <div className="start">
      <div className="hero">
        <div className="start-icon">
          <Coffee size={30} />
        </div>
        <h2>Xong {pause.done} thẻ rồi!</h2>
        <p>Còn {pause.left} thẻ nữa. Nghỉ một chút hoặc học tiếp đều được.</p>
        <div className="hero-nums">
          <div>
            <strong>{pause.good}</strong>
            <span>đã nhớ</span>
          </div>
          <div>
            <strong>{pause.again}</strong>
            <span>chưa nhớ</span>
          </div>
        </div>
        <div className="break-actions">
          <button className="primary" onClick={onContinue}>
            Học tiếp
          </button>
          <button className="link-btn" onClick={onStop}>
            Nghỉ ở đây (xem tổng kết, thẻ còn lại giữ cho lần sau)
          </button>
        </div>
      </div>
    </div>
  );
}
