const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function registerPushSubscription(token) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push notifications are not supported in this browser.");
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    throw new Error("Notification permission denied.");
  }
  const reg = await navigator.serviceWorker.ready;
  const vapidRes = await fetch(`${API_BASE}/api/push/vapid-public`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!vapidRes.ok) {
    const err = await vapidRes.json().catch(() => ({}));
    throw new Error(err.error || "Push not configured");
  }
  const { publicKey } = await vapidRes.json();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const p256dh = arrayBufferToBase64Url(sub.getKey("p256dh"));
  const auth = arrayBufferToBase64Url(sub.getKey("auth"));
  const payload = { endpoint: sub.endpoint, keys: { p256dh, auth } };
  const res = await fetch(`${API_BASE}/api/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save subscription");
  }
}

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

export async function ensureServiceWorkerRegistered() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    // ignore
  }
}
