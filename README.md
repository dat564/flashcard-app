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
- **Tối ưu tham số FSRS theo từng người** (Thống kê → "Tối ưu FSRS theo bạn"): app ghi nhật ký từng lượt ôn thật, khi đủ dữ liệu (≥ 1000 lượt và ≥ 30 lần "Chưa nhớ" ở lượt ôn lại) có thể tinh chỉnh 21 tham số FSRS cho sát trí nhớ của bạn. Chạy trong Web Worker, có kiểm tra trên 20% thẻ chưa dùng để huấn luyện: chỉ đề nghị áp dụng khi dự đoán tốt hơn rõ rệt, và luôn quay về được tham số mặc định.
- **Chưa nhớ** → thẻ luôn quay lại vào ngày mai, và được **hỏi lại đúng 1 lần** sau 3 thẻ trong cùng phiên. Lượt hỏi lại không đổi lịch và không tính thêm vào thống kê.
- Thẻ đến hạn xếp theo xác suất nhớ thấp nhất trước. Thẻ cũ (lịch SM-2 của bản trước) tự chuyển sang FSRS khi ôn, không mất tiến độ.
- Thống kê có "độ nhớ ước tính" (trung bình xác suất nhớ của các từ đã học).
- Từ mới của kho chung học theo **mức độ phổ biến**: mặc định "Phổ biến trước" (Cơ bản → Trung cấp → Nâng cao, chia nhóm 0,5 Zipf; trong mỗi nhóm trộn ổn định để `abandon`/`abandoned` không đứng liền nhau). Đổi sang "Ngẫu nhiên" ở Thống kê. Danh sách riêng giữ thứ tự người dùng nhập.
- Mỗi từ có độ phổ biến `z` (Zipf, từ `wordfreq`, tiếng Anh nói chung, không riêng TOEIC) và mức Cơ bản (z ≥ 5,0), Trung cấp (4,4–5,0), Nâng cao (< 4,4). Hiện nhãn mức trong Kho từ (có bộ lọc), tiến độ theo mức trong Thống kê và số từ mới theo mức trên màn hình bắt đầu. Phổ biến không có nghĩa là dễ (ví dụ `piano`, `spider` ít gặp nhưng dễ hiểu).
- Phím tắt: Space lật thẻ, P phát âm, Z hoàn tác.
- Quiz điền từ vào câu (kiểu TOEIC Part 5).
- Âm thanh: file mp3 giọng người dựng sẵn (`public/audio`), dự phòng từ điển online rồi giọng trình duyệt. Mỗi lần đọc dùng phần tử `Audio` mới; file lỗi hoặc không phát được trong ~1,5 giây thì tự chuyển sang giọng trình duyệt. Mỗi lần bấm chỉ nghe **một** nguồn (mp3 hoặc giọng trình duyệt, không bao giờ cả hai); mp3 đến muộn sau khi đã chuyển giọng sẽ bị dừng.
- Danh sách từ riêng: nhập từ file `.docx`, `.csv`, `.tsv`, `.txt`.
- Thống kê, chuỗi ngày, heatmap, dự báo ôn tập; xuất/nhập tiến độ JSON (kèm nhật ký ôn) và nhắc sao lưu khi quá 7 ngày.
- Lưu trữ bằng **IndexedDB** (mỗi lần chấm chỉ ghi thẻ thay đổi); dữ liệu `localStorage` của bản cũ tự chuyển sang, và tự dùng lại `localStorage` nếu IndexedDB không dùng được.
- PWA: cài lên màn hình chính, học offline (audio được lưu dần khi nghe).
- **Nhắc học & mục tiêu tuần** (Thống kê → "Nhắc học & mục tiêu tuần"):
  - Thông báo nhắc mỗi ngày vào giờ bạn chọn, chỉ khi hôm nay **chưa học**; mỗi ngày nhắc tối đa một lần và chỉ trong 4 giờ sau giờ đã chọn (không qua nửa đêm).
  - Hoạt động khi app đang mở hoặc ở nền; ở trình duyệt có Periodic Background Sync (Chrome/Edge, app đã cài) service worker còn nhắc được cả khi đóng app (giờ do trình duyệt quyết định nên có thể lệch). Không có máy chủ đẩy tin nên **không thể bảo đảm nhắc đúng giờ tuyệt đối khi app đã đóng**; iPhone/Safari không hỗ trợ cơ chế này.
  - **Lời nhắc qua lịch (.ics)**: sự kiện lặp mỗi ngày có chuông, chạy đúng giờ trên mọi thiết bị (kể cả iPhone). Đây là cách chắc nhất để nhắc khi đóng app.
  - Huy hiệu số thẻ đến hạn trên biểu tượng app (Badging API, nơi trình duyệt hỗ trợ).
  - **Mục tiêu tuần**: chọn học bao nhiêu ngày/tuần (1–7, mặc định 5; tuần tính từ thứ Hai). Dải 7 ngày hiện ở màn hình học và ở Thống kê, có chúc mừng khi đạt.
  - iPhone chỉ cho thông báo khi app đã thêm vào Màn hình chính.
- Giao diện sáng/tối, responsive desktop và mobile.

## Dữ liệu và âm thanh
Mỗi từ có dạng:
```json
{ "id": 1, "word": "abandon", "pos": "v.", "ipa": "/ə'bændən/",
  "example": "The company abandoned its plan.", "meaning": "bỏ, từ bỏ", "z": 4.02 }
```

| Lệnh | Tác dụng |
| --- | --- |
| `npm test` | Chạy bộ test (vitest): SRS, tối ưu FSRS (đối chiếu từng bước với ts-fsrs), IndexedDB, service worker (cache âm thanh, nhắc học), phát âm, nhắc học và mục tiêu tuần, quiz, thống kê, nhập file, phiên học |
| `python scripts/add_frequency.py` | Gắn/cập nhật độ phổ biến `z` cho từng từ (cần `pip install wordfreq`) |
| `npm run check` | Kiểm tra dữ liệu: thiếu từ/nghĩa/ví dụ, trùng id (lỗi làm `deploy` dừng); thiếu phiên âm/từ loại (cảnh báo) |
| `npm run check-audio` | Liệt kê từ chưa có file mp3 |
| `python gen_audio.py` | Tạo mp3 còn thiếu bằng `edge-tts` (`pip install edge-tts`) |
| `npm run prune-audio` | Xóa mp3 không còn từ nào dùng (thêm `-- --dry` để chỉ xem) |

`public_words_original.json` là bản dữ liệu gốc ban đầu, không được app sử dụng.

## Lưu ý về tiến độ học
Tiến độ lưu trong **IndexedDB** của trình duyệt (cơ sở dữ liệu `toeic-recall-db`: kho `cards`, `meta`, `reviews`).
Xóa dữ liệu trang hoặc đổi máy sẽ mất, nên hãy dùng **Thống kê → Sao lưu** để xuất file JSON định kỳ
(file sao lưu chứa cả nhật ký ôn và tham số FSRS cá nhân). App nhắc khi quá 7 ngày chưa sao lưu.
Nhật ký ôn chỉ bắt đầu ghi từ phiên bản này nên tối ưu tham số cần học thêm một thời gian.

## Hiệu năng
- Dữ liệu từ vựng được nạp lazy thành chunk riêng (`assets/words-*.js`), tách khỏi mã giao diện nên mỗi lần cập nhật code không bắt tải lại cả kho từ.
- Âm thanh chỉ tải khi nghe và được service worker lưu dần.

## Tài liệu
`PHUONG-PHAP-HOC.txt`: giải thích phương pháp học, thuật toán FSRS và cách dùng ứng dụng mỗi ngày.

## Việc có thể làm tiếp
- Thêm nút đánh giá "Khó" / "Dễ" (FSRS thiết kế cho 4 mức; nhật ký ôn và bộ tối ưu đã hỗ trợ sẵn các mức này).
- Đồng bộ tiến độ giữa các thiết bị (hiện chỉ có sao lưu/nhập tay).
- Tạo audio còn thiếu: `npm run check-audio` rồi `python gen_audio.py`.
