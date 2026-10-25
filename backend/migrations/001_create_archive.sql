CREATE TABLE IF NOT EXISTS albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description TEXT,
  event_name TEXT,
  category TEXT,
  event_date DATE,
  published_at TIMESTAMPTZ,
  cover_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS albums_publication_idx ON albums (status, published_at DESC);

CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('photo', 'video')),
  url TEXT NOT NULL CHECK (length(trim(url)) > 0),
  thumbnail_url TEXT,
  alt TEXT NOT NULL CHECK (length(trim(alt)) BETWEEN 1 AND 300),
  caption TEXT,
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_publication_idx ON media (album_id, status, created_at, id);
