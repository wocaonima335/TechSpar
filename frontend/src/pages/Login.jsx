import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { getRegisterOptions } from "../api/auth";
import { useAuth } from "../context/useAuth";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [registrationEnabled, setRegistrationEnabled] = useState(false);

  const from = location.state?.from?.pathname || "/";

  useEffect(() => {
    let cancelled = false;
    getRegisterOptions()
      .then((data) => {
        if (!cancelled) setRegistrationEnabled(Boolean(data.registration_enabled));
      })
      .catch(() => {
        if (!cancelled) setRegistrationEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    <div className="ts-page flex items-center">
      <div className="ts-container grid min-h-[calc(100vh-10rem)] overflow-hidden rounded-[2rem] border border-border bg-surface shadow-[0_24px_70px_rgba(2,8,23,0.24)] backdrop-blur-2xl lg:grid-cols-[1.04fr_0.96fr]">
        <section className="relative hidden overflow-hidden border-r border-border p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(59,130,246,0.22),transparent_32%),radial-gradient(circle_at_70%_78%,rgba(45,212,191,0.12),transparent_34%)]" />
          <div className="relative">
            <div className="ts-kicker">Secure training workspace</div>
            <h1 className="mt-6 max-w-xl text-5xl font-bold leading-[1.04] tracking-[-0.045em] text-text">
              少一点干扰，
              <span className="block text-accent-light">多一次有效复盘。</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-8 text-dim">
              登录 TechSpar，继续你的 AI 面试训练、知识沉淀与成长画像追踪。
            </p>
          </div>
          <div className="relative grid grid-cols-3 gap-3">
            {["模拟", "复盘", "成长"].map((item) => (
              <div key={item} className="rounded-3xl border border-border bg-card/60 p-4">
                <div className="text-2xl font-bold text-text">{item}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">TechSpar</div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-9 md:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <div className="ts-kicker">TechSpar</div>
              <div className="mt-4 text-3xl font-bold tracking-tight text-text">登录训练空间</div>
            </div>
            <div className="hidden lg:block">
              <div className="text-3xl font-bold tracking-tight text-text">欢迎回来</div>
              <div className="mt-2 text-sm leading-7 text-dim">使用管理员或已创建的普通用户账号进入训练空间。</div>
            </div>

            <form className="mt-7 flex flex-col gap-4" onSubmit={handleSubmit}>
              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-dim">用户名</span>
                <input
                  className="ts-input"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="请输入用户名"
                  autoFocus
                  disabled={submitting}
                />
              </label>

              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-dim">密码</span>
                <input
                  className="ts-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                  disabled={submitting}
                />
              </label>

              {error && (
                <div className="rounded-2xl border border-red/25 bg-red/10 px-4 py-3 text-sm leading-6 text-red" role="alert">
                  {error}
                </div>
              )}

              <button
                className={`ts-btn ts-btn-primary mt-2 w-full rounded-2xl py-3.5 ${submitting ? "opacity-50" : ""}`}
                disabled={submitting || !username.trim() || !password}
                type="submit"
              >
                {submitting ? "登录中..." : "登录"}
              </button>
            </form>

            <div className="mt-6 rounded-2xl border border-border bg-card/55 px-4 py-3 text-xs leading-6 text-muted">
              {registrationEnabled ? (
                <span>还没有账号？ <Link className="font-bold text-text hover:text-primary" to="/register">使用邮箱注册</Link></span>
              ) : (
                <span>账号由管理员创建。若无法登录，请确认用户名、密码或联系系统管理员。</span>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
