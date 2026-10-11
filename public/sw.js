// 梓养云 · Service Worker (Web Push & Notification Handler)
// 遵循标准 Web Push 协议，支持 Android Chrome 及 iOS 16.4+ (PWA standalone 模式)

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 处理 push 事件：解析 payload 并弹出系统通知
self.addEventListener("push", (event) => {
  let data = {
    title: "林梓精养馆 · 预约提醒",
    body: "您有一条新的预约状态更新，请点击查看。",
    url: "/my",
    tag: "linzi-appointment",
    data: { url: "/my" },
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
      if (parsed.url && !data.data) {
        data.data = { url: parsed.url };
      }
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || "linzi-notification",
    renotify: true,
    data: data.data || { url: data.url || "/my" },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// 处理通知点击：跳转到对应页面（/my 或 /admin）
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/my";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // 如果已有打开的窗口，聚焦并跳转
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // 没有则新开窗口
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
