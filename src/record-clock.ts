// Dev-only: a fake clock that only moves when window.__step(ms) is called, so a clip can be
// captured frame by frame (even in a background tab, where the browser pauses animation).
export function installRecordClock() {
  let now = 0, seq = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const timers: { at: number; id: number; fn: () => void }[] = [];
  performance.now = () => now;
  window.requestAnimationFrame = fn => { frames.set(++seq, fn); return seq; };
  window.cancelAnimationFrame = id => { frames.delete(id); };
  (window as any).setTimeout = (fn: () => void, ms = 0) => { timers.push({ at: now + ms, id: ++seq, fn }); return seq; };
  (window as any).clearTimeout = (id: number) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };
  // Size observers wait for rendering too, so they're checked on each step instead.
  const watched: { cb: ResizeObserverCallback; el: Element; w: number; h: number }[] = [];
  (window as any).ResizeObserver = class { constructor(private cb: ResizeObserverCallback) {} observe(el: Element) { watched.push({ cb: this.cb, el, w: -1, h: -1 }); } unobserve() {} disconnect() {} };
  const step = (ms: number) => {
    now += ms;
    for (const o of watched) { const r = o.el.getBoundingClientRect(); if (r.width !== o.w || r.height !== o.h) { o.w = r.width; o.h = r.height; o.cb([], null as never); } }
    for (let due; (due = timers.filter(t => t.at <= now).sort((a, b) => a.at - b.at)[0]);) { timers.splice(timers.indexOf(due), 1); due.fn(); }
    const fns = [...frames.values()]; frames.clear(); fns.forEach(f => f(now));
  };
  (window as any).__step = step;
  return step;
}
