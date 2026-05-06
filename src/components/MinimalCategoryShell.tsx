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
  contentClassName?: string;
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
  contentClassName,
  children,
}: MinimalCategoryShellProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fbfbfa] dark:bg-[#121212] p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 overflow-hidden rounded-[12px] border border-[#e9eae6] bg-white shadow-none">
        <div className="flex-shrink-0 border-b border-[#e9eae6] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-semibold tracking-tight text-[#1a1a1a]">{title}</h1>
              <p className="mt-1 text-[12px] text-[#646462] dark:text-[#a4a4a2]">{subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              {secondaryAction ? (
                <button
                  type="button"
                  onClick={secondaryAction.onClick}
                  disabled={secondaryAction.disabled}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-[#646462] transition-colors hover:text-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#c4c4c2] dark:hover:text-white"
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
                    'rounded-full px-5 py-2 text-[13px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40',
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

          <div className="mt-5 flex flex-wrap gap-5 border-t border-[#e9eae6] pt-4 text-[13px]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={[
                  'pb-2 text-[15px] font-semibold transition-colors border-b',
                  activeTab === tab.id
                    ? 'border-gray-950 text-[#1a1a1a] dark:border-white'
                    : 'border-transparent text-[#1a1a1a] hover:border-gray-400 hover:text-[#1a1a1a] dark:text-[#c4c4c2] dark:hover:border-gray-500 dark:hover:text-white',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-5 ${contentClassName || ''}`}>
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
    <section className="overflow-hidden rounded-[12px] border border-[#e9eae6] bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-[#e9eae6] px-5 py-4">
        <div className="flex items-center gap-3">
          {icon ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f8f8f7] text-[#1a1a1a]">
              <span className="material-symbols-outlined text-[18px]">{icon}</span>
            </div>
          ) : null}
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight text-[#1a1a1a]">{title}</h2>
            {subtitle ? <p className="text-[11px] text-[#646462] dark:text-[#a4a4a2]">{subtitle}</p> : null}
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
        <span className="text-[13px] font-medium text-[#1a1a1a]">{label}</span>
        <span className="text-[13px] font-semibold text-[#1a1a1a]">
          {value.toLocaleString()} / {max.toLocaleString()}
          {suffix ? <span className="ml-1 text-[#646462]">{suffix}</span> : null}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#f8f8f7] dark:bg-white/10">
        <div
          className="h-2 rounded-full bg-[#dc2626]"
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
  const base = 'inline-flex items-center justify-center rounded-full px-4 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const styles = {
    solid: 'bg-black text-white hover:bg-black/90',
    ghost: 'text-[#646462] hover:bg-[#f8f8f7] hover:text-[#1a1a1a] dark:text-[#c4c4c2] dark:hover:text-white',
    outline: 'border border-[#e9eae6] bg-white text-[#1a1a1a] hover:bg-[#f8f8f7]',
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
    neutral: 'bg-[#f8f8f7] text-[#1a1a1a] dark:bg-white/[0.06] dark:text-[#c4c4c2]',
    active: 'border border-[#e9eae6] bg-white text-[#1a1a1a]',
    subtle: 'bg-transparent text-[#646462] dark:text-[#a4a4a2]',
  } as const;

  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${styles[tone]}`}>{children}</span>;
}
