# Responsive gallery UI audit

## Design instruction and scope

The local Church of the Nazarene style instruction PDF,
`frontend/public/Church of the Nazarene Style Guide_EN.pdf`, was located and
used as the visual reference. Its typography guidance assigns Brandon Grotesque
to titles and Lato to body text. The implementation uses Lato for body and
declares Brandon Grotesque as the display-font preference with the locally
bundled Lato fallback; no licensed Brandon Grotesque font file was supplied.
The logo remains the supplied unmodified grey/white brand asset, and is never
recreated or placed over a gradient. The visual system uses the guide's defined
palette, approved 45°/135° gradient combinations, gradient circles, thin
outlines, light surfaces, and whitespace; saturated gradient ornaments remain
decorative, with readable text placed on glass/solid surfaces. No congregation
photography was invented. The PDF is a local-only reference and is excluded
from version control and production output.

This report distinguishes fixture-based browser evidence from live service
verification. The frontend was rendered in the integrated browser using four
temporary, intercepted sample album records; no live Supabase project/media was
used for those checks. A direct, unmocked album request was blocked by CORS from
the test browser's `http://127.0.0.1:5173` origin, so the real Supabase gallery
data was not verified. A later direct preflight check against the configured
project returned HTTP 404 with `Requested function was not found`, indicating
the archive Edge Function is not deployed to that project. The frontend now
reports this condition and the deployment guide documents exact-origin CORS
configuration. Screenshots were captured for the 375px mobile page,
1440px desktop page, and the floating album-card grid. The media-admin page
could not be exercised with a real authorized account.

## Implemented

- Shared brand, gradient, and glass tokens in
  `frontend/src/styles/design-tokens.css`. Glass surfaces and blur are limited
  to the header, selected panels, search, floating album-card descriptions, and
  image-viewer controls; solid fallbacks remain when `backdrop-filter` is
  unsupported.
- High-contrast brand-colored bubbles frame the gallery hero, album thumbnails,
  photo tiles, and selected admin panels. Album metadata uses compact brand
  capsules; image cards float glass panels over the lower edge of their covers,
  layered with approved gradient bubble accents.
- The guide's web palette is centralized as CSS tokens, including grey
  `#4A4B4C`, purple `#A688BF` / `#836AA3`, blue `#83D3EB` / `#50B8D4`,
  green `#40996D` / `#5DBF8B`, coral `#F2644E`, orange `#FBB042`, and yellow
  `#E8BE1F`. Approved brand gradient pairings are used at 45°/135° for
  decorative circles and accents.
- Gallery, album cards, album detail, photo viewer, search/filter, header, and
  responsive media-admin UI were updated. Images use responsive variants,
  intrinsic dimensions, lazy loading, and a graceful unavailable-cover state.
- Album gallery density: one column at narrow widths (up to 520px), two columns
  at 521–760px and 761–1024px, three columns at 1025–1439px, and four columns
  from 1440px. Main content is capped at 1160px to avoid ultrawide stretching.
- Dedicated tablet two-column and 1440px four-column rules were rendered with
  fixture albums across the listed viewport matrix.
- Mobile navigation and controls use 44px touch targets, safe-area padding, and
  narrow-screen adjustments down to 320px. Admin workspace collapses at 900px;
  admin album cards and upload rows adapt again at 560px.
- The header theme control is a compact accessible switch, not a dropdown. It
  follows the device color preference by default and stores an explicit choice
  after interaction. The logo and switch share a row at 320–1920px; logo hover
  keeps a transparent surface and uses only a short brand-gradient underline.
- `prefers-reduced-motion`, visible focus styling, semantic form labels, status
  announcements, image alternatives/fallbacks, and keyboard-operated native
  viewer controls are present in source.

## Required viewport verification

| Viewport | Orientation | Browser rendering / overflow / interactions |
| --- | --- | --- |
| 320px | Portrait | Rendered with fixture albums; 1 column; no horizontal overflow |
| 375px | Portrait | Rendered and screenshot captured; 1 column; no horizontal overflow |
| 430px | Portrait | Rendered with fixture albums; 1 column; no horizontal overflow |
| 768px | Portrait | Rendered with fixture albums; 2 columns; no horizontal overflow |
| 1024px | Portrait and landscape | Both rendered with fixture albums; 2 columns; no horizontal overflow |
| 1440px | Landscape | Rendered and screenshot captured; 4 columns; no horizontal overflow |
| 1920px | Landscape | Rendered with fixture albums; 4 columns; no horizontal overflow; content remains capped |

At each listed width the rendered document width equaled its client width. The
gallery search was exercised against the fixture albums (a matching query
reduced the set to one; reset restored all four). The 320px sign-in form was
also rendered: fields and submit control were 44px tall with no horizontal
overflow. The latest browser pass also measured the logo and theme-switch
centerlines at 320, 375, 430, 521, 600, 768, 1024, 1440, and 1920px; they
matched at each width with no horizontal overflow. Emulated system-dark mode
selected dark by default, the switch changed to light, and the logo hover
surface remained transparent. Reduced-motion mode was enabled in the browser.
The fixture records intentionally had no photos, so real image cropping/loading,
photo viewer, and content-over-image contrast remain unverified. WCAG AA
contrast has not been formally measured.

## Remaining visual/usability work

- Repeat the viewport matrix with real published albums and their actual
  responsive images, then inspect album detail and the photo viewer.
- Validate the media-admin dashboard at these widths using an authorized test
  account in an isolated Supabase project.
- Verify focus order, viewer escape/arrow navigation, touch gestures, real upload
  progress/errors, Supabase unauthorized states, and reduced-motion rendering.
- Measure contrast for light/dark theme combinations and translucent overlays
  over real images; adjust only where rendered results fail.
- Reorder/move operations are not exposed as controls in the current media
  administration page.
- The configured production build still emits a Vite warning for the 572 KB
  main JavaScript chunk (164 KB gzip); admin routes are code-split, but the
  Supabase/gallery client remains in the initial chunk.
