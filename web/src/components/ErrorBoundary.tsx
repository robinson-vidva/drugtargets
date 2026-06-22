import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

/** Catches render errors so one bad record can't blank the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="state">
          <div className="error-box">
            Something went wrong rendering this view.{' '}
            <a href="/" onClick={() => this.setState({ error: null })}>Back home</a>.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
