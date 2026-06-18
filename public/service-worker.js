self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      body: event.data ? event.data.text() : "",
    };
  }

  const title = payload.title || "Love Island Fantasy League";
  const options = {
    body: payload.body || "A new villa update just dropped.",
    icon: payload.icon || "/apple-icon",
    badge: payload.badge || "/apple-icon",
    tag: payload.tag || "villa-feed-alert",
    data: {
      url: payload.url || "/chat",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const destinationUrl = event.notification.data?.url || "/chat";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(destinationUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(destinationUrl);
      }

      return undefined;
    })
  );
});
