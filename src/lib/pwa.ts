// 辅助函数：将 Base64URL 格式的 VAPID 公钥转换为 Uint8Array (并显式返回 ArrayBuffer 视图，兼容 DOM BufferSource 类型)
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// 检测当前设备是否为 iOS
export function isIOS(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// 检测是否处于 PWA 独立窗口 (Standalone) 运行状态
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari 专有属性，标准类型定义中不存在
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

/**
 * 等待 Service Worker 就绪，带超时。
 * `navigator.serviceWorker.ready` 在没有注册成功时既不 resolve 也不 reject，
 * 直接 await 会让「开启推送」永久转圈（finally 永远到不了）。
 * 超时抛错，交由调用方提示并复位 loading。
 */
export function serviceWorkerReadyWithTimeout(
  timeoutMs = 8000
): Promise<ServiceWorkerRegistration> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.reject(new Error("当前环境不支持 Service Worker"));
  }
  return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("通知服务未就绪，请刷新页面后重试")),
      timeoutMs
    );
    navigator.serviceWorker.ready.then(
      (reg) => {
        clearTimeout(timer);
        resolve(reg);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
