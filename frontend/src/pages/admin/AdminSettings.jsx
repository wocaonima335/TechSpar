import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  changeAdminPassword,
  getAdminSettings,
  testAdminSettings,
  updateAdminProfile,
  updateAdminSettings,
} from "../../api/admin";
import AdminPageShell, { AdminEmptyState, AdminSection } from "../../components/AdminPageShell";
import { useAuth } from "../../context/useAuth";

const INITIAL_SETTINGS_FORM = {
  api_base: "",
  api_key: "",
  model: "",
  registration_enabled: false,
  email_verification_enabled: true,
  invitation_code_enabled: false,
  invitation_code: "",
  smtp_server: "",
  smtp_port: 465,
  smtp_account: "",
  smtp_from: "",
  smtp_token: "",
  smtp_ssl_enabled: true,
  smtp_force_auth_login: false,
};

export default function AdminSettings() {
  const navigate = useNavigate();
  const { currentUser, logout, updateCurrentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [testingSettings, setTestingSettings] = useState(false);
  const [settingsTestResult, setSettingsTestResult] = useState(null);
  const [settingsMeta, setSettingsMeta] = useState({ api_key_masked: "", api_key_configured: false, invitation_code_masked: "", invitation_code_configured: false });
  const [settingsForm, setSettingsForm] = useState(INITIAL_SETTINGS_FORM);
  const [profileForm, setProfileForm] = useState({ username: currentUser?.username || "", display_name: currentUser?.display_name || "" });
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", confirm_password: "" });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProfileForm({ username: currentUser?.username || "", display_name: currentUser?.display_name || "" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentUser]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const payload = await getAdminSettings();
        setSettingsMeta(payload);
        setSettingsForm({
          api_base: payload.api_base || "",
          api_key: "",
          model: payload.model || "",
          registration_enabled: Boolean(payload.registration_enabled),
          email_verification_enabled: payload.email_verification_enabled !== false,
          invitation_code_enabled: Boolean(payload.invitation_code_enabled),
          invitation_code: "",
          smtp_server: payload.smtp_server || "",
          smtp_port: payload.smtp_port || 465,
          smtp_account: payload.smtp_account || "",
          smtp_from: payload.smtp_from || "",
          smtp_token: "",
          smtp_ssl_enabled: payload.smtp_ssl_enabled !== false,
          smtp_force_auth_login: Boolean(payload.smtp_force_auth_login),
        });
      } catch (err) {
        alert(`加载系统设置失败: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const hasProfileChanges = useMemo(() => (
    (profileForm.username || "") !== (currentUser?.username || "") ||
    (profileForm.display_name || "") !== (currentUser?.display_name || "")
  ), [profileForm, currentUser]);

  const buildSettingsPayload = () => {
    const payload = {
      api_base: settingsForm.api_base.trim(),
      model: settingsForm.model.trim(),
      registration_enabled: Boolean(settingsForm.registration_enabled),
      email_verification_enabled: Boolean(settingsForm.email_verification_enabled),
      invitation_code_enabled: Boolean(settingsForm.invitation_code_enabled),
      smtp_server: settingsForm.smtp_server.trim(),
      smtp_port: Number(settingsForm.smtp_port) || 465,
      smtp_account: settingsForm.smtp_account.trim(),
      smtp_from: settingsForm.smtp_from.trim(),
      smtp_ssl_enabled: Boolean(settingsForm.smtp_ssl_enabled),
      smtp_force_auth_login: Boolean(settingsForm.smtp_force_auth_login),
    };
    if (settingsForm.api_key.trim()) payload.api_key = settingsForm.api_key.trim();
    if (settingsForm.smtp_token.trim()) payload.smtp_token = settingsForm.smtp_token.trim();
    if (settingsForm.invitation_code.trim()) payload.invitation_code = settingsForm.invitation_code.trim();
    return payload;
  };

  const updateSettingsField = (field, value) => {
    setSettingsTestResult(null);
    setSettingsForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleTestSettings = async () => {
    setTestingSettings(true);
    setSettingsTestResult(null);
    try {
      const result = await testAdminSettings(buildSettingsPayload());
      setSettingsTestResult({ ...result, ok: true });
    } catch (err) {
      setSettingsTestResult({ ok: false, message: err.message });
    } finally {
      setTestingSettings(false);
    }
  };

  const validateSettingsPayload = (payload) => {
    if (payload.invitation_code_enabled && !settingsMeta.invitation_code_configured && !settingsForm.invitation_code.trim()) {
      return "邀请码已启用但尚未设置，请填写邀请码或关闭启用邀请码。";
    }
    if (payload.email_verification_enabled) {
      if (!payload.smtp_server || !payload.smtp_account || !payload.smtp_from) {
        return "邮箱验证码已启用，请先补全 SMTP server、account 和 from。";
      }
      if (!settingsMeta.smtp_token_configured && !settingsForm.smtp_token.trim()) {
        return "邮箱验证码已启用但 SMTP Token 尚未配置，请填写 SMTP Token。";
      }
    }
    if (payload.smtp_port < 1 || payload.smtp_port > 65535) {
      return "SMTP 端口号须在 1-65535 之间。";
    }
    return "";
  };

  const handleSaveSettings = async (event) => {
    event?.preventDefault?.();
    const payload = buildSettingsPayload();
    const validationError = validateSettingsPayload(payload);
    if (validationError) {
      setSettingsTestResult({ ok: false, message: validationError });
      alert(validationError);
      return;
    }
    setSavingSettings(true);
    try {
      const data = await updateAdminSettings(payload);
      setSettingsMeta(data);
      setSettingsForm({
        api_base: data.api_base || "",
        api_key: "",
        model: data.model || "",
        registration_enabled: Boolean(data.registration_enabled),
        email_verification_enabled: data.email_verification_enabled !== false,
        invitation_code_enabled: Boolean(data.invitation_code_enabled),
        invitation_code: "",
        smtp_server: data.smtp_server || "",
        smtp_port: data.smtp_port || 465,
        smtp_account: data.smtp_account || "",
        smtp_from: data.smtp_from || "",
        smtp_token: "",
        smtp_ssl_enabled: data.smtp_ssl_enabled !== false,
        smtp_force_auth_login: Boolean(data.smtp_force_auth_login),
      });
      setSettingsTestResult({ ok: true, message: "保存成功，热更新已生效" });
      alert("系统设置已保存并热更新生效");
    } catch (err) {
      setSettingsTestResult({ ok: false, message: err.message });
      alert(`保存系统设置失败: ${err.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const payload = {};
      const nextUsername = profileForm.username.trim();
      const nextDisplayName = profileForm.display_name.trim();
      if (nextUsername !== (currentUser?.username || "")) payload.username = nextUsername;
      if (nextDisplayName !== (currentUser?.display_name || "")) payload.display_name = nextDisplayName;
      const result = await updateAdminProfile(payload);
      if (result.reauth_required) {
        alert("管理员用户名已更新，请重新登录");
        logout();
        navigate("/login", { replace: true });
        return;
      }
      updateCurrentUser(result.user);
      alert("账号信息已更新");
    } catch (err) {
      alert(`更新账号信息失败: ${err.message}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      alert("两次输入的新密码不一致");
      return;
    }
    setSavingPassword(true);
    try {
      await changeAdminPassword(passwordForm.current_password, passwordForm.new_password);
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      alert("密码已更新，请重新登录");
      logout();
      navigate("/login", { replace: true });
    } catch (err) {
      alert(`修改密码失败: ${err.message}`);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <AdminPageShell
      kicker="Phase 3 · System settings"
      title="系统设置"
      subtitle="管理模型连接、邮箱注册、邀请码与 SMTP 发信配置；敏感密钥保持掩码显示，保存后热更新。"
      stats={[{ label: "model", value: settingsForm.model || "--" }, { label: "registration", value: settingsForm.registration_enabled ? "open" : "closed" }, { label: "invite", value: settingsMeta.invitation_code_configured ? "set" : "empty" }, { label: "smtp", value: settingsMeta.smtp_token_configured ? "set" : "empty" }]}
    >
      {loading ? <AdminEmptyState>正在加载系统设置...</AdminEmptyState> : (
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <AdminSection title="模型与鉴权配置" description="一期范围只允许配置 model、base_url、api_key；留空 API Key 表示保持当前值。">
            <form className="grid gap-4" onSubmit={handleSaveSettings}>
              <label><span className="ts-admin-label">base url</span><input className="ts-admin-field" placeholder="Base URL" value={settingsForm.api_base} onChange={(event) => updateSettingsField("api_base", event.target.value)} /></label>
              <label><span className="ts-admin-label">model</span><input className="ts-admin-field" placeholder="模型名" value={settingsForm.model} onChange={(event) => updateSettingsField("model", event.target.value)} /></label>
              <label><span className="ts-admin-label">api key</span><input className="ts-admin-field" type="password" placeholder={settingsMeta.api_key_masked || "留空表示保持当前 API Key"} value={settingsForm.api_key} onChange={(event) => updateSettingsField("api_key", event.target.value)} /></label>
              <div className="rounded-2xl border border-border bg-surface/70 px-4 py-3 text-sm text-dim">当前 API Key: <span className="font-mono text-text">{settingsMeta.api_key_configured ? settingsMeta.api_key_masked : "未配置"}</span></div>
              {settingsTestResult ? <div role="status" className={`rounded-2xl border px-4 py-3 text-sm ${settingsTestResult.ok ? "border-green/40 bg-green/10 text-green" : "border-red/40 bg-red/10 text-red"}`}><div className="font-bold">{settingsTestResult.ok ? "连接测试通过" : "连接测试失败"}</div><div className="mt-1 break-all">{settingsTestResult.message}</div>{settingsTestResult.response_preview ? <div className="mt-1 text-xs opacity-80">响应预览: {settingsTestResult.response_preview}</div> : null}</div> : null}
              <div className="flex flex-wrap gap-3">
                <button className="ts-admin-action" disabled={testingSettings || savingSettings || !settingsForm.api_base.trim() || !settingsForm.model.trim()} onClick={handleTestSettings} type="button">{testingSettings ? "测试中..." : "测试连接"}</button>
                <button className="ts-admin-action ts-admin-action-primary" disabled={savingSettings || testingSettings || !settingsForm.api_base.trim() || !settingsForm.model.trim()} type="submit">{savingSettings ? "保存中..." : "保存并热更新"}</button>
              </div>
            </form>
          </AdminSection>

          <div className="space-y-6">
            <AdminSection title="注册、邀请码与邮件验证" description="开放注册后，用户可通过邮箱验证码自助创建普通账号；启用邀请码后，注册时还必须填写正确的邀请码。">
              <div className="grid gap-4">
                <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-bg-soft/60 px-4 py-3"><span><span className="block text-sm font-bold text-text">开放用户注册</span><span className="text-xs text-dim">关闭后登录页不展示注册链接，/register 显示关闭提示。</span></span><input checked={settingsForm.registration_enabled} className="h-5 w-5 accent-primary" onChange={(event) => updateSettingsField("registration_enabled", event.target.checked)} type="checkbox" /></label>
                <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-bg-soft/60 px-4 py-3"><span><span className="block text-sm font-bold text-text">启用邮箱验证码</span><span className="text-xs text-dim">启用后注册前必须先发送并填写邮箱验证码。</span></span><input checked={settingsForm.email_verification_enabled} className="h-5 w-5 accent-primary" onChange={(event) => updateSettingsField("email_verification_enabled", event.target.checked)} type="checkbox" /></label>
                <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-bg-soft/60 px-4 py-3"><span><span className="block text-sm font-bold text-text">启用邀请码</span><span className="text-xs text-dim">启用后注册页显示邀请码输入框，后端校验通过才允许创建账号。</span></span><input checked={settingsForm.invitation_code_enabled} className="h-5 w-5 accent-primary" onChange={(event) => updateSettingsField("invitation_code_enabled", event.target.checked)} type="checkbox" /></label>
                <label>
                  <span className="ts-admin-label">invitation code</span>
                  <input className="ts-admin-field font-mono tracking-[0.18em]" type="password" placeholder={settingsMeta.invitation_code_masked || "输入新的邀请码"} value={settingsForm.invitation_code} onChange={(event) => updateSettingsField("invitation_code", event.target.value)} />
                  <span className="mt-1 block text-xs text-dim">{settingsMeta.invitation_code_configured ? `当前已配置（${settingsMeta.invitation_code_masked}），留空则保持不变；填写新值则覆盖。` : "尚未配置，填写后点击本模块下方的保存设置即可启用。"}</span>
                </label>
                <div className="rounded-2xl border border-border bg-surface/70 px-4 py-3 text-sm text-dim">当前邀请码: <span className="font-mono text-text">{settingsMeta.invitation_code_configured ? settingsMeta.invitation_code_masked : "未配置"}</span></div>
                <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                  <label><span className="ts-admin-label">smtp server</span><input className="ts-admin-field" placeholder="smtp.example.com" value={settingsForm.smtp_server} onChange={(event) => updateSettingsField("smtp_server", event.target.value)} /></label>
                  <label><span className="ts-admin-label">port</span><input className="ts-admin-field" type="number" min="1" max="65535" value={settingsForm.smtp_port} onChange={(event) => updateSettingsField("smtp_port", event.target.value)} /></label>
                </div>
                <label><span className="ts-admin-label">smtp account</span><input className="ts-admin-field" placeholder="noreply@example.com" value={settingsForm.smtp_account} onChange={(event) => updateSettingsField("smtp_account", event.target.value)} /></label>
                <label><span className="ts-admin-label">smtp from</span><input className="ts-admin-field" placeholder="TechSpar <noreply@example.com>" value={settingsForm.smtp_from} onChange={(event) => updateSettingsField("smtp_from", event.target.value)} /></label>
                <label>
                  <span className="ts-admin-label">smtp token</span>
                  <input className="ts-admin-field" type="password" placeholder={settingsMeta.smtp_token_masked || "输入新的 SMTP Token"} value={settingsForm.smtp_token} onChange={(event) => updateSettingsField("smtp_token", event.target.value)} />
                  <span className="mt-1 block text-xs text-dim">{settingsMeta.smtp_token_configured ? `当前已配置（${settingsMeta.smtp_token_masked}），留空则保持不变；填写新值则覆盖。` : "尚未配置，填写后保存即可启用。"}</span>
                </label>
                <div className="rounded-2xl border border-border bg-surface/70 px-4 py-3 text-sm text-dim">当前 SMTP Token: <span className="font-mono text-text">{settingsMeta.smtp_token_configured ? settingsMeta.smtp_token_masked : "未配置"}</span></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-2xl border border-border bg-bg-soft/60 px-4 py-3 text-sm text-dim"><input checked={settingsForm.smtp_ssl_enabled} className="h-4 w-4 accent-primary" onChange={(event) => updateSettingsField("smtp_ssl_enabled", event.target.checked)} type="checkbox" />启用 SSL/TLS</label>
                  <label className="flex items-center gap-3 rounded-2xl border border-border bg-bg-soft/60 px-4 py-3 text-sm text-dim"><input checked={settingsForm.smtp_force_auth_login} className="h-4 w-4 accent-primary" onChange={(event) => updateSettingsField("smtp_force_auth_login", event.target.checked)} type="checkbox" />强制 AUTH LOGIN</label>
                </div>
                {settingsTestResult ? <div role="status" className={`rounded-2xl border px-4 py-3 text-sm ${settingsTestResult.ok ? "border-green/40 bg-green/10 text-green" : "border-red/40 bg-red/10 text-red"}`}><div className="font-bold">{settingsTestResult.ok ? "保存状态" : "保存失败"}</div><div className="mt-1 break-all">{settingsTestResult.message}</div></div> : null}
                <button className="ts-admin-action ts-admin-action-primary w-fit" disabled={savingSettings || testingSettings} onClick={handleSaveSettings} type="button">{savingSettings ? "保存中..." : "保存注册 / 邀请码 / SMTP 设置"}</button>
              </div>
            </AdminSection>

            <AdminSection title="管理员账号" description="修改用户名后会要求重新登录。">
              <form className="grid gap-4" onSubmit={handleSaveProfile}>
                <label><span className="ts-admin-label">username</span><input className="ts-admin-field" placeholder="用户名" value={profileForm.username} onChange={(event) => setProfileForm((prev) => ({ ...prev, username: event.target.value }))} /></label>
                <label><span className="ts-admin-label">display name</span><input className="ts-admin-field" placeholder="显示名" value={profileForm.display_name} onChange={(event) => setProfileForm((prev) => ({ ...prev, display_name: event.target.value }))} /></label>
                <button className="ts-admin-action ts-admin-action-primary w-fit" disabled={savingProfile || !profileForm.username.trim() || !profileForm.display_name.trim() || !hasProfileChanges} type="submit">{savingProfile ? "保存中..." : "保存账号信息"}</button>
              </form>
            </AdminSection>

            <AdminSection title="修改管理员密码" description="密码更新成功后会立即要求重新登录。">
              <form className="grid gap-4" onSubmit={handleChangePassword}>
                <label><span className="ts-admin-label">current password</span><input className="ts-admin-field" type="password" placeholder="当前密码" value={passwordForm.current_password} onChange={(event) => setPasswordForm((prev) => ({ ...prev, current_password: event.target.value }))} /></label>
                <label><span className="ts-admin-label">new password</span><input className="ts-admin-field" type="password" placeholder="新密码（至少 6 位）" value={passwordForm.new_password} onChange={(event) => setPasswordForm((prev) => ({ ...prev, new_password: event.target.value }))} /></label>
                <label><span className="ts-admin-label">confirm password</span><input className="ts-admin-field" type="password" placeholder="确认新密码" value={passwordForm.confirm_password} onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirm_password: event.target.value }))} /></label>
                <button className="ts-admin-action ts-admin-action-danger w-fit" disabled={savingPassword || !passwordForm.current_password || !passwordForm.new_password || !passwordForm.confirm_password} type="submit">{savingPassword ? "保存中..." : "更新密码"}</button>
              </form>
            </AdminSection>
          </div>
        </div>
      )}
    </AdminPageShell>
  );
}
