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
