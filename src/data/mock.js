/* Demo data. Every reading here is made up.
   Will be replaced by src/data/client.js (backend) with this file as the fallback. */

export const SYS = {
  lungs: { name: 'Lungs', value: 16, unit: 'breaths a minute', usual: '14–18', l2: 'Oxygen', v2: '98%', state: 'ok',
    note: 'Breathing is steady. Right where it usually is.', week: [15, 16, 15, 17, 16, 16, 16], jitter: [15, 17] },
  heart: { name: 'Heart', value: 64, unit: 'beats a minute at rest', usual: '54–62', l2: 'Rhythm', v2: 'Regular', state: 'watch',
    note: 'Resting rate has been a little high for 3 days. Worth watching.', week: [57, 58, 57, 60, 62, 63, 64], jitter: [63, 65] },
  sleep: { name: 'Sleep & mind', value: 6.2, unit: 'hours slept', usual: '7–8 h', l2: 'Reaction test', v2: 'Normal', state: 'watch',
    note: 'Sleeping less than usual this week. Focus is still normal.', week: [7.3, 7.1, 7.0, 6.8, 6.5, 6.4, 6.2] },
  muscles: { name: 'Muscles', value: 87, unit: 'strength estimate out of 100', usual: '80–95', l2: 'Workout today', v2: '45 min', state: 'ok',
    note: 'Recovered well from yesterday’s workout.', week: [84, 88, 82, 90, 86, 85, 87] },
};

export const CREW = [
  { n: 'Reyes', id: '03', role: 'Commander', watch: true, note: 'Alex Reyes: resting heart rate up, sleep down. Worth watching.' },
  { n: 'Kim', id: '01', role: 'Engineer', note: 'Maya Kim: everything in her normal range.' },
  { n: 'Laurent', id: '02', role: 'Scientist', note: 'Sofia Laurent: everything in her normal range.' },
  { n: 'Okafor', id: '04', role: 'Doctor', note: 'Jonah Okafor: everything in his normal range.' },
  { n: 'Nakamura', id: '05', role: 'Pilot', watch: true, note: 'Theo Nakamura: sore lower back after exercise. Resting today.' },
  { n: 'Alvarez', id: '06', role: 'Geologist', note: 'Elena Alvarez: everything in her normal range.' },
];

// Last 12 readings for crew 03, used by the Ask charts.
export const heartHistory = [58, 57, 59, 60, 59, 61, 62, 61, 63, 62, 64, 64];
export const sleepHistory = [7.2, 7.0, 7.1, 6.9, 6.8, 6.6, 6.7, 6.5, 6.4, 6.4, 6.3, 6.2];

/* ---------- Self check-ins (added for the challenge: astronaut-entered readings) ---------- */

// Latest check-in readings for crew 03. `when` is plain text for the UI. null value = not taken yet.
export const VITALS = {
  bp:      { name: 'Blood pressure', value: [118, 76], unit: 'mmHg', when: 'This morning' },
  glucose: { name: 'Blood sugar', value: null, unit: 'mg/dL', when: 'Due now' },
  temp:    { name: 'Temperature', value: 37.1, unit: '°C', when: 'Yesterday' },
  mood:    { name: 'Mood', value: 4, unit: 'of 5', when: 'Yesterday' },
};

// Today's health routine. `check` = which check-in field completes it.
// Exercise: ISS crews train about 2 hours a day (NASA HRP, muscle and bone loss countermeasures).
export const ROUTINE = [
  { id: 'bp', time: '07:00', label: 'Blood pressure', check: 'bp', done: true },
  { id: 'exercise', time: '09:00', label: 'Exercise · 2 h', done: true },
  { id: 'glucose', time: '12:00', label: 'Blood sugar', check: 'glucose', done: false },
  { id: 'temp', time: '20:00', label: 'Temperature', check: 'temp', done: false },
  { id: 'mood', time: '20:00', label: 'How do you feel?', check: 'mood', done: false },
];

export const SHIP_TIME = '12:04';
export const STREAK = 12;            // days in a row with every check done

// Mission numbers used when the backend is off. Matches the backend's default (Mars, day 184).
// Radiation = 184 days x 1.84 mSv/day (Curiosity RAD cruise rate). Limit = NASA-STD-3001 career limit.
export const MOCK_MISSION = {
  mission: 'mars', mission_name: 'Mars', day: 184, arrival_day: 240, phase: 'cruise', end_day: 740, crew_id: '03',
  comms_delay_min: 5.44, radiation_msv: 338.6, radiation_career_limit_msv: 600, radiation_event_limit_msv: 250,
};
