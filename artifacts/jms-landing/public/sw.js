/* Vivid OPS — Web Push service worker (background notifications when tab is hidden or closed). */

const DEFAULT_ICON = "/favicon.svg";

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Vivid OPS", body: event.data.text() };
  }

  const title = payload.title || "Vivid OPS";
  const body = payload.body || "";
  const tag = payload.tag || `vividops-${Date.now()}`;
  const data = payload.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const appFocused = clientList.some((client) => client.focused);
      if (appFocused) return;

      return self.registration.showNotification(title, {
        body,
        tag,
        icon: DEFAULT_ICON,
        badge: DEFAULT_ICON,
        data,
        renotify: true,
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
