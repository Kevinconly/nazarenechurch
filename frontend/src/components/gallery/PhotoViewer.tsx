import { useEffect, useId, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { KeyboardEvent, RefObject } from 'react'
import type { PhotoMedia } from '../../types/media'

type PhotoViewerProps = {
  photo: PhotoMedia | null
  photos: readonly PhotoMedia[]
  onSelect: (photo: PhotoMedia) => void
  onClose: () => void
  returnFocusRef: RefObject<HTMLButtonElement | null>
}

export function PhotoViewer({ photo, photos, onSelect, onClose, returnFocusRef }: PhotoViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const captionId = useId()
  const [sourceFailed, setSourceFailed] = useState(false)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const restoreFocus = () => {
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus()
    }
    const preventNativeClose = (event: Event) => {
      event.preventDefault()
      onCloseRef.current()
    }

    dialog.addEventListener('close', restoreFocus)
    dialog.addEventListener('cancel', preventNativeClose)
    return () => {
      dialog.removeEventListener('close', restoreFocus)
      dialog.removeEventListener('cancel', preventNativeClose)
    }
  }, [returnFocusRef])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (photo && !dialog.open) {
      dialog.showModal()
      closeButtonRef.current?.focus()
    } else if (!photo && dialog.open) {
      dialog.close()
    }
  }, [photo])

  useEffect(() => setSourceFailed(false), [photo?.id])

  const selectedIndex = photo ? photos.findIndex((item) => item.id === photo.id) : -1
  const previous = selectedIndex > 0 ? photos[selectedIndex - 1] : undefined
  const next = selectedIndex >= 0 && selectedIndex < photos.length - 1 ? photos[selectedIndex + 1] : undefined

  function handleViewerKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'ArrowLeft' && previous) {
      event.preventDefault()
      onSelect(previous)
    } else if (event.key === 'ArrowRight' && next) {
      event.preventDefault()
      onSelect(next)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="photo-viewer"
      aria-labelledby="photo-viewer-title"
      aria-describedby={photo?.caption ? captionId : undefined}
      onKeyDown={handleViewerKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <h2 className="visually-hidden" id="photo-viewer-title">Photo viewer</h2>
      <div className="photo-viewer__toolbar">
        <span className="photo-viewer__position" aria-live="polite">
          {selectedIndex >= 0 ? `${selectedIndex + 1} of ${photos.length}` : ''}
        </span>
        <button className="icon-button" ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close photo viewer">
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      {photo && (
        <figure className="photo-viewer__figure">
          {sourceFailed ? (
            <p className="media-unavailable" role="alert">This photograph is unavailable right now.</p>
          ) : (
            <img
              src={photo.src}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              onError={() => setSourceFailed(true)}
            />
          )}
          {photo.caption && <figcaption id={captionId}>{photo.caption}</figcaption>}
        </figure>
      )}
      {photos.length > 1 && (
        <div className="photo-viewer__navigation">
          <button className="icon-button" type="button" onClick={() => previous && onSelect(previous)} disabled={!previous} aria-label="Previous photograph">
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
          <button className="icon-button" type="button" onClick={() => next && onSelect(next)} disabled={!next} aria-label="Next photograph">
            <ChevronRight size={24} aria-hidden="true" />
          </button>
        </div>
      )}
    </dialog>
  )
}
