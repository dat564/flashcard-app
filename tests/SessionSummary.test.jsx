// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import SessionSummary from "../src/components/study/SessionSummary";
import { weekProgress } from "../src/lib/reminder";

const NOW = new Date(2026, 10, 19, 15, 0).getTime();
const mid = (n) => new Date(2026, 10, 19 + n, 0, 0).getTime();
const WORDS = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, word: `word${i + 1}`, meaning: `nghĩa ${i + 1}` }));

const base = {
  mode: "due",
  practice: false,
  early: false,
  total: 4,
  good: 3,
  again: 1,
  rate: 0.75,
  newCount: 2,
  newGood: 1,
  reviewCount: 2,
  reviewGood: 2,
  reviewRate: 1,
  relearnTotal: 1,
  relearnGood: 1,
  forgot: [1],
  seconds: 125,
};

function setup(over = {}, props = {}) {
  const onDone = vi.fn();
  const onMore = vi.fn();
  const speak = vi.fn();
  const data = {
    cards: { a: { dueAt: mid(-1) }, b: { dueAt: mid(1) }, c: { dueAt: mid(1) } },
    wordById: new Map(WORDS.map((w) => [w.id, w])),
    newWords: [WORDS[5]],
  };
  render(
    <SessionSummary
      summary={{ ...base, ...over }}
      data={data}
      speech={{ speak }}
      streak={{ cur: 3 }}
      week={weekProgress({ "2026-11-19": { reviewed: 4 } }, "2026-11-19", 5)}
      onDone={onDone}
      onMore={onMore}
      {...props}
    />
  );
  return { onDone, onMore, speak };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SessionSummary", () => {
  it("tiêu đề theo loại phiên", () => {
    setup();
    expect(screen.getByRole("heading", { name: /Hoàn thành phiên học/ })).toBeTruthy();
    cleanup();
    setup({ early: true });
    expect(screen.getByRole("heading", { name: "Phiên kết thúc sớm" })).toBeTruthy();
    cleanup();
    setup({ practice: true });
    expect(screen.getByRole("heading", { name: "Hoàn thành luyện tập" })).toBeTruthy();
    expect(screen.getByText(/không đổi lịch ôn/)).toBeTruthy();
  });

  it("số liệu chính: phần trăm, nhớ x/y, nhớ lại thẻ ôn", () => {
    setup();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText("Nhớ 3/4 thẻ")).toBeTruthy();
    expect(screen.getByText(/Nhớ lại thẻ đã học: 2\/2 \(100%\)/)).toBeTruthy();
  });

  it("không có thẻ ôn lại thì không hiện dòng 'nhớ lại thẻ đã học'", () => {
    setup({ reviewCount: 0, reviewGood: 0, reviewRate: null });
    expect(screen.queryByText(/Nhớ lại thẻ đã học/)).toBeNull();
  });

  it("các ô số liệu: từ mới, thẻ ôn, thời gian học thực", () => {
    setup();
    expect(screen.getByText("2 phút 5 giây")).toBeTruthy();
    expect(screen.getByText(/Từ mới học \(nhớ ngay 1\)/)).toBeTruthy();
    expect(screen.getByText("Thẻ ôn lại")).toBeTruthy();
  });

  it("danh sách từ cần chú ý: có nghĩa, bấm vào để nghe, kèm kết quả hỏi lại", () => {
    const { speak } = setup();
    expect(screen.getByText(/Từ cần chú ý \(sẽ ôn lại ngày mai\)/)).toBeTruthy();
    expect(screen.getByText("nghĩa 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "word1" }));
    expect(speak).toHaveBeenCalledWith("word1");
    expect(screen.getByText(/nhớ được 1\/1 từ/)).toBeTruthy();
  });

  it("chỉ liệt kê 8 từ, phần còn lại ghi 'và N từ khác'", () => {
    setup({ forgot: WORDS.map((w) => w.id) });
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByText("và 4 từ khác")).toBeTruthy();
  });

  it("không quên từ nào: không có danh sách", () => {
    setup({ forgot: [], again: 0, good: 4, rate: 1 });
    expect(screen.queryByText(/Từ cần chú ý/)).toBeNull();
  });

  it("luyện tập: tiêu đề danh sách khác, không có nút học thêm", () => {
    setup({ practice: true });
    expect(screen.getByText("Từ bạn chưa nhớ")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Học thêm từ mới/ })).toBeNull();
  });

  it("triển vọng: còn thẻ đến hạn hôm nay và ngày mai", () => {
    setup();
    expect(screen.getByText("Còn 1 thẻ đến hạn hôm nay.")).toBeTruthy();
    expect(screen.getByText("Ngày mai có thêm 2 thẻ đến hạn.")).toBeTruthy();
  });

  it("hết thẻ: báo ngày mai chưa có thẻ nào", () => {
    setup({}, { data: { cards: {}, wordById: new Map(WORDS.map((w) => [w.id, w])), newWords: [] } });
    expect(screen.queryByText(/Còn \d+ thẻ đến hạn hôm nay/)).toBeNull();
    expect(screen.getByText("Ngày mai chưa có thẻ nào đến hạn.")).toBeTruthy();
  });

  it("chuỗi ngày và dải tuần", () => {
    setup();
    expect(screen.getByText(/Chuỗi 3 ngày liên tiếp/)).toBeTruthy();
    expect(screen.getByRole("group", { name: /Tiến độ học tuần này/ })).toBeTruthy();
    cleanup();
    setup({}, { streak: { cur: 0 } });
    expect(screen.queryByText(/Chuỗi/)).toBeNull();
  });

  it("nút Xong và Học thêm từ mới", () => {
    const { onDone, onMore } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Xong" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Học thêm từ mới/ }));
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it("hết từ mới thì ẩn nút Học thêm", () => {
    setup({}, { data: { cards: {}, wordById: new Map(WORDS.map((w) => [w.id, w])), newWords: [] } });
    expect(screen.queryByRole("button", { name: /Học thêm từ mới/ })).toBeNull();
  });
});
