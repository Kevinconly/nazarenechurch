type SectionHeadingProps = { title: string; description?: string; level?: 'page' | 'section'; id?: string }

export function SectionHeading({ title, description, level = 'section', id }: SectionHeadingProps) {
  const Heading = level === 'page' ? 'h1' : 'h2'
  return <div className={`section-heading section-heading--${level}`}><Heading id={id}>{title}</Heading>{description && <p>{description}</p>}</div>
}
