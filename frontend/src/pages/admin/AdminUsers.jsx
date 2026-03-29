import { useEffect, useState } from "react";

import { createUser, listUsers, resetPassword, updateUser } from "../../api/admin";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    username: "",
    display_name: "",
    password: "",
    role: "member",
    status: "active",
  });

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
    loadUsers();
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    setCreating(true);
    try {
      await createUser(form);
      setForm({
        username: "",
        display_name: "",
        password: "",
        role: "member",
        status: "active",
      });
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

  return (
    <div className="flex-1 px-4 py-8 md:px-6 md:py-10 max-w-5xl mx-auto w-full">
      <div className="text-2xl md:text-[28px] font-display font-bold mb-6">用户管理</div>

      <form className="bg-card border border-border rounded-2xl p-5 md:p-6 mb-6" onSubmit={handleCreate}>
        <div className="text-base font-semibold mb-4">创建用户</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="px-4 py-3 rounded-xl border border-border bg-input text-text"
            placeholder="用户名"
            value={form.username}
            onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
          />
          <input
            className="px-4 py-3 rounded-xl border border-border bg-input text-text"
            placeholder="显示名"
            value={form.display_name}
            onChange={(event) => setForm((prev) => ({ ...prev, display_name: event.target.value }))}
          />
          <input
            className="px-4 py-3 rounded-xl border border-border bg-input text-text"
            placeholder="初始密码"
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <select
              className="px-4 py-3 rounded-xl border border-border bg-input text-text"
              value={form.role}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <select
              className="px-4 py-3 rounded-xl border border-border bg-input text-text"
              value={form.status}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </div>
        </div>
        <button
          className={`mt-4 px-5 py-2.5 rounded-xl bg-accent text-white ${creating ? "opacity-50" : ""}`}
          disabled={creating || !form.username || !form.display_name || !form.password}
          type="submit"
        >
          {creating ? "创建中..." : "创建用户"}
        </button>
      </form>

      <div className="bg-card border border-border rounded-2xl p-5 md:p-6">
        <div className="text-base font-semibold mb-4">用户列表</div>
        {loading ? (
          <div className="text-dim">加载中...</div>
        ) : (
          <div className="flex flex-col gap-3">
            {users.map((user) => (
              <div key={user.id} className="border border-border rounded-xl px-4 py-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="font-medium">{user.display_name} ({user.username})</div>
                    <div className="text-sm text-dim">role: {user.role} | status: {user.status}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="px-3 py-1.5 rounded-lg bg-hover text-sm" onClick={() => handleToggleRole(user)}>
                      切换角色
                    </button>
                    <button className="px-3 py-1.5 rounded-lg bg-hover text-sm" onClick={() => handleToggleStatus(user)}>
                      {user.status === "active" ? "禁用" : "启用"}
                    </button>
                    <button className="px-3 py-1.5 rounded-lg bg-hover text-sm" onClick={() => handleResetPassword(user)}>
                      重置密码
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
