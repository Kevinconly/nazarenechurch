import { useMemo, useState } from 'react'
import type { Album } from '../../types/album'
import { createEmptyArchiveFilters, filterPublishedAlbums, getArchiveFilterOptions, hasActiveArchiveFilters, type ArchiveFilters } from '../../lib/archiveSearch'
import { Container } from '../ui/Container'
import { Divider } from '../ui/Divider'
import { EmptyState } from '../ui/EmptyState'
import { SectionHeading } from '../ui/SectionHeading'
import { Button } from '../ui/Button'
import { AlbumCard } from './AlbumCard'

type FeaturedAlbumsSectionProps = {
  albums: readonly Album[]
}

export function FeaturedAlbumsSection({ albums }: FeaturedAlbumsSectionProps) {
  const [filters, setFilters] = useState<ArchiveFilters>(createEmptyArchiveFilters)
  const filterOptions = useMemo(() => getArchiveFilterOptions(albums), [albums])
  const filteredAlbums = useMemo(() => filterPublishedAlbums(albums, filters), [albums, filters])
  const hasAlbums = albums.some((album) => album.status === 'published')
  const hasFilters = hasActiveArchiveFilters(filters)

  function updateFilter(key: keyof ArchiveFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function clearFilters() {
    setFilters(createEmptyArchiveFilters())
  }

  const publishedAlbumCount = albums.filter((album) => album.status === 'published' && !album.developmentPreview).length

  return (
    <section className="featured-section" id="gallery" aria-labelledby="featured-heading">
      <Container>
        <div className="featured-section__heading">
          <div>
            <p className="eyebrow">The collection</p>
            <SectionHeading
              title="Featured albums"
              id="featured-heading"
              description="A growing collection of photographs and films from our community."
              level="section"
            />
          </div>
          {publishedAlbumCount > 0 && <span className="featured-section__count">{publishedAlbumCount} published {publishedAlbumCount === 1 ? 'album' : 'albums'}</span>}
        </div>
        <div className="archive-search" role="search" aria-label="Search and filter published albums">
          <div className="archive-search__query">
            <label htmlFor="archive-search-input">Search albums</label>
            <div className="archive-search__query-controls">
              <input
                id="archive-search-input"
                type="search"
                value={filters.query}
                onChange={(event) => updateFilter('query', event.currentTarget.value)}
                placeholder="Title, event, category, or year"
                aria-controls="archive-results"
              />
              <Button variant="outline" type="button" disabled={!filters.query} onClick={() => updateFilter('query', '')}>
                Clear search
              </Button>
            </div>
          </div>
          <div className="archive-search__filters" role="group" aria-label="Archive filters">
            <div className="archive-search__selects">
              <label>
                <span>Event</span>
                <select value={filters.event} onChange={(event) => updateFilter('event', event.currentTarget.value)} disabled={filterOptions.events.length === 0}>
                  <option value="">All events</option>
                  {filterOptions.events.map((eventName) => <option key={eventName} value={eventName}>{eventName}</option>)}
                </select>
              </label>
              <label>
                <span>Category</span>
                <select value={filters.category} onChange={(event) => updateFilter('category', event.currentTarget.value)} disabled={filterOptions.categories.length === 0}>
                  <option value="">All categories</option>
                  {filterOptions.categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label>
                <span>Year</span>
                <select value={filters.year} onChange={(event) => updateFilter('year', event.currentTarget.value)} disabled={filterOptions.years.length === 0}>
                  <option value="">All years</option>
                  {filterOptions.years.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
            </div>
            <Button variant="secondary" type="button" disabled={!hasFilters} onClick={clearFilters}>
              Reset all
            </Button>
          </div>
          {!filterOptions.events.length && !filterOptions.categories.length && !filterOptions.years.length && (
            <p className="archive-search__hint">Event, category, and year choices appear when published albums include that metadata.</p>
          )}
        </div>

        {hasAlbums && (
          <p className="archive-results-status" role="status" aria-live="polite" aria-atomic="true">
            {filteredAlbums.length} {filteredAlbums.length === 1 ? 'album' : 'albums'} found
          </p>
        )}

        <div id="archive-results">
          {!hasAlbums ? (
            <div className="featured-section__empty">
              <Divider />
              <EmptyState
                title="The archive is being prepared"
                description="There are no published albums yet. When the collection is ready, its stories will be gathered here."
              />
            </div>
          ) : filteredAlbums.length > 0 ? (
            <div className="album-grid">
              {filteredAlbums.map((album) => <AlbumCard key={album.id} album={album} />)}
            </div>
          ) : (
            <div className="featured-section__empty archive-search__no-results">
              <Divider />
              <EmptyState
                title="No albums match your search"
                description="Try another title, event, category, or year, or clear the current search and filters."
              />
              <Button variant="outline" type="button" onClick={clearFilters}>
                Clear search and filters
              </Button>
            </div>
          )}
          </div>
      </Container>
    </section>
  )
}
