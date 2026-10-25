import { useStore } from '../store';
import { Header } from '../components/ui';

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
        alert('That file is not an Veylith export.');
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
