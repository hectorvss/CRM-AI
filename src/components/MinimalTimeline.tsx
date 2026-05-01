import React from 'react';

type TimelineEvent = {
  id: string;
  content: string;
  time?: string;
  system?: string;
};

type MinimalTimelineProps = {
  title: string;
  events: TimelineEvent[];
};

export default function MinimalTimeline({ title, events }: MinimalTimelineProps) {
  return (
    <div>
      <h3 className="mb-4 text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
      <div className="space-y-4">
        {events.map((event, idx) => (
          <div key={event.id} className="relative flex gap-4">
            {idx !== events.length - 1 ? (
              <div className="absolute left-[5px] top-3 bottom-[-18px] w-px bg-black/8 dark:bg-white/10" />
            ) : null}
            <div className="relative z-10 mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
            <div className="flex-1 border-b border-black/5 pb-4 dark:border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-6 text-gray-900 dark:text-white">{event.content}</p>
                  {event.system ? (
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                      {event.system}
                    </p>
                  ) : null}
                </div>
                {event.time ? (
                  <span className="whitespace-nowrap text-xs text-gray-400 dark:text-gray-500">{event.time}</span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
