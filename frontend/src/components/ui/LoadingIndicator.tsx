type LoadingIndicatorProps = { label?: string }

export function LoadingIndicator({ label = 'Loading' }: LoadingIndicatorProps) {
  return <div className="loading-indicator" role="status"><span className="spinner" aria-hidden="true" />{label}</div>
}
