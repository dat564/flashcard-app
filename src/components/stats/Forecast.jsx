export default function Forecast({ forecast }) {
  const max = Math.max(1, ...forecast.map((f) => f.n));
  return (
    <>
      <h3>Dự báo 7 ngày tới</h3>
      <div className="forecast">
        {forecast.map((f) => (
          <div className="fc" key={f.i}>
            <span className="fc-n">{f.n}</span>
            <div className="fc-bar">
              <i style={{ height: `${Math.max(4, (f.n / max) * 100)}%` }} />
            </div>
            <small>
              {f.i === 0
                ? "Hôm nay"
                : f.i === 1
                ? "Mai"
                : new Date(f.t).toLocaleDateString("vi-VN", {
                    weekday: "short",
                  })}
            </small>
          </div>
        ))}
      </div>
      <p className="muted">
        Hôm nay gồm cả thẻ đã quá hạn. Tính trên toàn bộ kho chung và các danh
        sách riêng.
      </p>
    </>
  );
}
