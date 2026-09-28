/**
 * 用**真实请求头**解析当前站点地址。
 *
 * 不能直接用 `request.nextUrl.origin`：Next 在路由里可能给出服务端自身的主机名
 * （实测本机访问 `http://127.0.0.1:5174` 时它返回 `http://localhost:5174`）。
 * 登录回调如果按这个地址跳转，就会发生"跨主机跳转"——cookie 写在 127.0.0.1 上，
 * 浏览器却被送到 localhost，表现为"授权完成后又回到登录页，需要再点一次"。
 */
export function resolveRequestOrigin(request: { nextUrl: URL; headers: Headers }) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = (forwardedHost ?? request.headers.get("host") ?? request.nextUrl.host).split(",")[0].trim();
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = (forwardedProto ?? request.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
  return `${proto}://${host}`;
}

/** 站内路径白名单：只接受以单个 "/" 开头的相对路径，避免开放重定向。 */
export function safeInternalPath(value: string | null | undefined, fallback = "/") {
  const path = String(value ?? "").trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}
