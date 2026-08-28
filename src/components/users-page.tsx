"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Save, UserPlus } from "lucide-react";
import { Button, Input, Panel } from "./ui";

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
  permissions: Permission[];
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
  const [form, setForm] = useState({ displayName: "", email: "", password: "", role: "user" as ManagedUser["role"] });
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
    setForm({ displayName: user.displayName, email: user.email, password: "", role: user.role });
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
      setForm({ displayName: "", email: "", password: "", role: "user" });
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
        body: JSON.stringify({ displayName: form.displayName, password: form.password, status: selected.status, role: form.role, permissions: selected.permissions }),
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
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#ebeef5] p-4">
        <div><h1 className="font-medium text-[#303133]">用户与权限</h1><p className="mt-1 text-sm text-[#909399]">管理员可以管理账号状态、密码和系统权限。</p></div>
        <Button onClick={() => void load()}><RefreshCw size={15} />刷新</Button>
      </div>
      {error ? <div className="border-b border-[#fde2e2] bg-[#fef0f0] px-4 py-3 text-sm text-[#f56c6c]">{error}</div> : null}
      <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div>
          <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_1.2fr_1fr_110px_auto]"><Input placeholder="用户名称" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /><Input placeholder="账号邮箱" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><Input placeholder="初始密码" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><select aria-label="新用户角色" className="h-9 rounded border border-[#dcdfe6] px-3 text-sm" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as ManagedUser["role"] })}><option value="user">普通用户</option><option value="admin">管理员</option></select><Button disabled={saving} onClick={() => void createUser()} tone="primary"><UserPlus size={15} />新增</Button></div>
          <div className="overflow-auto border border-[#ebeef5]">
            <table className="min-w-full text-sm"><thead className="bg-[#f5f7fa]"><tr>{["名称", "账号", "角色", "状态"].map((label) => <th className="border-b border-r border-[#ebeef5] px-3 py-2 text-left font-medium" key={label}>{label}</th>)}</tr></thead><tbody>
              {users.map((user) => <tr className={`cursor-pointer hover:bg-[#f5f7fa] ${selected?.userId === user.userId ? "bg-[#ecf5ff]" : ""}`} key={user.userId} onClick={() => selectUser(user)}><td className="border-b border-r border-[#ebeef5] px-3 py-2">{user.displayName}</td><td className="border-b border-r border-[#ebeef5] px-3 py-2">{user.email}</td><td className="border-b border-r border-[#ebeef5] px-3 py-2">{user.role === "admin" ? "管理员" : "普通用户"}</td><td className="border-b border-[#ebeef5] px-3 py-2">{user.status === "active" ? "启用" : "停用"}</td></tr>)}
              {!loading && !users.length ? <tr><td className="px-3 py-8 text-center text-[#909399]" colSpan={4}>暂无用户</td></tr> : null}
            </tbody></table>
          </div>
        </div>
        <div className="border border-[#ebeef5] p-4">
          {selected ? <><div className="mb-3 flex items-center justify-between"><div className="font-medium">编辑用户</div><Button disabled={saving} onClick={() => void saveUser()} tone="primary"><Save size={15} />保存</Button></div><div className="grid gap-3 sm:grid-cols-2"><Input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="用户名称" /><Input value={form.email} disabled placeholder="账号" /><Input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="留空表示不修改密码" type="password" /><select aria-label="用户角色" className="h-9 rounded border border-[#dcdfe6] px-3 text-sm" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as ManagedUser["role"] })}><option value="user">普通用户</option><option value="admin">管理员</option></select><select aria-label="用户状态" className="h-9 rounded border border-[#dcdfe6] px-3 text-sm" value={selected.status} onChange={(event) => setSelected({ ...selected, status: event.target.value as ManagedUser["status"] })}><option value="active">启用</option><option value="disabled">停用</option></select></div><div className="mt-5 overflow-auto"><table className="min-w-[760px] w-full text-sm"><thead className="bg-[#f5f7fa]"><tr><th className="px-3 py-2 text-left">目录/功能</th>{permissionKeys.map(([, label]) => <th className="px-2 py-2 text-center" key={label}>{label}</th>)}</tr></thead><tbody>{selected.permissions.map((permission) => <tr key={permission.moduleKey}><td className="border-b border-[#ebeef5] px-3 py-2" style={{ paddingLeft: `${12 + Math.max(0, (permission.level ?? 3) - 1) * 20}px` }}><span className={permission.kind !== "module" ? "font-medium" : ""}>{permission.title ?? permission.moduleKey}</span></td>{permissionKeys.map(([key, label]) => <td className="border-b border-[#ebeef5] px-2 py-2 text-center" key={label}><input aria-label={`${permission.moduleKey}-${label}`} checked={permission[key]} onChange={() => togglePermission(permission.moduleKey, key)} type="checkbox" /></td>)}</tr>)}</tbody></table></div></> : <div className="py-12 text-center text-sm text-[#909399]">请选择用户</div>}
        </div>
      </div>
    </Panel>
  );
}
