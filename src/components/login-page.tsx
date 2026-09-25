"use client";

import { useMemo, useState } from "react";
import { LockKeyhole, Mail, MessageCircle } from "lucide-react";
import { Button, Input } from "./ui";

export function LoginPage({ feishuEnabled = false }: { feishuEnabled?: boolean }) {
  const [email, setEmail] = useState("admin@luzcorp.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("error") ?? "";
  });
  const [submitting, setSubmitting] = useState(false);
  const nextUrl = useMemo(() => {
    if (typeof window === "undefined") return "/";
    return new URLSearchParams(window.location.search).get("next") || "/";
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const responseText = await response.text();
      let data: { error?: string } = {};
      try {
        data = JSON.parse(responseText) as { error?: string };
      } catch {
        throw new Error(`登录服务返回异常（HTTP ${response.status}）`);
      }
      if (!response.ok) {
        throw new Error(data.error || "登录失败");
      }
      window.location.href = nextUrl;
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <section className="w-full max-w-[420px] border border-line bg-white p-8 shadow-sm">
        <div className="mb-7">
          <div className="mb-2 text-2xl font-medium text-ink">Cloud业务系统</div>
        </div>

        {error ? <div className="mb-4 border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div> : null}

        <a className="block" href={`/api/auth/feishu/start?next=${encodeURIComponent(nextUrl)}`}>
          <Button className="w-full" disabled={!feishuEnabled} tone="primary" type="button">
            <MessageCircle size={16} />
            使用飞书登录
          </Button>
        </a>
        {feishuEnabled ? null : <div className="mt-2 text-xs text-ink-3">飞书登录尚未配置（FEISHU_APP_ID / FEISHU_APP_SECRET），请联系管理员。</div>}

        <details className="mt-6 border-t border-line-soft pt-4">
          <summary className="cursor-pointer text-sm text-ink-3 hover:text-ink">邮箱密码登录</summary>
          <form className="mt-4 space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="mb-1 block text-sm text-ink-2">账号</span>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" size={16} />
              <Input
                autoComplete="username"
                className="w-full pl-9"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="请输入账号"
                type="email"
                value={email}
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-ink-2">密码</span>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" size={16} />
              <Input
                autoComplete="current-password"
                className="w-full pl-9"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                type="password"
                value={password}
              />
            </div>
          </label>
          <Button className="w-full" disabled={submitting} tone="primary" type="submit">
            {submitting ? "登录中..." : "登录"}
          </Button>
          </form>
        </details>
      </section>
    </main>
  );
}
