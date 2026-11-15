// Small DOM + math helpers shared by every module.
export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
// A "REAL" tag for a reading that came from the real watch (the backend marks it real, and
// modified when a Director event is layered on top). Empty for simulated readings.
export function realTag(v) {
  if (!v || !v.real) return '';
  const age = v.sampled_at ? Math.max(0, Math.round((Date.now() / 1000 - v.sampled_at) / 60)) : null;
  const tip = `${v.source}${age === null ? '' : `, sampled ${age} min ago`}${v.modified ? ', with a simulated event added on top' : ''}`;
  return `<span class="real-tag${v.modified ? ' event' : ''}" title="${tip}">${v.modified ? 'Real + event' : 'Real'}</span>`;
}
export const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
