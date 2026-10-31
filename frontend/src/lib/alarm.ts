import { useEffect, useState } from 'react';

export function beep(times = 3) {
  try {
    const ctx = new AudioContext();
    for (let k = 0; k < times; k++) {
      const at = k * 0.25;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.2, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.2);
    }
  } catch {
    /* audio unavailable */
  }
  navigator.vibrate?.([300, 120, 300]);
}

export function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export const tap = () => navigator.vibrate?.(12);

// Blink the screen in the accent colour (rest over). Pure CSS on <body>; reduced-motion skips it.
export function flashScreen() {
  const b = document.body;
  b.classList.remove('flash');
  void b.offsetWidth;
  b.classList.add('flash');
  setTimeout(() => b.classList.remove('flash'), 1300);
}

// Keep the screen awake while `on`. The lock drops when the page is hidden, so take it again.
export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const take = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then((l) => {
        if (live) lock = l;
        else l.release();
      }, () => {});
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', take);
      lock?.release().catch(() => {});
    };
  }, [on]);
}
