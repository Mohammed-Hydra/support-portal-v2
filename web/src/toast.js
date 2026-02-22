const TOAST_EVENT = "app:toast";

export function pushToast(type, message) {
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, {
      detail: { type, message },
    })
  );
}

export function toastSuccess(message) {
  pushToast("success", message);
}

export function toastError(message) {
  pushToast("error", message);
}

export function subscribeToasts(handler) {
  window.addEventListener(TOAST_EVENT, handler);
  return () => window.removeEventListener(TOAST_EVENT, handler);
}
