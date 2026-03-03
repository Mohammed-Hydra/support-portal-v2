const API_BASE = import.meta.env.VITE_API_BASE || "";

export async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (!headers["Content-Type"] && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data.error || "Request failed");
    err.code = data.code;
    err.status = response.status;
    if (response.status >= 500 && data.error) {
      console.error(`API ${path} error (${response.status}):`, data.error);
    }
    throw err;
  }
  return data;
}
