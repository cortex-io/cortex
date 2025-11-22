/**
 * Error Boundary component for catching and displaying errors
 * Follows React best practices for error handling
 */

import React, { Component, ErrorInfo, ReactNode } from 'react'
import {
  EuiEmptyPrompt,
  EuiButton,
  EuiButtonEmpty,
  EuiPanel,
  EuiText,
  EuiSpacer,
  EuiCode,
} from '@elastic/eui'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })

    // Log error for debugging
    console.error('Error caught by boundary:', error, errorInfo)

    // Call optional error handler (e.g., for Sentry)
    this.props.onError?.(error, errorInfo)

    // Future: Send to Sentry
    // if (typeof Sentry !== 'undefined') {
    //   Sentry.captureException(error, {
    //     extra: { componentStack: errorInfo.componentStack }
    //   })
    // }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <EuiPanel paddingSize="l" hasBorder>
          <EuiEmptyPrompt
            iconType="alert"
            iconColor="danger"
            title={<h2>Something went wrong</h2>}
            body={
              <>
                <EuiText>
                  <p>
                    An unexpected error occurred while rendering this component.
                    Please try again or reload the page.
                  </p>
                </EuiText>

                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <>
                    <EuiSpacer size="m" />
                    <EuiText size="s" color="subdued">
                      <p><strong>Error:</strong></p>
                      <EuiCode>{this.state.error.message}</EuiCode>
                    </EuiText>

                    {this.state.errorInfo && (
                      <>
                        <EuiSpacer size="s" />
                        <EuiText size="xs" color="subdued">
                          <p><strong>Component Stack:</strong></p>
                          <pre style={{
                            maxHeight: '200px',
                            overflow: 'auto',
                            fontSize: '10px',
                            background: '#f5f7fa',
                            padding: '8px',
                            borderRadius: '4px'
                          }}>
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </EuiText>
                      </>
                    )}
                  </>
                )}
              </>
            }
            actions={[
              <EuiButton
                key="retry"
                color="primary"
                onClick={this.handleRetry}
              >
                Try Again
              </EuiButton>,
              <EuiButtonEmpty
                key="reload"
                onClick={this.handleReload}
              >
                Reload Page
              </EuiButtonEmpty>,
            ]}
          />
        </EuiPanel>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
