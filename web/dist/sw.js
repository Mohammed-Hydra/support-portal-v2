self.addEventListener("push", (event) => {
  let data = { title: "Support Portal", body: "New notification" };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {}
  const options = {
    body: data.body || "",
    tag: "portal-" + (data.ticketId || "general"),
    data: { url: data.ticketId ? "/tickets/" + data.ticketId : "/tickets" },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(data.title || "Support Portal", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/tickets";
  const fullUrl = self.location.origin + url;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const c of windowClients) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          c.navigate(fullUrl);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(fullUrl);
    })
  );
});
