import { Component, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) { return { error } }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-paper px-4">
          <div className="max-w-md rounded-xl border border-line bg-surface p-6 text-center shadow-card">
            <h1 className="font-display text-xl font-semibold text-ink">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate2">{this.state.error.message}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.assign('/') }}
              className="mt-4 rounded-lg bg-moss px-4 py-2 text-sm font-medium text-paper"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
