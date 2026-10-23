"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { MaintenanceScreen } from "./maintenance-screen";

interface Props {
  children?: ReactNode;
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * @fileOverview ViMore Diagnostic Error Boundary
 * Catch and disclose terminal client-side exceptions with specific error nodes.
 */
export class DiagnosticErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught spatial error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return <MaintenanceScreen />;
    }

    return this.props.children;
  }
}
