// Xin trình duyệt giữ dữ liệu (IndexedDB) lâu dài, tránh bị xóa khi thiếu dung lượng.
// Trình duyệt có thể từ chối hoặc im lặng; vì vậy vẫn nên sao lưu JSON định kỳ.
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
