import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import css from './PhotoCropper.module.css';

// Output: 3:4.5 (2:3), the shape of the listing tiles (config.layout.listingImage)
const OUT_W = 1200;
const OUT_H = 1800;
const MAX_ZOOM = 4;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Refume: quick framing of a listing photo in the 3:4.5 tile shape before it's uploaded.
 * Drag to move, wheel / slider / two fingers to zoom. "Całe zdjęcie" fits the whole photo
 * (white around it). The result is a 1200×1800 JPEG.
 *
 * @param {Array<File>} props.files photos waiting to be framed (one at a time)
 * @param {Function} props.onDone (croppedFile, originalFile) => void
 * @param {Function} props.onDiscard (originalFile) => void — the user removed this photo
 */
const PhotoCropper = ({ files, onDone, onDiscard }) => {
  const file = files[0] || null;
  const [img, setImg] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 }); // zoom 1 = cover
  const [busy, setBusy] = useState(false);
  const frameRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const [frame, setFrame] = useState({ w: 300, h: 400 });

  // Load the photo (browsers apply the EXIF rotation of phone photos by themselves)
  useEffect(() => {
    if (!file) return undefined;
    setImg(null);
    setError(null);
    setView({ zoom: 1, x: 0, y: 0 });
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setError('Nie udało się otworzyć tego zdjęcia. Wybierz plik JPG, PNG lub WEBP.');
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Frame size follows the screen
  useEffect(() => {
    const measure = () => {
      const el = frameRef.current;
      if (el) setFrame({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [img]);

  // Scale at which the photo just covers the frame, and the one at which all of it fits
  const coverScale = img ? Math.max(frame.w / img.naturalWidth, frame.h / img.naturalHeight) : 1;
  const containScale = img ? Math.min(frame.w / img.naturalWidth, frame.h / img.naturalHeight) : 1;
  const minZoom = containScale / coverScale;

  // Keep the photo over the frame (no empty edges unless it's smaller than the frame)
  const limit = useCallback(
    v => {
      if (!img) return v;
      const zoom = clamp(v.zoom, minZoom, MAX_ZOOM);
      const s = coverScale * zoom;
      const maxX = Math.max(0, (img.naturalWidth * s - frame.w) / 2);
      const maxY = Math.max(0, (img.naturalHeight * s - frame.h) / 2);
      return { zoom, x: clamp(v.x, -maxX, maxX), y: clamp(v.y, -maxY, maxY) };
    },
    [img, coverScale, minZoom, frame.w, frame.h]
  );

  const onPointerDown = e => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    gesture.current = {
      view,
      start: pts.map(p => ({ ...p })),
      dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
    };
  };
  const onPointerMove = e => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (pts.length >= 2 && g.dist) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setView(limit({ ...g.view, zoom: g.view.zoom * (dist / g.dist) }));
    } else if (pts.length === 1 && g.start.length === 1) {
      setView(limit({ ...g.view, x: g.view.x + pts[0].x - g.start[0].x, y: g.view.y + pts[0].y - g.start[0].y }));
    }
  };
  const onPointerUp = e => {
    pointers.current.delete(e.pointerId);
    const pts = [...pointers.current.values()];
    gesture.current = pts.length ? { view, start: pts.map(p => ({ ...p })), dist: 0 } : null;
  };
  const onWheel = e => {
    e.preventDefault();
    setView(v => limit({ ...v, zoom: v.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) }));
  };
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const save = () => {
    if (!img) return;
    setBusy(true);
    const canvas = document.createElement('canvas');
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    // Frame pixels → output pixels
    const k = OUT_W / frame.w;
    const s = coverScale * view.zoom * k;
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    const x = OUT_W / 2 - w / 2 + view.x * k;
    const y = OUT_H / 2 - h / 2 + view.y * k;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h);
    canvas.toBlob(
      blob => {
        setBusy(false);
        if (!blob) {
          setError('Nie udało się przygotować zdjęcia.');
          return;
        }
        const name = (file.name || 'zdjecie').replace(/\.[^.]+$/, '') + '.jpg';
        onDone(new File([blob], name, { type: 'image/jpeg' }), file);
      },
      'image/jpeg',
      0.9
    );
  };

  // Enter = Gotowe
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Enter' && img && !busy) save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!file || typeof document === 'undefined') return null;

  const s = coverScale * view.zoom;
  const imgStyle = img
    ? {
        width: img.naturalWidth * s,
        height: img.naturalHeight * s,
        transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px)`,
      }
    : null;

  return createPortal(
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label="Kadrowanie zdjęcia">
      <div className={css.panel}>
        <div className={css.head}>
          <div>
            <h3 className={css.title}>Ustaw zdjęcie</h3>
            <p className={css.sub}>
              Tak będzie wyglądać kafelek oferty. Przesuń zdjęcie i przybliż, żeby flakon był na środku.
              {files.length > 1 ? ` (zostało ${files.length})` : ''}
            </p>
          </div>
        </div>

        <div
          ref={frameRef}
          className={css.frame}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {img ? <img src={img.src} alt="" className={css.photo} style={imgStyle} draggable={false} /> : null}
          {!img && !error ? <span className={css.loading}>Wczytywanie…</span> : null}
          {error ? <span className={css.loading}>{error}</span> : null}
          <span className={css.grid} aria-hidden="true" />
        </div>

        <div className={css.controls}>
          <span aria-hidden="true">−</span>
          <input
            type="range"
            className={css.zoom}
            min={minZoom}
            max={MAX_ZOOM}
            step={0.01}
            value={view.zoom}
            onChange={e => setView(v => limit({ ...v, zoom: Number(e.target.value) }))}
            aria-label="Przybliżenie"
            disabled={!img}
          />
          <span aria-hidden="true">+</span>
        </div>

        <div className={css.quick}>
          <button type="button" onClick={() => setView({ zoom: 1, x: 0, y: 0 })} disabled={!img}>
            Wypełnij kafelek
          </button>
          <button type="button" onClick={() => setView({ zoom: minZoom, x: 0, y: 0 })} disabled={!img}>
            Całe zdjęcie
          </button>
        </div>

        <div className={css.actions}>
          <button type="button" className={css.secondary} onClick={() => onDiscard(file)} disabled={busy}>
            Usuń to zdjęcie
          </button>
          <button type="button" className={css.primary} onClick={save} disabled={!img || busy}>
            {busy ? 'Zapisywanie…' : files.length > 1 ? 'Gotowe, następne' : 'Gotowe'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PhotoCropper;
