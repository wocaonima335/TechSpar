import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  changeAdminPassword,
  getAdminSettings,
  updateAdminProfile,
  updateAdminSettings,
} from "../../api/admin";
import { useAuth } from "../../context/AuthContext";

const INITIAL_SETTINGS_FORM = {
  api_base: "",
  api_key: "",
  model: "",
};

export default function AdminSettings() {
  const navigate = useNavigate();
  const { currentUser, logout, updateCurrentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [settingsMeta, setSettingsMeta] = useState({ api_key_masked: "", api_key_configured: false });
  const [settingsForm, setSettingsForm] = useState(INITIAL_SETTINGS_FORM);
  const [profileForm, setProfileForm] = useState({
    username: currentUser?.username || "",
    display_name: currentUser?.display_name || "",
  });
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", confirm_password: "" });

  useEffect(() => {
    setProfileForm({
      username: currentUser?.username || "",
      display_name: currentUser?.display_name || "",
    });
  }, [currentUser]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const payload = await getAdminSettings();
        setSettingsMeta(payload);
        setSettingsForm({
          api_base: payload.api_base || "",
          api_key: "",
          model: payload.model || "",
        });
      } catch (err) {
        alert(`加载系统设置失败: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const hasProfileChanges = useMemo(() => {
    return (
      (profileForm.username || "") !== (currentUser?.username || "") ||
      (profileForm.display_name || "") !== (currentUser?.display_name || "")
    );
  }, [profileForm, currentUser]);

  const handleSaveSettings = async (event) => {
    event.preventDefault();
    setSavingSettings(true);
    try {
      const payload = {
        api_base: settingsForm.api_base.trim(),
        model: settingsForm.model.trim(),
      };
      if (settingsForm.api_key.trim()) {
        payload.api_key = settingsForm.api_key.trim();
      }
      const data = await updateAdminSettings(payload);
      setSettingsMeta(data);
      setSettingsForm({
        api_base: data.api_base || "",
        api_key: "",
        model: data.model || "",
      });
      alert("系统设置已保存并热更新生效");
    } catch (err) {
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
      if (nextUsername !== (currentUser?.username || "")) {
        payload.username = nextUsername;
      }
      if (nextDisplayName !== (currentUser?.display_name || "")) {
        payload.display_name = nextDisplayName;
      }
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
    <div className="flex-1 px-4 py-8 md:px-6 md:py-10 max-w-5xl mx-auto w-full">
      <div className="text-2xl md:text-[28px] font-display font-bold mb-6">系统设置</div>

      {loading ? (
        <div className="text-dim">加载中...</div>
      ) : (
        <div className="flex flex-col gap-6">
          <form className="bg-card border border-border rounded-2xl p-5 md:p-6" onSubmit={handleSaveSettings}>
            <div className="text-base font-semibold mb-4">模型与鉴权配置</div>
            <div className="grid grid-cols-1 gap-3">
              <input
                className="px-4 py-3 rounded-xl border border-border bg-input text-text"
                placeholder="Base URL"
                value={settingsForm.api_base}
                onChange={(event) => setSettingsForm((prev) => ({ ...prev, api_base: event.target.value }))}
              />
              <input
                className="px-4 py-3 rounded-xl border border-border bg-input text-text"
                placeholder="模型名"
                value={settingsForm.model}
                onChange={(event) => setSettingsForm((prev) => ({ ...prev, model: event.target.value }))}
              />
              <input
                className="px-4 py-3 rounded-xl border border-border bg-input text-text"
                placeholder={settingsMeta.api_key_masked || "留空表示保持当前 API Key"}
                value={settingsForm.api_key}
                onChange={(event) => setSettingsForm((prev) => ({ ...prev, api_key: event.target.value }))}
              />
            </div>
            <div className="text-xs text-dim mt-3">
              当前 API Key: {settingsMeta.api_key_configured ? settingsMeta.api_key_masked : "未配置"}
            </div>
            <button
              className={`mt-4 px-5 py-2.5 rounded-xl bg-accent text-white ${savingSettings ? "opacity-50" : ""}`}
              disabled={savingSettings || !settingsForm.api_base.trim() || !settingsForm.model.trim()}
              type="submit"
            >
              {savingSettings ? "保存中..." : "保存并热更新"}
            </button>
          </form>

          <form className="bg-card border border-border rounded-2xl p-5 md:p-6" onSubmit={handleSaveProfile}>
            <div className="text-base font-semibold mb-4">管理员账号</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                className="px-4 py-3 rounded-xl border border-border bg-input text-text"
                placeholder="用户名"
                value={profileForm.username}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, username: event.target.value }))}
              />
              <input
                className="px-4 py-3 rounded-xl border border-border bg-input text-text"
                placeholder="显示名"
                value={profileForm.display_name}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, display_name: event.target.value }))}
              />
            </div>
            <div className="text-xs text-dim mt-3">修改用户名后会要求重新登录。</div>
            <button
              className={`mt-4 px-5 py-2.5 rounded-xl bg-accent text-white ${savingProfile ? "opacity-50" : ""}`}
              disabled={savingProfile || !profileForm.username.trim() || !profileForm.display_name.trim() || !hasProfileChanges}
              type="submit"
            >
              {savingProfile ? "保存中..." : "保存账号信息"}
            </button>
          </form>

          <form className="bg-card border border-border rounded-2xl p-5 md:p-6" onSubmit={handleChangePassword}>
            <div className="text-base font-semibold mb-4">修改管理员密码</div>
            <div className="grid grid-cols-1 gap-3">
              <input
                className="px-4 py-3 rounded-xl border border-border bg-input text-text"
                type="password"
                placeholder="当前密码"
                value={passwordForm.current_password}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, current_password: event.target.value }))}
              />
              <input
                className="px-4 py-3 rounded-xl border border-border bg-input text-text"
                type="password"
                placeholder="新密码（至少 6 位）"
                value={passwordForm.new_password}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, new_password: event.target.value }))}
              />
              <input
                className="px-4 py-3 rounded-xl border border-border bg-input text-text"
                type="password"
                placeholder="确认新密码"
                value={passwordForm.confirm_password}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirm_password: event.target.value }))}
              />
            </div>
            <div className="text-xs text-dim mt-3">密码更新成功后会立即要求重新登录。</div>
            <button
              className={`mt-4 px-5 py-2.5 rounded-xl bg-accent text-white ${savingPassword ? "opacity-50" : ""}`}
              disabled={
                savingPassword ||
                !passwordForm.current_password ||
                !passwordForm.new_password ||
                !passwordForm.confirm_password
              }
              type="submit"
            >
              {savingPassword ? "保存中..." : "更新密码"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
