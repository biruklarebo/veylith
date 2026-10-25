import { useStore } from '../store';
import { Header } from '../components/ui';
import { DEFAULT_BAR, DEFAULT_PLATES, barOf, platesOf } from '../lib/plates';
import type { EffortScale } from '../types';

export function SettingsScreen() {
  const { settings, updateSettings, sessions, routines, bodyStats, customExercises, records } = useStore();

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ sessions, routines, bodyStats, customExercises, records, settings }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `veylith-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = (file: File) => {
    file.text().then((t) => {
      try {
        const d = JSON.parse(t);
        if (!Array.isArray(d.sessions) || !Array.isArray(d.routines)) throw new Error('bad file');
        if (!confirm('Replace all data on this device with the imported file?')) return;
        useStore.setState({
          sessions: d.sessions,
          routines: d.routines,
          bodyStats: d.bodyStats ?? [],
          customExercises: d.customExercises ?? [],
          records: d.records ?? {},
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
          <input
            className="narrow"
            inputMode="decimal"
            value={barOf(settings)}
            onChange={(e) => updateSettings({ bar: { ...(settings.bar ?? DEFAULT_BAR), [settings.unit]: parseFloat(e.target.value) || 0 } })}
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
            <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          </label>
        </div>
      </section>
    </div>
  );
}
