// The trip plan from "Trip Plan.xlsx". Seed records use fixed ids and updatedAt 0,
// so all four phones load the same plan without duplicates, and any edit wins.
export const TRIP = {
  name: 'Indore Yatra',
  days: ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'],
};

export const KINDS = ['Visit', 'Stay', 'Fuel', 'Food', 'Shopping', 'Other'];
export const CATEGORIES = ['Fuel', 'Food', 'Stay', 'Toll', 'Parking', 'Daan', 'Shopping', 'Other'];

// [date, name, city, kind, planned km from previous stop, notes]
const PLAN = [
  ['2026-11-07', 'Start: Chh. Sambhajinagar', 'Chh. Sambhajinagar', 'Visit', null, ''],
  ['2026-11-07', 'Un (Paavagiri)', 'Un', 'Visit', 308, ''],
  ['2026-11-07', 'Stay at Siddhavarkut', 'Siddhavarkut', 'Stay', 118, 'Rs 700 / 1200 per room.'],
  ['2026-11-08', 'Siddhavarkut darshan', 'Siddhavarkut', 'Visit', null, ''],
  ['2026-11-08', 'Pushpagiri', 'Pushpagiri', 'Visit', 140, ''],
  ['2026-11-08', 'Gandharvapuri', 'Gandharvapuri', 'Visit', 15, ''],
  ['2026-11-08', 'Maksi', 'Maksi', 'Visit', 45, ''],
  ['2026-11-08', 'Stay at Ujjain', 'Ujjain', 'Stay', 40, 'Rs 1000 per room. Rs 1000 advance paid.'],
  ['2026-11-09', 'Ujjain darshan', 'Ujjain', 'Visit', null, ''],
  ['2026-11-09', 'Mohankheda', 'Mohankheda', 'Visit', 136, ''],
  ['2026-11-09', 'Mantungiri', 'Mantungiri', 'Visit', 43, ''],
  ['2026-11-09', 'Aahu', 'Aahu', 'Visit', 15, ''],
  ['2026-11-09', 'Dhar', 'Dhar', 'Visit', 15, ''],
  ['2026-11-09', 'Banediya', 'Banediya', 'Visit', 60, ''],
  ['2026-11-09', 'Stay at Dhai Dweep', 'Indore', 'Stay', 36, 'Rs 1500 + 1200 per room. Rs 2700 advance paid.'],
  ['2026-11-10', 'Gommatgiri', 'Indore', 'Visit', 1, ''],
  ['2026-11-10', 'Sumatidham', 'Indore', 'Visit', 3, ''],
  ['2026-11-10', 'Kanch Mandir', 'Indore', 'Visit', null, ''],
  ['2026-11-10', 'Rajwada', 'Indore', 'Visit', null, ''],
  ['2026-11-10', 'Central Museum', 'Indore', 'Visit', null, 'Closed on Mondays.'],
  ['2026-11-10', 'Lal Bagh Palace', 'Indore', 'Visit', null, 'Closed on Mondays. Open 11 am to 5 pm.'],
  ['2026-11-10', 'Shopping', 'Indore', 'Shopping', null, ''],
  ['2026-11-10', 'Khau Galli (Sarafa)', 'Indore', 'Food', null, 'Night market, about 9 pm onwards.'],
  ['2026-11-10', 'Stay at Dhai Dweep', 'Indore', 'Stay', null, ''],
  ['2026-11-11', 'Badwani', 'Badwani', 'Visit', 162, ''],
  ['2026-11-11', 'Stay at Bawangaja', 'Bawangaja', 'Stay', 37, 'Rs 1200 per room. Rs 2400 advance paid.'],
  ['2026-11-12', 'Bawangaja darshan', 'Bawangaja', 'Visit', null, ''],
  ['2026-11-12', 'Dharangaon', 'Dharangaon', 'Visit', 168, ''],
  ['2026-11-12', 'Mandal', 'Mandal', 'Visit', 45, ''],
  ['2026-11-12', 'Home: Chh. Sambhajinagar', 'Chh. Sambhajinagar', 'Visit', 190, ''],
];

export const SEED_STOPS = PLAN.map(([date, name, city, kind, plannedKm, notes], i) => ({
  id: 'seed-stop-' + String(i + 1).padStart(2, '0'),
  date, name, city, kind, plannedKm, notes,
  km: null, time: '', order: i * 10,
  updatedAt: 0, createdAt: 0, by: 'plan', deleted: false,
}));

export const SEED_EXPENSES = [
  ['2026-11-08', 'Ujjain', 'Stay', 1000, 'Advance paid (Anita Jain)'],
  ['2026-11-09', 'Indore', 'Stay', 2700, 'Advance paid, Dhai Dweep (Prince Jain)'],
  ['2026-11-11', 'Bawangaja', 'Stay', 2400, 'Advance paid (Pravin Jain)'],
].map(([date, city, category, amount, note], i) => ({
  id: 'seed-exp-' + (i + 1),
  date, city, category, amount, note, paidBy: '',
  order: i * 10, updatedAt: 0, createdAt: 0, by: 'plan', deleted: false,
}));
