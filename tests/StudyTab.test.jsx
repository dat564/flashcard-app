// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../src/components/study/StartScreen", () => ({ default: () => <div>MÀN HÌNH BẮT ĐẦU</div> }));
vi.mock("../src/components/study/SessionView", () => ({ default: () => <div>ĐANG HỌC</div> }));
vi.mock("../src/components/study/QuizView", () => ({ default: () => <div>QUIZ</div> }));
vi.mock("../src/components/study/SessionSummary", () => ({
  default: ({ summary, onDone, onMore, streak, week }) => (
    <div>
      TỔNG KẾT {summary.total} / {streak?.cur} / {week?.goal}
      <button onClick={onDone}>done</button>
      <button onClick={onMore}>more</button>
    </div>
  ),
}));

import StudyTab from "../src/components/study/StudyTab";

afterEach(cleanup);

const summary = { total: 3 };
const study = (over = {}) => ({
  session: [],
  current: null,
  summary: null,
  dismissSummary: vi.fn(),
  startStudy: vi.fn(),
  ...over,
});

const mount = (s, quiz = null, extra = {}) =>
  render(<StudyTab study={s} quizApi={{ quiz }} data={{}} speech={{}} streak={{ cur: 4 }} week={{ goal: 5 }} {...extra} />);

describe("StudyTab — màn hình nào hiện khi nào", () => {
  it("không phiên, không tổng kết: màn hình bắt đầu", () => {
    mount(study());
    expect(screen.getByText("MÀN HÌNH BẮT ĐẦU")).toBeTruthy();
  });

  it("có tổng kết và không còn phiên: hiện tổng kết với chuỗi ngày và tuần", () => {
    mount(study({ summary }));
    expect(screen.getByText(/TỔNG KẾT 3 \/ 4 \/ 5/)).toBeTruthy();
    expect(screen.queryByText("MÀN HÌNH BẮT ĐẦU")).toBeNull();
  });

  it("đang học thì ưu tiên màn hình học dù còn tổng kết cũ", () => {
    mount(study({ summary, session: [1, 2], current: { id: 1 } }));
    expect(screen.getByText("ĐANG HỌC")).toBeTruthy();
    expect(screen.queryByText(/TỔNG KẾT/)).toBeNull();
  });

  it("quiz được ưu tiên hơn tất cả", () => {
    mount(study({ summary }), { id: 1 });
    expect(screen.getByText("QUIZ")).toBeTruthy();
  });

  it("nút Xong gọi dismissSummary; nút Học thêm bắt đầu chế độ 'more'", () => {
    const s = study({ summary });
    mount(s);
    fireEvent.click(screen.getByText("done"));
    expect(s.dismissSummary).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("more"));
    expect(s.startStudy).toHaveBeenCalledWith("more");
  });
});
