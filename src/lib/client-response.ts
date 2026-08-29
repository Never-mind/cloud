export async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const text = await response.text();
  let data: unknown = null;

  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${fallbackMessage}（服务器返回了无效响应，HTTP ${response.status}）`);
    }
  }

  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data
      ? String((data as { error?: unknown }).error ?? "")
      : "";
    throw new Error(message || `${fallbackMessage}（HTTP ${response.status}）`);
  }
  if (data === null) throw new Error(`${fallbackMessage}（服务器返回空响应）`);
  return data as T;
}
