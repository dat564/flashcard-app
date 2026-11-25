import { CHUNK_SIZE, CHUNK_MIN_LEFT } from "./constants";

// Có nên hỏi "nghỉ hay học tiếp" sau thẻ vừa chấm không?
//   done = số thẻ đã chấm trong phiên (không tính lượt hỏi lại), gồm cả thẻ vừa chấm
//   left = số thẻ còn lại trong phiên
export const shouldBreak = (done, left) =>
  done > 0 && done % CHUNK_SIZE === 0 && left > CHUNK_MIN_LEFT;
