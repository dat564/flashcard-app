#!/usr/bin/env python3
"""Gắn độ phổ biến (Zipf) vào từng từ trong src/data/words/*.json.

Zipf = log10(số lần xuất hiện / 1 tỷ từ) + 3, lấy từ thư viện `wordfreq` (tiếng Anh nói chung, KHÔNG riêng TOEIC):
  ~7 rất phổ biến (the, of) · ~5 phổ biến (account) · ~4 vừa (abandon) · ≤3 hiếm.
Với cụm từ, độ phổ biến = của từ KHÓ NHẤT (Zipf thấp nhất) trong cụm.

Chạy:  pip install wordfreq  &&  python scripts/add_frequency.py
(Chạy lại được nhiều lần; chỉ ghi đè trường `z`.)
"""
import glob
import json
import re
import sys

from wordfreq import zipf_frequency

SKIP = {"sb", "sth"}                      # ký hiệu trong từ điển, không phải từ
DIALECT = {"NAmE", "BrE", "AmE"}          # nhãn Anh/Mỹ (so khớp đúng hoa thường để không nhầm với từ "name")


def tokens(entry: str):
    s = entry.replace("’", "'")
    s = re.sub(r"\(.*?\)", " ", s)          # bỏ phần trong ngoặc: (to), (US), (of)...
    s = re.split(r"[,/;]", s)[0]            # chỉ lấy biến thể đầu: "better, best" -> "better"
    out = []
    for t in re.findall(r"[A-Za-z]+(?:'[a-z]+)?", s):
        if t in DIALECT:
            continue
        low = t.lower()
        if low in SKIP or low.startswith(("sb'", "sth'")):
            continue
        out.append(low)
    return out


def zipf(entry: str):
    zs = [zipf_frequency(t, "en") for t in tokens(entry)]
    zs = [z for z in zs if z > 0]
    return round(min(zs), 2) if zs else None


def main():
    files = sorted(glob.glob("src/data/words/*.json"))
    all_z, none = [], []
    for path in files:
        raw = open(path, encoding="utf-8", newline="").read()
        crlf = "\r\n" in raw
        words = json.loads(raw)
        for w in words:
            z = zipf(w["word"])
            if z is None:
                none.append(w["word"])
                w.pop("z", None)
            else:
                w["z"] = z
                all_z.append(z)
        out = json.dumps(words, ensure_ascii=False, indent=2)
        if crlf:
            out = out.replace("\n", "\r\n")
        open(path, "w", encoding="utf-8", newline="").write(out)
    all_z.sort()
    n = len(all_z)
    print(f"{n} từ có độ phổ biến, {len(none)} từ không có: {none[:20]}")
    for cut in (5.0, 4.6, 4.2, 3.8, 3.5, 3.0):
        print(f"  Zipf >= {cut}: {sum(1 for z in all_z if z >= cut)}")
    print("  trung vị:", all_z[n // 2], " phân vị 33%:", all_z[n // 3], " 66%:", all_z[2 * n // 3])


if __name__ == "__main__":
    sys.exit(main())
