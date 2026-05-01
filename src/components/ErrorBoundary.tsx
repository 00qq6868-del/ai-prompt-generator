"use client";

import { Component, type ReactNode } from "react";
import { trackError } from "@/lib/analytics";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    trackError(error.message, info.componentStack ?? undefined);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="flex justify-center mb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle size={28} className="text-red-400" />
            </div>
          </div>

          <h2 className="text-xl font-bold text-white mb-2">
            页面出现了问题
          </h2>
          <p className="text-white/40 text-sm mb-1">
            Something went wrong
          </p>
          <p className="text-white/25 text-xs mb-6 break-all">
            {this.state.error}
          </p>

          <div className="flex justify-center gap-3">
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <RefreshCw size={14} />
              重试 Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white/60 text-sm hover:bg-white/15 transition-all"
            >
              刷新页面 Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
