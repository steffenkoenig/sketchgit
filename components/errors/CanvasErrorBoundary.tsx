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

export class CanvasErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.resetError = this.resetError.bind(this);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error({
      error,
      componentStack: errorInfo.componentStack
    }, "CanvasErrorBoundary caught error");
  }

  resetError() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <ErrorFallback error={this.state.error} resetError={this.resetError} titleKey="errors.canvasError" inline />
        </div>
      );
    }

    return this.props.children;
  }
}
