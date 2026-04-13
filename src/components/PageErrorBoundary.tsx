import React, { Component } from 'react';

interface Props {
  children: React.ReactNode;
  page: string;
}

interface State {
  error: Error | null;
}

export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    const self = this as any;
    if (prevProps.page !== self.props.page && this.state.error) {
      self.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return (this as any).props.children;

    return (
      <div className="flex-1 flex items-center justify-center bg-background-light dark:bg-background-dark p-8">
        <div className="max-w-lg rounded-lg border border-red-100 bg-white p-6 shadow-card dark:border-red-900/40 dark:bg-card-dark">
          <div className="flex items-center gap-3 mb-3">
            <span className="material-symbols-outlined text-red-500">error</span>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">This page could not be loaded</h1>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            The rest of the workspace is still available. Switch pages or retry after fixing the issue.
          </p>
          <pre className="max-h-40 overflow-auto rounded bg-gray-50 p-3 text-xs text-red-700 dark:bg-gray-900/40 dark:text-red-300">
            {this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}
