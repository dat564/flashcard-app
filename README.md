# TOEIC Recall — React Flashcards

Ứng dụng flashcard từ vựng TOEIC bằng React + Vite, dùng lặp lại ngắt quãng bằng thuật toán **FSRS** và active recall. Chạy được offline như một PWA.

## Chạy ứng dụng
Yêu cầu Node.js 20+.

```bash
npm install
npm run dev
```
Mở URL Vite in ra (thường là http://localhost:5173).

Build production:
```bash
npm run build
npm run preview
```

## Triển khai (GitHub Pages hoặc hosting tĩnh)
`vite.config.js` đặt `base: "./"` nên bản build chạy được ở mọi đường dẫn
(`user.github.io/ten-repo/`, thư mục con, tên miền riêng) mà không cần sửa cấu hình.

```bash
npm run deploy   # kiểm tra dữ liệu → chạy test → build → đẩy dist/ lên nhánh gh-pages
```

> Service worker chỉ hoạt động trên HTTPS (hoặc localhost) và chỉ đăng ký ở bản build.
> Khi sửa code mà muốn người dùng nhận bản mới ngay, đổi `VERSION` trong `public/sw.js`.

## Tính năng
- Bộ flashcard ~3.500 từ lấy từ `src/data/words/*.json` (có thể thêm nhiều file).
- Học từ đến hạn + giới hạn từ mới mỗi ngày; chế độ luyện tập không đổi lịch ôn.
- Hai mức đánh giá: **Chưa nhớ / Đã nhớ** (vuốt trái/phải, phím ←/→ hoặc 1/2).
- Lịch ôn bằng **FSRS** (thư viện `ts-fsrs`, tham số mặc định): mỗi thẻ có độ bền (stability) và độ khó (difficulty); khoảng ôn tính theo ngày, tối đa 365 ngày.
  Chỉnh được **mức nhớ mục tiêu** 80–97% (mặc định 90%) ở Thống kê.
- **Chưa nhớ** → thẻ luôn quay lại vào ngày mai, và được **hỏi lại đúng 1 lần** sau 3 thẻ trong cùng phiên. Lượt hỏi lại không đổi lịch và không tính thêm vào thống kê.
- Thẻ đến hạn xếp theo xác suất nhớ thấp nhất trước. Thẻ cũ (lịch SM-2 của bản trước) tự chuyển sang FSRS khi ôn, không mất tiến độ.
- Thống kê có "độ nhớ ước tính" (trung bình xác suất nhớ của các từ đã học).
- Từ mới của kho chung được trộn theo thứ tự ổn định (không học liền `abandon`/`abandoned`/`ability`...); danh sách riêng giữ thứ tự bạn nhập.
- Phím tắt: Space lật thẻ, P phát âm, Z hoàn tác.
- Quiz điền từ vào câu (kiểu TOEIC Part 5).
- Âm thanh: file mp3 giọng người dựng sẵn (`public/audio`), dự phòng từ điển online rồi giọng trình duyệt.
- Danh sách từ riêng: nhập từ file `.docx`, `.csv`, `.tsv`, `.txt`.
- Thống kê, chuỗi ngày, heatmap, dự báo ôn tập; xuất/nhập tiến độ JSON; lưu `localStorage`.
- PWA: cài lên màn hình chính, học offline (audio được lưu dần khi nghe).
- Giao diện sáng/tối, responsive desktop và mobile.

## Dữ liệu và âm thanh
Mỗi từ có dạng:
```json
{ "id": 1, "word": "abandon", "pos": "v.", "ipa": "/ə'bændən/",
  "example": "The company abandoned its plan.", "meaning": "bỏ, từ bỏ" }
```

| Lệnh | Tác dụng |
| --- | --- |
| `npm test` | Chạy bộ test (vitest): SRS, quiz, trộn tiến độ, thống kê, nhập file, phiên học |
| `npm run check` | Kiểm tra dữ liệu: thiếu từ/nghĩa/ví dụ, trùng id (lỗi làm `deploy` dừng); thiếu phiên âm/từ loại (cảnh báo) |
| `npm run check-audio` | Liệt kê từ chưa có file mp3 |
| `python gen_audio.py` | Tạo mp3 còn thiếu bằng `edge-tts` (`pip install edge-tts`) |
| `npm run prune-audio` | Xóa mp3 không còn từ nào dùng (thêm `-- --dry` để chỉ xem) |

`public_words_original.json` là bản dữ liệu gốc ban đầu, không được app sử dụng.

## Lưu ý về tiến độ học
Tiến độ lưu trong `localStorage` của trình duyệt. Xóa dữ liệu trang hoặc đổi máy sẽ mất,
nên hãy dùng **Thống kê → Sao lưu** để xuất file JSON định kỳ.

## Hiệu năng
- Dữ liệu từ vựng được nạp lazy thành chunk riêng (`assets/words-*.js`), tách khỏi mã giao diện nên mỗi lần cập nhật code không bắt tải lại cả kho từ.
- Âm thanh chỉ tải khi nghe và được service worker lưu dần.

## Tài liệu
`PHUONG-PHAP-HOC.txt`: giải thích phương pháp học, thuật toán FSRS và cách dùng ứng dụng mỗi ngày.

## Việc có thể làm tiếp
- Chuyển lưu trữ sang IndexedDB và nhắc sao lưu khi quá 7 ngày chưa xuất file.
- Thêm nút đánh giá "Khó" / "Dễ" (FSRS thiết kế cho 4 mức), hoặc tối ưu tham số FSRS theo lịch sử học của từng người.
- Tạo audio còn thiếu: `npm run check-audio` rồi `python gen_audio.py`.
