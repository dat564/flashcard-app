# TOEIC Recall — React Flashcards

Ứng dụng flashcard TOEIC dùng React + Vite, áp dụng lặp lại ngắt quãng (SRS) và active recall.

## Chạy ứng dụng
Yêu cầu Node.js 18+.

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

## Tính năng
- Bộ flashcard lấy từ `src/data/words.json`.
- Ôn từ đến hạn và giới hạn từ mới mỗi ngày.
- Đánh giá Quên / Khó / Tốt / Dễ để lên lịch ôn tiếp.
- Lịch ôn tăng dần, có điều chỉnh ease factor theo kiểu SM-2 đơn giản.
- Lật thẻ bằng Space; phím 1–4 để đánh giá.
- Phát âm bằng SpeechSynthesis của trình duyệt.
- Kho từ vựng có tìm kiếm, lọc trạng thái.
- Thống kê ngày học; nhập/xuất tiến độ JSON; lưu localStorage.
- Responsive cho desktop và mobile.

## Lưu ý về dữ liệu đầu vào
File nguồn có 3.600 bản ghi nhưng chỉ có 79 từ khác nhau sau khi bỏ hậu tố `(level N)` và loại trùng theo từ. Ứng dụng dùng danh sách 79 từ duy nhất để tránh một từ xuất hiện lặp lại hàng trăm lần trong phiên học. Bản JSON gốc được giữ ở `public_words_original.json`; dữ liệu đã chuẩn hóa dùng trong app ở `src/data/words.json`.

## Thuật toán SRS trong bản mẫu
- Quên: quay lại sau 1 phút, reset số lần nhớ liên tiếp.
- Khó: lần đầu 1 giờ; các lần sau tăng khoảng 1.2 lần interval.
- Tốt: lần đầu 1 ngày, lần tiếp theo 3 ngày, sau đó nhân với ease factor.
- Dễ: lần đầu 4 ngày, sau đó interval × ease × 1.3.
- Ease factor khởi tạo 2.5; giảm khi đánh giá Khó/Quên, tăng nhẹ khi Dễ.

Đây là lịch SRS mẫu có thể tinh chỉnh theo dữ liệu học thực tế; không phải triển khai nguyên bản đầy đủ của thuật toán SM-2.
