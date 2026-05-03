import React, { Component, ErrorInfo } from 'react';

interface Props {
  children: React.ReactNode;
  /**
   * Page identifier. When this changes the boundary resets — e.g. after the
   * user navigates to another route, errors thrown by a previous page
   * shouldn't keep the new page from rendering.
   */
  page: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors thrown by any child in the tree and surfaces a
 * friendly fallback UI so a single broken component does not blank the whole
 * application. All caught errors are logged via `console.error` so they show
 * up in the browser DevTools / log aggregator.
 *
 * Two recovery actions are exposed:
 *   - "Try again" clears the boundary state, re-rendering children.
 *   - "Reload" performs a hard refresh (covers cases where module state is
 *     wedged, e.g. after a failed lazy-load).
 */
export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // ALWAYS surface to console so production logs / DevTools show the full
    // stack — silent failures are the worst possible UX in a SPA.
    const self = this as any;
    console.error('[PageErrorBoundary] caught error', {
      page: self.props?.page,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(prevProps: Props) {
    const self = this as any;
    if (prevProps.page !== self.props.page && this.state.error) {
      self.setState({ error: null });
    }
  }

  private handleRetry = () => {
    (this as any).setState({ error: null });
  };

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    const { error } = this.state;
    const self = this as any;
    if (!error) return self.props.children;

    return (
      <div className="flex-1 flex items-center justify-center bg-background-light dark:bg-background-dark p-8">
        <div className="max-w-lg w-full rounded-lg border border-red-100 bg-white p-6 shadow-card dark:border-red-900/40 dark:bg-card-dark">
          <div className="flex items-center gap-3 mb-3">
            <span className="material-symbols-outlined text-red-500">error</span>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Algo salió mal
            </h1>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Esta sección no se pudo cargar. Puedes reintentar o recargar la
            aplicación. El resto del workspace sigue disponible.
          </p>
          <pre className="mb-4 max-h-40 overflow-auto rounded bg-gray-50 p-3 text-xs text-red-700 dark:bg-gray-900/40 dark:text-red-300">
            {error.message || 'Unknown error'}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Recargar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
