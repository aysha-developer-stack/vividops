export type PushSubscriptionKeys = {
  p256dh: string;
  auth: string;
};

export type StoredPushSubscription = {
  endpoint: string;
  keys: PushSubscriptionKeys;
};

let activeSubscription: StoredPushSubscription | null = null;
let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

function swUrl(): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base.endsWith("/") ? base : `${base}/`}sw.js`;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function webPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function isWebPushActive(): boolean {
  return activeSubscription !== null;
}

export function getActivePushSubscription(): StoredPushSubscription | null {
  return activeSubscription;
}

async function fetchVapidPublicKey(): Promise<string | null> {
  const res = await fetch("/api/push/vapid-public-key", { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { enabled?: boolean; publicKey?: string | null };
  return data.enabled && data.publicKey ? data.publicKey : null;
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!webPushSupported()) return null;

  registrationPromise ??= navigator.serviceWorker
    .register(swUrl(), { scope: import.meta.env.BASE_URL ?? "/" })
    .then((registration) => registration)
    .catch(() => null);

  return registrationPromise;
}

async function syncSubscriptionWithServer(subscription: PushSubscription | null): Promise<boolean> {
  if (!subscription) {
    activeSubscription = null;
    return false;
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    activeSubscription = null;
    return false;
  }

  const payload: StoredPushSubscription = {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    activeSubscription = null;
    return false;
  }

  activeSubscription = payload;
  return true;
}

export async function registerWebPush(): Promise<boolean> {
  if (!webPushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) return false;

  const registration = await getServiceWorkerRegistration();
  if (!registration) return false;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  return syncSubscriptionWithServer(subscription);
}

export async function unregisterWebPush(): Promise<void> {
  activeSubscription = null;

  if (!webPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL ?? "/");
    const subscription = await registration?.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
    } else {
      await fetch("/api/push/subscribe/all", {
        method: "DELETE",
        credentials: "include",
      });
    }
  } catch {
    await fetch("/api/push/subscribe/all", {
      method: "DELETE",
      credentials: "include",
    }).catch(() => undefined);
  }
}

/** Re-attach to an existing browser push subscription after page reload. */
export async function refreshWebPushRegistration(): Promise<boolean> {
  if (!webPushSupported()) return false;
  if (Notification.permission !== "granted") return false;

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) return false;

  const registration = await getServiceWorkerRegistration();
  if (!registration) return false;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  return syncSubscriptionWithServer(subscription);
}
