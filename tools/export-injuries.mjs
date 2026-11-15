// Exports the injury drill's first-aid text (src/ui/injury-library.js) for Vitaly's backend, so both read the
// same steps. Run: node tools/export-injuries.mjs   -> backend/app/vitaly/injury_data.json
import { writeFileSync } from 'node:fs';
import { INJURIES, GENERAL } from '../src/ui/injury-library.js';

const pick = i => ({ id: i.id, title: i.title || null, urgent: !!i.urgent, steps: i.steps, help: i.help || [], space: i.space || '', kit: i.kit || '', limits: i.limits || '' });
const out = { injuries: Object.fromEntries(INJURIES.map(i => [i.id, pick(i)])), general: pick(GENERAL) };
writeFileSync(new URL('../backend/app/vitaly/injury_data.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`exported ${INJURIES.length} injuries`);
