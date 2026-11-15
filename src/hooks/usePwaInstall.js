import { useEffect, useState } from "react";
import { setMeta } from "../lib/utils";

// PWA: manifest, biểu tượng, service worker, nút cài đặt
export function usePwaInstall() {
  const [installEvt, setInstallEvt] = useState(null);
  const [installed, setInstalled] = useState(
    () =>
      !!window.matchMedia?.("(display-mode: standalone)").matches ||
      navigator.standalone === true
  );

  useEffect(() => {
    const addLink = (rel, href) => {
      if (document.head.querySelector(`link[rel="${rel}"]`)) return;
      const l = document.createElement("link");
      l.rel = rel;
      l.href = href;
      document.head.appendChild(l);
    };
    addLink("manifest", "/manifest.webmanifest");
    addLink("apple-touch-icon", "/apple-touch-icon.png");
    setMeta("apple-mobile-web-app-capable", "yes");
    setMeta("mobile-web-app-capable", "yes");
    setMeta("apple-mobile-web-app-title", "TOEIC Recall");
    setMeta("apple-mobile-web-app-status-bar-style", "default");
    const vp = document.querySelector('meta[name="viewport"]');
    if (vp && !/viewport-fit/.test(vp.content))
      vp.content += ", viewport-fit=cover";
    if ("serviceWorker" in navigator && import.meta.env.PROD)
      navigator.serviceWorker.register("/sw.js").catch(() => {});

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
