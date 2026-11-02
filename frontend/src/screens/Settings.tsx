import { useStore } from '../store';
import { Header, NumField } from '../components/ui';
import { DEFAULT_BAR, DEFAULT_PLATES, barOf, platesOf } from '../lib/plates';
import { blobToDataUrl, dataUrlToBlob, deletePhotoBlob, loadPhotoBlob, savePhotoBlob } from '../lib/photos';
import { dayKey } from '../lib/calc';
import type { EffortScale, Routine } from '../types';

export function SettingsScreen() {
  const { settings, updateSettings, sessions, routines, activeRoutineId, bodyStats, customExercises, records, curated, photos, schedule } = useStore();

  const exportData = async () => {
    const photoData: Record<string, string> = {};
    for (const p of photos) {
      const b = await loadPhotoBlob(p.id);
      if (b) photoData[p.id] = await blobToDataUrl(b);
    }
    const data = { sessions, routines, activeRoutineId, bodyStats, customExercises, records, curated, schedule, settings, photos, photoData };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `veylith-${dayKey(Date.now())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importData = (file: File) => {
    file.text().then(async (t) => {
      try {
        const d = JSON.parse(t);
        if (!Array.isArray(d.sessions) || !Array.isArray(d.routines)) throw new Error('bad file');
        if (!confirm('Replace all data on this device with the imported file?')) return;
        // Files from older versions have no photos, curated programs or active program.
        if (Array.isArray(d.photos)) {
          for (const p of d.photos) if (d.photoData?.[p.id]) await savePhotoBlob(p.id, await dataUrlToBlob(d.photoData[p.id]));
          for (const p of photos) if (!d.photos.some((x: { id: string }) => x.id === p.id)) await deletePhotoBlob(p.id);
        }
        const kept = (d.routines as Routine[]).some((r) => r.id === activeRoutineId) ? activeRoutineId : (d.routines[0]?.id ?? null);
        useStore.setState({
          sessions: d.sessions,
          routines: d.routines,
          activeRoutineId: d.activeRoutineId !== undefined ? d.activeRoutineId : kept,
          bodyStats: d.bodyStats ?? [],
          customExercises: d.customExercises ?? [],
          records: d.records ?? {},
          curated: d.curated ?? curated,
          schedule: d.schedule ?? [],
          photos: d.photos ?? photos,
          settings: { ...settings, ...d.settings },
        });
      } catch {
        alert('That file is not a Veylith export.');
      }
    });
  };

  return (
    <div className="page">
      <Header title="Settings" />
      <section className="card">
        <label className="row gap">
          <span className="grow">Units</span>
          <select value={settings.unit} onChange={(e) => updateSettings({ unit: e.target.value as 'lb' | 'kg' })}>
            <option value="lb">Pounds (lb)</option>
            <option value="kg">Kilograms (kg)</option>
          </select>
        </label>
        <label className="row gap">
          <span className="grow">Rest timer</span>
          <input type="checkbox" checked={settings.restTimerOn} onChange={(e) => updateSettings({ restTimerOn: e.target.checked })} />
        </label>
        <label className="row gap">
          <span className="grow">Default rest (seconds)</span>
          <input
            className="narrow"
            inputMode="numeric"
            value={settings.defaultRest}
            onChange={(e) => updateSettings({ defaultRest: +e.target.value || 0 })}
          />
        </label>
        <label className="row gap">
          <span className="grow">Flash screen when rest ends</span>
          <input type="checkbox" checked={settings.flash !== false} onChange={(e) => updateSettings({ flash: e.target.checked })} />
        </label>
        <label className="row gap">
          <span className="grow">
            Effort per set
            <small className="muted block">RIR = reps left in the tank, RPE = 10 − RIR</small>
          </span>
          <select value={settings.effort ?? 'rir'} onChange={(e) => updateSettings({ effort: e.target.value as EffortScale })}>
            <option value="rir">RIR</option>
            <option value="rpe">RPE</option>
            <option value="off">Off</option>
          </select>
        </label>
      </section>
      <section className="card">
        <h3>Bar and plates</h3>
        <p className="muted small">Used to show which plates go on each side for barbell lifts.</p>
        <label className="row gap">
          <span className="grow">Bar weight ({settings.unit})</span>
          <NumField
            className="narrow"
            decimal
            label="Bar weight"
            value={barOf(settings)}
            onChange={(v) => updateSettings({ bar: { ...(settings.bar ?? DEFAULT_BAR), [settings.unit]: v ?? 0 } })}
          />
        </label>
        <span className="muted small">Plates you own ({settings.unit})</span>
        <div className="chips wrap">
          {[...new Set([...DEFAULT_PLATES[settings.unit], ...platesOf(settings)])]
            .sort((a, b) => b - a)
            .map((p) => {
              const owned = platesOf(settings).includes(p);
              return (
                <button
                  key={p}
                  className={`chip ${owned ? 'on' : ''}`}
                  aria-pressed={owned}
                  onClick={() => {
                    const cur = platesOf(settings);
                    const next = owned ? cur.filter((x) => x !== p) : [...cur, p];
                    updateSettings({ plates: { ...(settings.plates ?? DEFAULT_PLATES), [settings.unit]: next } });
                  }}
                >
                  {p}
                </button>
              );
            })}
        </div>
      </section>
      <section className="card">
        <h3>Data</h3>
        <p className="muted small">Everything is stored on this device only (IndexedDB).</p>
        <div className="row gap">
          <button className="btn grow" onClick={exportData}>
            Export JSON
          </button>
          <label className="btn grow">
            Import JSON
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) importData(f);
              }}
            />
          </label>
        </div>
      </section>
      <section className="card">
        <h3>About</h3>
        <p className="muted small">
          Exercise illustrations by{' '}
          <a className="accent" href="https://github.com/everkinetic/data" target="_blank" rel="noreferrer">
            Everkinetic
          </a>
          , licensed{' '}
          <a className="accent" href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
            CC BY-SA 4.0
          </a>
          , recoloured for the app.
        </p>
      </section>
    </div>
  );
}
