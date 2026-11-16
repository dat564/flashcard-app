import { useEffect, useState } from "react";

// PWA: đăng ký service worker (offline) và nút cài đặt.
// manifest/biểu tượng/meta đã khai báo trong index.html.
export function usePwaInstall() {
  const [installEvt, setInstallEvt] = useState(null);
  const [installed, setInstalled] = useState(
    () =>
      !!window.matchMedia?.("(display-mode: standalone)").matches ||
      navigator.standalone === true
  );

  useEffect(() => {
    if ("serviceWorker" in navigator && import.meta.env.PROD)
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .catch(() => {});

    const onBip = (e) => {
      e.preventDefault();
      setInstallEvt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvt(null);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice;
    setInstallEvt(null);
  };

  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return { installEvt, installed, isIOS, installApp };
}
