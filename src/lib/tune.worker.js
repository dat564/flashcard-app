// Chạy tối ưu tham số FSRS ngoài luồng chính để giao diện không bị đơ.
import { tune } from "./fsrsTune";

self.onmessage = (e) => {
  try {
    const res = tune(e.data.log, {
      steps: e.data.steps,
      onProgress: (f) => self.postMessage({ type: "progress", f }),
    });
    self.postMessage({ type: "done", res });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err?.message || err) });
  }
};
