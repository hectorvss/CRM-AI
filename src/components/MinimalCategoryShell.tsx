import React from 'react';

export type MinimalTab = {
  id: string;
  label: string;
};

type ActionButton = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'ghost';
};

type MinimalCategoryShellProps = {
  title: string;
  subtitle: string;
  tabs: MinimalTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  primaryAction?: ActionButton;
  secondaryAction?: ActionButton;
  children: React.ReactNode;
};

export function MinimalCategoryShell({
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  primaryAction,
  secondaryAction,
  children,
}: MinimalCategoryShellProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fbfbfa] dark:bg-[#121212] p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-none dark:border-white/10 dark:bg-[#171717]">
        <div className="flex-shrink-0 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight text-gray-950 dark:text-white">{title}</h1>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              {secondaryAction ? (
                <button
                  type="button"
                  onClick={secondaryAction.onClick}
                  disabled={secondaryAction.disabled}
                  className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:text-white"
                >
                  {secondaryAction.label}
                </button>
              ) : null}
              {primaryAction ? (
                <button
                  type="button"
                  onClick={primaryAction.onClick}
                  disabled={primaryAction.disabled}
                  className={[
                    'rounded-full px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40',
                    primaryAction.tone === 'ghost'
                      ? 'bg-black/90 hover:bg-black'
                      : 'bg-black hover:bg-black/90',
                  ].join(' ')}
                >
                  {primaryAction.label}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-5 border-t border-black/5 pt-4 text-sm dark:border-white/10">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={[
                  'pb-2 transition-colors border-b',
                  activeTab === tab.id
                    ? 'border-gray-950 text-gray-950 dark:border-white dark:text-white'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-950 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-white',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export function MinimalCard({
  title,
  subtitle,
  icon,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-black/5 bg-white dark:border-white/10 dark:bg-[#1b1b1b]">
      <div className="flex items-center justify-between gap-4 border-b border-black/5 px-5 py-4 dark:border-white/10">
        <div className="flex items-center gap-3">
          {icon ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-gray-700 dark:bg-white/5 dark:text-gray-200">
              <span className="material-symbols-outlined text-[18px]">{icon}</span>
            </div>
          ) : null}
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-gray-950 dark:text-white">{title}</h2>
            {subtitle ? <p className="text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
          </div>
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function MinimalProgressBar({
  label,
  value,
  max,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
}) {
  const pct = Math.min((value / Math.max(max, 1)) * 100, 100);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          {value.toLocaleString()} / {max.toLocaleString()}
          {suffix ? <span className="ml-1 text-gray-500">{suffix}</span> : null}
        </span>
      </div>
      <div className="h-2 rounded-full bg-black/5 dark:bg-white/10">
        <div
          className="h-2 rounded-full bg-violet-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function MinimalButton({
  children,
  onClick,
  disabled,
  variant = 'solid',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'ghost' | 'outline';
}) {
  const base = 'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const styles = {
    solid: 'bg-black text-white hover:bg-black/90',
    ghost: 'text-gray-600 hover:bg-black/5 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white',
    outline: 'border border-black/10 bg-white text-gray-900 hover:bg-black/5 dark:border-white/10 dark:bg-[#171717] dark:text-white dark:hover:bg-white/5',
  } as const;

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]}`}>
      {children}
    </button>
  );
}

export function MinimalPill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'active' | 'subtle';
}) {
  const styles = {
    neutral: 'bg-black/[0.03] text-gray-700 dark:bg-white/[0.06] dark:text-gray-300',
    active: 'border border-black/10 bg-white text-gray-900 dark:border-white/10 dark:bg-[#171717] dark:text-white',
    subtle: 'bg-transparent text-gray-500 dark:text-gray-400',
  } as const;

  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${styles[tone]}`}>{children}</span>;
}
