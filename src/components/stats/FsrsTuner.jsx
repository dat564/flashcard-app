import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { getReviews } from "../../lib/storage";
import { dataSummary, tune, MIN_REVIEWS, MIN_FAILS } from "../../lib/fsrsTune";

const fmt = (x) => x.toFixed(4);

// Tối ưu 21 tham số FSRS theo lịch sử ôn của chính người dùng (chạy trong Web Worker)
export default function FsrsTuner({ progress, setProgress, setToast }) {
  const [info, setInfo] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | running | done | error
  const [pct, setPct] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const workerRef = useRef(null);

  const settings = progress.settings || {};
  const personal = Array.isArray(settings.fsrsWeights);

  useEffect(() => {
    let alive = true;
    getReviews().then((log) => alive && setInfo(dataSummary(log)));
    return () => {
      alive = false;
    };
  }, [progress.stats]);
  useEffect(() => () => workerRef.current?.terminate(), []);

  const finish = (res) => {
    setResult(res);
    setPhase("done");
  };
  const fail = (msg) => {
    setError(msg);
    setPhase("error");
  };

  const run = async () => {
    const log = await getReviews();
    setPhase("running");
    setPct(0);
    setResult(null);
    if (typeof Worker === "undefined") {
      // Trình duyệt không có Web Worker: chạy trực tiếp (giao diện có thể khựng vài giây)
      setTimeout(() => {
        try {
          finish(tune(log));
        } catch (e) {
          fail(String(e?.message || e));
        }
      }, 50);
      return;
    }
    try {
      const w = new Worker(new URL("../../lib/tune.worker.js", import.meta.url), {
        type: "module",
      });
      workerRef.current = w;
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === "progress") setPct(m.f);
        else if (m.type === "done") {
          w.terminate();
          finish(m.res);
        } else {
          w.terminate();
          fail(m.message);
        }
      };
      w.onerror = (e) => {
        w.terminate();
        fail(e.message || "Không chạy được tiến trình tối ưu");
      };
      w.postMessage({ log });
    } catch (e) {
      fail(String(e?.message || e));
    }
  };

  const apply = () => {
    setProgress((p) => ({
      ...p,
      settings: {
        ...p.settings,
        fsrsWeights: result.weights,
        fsrsTunedAt: Date.now(),
        fsrsTuneInfo: {
          reviews: result.reviews,
          lossDefault: result.lossDefault,
          lossTuned: result.lossTuned,
        },
      },
    }));
    setResult(null);
    setPhase("idle");
    setToast("Đã áp dụng tham số FSRS riêng của bạn.");
  };

  const reset = () => {
    setProgress((p) => {
      const { fsrsWeights, fsrsTunedAt, fsrsTuneInfo, ...rest } = p.settings || {};
      return { ...p, settings: rest };
    });
    setToast("Đã quay về tham số FSRS mặc định.");
  };

  return (
    <div className="panel wide">
      <h3>
        <Sparkles size={16} /> Tối ưu FSRS theo bạn
      </h3>
      <p className="muted">
        FSRS dùng 21 tham số mặc định chung cho mọi người. Khi đã có đủ lịch sử ôn của bạn, app
        có thể tinh chỉnh các tham số này cho sát trí nhớ thật của bạn (bạn quên nhanh hay chậm
        hơn trung bình), để từ được hẹn ôn đúng lúc hơn. Tính toán chạy ngay trên máy bạn, không
        gửi dữ liệu đi đâu.
      </p>

      {personal && (
        <p className="note">
          ✓ Đang dùng tham số riêng của bạn
          {settings.fsrsTunedAt
            ? ` (tối ưu lúc ${new Date(settings.fsrsTunedAt).toLocaleString("vi-VN")})`
            : ""}
          .
        </p>
      )}

      <p className="muted">
        {info
          ? `Đã ghi ${info.reviews} lượt ôn trên ${info.cards} thẻ, trong đó ${info.fails} lần "Chưa nhớ" ở các lượt ôn lại. `
          : "Đang đọc nhật ký ôn… "}
        Cần ít nhất {MIN_REVIEWS} lượt ôn và {MIN_FAILS} lần "Chưa nhớ" ở lượt ôn lại. Nhật ký chỉ
        ghi các lượt chấm thật (không tính luyện tập và lượt hỏi lại trong phiên).
      </p>

      {phase === "running" && (
        <>
          <div className="track big">
            <i style={{ width: `${Math.round(pct * 100)}%` }} />
          </div>
          <p className="muted">Đang tối ưu… {Math.round(pct * 100)}%</p>
        </>
      )}

      {phase === "error" && <p className="warn">Không tối ưu được: {error}</p>}

      {phase === "done" && result && !result.ok && (
        <p className="note">
          Chưa đủ dữ liệu để tối ưu. Hãy học thêm một thời gian rồi thử lại.
        </p>
      )}
      {phase === "done" && result?.ok && !result.improved && (
        <p className="note">
          Tham số mặc định đã phù hợp với bạn: tham số mới không dự đoán tốt hơn rõ rệt trên{" "}
          {result.testReviews} lượt ôn kiểm tra, nên giữ nguyên.
        </p>
      )}
      {phase === "done" && result?.ok && result.improved && (
        <div className="note">
          Tham số mới dự đoán tốt hơn: sai số (log-loss) trên {result.testReviews} lượt ôn không
          dùng để huấn luyện giảm từ {fmt(result.lossDefault)} xuống {fmt(result.lossTuned)}.
          <div className="data-actions">
            <button className="primary" onClick={apply}>
              Áp dụng tham số mới
            </button>
            <button className="secondary" onClick={() => setPhase("idle")}>
              Bỏ qua
            </button>
          </div>
        </div>
      )}

      <div className="data-actions">
        <button
          className="secondary"
          onClick={run}
          disabled={!info?.enough || phase === "running"}
        >
          {phase === "running" ? "Đang tối ưu…" : "Tối ưu theo lịch sử của tôi"}
        </button>
        {personal && (
          <button className="danger" onClick={reset}>
            Quay về tham số mặc định
          </button>
        )}
      </div>
    </div>
  );
}
