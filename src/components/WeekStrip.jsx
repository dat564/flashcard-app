const NAMES = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

// Dải 7 ngày của tuần này (thứ Hai → Chủ nhật) và tiến độ so với mục tiêu số ngày học
export default function WeekStrip({ week }) {
  const status = week.reached
    ? "Đạt mục tiêu tuần 🎉"
    : week.canReach
    ? `Còn ${week.remaining} ngày nữa`
    : "Tuần này khó đạt, tuần sau cố lên";
  return (
    <div className="week" role="group" aria-label="Tiến độ học tuần này">
      <div className="week-head">
        <b>
          Tuần này: {week.done}/{week.goal} ngày
        </b>
        <span className="muted">{status}</span>
      </div>
      <div className="week-dots">
        {week.days.map((d, i) => (
          <span
            key={d.key}
            className={`week-dot${d.active ? " on" : ""}${d.today ? " today" : ""}${d.future ? " future" : ""}`}
            title={d.key}
          >
            <i aria-hidden="true">{d.active ? "✓" : ""}</i>
            <small>{NAMES[i]}</small>
            <span className="sr-only">
              {d.active ? "đã học" : d.future ? "chưa tới" : "chưa học"}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
