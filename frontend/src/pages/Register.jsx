import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getRegisterOptions, requestEmailVerification } from "../api/auth";
import { useAuth } from "../context/useAuth";

const INITIAL_FORM = {
  username: "",
  display_name: "",
  email: "",
  password: "",
  confirm_password: "",
  verification_code: "",
  invitation_code: "",
};

function maskEmail(email) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  return `${name.slice(0, 1)}***@${domain}`;
}

function validateStepOne(form, options) {
  if (!form.username.trim()) return "请输入用户名";
  if (!form.display_name.trim()) return "请输入显示名";
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return "请输入有效邮箱地址";
  if (options?.invitation_code_enabled && !form.invitation_code.trim()) return "请输入邀请码";
  if (form.password.length < 6) return "密码至少 6 位";
  if (form.password !== form.confirm_password) return "两次输入的密码不一致";
  return "";
}

export default function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState(INITIAL_FORM);
  const [options, setOptions] = useState({ registration_enabled: false, email_verification_enabled: true, invitation_code_enabled: false });
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getRegisterOptions()
      .then((data) => {
        if (!cancelled) setOptions(data);
      })
      .catch((err) => {
        if (!cancelled) setMessage({ ok: false, text: `读取注册状态失败: ${err.message}` });
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const stepOneError = useMemo(() => validateStepOne(form, options), [form, options]);

  const updateField = (field, value) => {
    setMessage(null);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const sendCode = async () => {
    const error = validateStepOne(form, options);
    if (error) {
      setMessage({ ok: false, text: error });
      return false;
    }
    setSendingCode(true);
    try {
      await requestEmailVerification(form.email.trim());
      setCooldown(60);
      setStep(2);
      setMessage({ ok: true, text: `验证码已发送至 ${maskEmail(form.email.trim())}` });
      return true;
    } catch (err) {
      setMessage({ ok: false, text: err.message });
      return false;
    } finally {
      setSendingCode(false);
    }
  };

  const handleNext = async (event) => {
    event.preventDefault();
    if (options.email_verification_enabled) {
      await sendCode();
      return;
    }
    await submitRegister();
  };

  const submitRegister = async (event) => {
    if (event) event.preventDefault();
    const error = validateStepOne(form, options);
    if (error) {
      setMessage({ ok: false, text: error });
      return;
    }
    if (options.email_verification_enabled && !form.verification_code.trim()) {
      setMessage({ ok: false, text: "请输入邮箱验证码" });
      return;
    }
    setSubmitting(true);
    try {
      await register({
        username: form.username.trim(),
        display_name: form.display_name.trim(),
        email: form.email.trim(),
        password: form.password,
        verification_code: form.verification_code.trim() || undefined,
        invitation_code: options.invitation_code_enabled ? form.invitation_code.trim() : undefined,
      });
      navigate("/", { replace: true });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingOptions) {
    return <div className="flex min-h-[calc(100vh-72px)] items-center justify-center px-4 text-dim">正在读取注册入口...</div>;
  }

  if (!options.registration_enabled) {
    return (
      <div className="flex min-h-[calc(100vh-72px)] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-[2rem] border border-border bg-surface/90 p-8 text-center shadow-card">
          <div className="ts-chip mx-auto w-fit">Phase 4 · Email registration</div>
          <h1 className="mt-4 text-2xl font-black text-text">注册暂未开放</h1>
          <p className="mt-3 text-sm leading-6 text-dim">当前站点由管理员关闭自助注册，请联系管理员创建账号。</p>
          <Link className="ts-admin-action ts-admin-action-primary mt-6 inline-flex" to="/login">返回登录</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-72px)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl rounded-[2rem] border border-border bg-surface/90 p-6 shadow-card sm:p-8">
        <div className="ts-chip w-fit">Phase 4 · Email registration</div>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-text sm:text-3xl">创建 TechSpar 账号</h1>
            <p className="mt-2 text-sm text-dim">用邮箱验证码完成注册，进入你的 AI 面试训练工作台。</p>
          </div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-dim">Step {step}/2</div>
        </div>
        <div className="mt-6 h-2 rounded-full bg-bg-soft"><div className="h-full rounded-full bg-gradient-to-r from-primary to-purple transition-all" style={{ width: step === 1 ? "50%" : "100%" }} /></div>

        {message ? <div role="status" className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${message.ok ? "border-green/40 bg-green/10 text-green" : "border-red/40 bg-red/10 text-red"}`}>{message.text}</div> : null}

        {step === 1 ? (
          <form className="mt-6 grid gap-4" onSubmit={handleNext}>
            <label><span className="ts-admin-label">username</span><input className="ts-admin-field" value={form.username} onChange={(event) => updateField("username", event.target.value)} placeholder="如 alice" autoComplete="username" /></label>
            <label><span className="ts-admin-label">display name</span><input className="ts-admin-field" value={form.display_name} onChange={(event) => updateField("display_name", event.target.value)} placeholder="你的显示名" autoComplete="name" /></label>
            <label><span className="ts-admin-label">email</span><input className="ts-admin-field" type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="you@example.com" autoComplete="email" /></label>
            {options.invitation_code_enabled && (
              <label><span className="ts-admin-label">invitation code</span><input className="ts-admin-field font-mono tracking-[0.2em]" value={form.invitation_code} onChange={(event) => updateField("invitation_code", event.target.value)} placeholder="输入邀请码" autoComplete="off" /></label>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="ts-admin-label">password</span><input className="ts-admin-field" type="password" value={form.password} onChange={(event) => updateField("password", event.target.value)} placeholder="至少 6 位" autoComplete="new-password" /></label>
              <label><span className="ts-admin-label">confirm password</span><input className="ts-admin-field" type="password" value={form.confirm_password} onChange={(event) => updateField("confirm_password", event.target.value)} placeholder="再次输入密码" autoComplete="new-password" /></label>
            </div>
            <button className="ts-admin-action ts-admin-action-primary justify-center" disabled={sendingCode || submitting || Boolean(stepOneError)} type="submit">{sendingCode ? "发送验证码中..." : options.email_verification_enabled ? "下一步：验证邮箱" : submitting ? "注册中..." : "完成注册"}</button>
          </form>
        ) : (
          <form className="mt-6 grid gap-4" onSubmit={submitRegister}>
            <div className="rounded-2xl border border-border bg-bg-soft/70 px-4 py-3 text-sm text-dim">验证码已发送至 <span className="font-semibold text-text">{maskEmail(form.email.trim())}</span></div>
            <label><span className="ts-admin-label">verification code</span><input className="ts-admin-field text-center font-mono text-2xl tracking-[0.5em]" inputMode="numeric" maxLength={6} value={form.verification_code} onChange={(event) => updateField("verification_code", event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" autoFocus /></label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button className="ts-admin-action" disabled={sendingCode || cooldown > 0} onClick={sendCode} type="button">{cooldown > 0 ? `重新发送 (${cooldown}s)` : sendingCode ? "发送中..." : "重新发送"}</button>
              <button className="text-sm font-semibold text-dim hover:text-text" onClick={() => setStep(1)} type="button">← 返回修改信息</button>
            </div>
            <button className="ts-admin-action ts-admin-action-primary justify-center" disabled={submitting || form.verification_code.trim().length < 4} type="submit">{submitting ? "注册中..." : "完成注册并进入工作台"}</button>
          </form>
        )}

        <div className="mt-6 border-t border-border pt-5 text-center text-sm text-dim">已有账号？ <Link className="font-bold text-text hover:text-primary" to="/login">返回登录</Link></div>
      </div>
    </div>
  );
}
