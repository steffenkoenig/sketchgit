"use client";
import React from "react";
import { logger } from "@/lib/sketchgit/logger";
import { ErrorFallback } from "./ErrorFallback";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class TimelineErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.resetError = this.resetError.bind(this);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    void logger.warn("TimelineErrorBoundary caught error", {
      error,
      componentStack: errorInfo.componentStack
    });
  }

  resetError() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ height: "100%", width: "100%" }}>
          <ErrorFallback error={this.state.error} resetError={this.resetError} titleKey="errors.timelineError" inline />
        </div>
      );
    }

    return this.props.children;
  }
}
