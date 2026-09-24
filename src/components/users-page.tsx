"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Save, UserPlus } from "lucide-react";
import { Button, Input, Panel, Select } from "./ui";

type Permission = {
  moduleKey: string;
  title?: string;
  level?: 1 | 2 | 3;
  parentKey?: string;
  kind?: "domain" | "group" | "module";
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canExport: boolean;
  canImport: boolean;
  canConfirm: boolean;
};

type ManagedUser = {
  userId: string;
  displayName: string;
  email: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  loginType: "local" | "feishu" | "both";
  feishuBound: boolean;
  feishuName: string | null;
  feishuBoundAt: string | null;
  permissions: Permission[];
};

const loginTypeLabels: Record<ManagedUser["loginType"], string> = {
  local: "仅邮箱密码",
  feishu: "仅飞书",
  both: "飞书 + 密码",
};

const permissionKeys = [
  ["canView", "查看"],
  ["canCreate", "新增"],
  ["canUpdate", "修改"],
  ["canDelete", "删除"],
  ["canExport", "导出"],
  ["canImport", "导入"],
  ["canConfirm", "确认"],
] as const;

export function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    role: "user" as ManagedUser["role"],
    loginType: "feishu" as ManagedUser["loginType"],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/system/users", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "用户列表加载失败");
      setUsers(data.users ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "用户列表加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function selectUser(user: ManagedUser) {
    setSelected(user);
    setForm({ displayName: user.displayName, email: user.email, password: "", role: user.role, loginType: user.loginType });
  }

  async function createUser() {
    setSaving(true);
    try {
      const response = await fetch("/api/system/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "用户创建失败");
      setForm({ displayName: "", email: "", password: "", role: "user", loginType: "feishu" });
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "用户创建失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveUser() {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/system/users/${encodeURIComponent(selected.userId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: form.displayName,
          password: form.password,
          status: selected.status,
          role: form.role,
          loginType: form.loginType,
          permissions: selected.permissions,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "用户保存失败");
      setForm((current) => ({ ...current, password: "" }));
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "用户保存失败");
    } finally {
      setSaving(false);
    }
  }

  /** 飞书解绑：只清飞书绑定关系，账号与权限保留。 */
  async function unbindFeishu(user: ManagedUser) {
    if (!confirm(`确认解绑 ${user.displayName || user.email} 的飞书账号？\n解绑后该账号只能用邮箱密码登录（若已关闭密码登录，请联系管理员重新绑定）。`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/system/users/${encodeURIComponent(user.userId)}/feishu-binding`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "解绑失败");
      setSelected(null);
      await load();
    } catch (unbindError) {
      setError(unbindError instanceof Error ? unbindError.message : "解绑失败");
    } finally {
      setSaving(false);
    }
  }

  function togglePermission(moduleKey: string, key: keyof Omit<Permission, "moduleKey">) {
    if (!selected) return;
    const targetKeys = new Set([moduleKey]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const permission of selected.permissions) {
        if (permission.parentKey && targetKeys.has(permission.parentKey) && !targetKeys.has(permission.moduleKey)) {
          targetKeys.add(permission.moduleKey);
          changed = true;
        }
      }
    }
    setSelected({
      ...selected,
      permissions: selected.permissions.map((permission) => targetKeys.has(permission.moduleKey) ? { ...permission, [key]: !permission[key] } : permission),
    });
  }

  return (
    <Panel>
      <div className="flex items-center justify-between border-b border-line-soft p-4">
        <div><h1 className="font-medium text-ink">用户与权限</h1><p className="mt-1 text-sm text-ink-3">管理员可以管理账号状态、密码和系统权限。</p></div>
        <Button onClick={() => void load()}><RefreshCw size={15} />刷新</Button>
      </div>
      {error ? <div className="border-b border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">{error}</div> : null}
      <div className="grid min-w-0 gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="min-w-0">
          <div className="mb-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2"><Input className="w-full min-w-0" placeholder="用户名称" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /><Input className="w-full min-w-0" placeholder="账号邮箱" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><Input className="w-full min-w-0" placeholder="初始密码（仅飞书登录可留空）" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><Select aria-label="新用户角色" className="w-full min-w-0" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as ManagedUser["role"] })}><option value="user">普通用户</option><option value="admin">管理员</option></Select><Select aria-label="新用户登录方式" className="w-full min-w-0" value={form.loginType} onChange={(event) => setForm({ ...form, loginType: event.target.value as ManagedUser["loginType"] })}><option value="feishu">登录方式：仅飞书</option><option value="both">登录方式：飞书 + 密码</option><option value="local">登录方式：仅邮箱密码</option></Select><Button className="justify-self-start" disabled={saving} onClick={() => void createUser()} tone="primary"><UserPlus size={15} />新增</Button></div>
          <div className="overflow-auto border border-line-soft">
            <table className="min-w-full text-sm"><thead className="bg-canvas"><tr>{["名称", "账号", "角色", "登录方式", "飞书绑定", "状态"].map((label) => <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={label}>{label}</th>)}</tr></thead><tbody>
              {users.map((user) => <tr className={`cursor-pointer hover:bg-canvas ${selected?.userId === user.userId ? "bg-info-soft" : ""}`} key={user.userId} onClick={() => selectUser(user)}><td className="border-b border-r border-line-soft px-3 py-2">{user.displayName}</td><td className="border-b border-r border-line-soft px-3 py-2">{user.email}</td><td className="border-b border-r border-line-soft px-3 py-2">{user.role === "admin" ? "管理员" : "普通用户"}</td><td className="border-b border-r border-line-soft px-3 py-2">{loginTypeLabels[user.loginType] ?? user.loginType}</td><td className="border-b border-r border-line-soft px-3 py-2">{user.feishuBound ? `已绑定${user.feishuName ? `（${user.feishuName}）` : ""}` : "未绑定"}</td><td className="border-b border-line-soft px-3 py-2">{user.status === "active" ? "启用" : "停用"}</td></tr>)}
              {!loading && !users.length ? <tr><td className="px-3 py-8 text-center text-ink-3" colSpan={6}>暂无用户</td></tr> : null}
            </tbody></table>
          </div>
        </div>
        <div className="min-w-0 border border-line-soft p-4">
          {selected ? <><div className="mb-3 flex items-center justify-between"><div className="font-medium">编辑用户</div><div className="flex items-center gap-2">{selected.feishuBound ? <Button disabled={saving} onClick={() => void unbindFeishu(selected)} tone="warning">解绑飞书</Button> : null}<Button disabled={saving} onClick={() => void saveUser()} tone="primary"><Save size={15} />保存</Button></div></div><div className="grid gap-3 sm:grid-cols-2"><Input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="用户名称" /><Input value={form.email} disabled placeholder="账号" /><Input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="留空表示不修改密码" type="password" /><Select aria-label="用户角色" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as ManagedUser["role"] })}><option value="user">普通用户</option><option value="admin">管理员</option></Select><Select aria-label="用户登录方式" value={form.loginType} onChange={(event) => setForm({ ...form, loginType: event.target.value as ManagedUser["loginType"] })}><option value="feishu">仅飞书</option><option value="both">飞书 + 密码</option><option value="local">仅邮箱密码</option></Select><Select aria-label="用户状态" value={selected.status} onChange={(event) => setSelected({ ...selected, status: event.target.value as ManagedUser["status"] })}><option value="active">启用</option><option value="disabled">停用</option></Select></div><div className="mt-5 overflow-auto"><table className="min-w-[760px] w-full text-sm"><thead className="bg-canvas"><tr><th className="whitespace-nowrap px-3 py-3 text-left font-medium">目录/功能</th>{permissionKeys.map(([, label]) => <th className="whitespace-nowrap px-2 py-3 text-center font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{selected.permissions.map((permission) => <tr key={permission.moduleKey}><td className="border-b border-line-soft px-3 py-2" style={{ paddingLeft: `${12 + Math.max(0, (permission.level ?? 3) - 1) * 20}px` }}><span className={permission.kind !== "module" ? "font-medium" : ""}>{permission.title ?? permission.moduleKey}</span></td>{permissionKeys.map(([key, label]) => <td className="border-b border-line-soft px-2 py-2 text-center" key={label}><input aria-label={`${permission.moduleKey}-${label}`} checked={permission[key]} onChange={() => togglePermission(permission.moduleKey, key)} type="checkbox" /></td>)}</tr>)}</tbody></table></div></> : <div className="py-12 text-center text-sm text-ink-3">请选择用户</div>}
        </div>
      </div>
    </Panel>
  );
}
