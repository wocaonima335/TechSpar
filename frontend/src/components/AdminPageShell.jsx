export default function AdminPageShell({ kicker, title, subtitle, stats = [], children }) {
  return (
    <div className="ts-admin-shell">
      <div className="ts-admin-hero">
        <div>
          <div className="ts-kicker">{kicker}</div>
          <h1 className="ts-page-title">{title}</h1>
          {subtitle ? <p className="ts-page-subtitle">{subtitle}</p> : null}
        </div>
        {stats.length > 0 && (
          <div className="grid w-full gap-3 sm:grid-cols-3 md:w-auto md:min-w-[360px]">
            {stats.map((item) => (
              <div key={item.label} className="ts-stat-card text-center">
                <div className="ts-stat-value">{item.value}</div>
                <div className="ts-stat-label">{item.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function AdminSection({ title, description, children, actions }) {
  return (
    <section className="ts-admin-card p-5 md:p-6">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-text">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-6 text-dim">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function AdminEmptyState({ children }) {
  return <div className="ts-empty-state">{children}</div>;
}
