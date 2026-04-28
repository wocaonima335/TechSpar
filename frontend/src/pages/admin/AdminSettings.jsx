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

const INITIAL_SETTINGS_FORM = { api_base: "", api_key: "", model: "" };

export default function AdminSettings() {
  const navigate = useNavigate();
  const { currentUser, logout, updateCurrentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [testingSettings, setTestingSettings] = useState(false);
  const [settingsTestResult, setSettingsTestResult] = useState(null);
  const [settingsMeta, setSettingsMeta] = useState({ api_key_masked: "", api_key_configured: false });
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
        setSettingsForm({ api_base: payload.api_base || "", api_key: "", model: payload.model || "" });
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
    const payload = { api_base: settingsForm.api_base.trim(), model: settingsForm.model.trim() };
    if (settingsForm.api_key.trim()) payload.api_key = settingsForm.api_key.trim();
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

  const handleSaveSettings = async (event) => {
    event.preventDefault();
    setSavingSettings(true);
    try {
      const data = await updateAdminSettings(buildSettingsPayload());
      setSettingsMeta(data);
      setSettingsForm({ api_base: data.api_base || "", api_key: "", model: data.model || "" });
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
      subtitle="仅暴露模型、Base URL 与 API Key 管理；敏感密钥保持掩码显示，保存后热更新。"
      stats={[{ label: "model", value: settingsForm.model || "--" }, { label: "api key", value: settingsMeta.api_key_configured ? "set" : "empty" }, { label: "user", value: currentUser?.username || "--" }]}
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
