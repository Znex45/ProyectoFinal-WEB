const apiBaseUrl = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");

export async function api(path, { method = "GET", body, headers = {} } = {}) {
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    credentials: "include",
    headers: isFormData ? headers : { "Content-Type": "application/json", ...headers },
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(data?.error || "Error del servidor");
    error.status = response.status;
    throw error;
  }

  return data;
}

export function fetchHealth() {
  return api("/health", { headers: { Accept: "application/json" } });
}
