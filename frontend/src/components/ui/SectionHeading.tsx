type SectionHeadingProps = { title: string; description?: string; level?: 'page' | 'section' }

export function SectionHeading({ title, description, level = 'section' }: SectionHeadingProps) {
  const Heading = level === 'page' ? 'h1' : 'h2'
  return <div className={`section-heading section-heading--${level}`}><Heading>{title}</Heading>{description && <p>{description}</p>}</div>
}
