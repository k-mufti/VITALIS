import { $, $$ } from './util.js';
import { state } from './state.js';
import { leaveDetail } from './ui/detail.js';

/* Switching between Body and Detail. */

export function show(name) {
  if (state.view === 'detail' && name !== 'detail') leaveDetail(name !== 'body');
  state.view = name;
  const host = $('#stage3d');
  $$('.view').forEach(el => el.classList.toggle('on', el.id === 'view-' + name));
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.view === (name === 'detail' ? 'body' : name)));
  host.classList.toggle('away', false);
  host.classList.toggle('locked', name === 'detail');
}

export function initNav() {
  $$('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));
}
