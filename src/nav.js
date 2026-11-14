import { $, $$ } from './util.js';
import { state } from './state.js';
import { leaveDetail } from './ui/detail.js';
import { ask } from './ui/ask.js';

/* Switching between Body, Detail, Crew and Ask. */

export function show(name) {
  if (state.view === 'detail' && name !== 'detail') leaveDetail(name !== 'body');
  state.view = name;
  const host = $('#stage3d');
  $$('.view').forEach(el => el.classList.toggle('on', el.id === 'view-' + name));
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.view === (name === 'detail' ? 'body' : name)));
  host.classList.toggle('away', name === 'crew' || name === 'ask');
  host.classList.toggle('locked', name === 'detail');
  if (name === 'ask' && !$('#thread').children.length) ask('Why was crew 03 flagged?', true);
}

export function initNav() {
  $$('.tab').forEach(t => t.addEventListener('click', () => show(t.dataset.view)));
}
