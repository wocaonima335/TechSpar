import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const from = location.state?.from?.pathname || "/";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl px-6 py-8 md:px-8">
        <div className="text-2xl font-display font-bold mb-2">登录 TechSpar</div>
        <div className="text-sm text-dim mb-6">使用管理员或已创建的普通用户账号进入训练空间。</div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="text-sm">
            <span className="block text-dim mb-1.5">用户名</span>
            <input
              className="w-full px-4 py-3 rounded-xl border border-border bg-input text-text outline-none"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入用户名"
              autoFocus
            />
          </label>

          <label className="text-sm">
            <span className="block text-dim mb-1.5">密码</span>
            <input
              className="w-full px-4 py-3 rounded-xl border border-border bg-input text-text outline-none"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
          </label>

          {error && <div className="text-sm text-red bg-red/10 border border-red/20 rounded-lg px-3 py-2">{error}</div>}

          <button
            className={`mt-2 w-full py-3.5 rounded-xl bg-gradient-to-r from-accent to-orange text-white font-semibold ${
              submitting ? "opacity-50 cursor-not-allowed" : ""
            }`}
            disabled={submitting || !username.trim() || !password}
            type="submit"
          >
            {submitting ? "登录中..." : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
}
