// Phone layout helpers (styles/phone.css). A few elements live in a different place on a phone:
//   - the Vitaly orb goes into the middle of the bottom tab bar, so it shows on every screen;
//   - the body layer switch (Body / Muscles / Bones / Organs, Highlight) sits on top of the 3D body;
//   - the footer ("Where this data comes from") goes to the end of the Collect screen.
// Everything goes back to where it was when the screen gets wide again. Listeners stay attached,
// because the elements are moved, not copied.

const phone = matchMedia('(max-width: 820px), (max-height: 500px)');
const homes = [];   // [element, parent, nextSibling], in the order they were moved

const $ = s => document.querySelector(s);

function move(el, parent) {
  if (!el || !parent || el.parentNode === parent) return;
  homes.push([el, el.parentNode, el.nextSibling]);
  parent.appendChild(el);
}

function restore() {
  // Last moved first, so an element whose old neighbour was also moved finds it back in place.
  while (homes.length) {
    const [el, parent, next] = homes.pop();
    parent.insertBefore(el, next && next.parentNode === parent ? next : null);
  }
}

let tools = null;
function apply() {
  const app = $('#app'), body = $('#view-body');
  if (!app || !body) return;
  if (!phone.matches) { restore(); tools?.remove(); return; }
  move($('.body-foot'), app);
  move($('.foot'), $('#view-collect'));
  const head = $('#anatomy .an-head'), tabs = $('#anatomy .an-tabs');
  if (head && tabs) {
    if (!tools) { tools = document.createElement('div'); tools.className = 'stage-tools'; }
    if (!tools.isConnected) body.appendChild(tools);
    move(head, tools);   // head before tabs, so restore() puts them back in the right order
    move(tabs, tools);
  }
}

phone.addEventListener('change', apply);
apply();
// The body panel is built once the 3D scene starts; place its switch as soon as it appears.
const body = $('#view-body');
if (body) {
  const watch = new MutationObserver(() => { if ($('#anatomy .an-head')) { watch.disconnect(); apply(); } });
  if ($('#anatomy .an-head')) apply(); else watch.observe(body, { childList: true });
}
