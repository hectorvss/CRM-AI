import React from 'react';

interface LoadingStateProps {
  title?: string;
  message?: string;
  compact?: boolean;
}

export default function LoadingState({
  title = 'Loading',
  message = 'Please wait while we fetch the latest data.',
  compact = false,
}: LoadingStateProps) {
  return (
    <div className={`flex items-center justify-center ${compact ? 'py-10' : 'flex-1 min-h-[320px]'} px-6`}>
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-4 border-gray-200 border-t-secondary animate-spin dark:border-gray-700 dark:border-t-secondary" />
          <div className="absolute inset-0 rounded-full border border-secondary/10" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{message}</p>
        </div>
      </div>
    </div>
  );
}
