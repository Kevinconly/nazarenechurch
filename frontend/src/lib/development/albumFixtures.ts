import type { Album } from '../../types/album'

/** Empty preview record for checking album routes without inventing archive media. */
export const developmentAlbumFixtures: readonly Album[] = [
  {
    id: 'development-empty-album',
    slug: 'development-preview-empty-album',
    title: 'Development preview: empty album',
    description: 'This development-only record contains no media and does not represent Remera history.',
    status: 'published',
    mediaType: 'photo',
    mediaCount: 0,
    createdAt: new Date().toISOString(),
    developmentPreview: true,
  },
]
