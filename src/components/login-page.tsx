"use client";

import { useMemo, useState } from "react";
import { LockKeyhole, Mail } from "lucide-react";
import { Button, Input } from "./ui";

export function LoginPage() {
  const [email, setEmail] = useState("admin@luzcorp.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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
      const data = await response.json();
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
    <main className="flex min-h-screen items-center justify-center bg-[#f2f6fb] px-4">
      <section className="w-full max-w-[420px] border border-[#dcdfe6] bg-white p-8 shadow-sm">
        <div className="mb-7">
          <div className="mb-2 text-2xl font-medium text-[#303133]">算力交付管理系统</div>
          <div className="text-sm text-[#909399]">请输入账号和密码登录后台</div>
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="mb-1 block text-sm text-[#606266]">账号</span>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c0c4cc]" size={16} />
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
            <span className="mb-1 block text-sm text-[#606266]">密码</span>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 text-[#c0c4cc]" size={16} />
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
          {error ? <div className="border border-[#fde2e2] bg-[#fef0f0] px-3 py-2 text-sm text-[#f56c6c]">{error}</div> : null}
          <Button className="w-full" disabled={submitting} tone="primary" type="submit">
            {submitting ? "登录中..." : "登录"}
          </Button>
        </form>
      </section>
    </main>
  );
}
