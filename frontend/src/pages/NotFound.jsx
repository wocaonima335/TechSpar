import { useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="ts-page flex items-center justify-center">
      <div className="glass-card w-full max-w-xl rounded-[2rem] px-6 py-12 text-center md:px-10 md:py-14">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-border bg-surface text-2xl text-accent-light">
          404
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-text md:text-4xl">页面不存在</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-dim">
          你访问的页面可能已移除、地址有误，或当前账号没有访问权限。可以返回训练首页，或直接开始新的面试练习。
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button className="ts-btn ts-btn-primary" onClick={() => navigate("/")} type="button">
            返回首页
          </button>
          <button className="ts-btn ts-btn-secondary" onClick={() => navigate("/history")} type="button">
            查看历史记录
          </button>
        </div>
      </div>
    </div>
  );
}
