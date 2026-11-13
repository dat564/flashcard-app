import asyncio, json, glob, os, re, random
import edge_tts

VOICE = "en-US-AriaNeural"
OUT = "public/audio"
CONCURRENCY = 2      # đừng tăng cao, dễ bị 503
RETRIES = 6
os.makedirs(OUT, exist_ok=True)

def slug(w):
    return re.sub(r"[^a-z0-9]+", "_", w.lower()).strip("_")

async def main():
    words = []
    for f in sorted(glob.glob("src/data/words/*.json")):
        words += [w["word"].strip() for w in json.load(open(f, encoding="utf-8"))]
    words = sorted(set(words))

    # xóa file rỗng/hỏng do lần chạy trước bị ngắt
    for p in glob.glob(f"{OUT}/*.mp3"):
        if os.path.getsize(p) < 500:
            os.remove(p)

    todo = [w for w in words if not os.path.exists(f"{OUT}/{slug(w)}.mp3")]
    print(f"Còn {len(todo)}/{len(words)} từ cần tạo")

    sem = asyncio.Semaphore(CONCURRENCY)
    done = 0
    failed = []

    async def one(w):
        nonlocal done
        path = f"{OUT}/{slug(w)}.mp3"
        async with sem:
            for attempt in range(RETRIES):
                try:
                    await edge_tts.Communicate(w, VOICE).save(path)
                    if os.path.getsize(path) > 500:
                        done += 1
                        if done % 50 == 0:
                            print(f"{done}/{len(todo)}")
                        await asyncio.sleep(0.15)
                        return
                except Exception:
                    pass
                if os.path.exists(path):
                    os.remove(path)
                # chờ lâu dần: 2s, 4s, 8s... cộng chút ngẫu nhiên
                await asyncio.sleep(2 ** (attempt + 1) + random.random())
            failed.append(w)

    await asyncio.gather(*[one(w) for w in todo])
    print(f"Xong. Thất bại: {len(failed)}")
    if failed:
        print("Chạy lại script để thử tiếp các từ này:", failed[:20], "...")

asyncio.run(main())