// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import ExamTab from "../src/components/exam/ExamTab";
import { loadWords } from "../src/lib/words";

beforeAll(async () => {
  await loadWords();
  window.scrollTo = () => {};
  vi.stubGlobal("confirm", () => true);
});

afterEach(cleanup);

const speech = { voices: [], voiceURI: "", rate: 1, speak: () => {} };
const setup = () => {
  const setProgress = vi.fn();
  const setToast = vi.fn();
  render(<ExamTab active progress={{ lists: [], stats: {} }} setProgress={setProgress} speech={speech} setToast={setToast} />);
  return { setProgress, setToast };
};

describe("Tab Luyện thi", () => {
  it("hiện các Part và số câu của bộ đề có sẵn", async () => {
    setup();
    await waitFor(() => expect(screen.getByText(/^6 câu/)).toBeTruthy()); // Part 5
    expect(screen.getByText("Nghe (Listening)")).toBeTruthy();
    expect(screen.getByText("Đọc (Reading)")).toBeTruthy();
  });

  it("làm Part 5: chọn đáp án → thấy giải thích → xem kết quả → ghi hoạt động", async () => {
    const { setProgress } = setup();
    await waitFor(() => expect(screen.getByText(/^6 câu/)).toBeTruthy());
    fireEvent.click(screen.getByText("Part 5").closest("button"));
    await waitFor(() => expect(document.querySelector(".ex-opt")).toBeTruthy());
    fireEvent.click(document.querySelectorAll(".ex-opt")[0]);
    expect(document.querySelector(".ex-exp")).toBeTruthy(); // luyện tập: có giải thích ngay
    fireEvent.click(screen.getByText("Kết thúc"));
    await waitFor(() => expect(screen.getByText(/Kết quả/)).toBeTruthy());
    expect(setProgress).toHaveBeenCalled(); // ghi nhận hoạt động trong ngày
  });

  it("chế độ Thi thử: không hiện đáp án giữa chừng", async () => {
    setup();
    await waitFor(() => expect(screen.getByText(/^6 câu/)).toBeTruthy());
    fireEvent.click(screen.getByText("Thi thử", { selector: "button" }));
    fireEvent.click(screen.getByText("Part 5").closest("button"));
    await waitFor(() => expect(document.querySelector(".ex-opt")).toBeTruthy());
    fireEvent.click(document.querySelectorAll(".ex-opt")[1]);
    expect(document.querySelector(".ex-exp")).toBeNull();
    expect(document.querySelector(".ex-opt.sel")).toBeTruthy();
  });

  it("bấm vào từ trong đề mở khung tra từ và lưu được vào Từ của tôi", async () => {
    const { setProgress } = setup();
    await waitFor(() => expect(screen.getByText(/^6 câu/)).toBeTruthy());
    fireEvent.click(screen.getByText("Part 7").closest("button"));
    await waitFor(() => expect(document.querySelector(".ex-passage .tw")).toBeTruthy());
    const w = [...document.querySelectorAll(".ex-passage .tw")].find((n) => n.textContent === "employees");
    fireEvent.click(w);
    expect(document.querySelector(".ex-sheet")).toBeTruthy();
    fireEvent.click(screen.getByText(/Lưu vào/));
    const updater = setProgress.mock.calls.at(-1)[0];
    const next = updater({ lists: [] });
    expect(next.lists[0].id).toBe("LEXAM");
    expect(next.lists[0].words[0].word).toBe("employee");
    expect(next.lists[0].words[0].example).toMatch(/employees/);
  });
});
