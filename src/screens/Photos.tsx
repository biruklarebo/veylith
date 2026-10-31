import { useEffect, useMemo, useRef, useState } from 'react';
import { useNav } from '../nav';
import { useStore } from '../store';
import { dayKey, toDisplay, uid } from '../lib/calc';
import { deletePhotoBlob, savePhotoBlob, shrinkImage, usePhotoUrl } from '../lib/photos';
import { Sheet } from '../components/Sheet';
import { Empty, Header, Toast, type ToastMsg } from '../components/ui';
import type { BodyStat, Pose, ProgressPhoto } from '../types';

const POSES: { v: Pose; label: string }[] = [
  { v: 'front', label: 'Front' },
  { v: 'side', label: 'Side' },
  { v: 'back', label: 'Back' },
];

const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  new Date(`${d}T12:00`).toLocaleDateString(undefined, opts);

// Body weight logged closest to a date (within two weeks), in lbs.
function weightNear(stats: BodyStat[], date: string): number | undefined {
  const t = new Date(`${date}T12:00`).getTime();
  let best: { d: number; w: number } | undefined;
  for (const b of stats) {
    if (!b.values.weight) continue;
    const d = Math.abs(new Date(`${b.date}T12:00`).getTime() - t);
    if (d <= 14 * 864e5 && (!best || d < best.d)) best = { d, w: b.values.weight };
  }
  return best?.w;
}

export function Thumb({ photo, className, onClick, selected }: { photo: ProgressPhoto; className?: string; onClick?: () => void; selected?: number }) {
  const url = usePhotoUrl(photo.id);
  return (
    <button className={`ph-thumb ${className ?? ''} ${selected ? 'sel' : ''}`} onClick={onClick} aria-label={`${photo.pose} photo, ${fmtDate(photo.date)}`}>
      {url ? <img src={url} alt="" /> : <span className="ph-ph" />}
      <span className="ph-date">{fmtDate(photo.date, { month: 'short', day: 'numeric' })}</span>
      {selected ? <span className="ph-pick">{selected}</span> : null}
    </button>
  );
}

export function PhotosScreen() {
  const nav = useNav();
  const { photos, addPhoto, deletePhoto, updatePhoto } = useStore();
  const [pose, setPose] = useState<Pose | 'all'>('all');
  const [picking, setPicking] = useState<string[] | null>(null);
  const [view, setView] = useState<ProgressPhoto | null>(null);
  const [pending, setPending] = useState<File[] | null>(null);
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = photos.filter((p) => pose === 'all' || p.pose === pose);
  const groups = useMemo(() => {
    const m = new Map<string, ProgressPhoto[]>();
    for (const p of [...list].reverse()) {
      const k = p.date.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [list]);

  // Default comparison: first and latest photo of the most-used pose.
  const quick = useMemo(() => {
    const byPose = (pp: Pose) => photos.filter((p) => p.pose === pp);
    const best = POSES.map((x) => byPose(x.v)).sort((a, b) => b.length - a.length)[0];
    return best && best.length >= 2 ? [best[0].id, best[best.length - 1].id] : null;
  }, [photos]);

  const toggle = (id: string) =>
    setPicking((cur) => {
      if (!cur) return cur;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-2);
      if (next.length === 2) {
        const [a, b] = [...next].sort((x, y) => photos.findIndex((p) => p.id === x) - photos.findIndex((p) => p.id === y));
        setTimeout(() => {
          setPicking(null);
          nav.push({ kind: 'compare', a, b });
        }, 150);
      }
      return next;
    });

  return (
    <div className="page photos">
      <Header
        title="Progress photos"
        right={
          <button className="icon-btn" onClick={() => fileRef.current?.click()} aria-label="Add photos">
            ＋
          </button>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) setPending(files);
        }}
      />

      <div className="row gap">
        <div className="seg-ctl grow" role="tablist" aria-label="Pose">
          {[{ v: 'all' as const, label: 'All' }, ...POSES].map((p) => (
            <button key={p.v} role="tab" aria-selected={pose === p.v} className={pose === p.v ? 'on' : ''} onClick={() => setPose(p.v)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {photos.length >= 2 && (
        <div className="row gap">
          <button className="btn primary grow" disabled={!quick} onClick={() => quick && nav.push({ kind: 'compare', a: quick[0], b: quick[1] })}>
            ⇆ Compare first & latest
          </button>
          <button className={`btn ${picking ? 'soft' : ''}`} onClick={() => setPicking(picking ? null : [])}>
            {picking ? 'Cancel' : 'Pick two'}
          </button>
        </div>
      )}
      {picking && <p className="muted small center">Tap two photos to compare them.</p>}

      {photos.length === 0 ? (
        <Empty title="No photos yet">
          <p className="muted small">Take one from the front, side and back every few weeks, same light and spot. They stay on this device.</p>
          <button className="btn primary" onClick={() => fileRef.current?.click()}>
            Add your first photo
          </button>
        </Empty>
      ) : (
        groups.map(([month, items]) => (
          <section key={month} className="ph-month">
            <h3 className="section-title">{fmtDate(`${month}-01`, { month: 'long', year: 'numeric' })}</h3>
            <div className="ph-grid">
              {items.map((p) => (
                <Thumb
                  key={p.id}
                  photo={p}
                  selected={picking ? picking.indexOf(p.id) + 1 : undefined}
                  onClick={() => (picking ? toggle(p.id) : setView(p))}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <AddSheet
        files={pending}
        onClose={() => setPending(null)}
        onAdd={async (date, pp) => {
          const files = pending ?? [];
          setPending(null);
          let n = 0;
          for (const f of files) {
            try {
              const { blob, w, h } = await shrinkImage(f);
              const id = uid();
              await savePhotoBlob(id, blob);
              addPhoto({ id, date, pose: pp, w, h });
              n++;
            } catch {
              /* unreadable file, skipped below */
            }
          }
          setToast({ id: Date.now(), text: n === files.length ? `Added ${n} photo${n === 1 ? '' : 's'}` : `Added ${n} of ${files.length}; some files couldn't be read` });
        }}
      />

      <ViewSheet
        photo={view}
        onClose={() => setView(null)}
        onPose={(pp) => {
          if (!view) return;
          updatePhoto(view.id, { pose: pp });
          setView({ ...view, pose: pp });
        }}
        onDelete={() => {
          if (!view) return;
          deletePhoto(view.id);
          deletePhotoBlob(view.id);
          setView(null);
          setToast({ id: Date.now(), text: 'Photo deleted' });
        }}
      />
      <Toast msg={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function AddSheet({ files, onClose, onAdd }: { files: File[] | null; onClose: () => void; onAdd: (date: string, pose: Pose) => void }) {
  const [date, setDate] = useState(dayKey(Date.now()));
  const [pose, setPose] = useState<Pose>('front');
  useEffect(() => {
    if (files) setDate(dayKey(Date.now()));
  }, [files]);
  return (
    <Sheet open={!!files} onClose={onClose} title={files && files.length > 1 ? `Add ${files.length} photos` : 'Add photo'}>
      <label className="row gap">
        <span className="grow">Date</span>
        <input type="date" value={date} max={dayKey(Date.now())} onChange={(e) => setDate(e.target.value)} />
      </label>
      <span className="muted small">Pose</span>
      <div className="seg-ctl">
        {POSES.map((p) => (
          <button key={p.v} className={pose === p.v ? 'on' : ''} onClick={() => setPose(p.v)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="muted small">Photos are resized and their location data removed before saving. They're kept on this device only.</p>
      <button className="btn primary big block" onClick={() => onAdd(date, pose)}>
        Save
      </button>
    </Sheet>
  );
}

function ViewSheet({ photo, onClose, onPose, onDelete }: { photo: ProgressPhoto | null; onClose: () => void; onPose: (p: Pose) => void; onDelete: () => void }) {
  const url = usePhotoUrl(photo?.id);
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet open={!!photo} onClose={onClose} title={photo ? fmtDate(photo.date) : ''}>
      {url && <img className="ph-full" src={url} alt="" />}
      <div className="seg-ctl">
        {POSES.map((p) => (
          <button key={p.v} className={photo?.pose === p.v ? 'on' : ''} onClick={() => onPose(p.v)}>
            {p.label}
          </button>
        ))}
      </div>
      <button
        className="btn danger block"
        onClick={() => {
          if (!confirm) return setConfirm(true);
          setConfirm(false);
          onDelete();
        }}
      >
        {confirm ? 'Tap again to delete' : 'Delete photo'}
      </button>
    </Sheet>
  );
}

// Before/after: the later photo sits on top, clipped at the handle; drag anywhere to move it.
export function CompareScreen({ a, b }: { a: string; b: string }) {
  const nav = useNav();
  const { photos, bodyStats, settings } = useStore();
  const pa = photos.find((p) => p.id === a);
  const pb = photos.find((p) => p.id === b);
  const ua = usePhotoUrl(a);
  const ub = usePhotoUrl(b);
  const [pos, setPos] = useState(50);
  const stage = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  if (!pa || !pb) return <Header title="Photo not found" />;
  const move = (clientX: number) => {
    const r = stage.current?.getBoundingClientRect();
    if (r) setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  const days = Math.round((new Date(pb.date).getTime() - new Date(pa.date).getTime()) / 864e5);
  const wa = weightNear(bodyStats, pa.date);
  const wb = weightNear(bodyStats, pb.date);
  const dw = wa !== undefined && wb !== undefined ? Math.round(toDisplay(wb - wa, settings) * 10) / 10 : null;
  const ratio = Math.max(pa.h / pa.w, pb.h / pb.w);

  return (
    <div className="compare">
      <header className="cmp-top">
        <button className="icon-btn glass" onClick={nav.pop} aria-label="Back">
          ‹
        </button>
        <div className="grow center">
          <b>{days === 0 ? 'Same day' : `${days} days apart`}</b>
          {dw !== null && (
            <small className="block">
              {dw === 0 ? 'Same weight' : `${dw > 0 ? '+' : ''}${dw} ${settings.unit}`}
            </small>
          )}
        </div>
        <span className="icon-spacer" />
      </header>

      <div
        ref={stage}
        className="cmp-stage"
        style={{ aspectRatio: `1 / ${ratio}` }}
        onPointerDown={(e) => {
          dragging.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          move(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && move(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        role="slider"
        aria-label="Before and after"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5));
          if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5));
        }}
      >
        {ua && <img src={ua} alt="" className="cmp-img" draggable={false} />}
        {ub && <img src={ub} alt="" className="cmp-img top" draggable={false} style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />}
        <span className="cmp-line" style={{ left: `${pos}%` }}>
          <span className="cmp-knob">⇆</span>
        </span>
        <span className="cmp-tag l">
          Before · {fmtDate(pa.date, { month: 'short', day: 'numeric' })}
          {wa !== undefined && ` · ${toDisplay(wa, settings)}`}
        </span>
        <span className="cmp-tag r">
          After · {fmtDate(pb.date, { month: 'short', day: 'numeric' })}
          {wb !== undefined && ` · ${toDisplay(wb, settings)}`}
        </span>
      </div>

      <div className="cmp-strip">
        {[pa, pb].map((p, i) => (
          <div key={p.id} className="cmp-pick">
            <span className="muted small">{i ? 'After' : 'Before'}</span>
            <select
              value={p.id}
              onChange={(e) => {
                const id = e.target.value;
                const [x, y] = i ? [a, id] : [id, b];
                const ix = photos.findIndex((q) => q.id === x);
                const iy = photos.findIndex((q) => q.id === y);
                nav.replace({ kind: 'compare', a: ix <= iy ? x : y, b: ix <= iy ? y : x });
              }}
            >
              {photos.map((q) => (
                <option key={q.id} value={q.id}>
                  {fmtDate(q.date)} · {q.pose}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
