import { useEffect, useState } from "react";

import { createUser, listUsers, resetPassword, updateUser } from "../../api/admin";
import AdminPageShell, { AdminEmptyState, AdminSection } from "../../components/AdminPageShell";

const EMPTY_FORM = { username: "", display_name: "", password: "", role: "member", status: "active" };

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await listUsers();
      setUsers(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => loadUsers(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreating(true);
    try {
      await createUser(form);
      setForm(EMPTY_FORM);
      await loadUsers();
    } catch (err) {
      alert(`创建失败: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (user) => {
    const nextStatus = user.status === "active" ? "disabled" : "active";
    try {
      await updateUser(user.id, { status: nextStatus });
      await loadUsers();
    } catch (err) {
      alert(`更新状态失败: ${err.message}`);
    }
  };

  const handleToggleRole = async (user) => {
    const nextRole = user.role === "admin" ? "member" : "admin";
    try {
      await updateUser(user.id, { role: nextRole });
      await loadUsers();
    } catch (err) {
      alert(`更新角色失败: ${err.message}`);
    }
  };

  const handleResetPassword = async (user) => {
    const password = window.prompt(`请输入 ${user.username} 的新密码`);
    if (!password) return;
    try {
      await resetPassword(user.id, password);
      alert("密码已重置");
    } catch (err) {
      alert(`重置失败: ${err.message}`);
    }
  };

  const activeCount = users.filter((user) => user.status === "active").length;
  const adminCount = users.filter((user) => user.role === "admin").length;

  return (
    <AdminPageShell
      kicker="Phase 3 · Admin console"
      title="用户管理"
      subtitle="集中管理成员、角色与账号状态。高风险操作保持显式按钮和二次确认。"
      stats={[{ label: "users", value: users.length }, { label: "active", value: activeCount }, { label: "admins", value: adminCount }]}
    >
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <AdminSection title="创建用户" description="为新成员创建初始账号，之后可单独切换角色、状态或重置密码。">
          <form className="grid gap-4" onSubmit={handleCreate}>
            <label><span className="ts-admin-label">username</span><input className="ts-admin-field" placeholder="用户名" value={form.username} onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))} /></label>
            <label><span className="ts-admin-label">display name</span><input className="ts-admin-field" placeholder="显示名" value={form.display_name} onChange={(event) => setForm((prev) => ({ ...prev, display_name: event.target.value }))} /></label>
            <label><span className="ts-admin-label">initial password</span><input className="ts-admin-field" placeholder="初始密码" type="password" value={form.password} onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label><span className="ts-admin-label">role</span><select className="ts-admin-field" value={form.role} onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}><option value="member">member</option><option value="admin">admin</option></select></label>
              <label><span className="ts-admin-label">status</span><select className="ts-admin-field" value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}><option value="active">active</option><option value="disabled">disabled</option></select></label>
            </div>
            <button className="ts-admin-action ts-admin-action-primary" disabled={creating || !form.username || !form.display_name || !form.password} type="submit">{creating ? "创建中..." : "创建用户"}</button>
          </form>
        </AdminSection>

        <AdminSection title="用户列表" description="状态圆点用于快速识别可用账号；角色和状态切换会立即生效。">
          {loading ? (
            <AdminEmptyState>正在加载用户列表...</AdminEmptyState>
          ) : users.length === 0 ? (
            <AdminEmptyState>暂无用户。</AdminEmptyState>
          ) : (
            <div className="grid gap-3">
              {users.map((user) => (
                <article key={user.id} className="rounded-2xl border border-border bg-surface/70 p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-text">{user.display_name}</h3>
                        <span className="font-mono text-xs text-dim">@{user.username}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`ts-admin-badge ${user.role === "admin" ? "border-accent/30 bg-accent/10 text-accent-light" : "bg-hover text-dim"}`}>{user.role}</span>
                        <span className={`ts-admin-badge ${user.status === "active" ? "border-green/30 bg-green/10 text-green" : "border-red/30 bg-red/10 text-red"}`}><span className={`ts-admin-status-dot ${user.status === "active" ? "bg-green" : "bg-red"}`} />{user.status}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button className="ts-admin-action" onClick={() => handleToggleRole(user)}>切换角色</button>
                      <button className="ts-admin-action" onClick={() => handleToggleStatus(user)}>{user.status === "active" ? "禁用" : "启用"}</button>
                      <button className="ts-admin-action ts-admin-action-danger" onClick={() => handleResetPassword(user)}>重置密码</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </AdminSection>
      </div>
    </AdminPageShell>
  );
}
