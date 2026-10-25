type EmptyStateProps = { title: string; description: string }

export function EmptyState({ title, description }: EmptyStateProps) {
  return <div className="empty-state"><span className="empty-state__rule" aria-hidden="true" /><h2>{title}</h2><p>{description}</p></div>
}
