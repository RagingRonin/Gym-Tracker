/* ================= CONSTANTS ================= */
const KG_LB = 2.2046226218;
const SET_TYPES = ['work', 'warmup', 'failure', 'drop'];
const TYPE_INFO = {
  work:    { label: 'W',  name: 'Working', cls: 'type-work' },
  warmup:  { label: 'WU', name: 'Warmup',  cls: 'type-warmup' },
  failure: { label: 'F',  name: 'Failure', cls: 'type-failure' },
  drop:    { label: 'D',  name: 'Drop',    cls: 'type-drop' }
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

/* ================= STATE ================= */
function defaultState() {
  return {
    settings: { unit: 'kg', theme: 'dark' },
    exercises: [
      { id: uid(), name: 'Bench Press',        rest: 120 },
      { id: uid(), name: 'Squat',              rest: 180 },
      { id: uid(), name: 'Deadlift',           rest: 180 },
      { id: uid(), name: 'Overhead Press',     rest: 120 },
      { id: uid(), name: 'Barbell Row',        rest: 120 },
      { id: uid(), name: 'Pull Up',            rest: 90  },
      { id: uid(), name: 'Lat Pulldown',       rest: 90  },
      { id: uid(), name: 'Dumbbell Curl',      rest: 60  },
      { id: uid(), name: 'Triceps Pushdown',   rest: 60  },
      { id: uid(), name: 'Leg Press',          rest: 120 },
      { id: uid(), name: 'Lateral Raise',      rest: 60  }
    ],
    weeks: []
  };
}

let state;
try { state = JSON.parse(localStorage.getItem('gymtrack')) || defaultState(); }
catch { state = defaultState(); }

function save() { localStorage.setItem('gymtrack', JSON.stringify(state)); }

/* ================= SETTINGS ================= */
function toggleUnit() {
  state.settings.unit = state.settings.unit === 'kg' ? 'lb' : 'kg';
  save(); render();
}

function toggleTheme() {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.settings.theme;
  save();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gymtrack-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        state = JSON.parse(ev.target.result);
        save();
        alert('Data imported successfully!');
        render();
      } catch {
        alert('Invalid file format');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

/* ================= NAVIGATION ================= */
let currentTab = 'plan';
let openDayRef = null;  // { weekId, dayId }
let calDate = new Date();
let calSelected = null; // 'YYYY-MM-DD'
let restTimer = null;
let durationTimer = null;

function switchTab(tab) {
  currentTab = tab;
  openDayRef = null;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('#view-' + tab).classList.remove('hidden');
  document.querySelectorAll('#tabbar button').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  render();
}

function closeDay() {
  stopDurationTimer();
  stopRestTimer();
  openDayRef = null;
  switchTab('plan');
}

/* ================= HELPERS ================= */
function getWeek(id) { return state.weeks.find(w => w.id === id); }
function getDay(wId, dId) { const w = getWeek(wId); return w?.days.find(d => d.id === dId); }
function getExercise(id) { return state.exercises.find(e => e.id === id); }
function getExerciseByName(name) { return state.exercises.find(e => e.name === name); }
function getOpenDay() { return openDayRef ? getDay(openDayRef.weekId, openDayRef.dayId) : null; }

function dispW(kg) {
  const v = state.settings.unit === 'kg' ? kg : kg * KG_LB;
  return Math.round(v * 10) / 10;
}

function kgFromDisplay(display) {
  if (state.settings.unit === 'kg') return display;
  return display / KG_LB;
}

function weightStep() { 
  return state.settings.unit === 'kg' ? 2.5 : 5 / KG_LB; 
}

function unitLabel() { return state.settings.unit; }

function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getCompletedDateForDay(wId, dId) {
  return getDay(wId, dId)?.completedDate;
}

function isCompleted(wId, dId) {
  return !!getCompletedDateForDay(wId, dId);
}

/* ================= WEEKS ================= */
function addWeek() {
  const name = prompt('Week name:', `Week ${state.weeks.length + 1}`);
  if (!name) return;
  state.weeks.push({ id: uid(), name, days: [] });
  save(); render();
}

function renameWeek(weekId) {
  const w = getWeek(weekId);
  const name = prompt('Rename week:', w.name);
  if (!name) return;
  w.name = name; save(); render();
}

function deleteWeek(weekId) {
  const w = getWeek(weekId);
  if (!confirm(`Delete "${w.name}" and all its workouts?`)) return;
  state.weeks = state.weeks.filter(x => x.id !== weekId);
  save(); render();
}

function duplicateWeek(weekId) {
  const w = getWeek(weekId);
  const copy = {
    id: uid(),
    name: w.name + ' (copy)',
    days: w.days.map(d => ({
      id: uid(),
      name: d.name,
      completedDate: null,
      startedAt: null,
      durationSec: null,
      exercises: d.exercises.map(ex => ({
        id: uid(),
        exName: ex.exName,
        rest: ex.rest,
        sets: ex.sets.map(s => ({ 
          id: uid(), 
          type: s.type, 
          weight: s.weight, 
          reps: s.reps, 
          done: false 
        }))
      }))
    }))
  };
  state.weeks.splice(state.weeks.indexOf(w) + 1, 0, copy);
  save(); render();
}

/* ================= DAYS ================= */
function addDay(weekId) {
  const w = getWeek(weekId);
  const name = prompt('Day name (e.g. Push Day):', `Day ${w.days.length + 1}`);
  if (!name) return;
  w.days.push({ 
    id: uid(), 
    name, 
    exercises: [], 
    completedDate: null, 
    startedAt: null, 
    durationSec: null 
  });
  save(); render();
}

function renameDay(weekId, dayId) {
  const d = getDay(weekId, dayId);
  const name = prompt('Rename day:', d.name);
  if (!name) return;
  d.name = name; save(); render();
}

function openDay(weekId, dayId) {
  openDayRef = { weekId, dayId };
  const d = getDay(weekId, dayId);
  if (!d.startedAt) {
    d.startedAt = Date.now();
    d.durationSec = 0;
  }
  startDurationTimer();
  switchTab('day');
}

function deleteDay() {
  if (!openDayRef) return;
  if (!confirm('Delete this workout day?')) return;
  const w = getWeek(openDayRef.weekId);
  w.days = w.days.filter(x => x.id !== openDayRef.dayId);
  save();
  closeDay();
}

function toggleComplete() {
  const d = getOpenDay();
  if (!d) return;
  if (d.completedDate) {
    d.completedDate = null;
  } else {
    d.completedDate = new Date().toISOString();
  }
  save(); render();
}

/* ================= EXERCISES IN DAY ================= */
function openPicker() {
  $('#picker').classList.remove('hidden');
  renderPicker();
}

function closePicker() {
  $('#picker').classList.add('hidden');
}

function renderPicker() {
  const q = ($('#picker-search')?.value || '').toLowerCase();
  const filtered = state.exercises.filter(e => e.name.toLowerCase().includes(q));
  $('#picker-list').innerHTML = filtered.map(e => `
    <button class="picker-item" onclick="addExerciseToDay('${e.id}')">
      ${esc(e.name)} <span class="muted">${e.rest}s rest</span>
    </button>
  `).join('');
}

function addExerciseToDay(exId) {
  const d = getOpenDay();
  const ex = getExercise(exId);
  if (!ex || !d) return;
  
  d.exercises.push({
    id: uid(),
    exName: ex.name,
    rest: ex.rest,
    sets: [{ id: uid(), type: 'work', weight: 20, reps: 10, done: false }]
  });
  
  save(); render(); closePicker();
}

function removeExerciseFromDay(exIdx) {
  const d = getOpenDay();
  if (!d) return;
  d.exercises.splice(exIdx, 1);
  save(); render();
}

function addSetToExercise(exIdx) {
  const d = getOpenDay();
  if (!d) return;
  const ex = d.exercises[exIdx];
  const last = ex.sets[ex.sets.length - 1] || { type: 'work', weight: 20, reps: 10 };
  ex.sets.push({ 
    id: uid(), 
    type: 'work', 
    weight: last.weight, 
    reps: last.reps, 
    done: false 
  });
  save(); render();
}

function removeSetFromExercise(exIdx, setIdx) {
  const d = getOpenDay();
  if (!d) return;
  d.exercises[exIdx].sets.splice(setIdx, 1);
  save(); render();
}

function updateSet(exIdx, setIdx, field, delta) {
  const d = getOpenDay();
  if (!d) return;
  const set = d.exercises[exIdx].sets[setIdx];
  
  if (field === 'weight') {
    set.weight = Math.max(0, +(set.weight + delta).toFixed(2));
  } else if (field === 'reps') {
    set.reps = Math.max(0, set.reps + delta);
  } else if (field === 'type') {
    set.type = delta;
  }
  
  save(); render();
}

function toggleSetDone(exIdx, setIdx) {
  const d = getOpenDay();
  if (!d) return;
  const set = d.exercises[exIdx].sets[setIdx];
  set.done = !set.done;
  save(); render();
}

function startRestForSet(exIdx) {
  const d = getOpenDay();
  if (!d || exIdx >= d.exercises.length) return;
  const rest = d.exercises[exIdx].rest || 90;
  startRestTimer(rest);
}

/* ================= WEIGHT INPUT HANDLER ================= */
function handleWeightInput(exIdx, setIdx, newValue) {
  const d = getOpenDay();
  if (!d) return;
  const set = d.exercises[exIdx].sets[setIdx];
  const kgValue = kgFromDisplay(parseFloat(newValue) || 0);
  set.weight = Math.max(0, kgValue);
  save(); render();
}

/* ================= EXERCISE LIBRARY ================= */
function addLibraryExercise() {
  const name = prompt('Exercise name:');
  if (!name) return;
  const rest = parseInt(prompt('Default rest (seconds):', '90')) || 90;
  state.exercises.push({ id: uid(), name, rest });
  save(); render();
}

function editLibraryExercise(exId) {
  const ex = getExercise(exId);
  if (!ex) return;
  const name = prompt('Edit exercise name:', ex.name);
  if (name) ex.name = name;
  const rest = parseInt(prompt('Default rest (seconds):', ex.rest)) || ex.rest;
  if (rest) ex.rest = rest;
  save(); render();
}

function deleteLibraryExercise(exId) {
  const ex = getExercise(exId);
  if (!confirm(`Delete "${ex.name}" from library?`)) return;
  state.exercises = state.exercises.filter(e => e.id !== exId);
  save(); render();
}

/* ================= TIMERS ================= */
function startRestTimer(seconds) {
  clearInterval(restTimer);
  let remaining = seconds;
  $('#rest-timer').classList.remove('hidden');
  
  const update = () => {
    $('#rest-display').textContent = fmtTime(remaining);
    if (remaining <= 0) {
      stopRestTimer();
      navigator.vibrate?.(500);
    } else {
      remaining--;
    }
  };
  
  update();
  restTimer = setInterval(update, 1000);
}

function stopRestTimer() {
  clearInterval(restTimer);
  $('#rest-timer').classList.add('hidden');
}

function skipRest() {
  stopRestTimer();
}

function startDurationTimer() {
  clearInterval(durationTimer);
  const d = getOpenDay();
  if (!d) return;
  
  durationTimer = setInterval(() => {
    d.durationSec = (d.durationSec || 0) + 1;
    $('#duration-display').textContent = fmtTime(d.durationSec);
    save();
  }, 1000);
}

function stopDurationTimer() {
  clearInterval(durationTimer);
}

/* ================= CALENDAR ================= */
function calMove(dir) {
  calDate.setMonth(calDate.getMonth() + dir);
  render();
}

function renderCalendar() {
  const y = calDate.getFullYear();
  const m = calDate.getMonth();
  
  $('#cal-title').textContent = new Date(y, m).toLocaleDateString('en', { month: 'long', year: 'numeric' });
  
  // Get all workouts by date
  const workoutsByDate = {};
  state.weeks.forEach(w => {
    w.days.forEach(d => {
      if (d.completedDate) {
        const dateStr = d.completedDate.slice(0, 10);
        if (!workoutsByDate[dateStr]) workoutsByDate[dateStr] = [];
        workoutsByDate[dateStr].push({ week: w.name, day: d.name });
      }
    });
  });
  
  // Build calendar grid
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const grid = [];
  
  for (let i = 0; i < firstDay; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(d);
  
  const dateStrs = Object.keys(workoutsByDate);
  let html = '';
  for (let i = 0; i < grid.length; i++) {
    const day = grid[i];
    const dateStr = day ? `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
    const hasWorkout = dateStr && workoutsByDate[dateStr];
    const isSelected = dateStr === calSelected;
    
    html += `<div class="cal-day ${!day ? 'empty' : ''} ${hasWorkout ? 'has-workout' : ''} ${isSelected ? 'selected' : ''}" 
              onclick="${day ? `selectCalendarDay('${dateStr}')` : ''}">
              ${day || ''}
            </div>`;
  }
  $('#cal-grid').innerHTML = html;
  
  // Show detail if selected
  if (calSelected && workoutsByDate[calSelected]) {
    const workouts = workoutsByDate[calSelected];
    $('#cal-day-detail').innerHTML = `
      <div class="cal-detail">
        <h3>${new Date(calSelected).toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
        ${workouts.map(w => `<p><strong>${esc(w.week)}</strong> - ${esc(w.day)}</p>`).join('')}
      </div>
    `;
  } else {
    $('#cal-day-detail').innerHTML = '';
  }
}

function selectCalendarDay(dateStr) {
  calSelected = calSelected === dateStr ? null : dateStr;
  render();
}

/* ================= RENDERING ================= */
function render() {
  applyTheme();
  updateUnitButton();
  updateThemeButton();
  
  if (currentTab === 'plan') renderPlan();
  else if (currentTab === 'calendar') renderCalendar();
  else if (currentTab === 'library') renderLibrary();
  else if (currentTab === 'day') renderDay();
}

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
}

function updateUnitButton() {
  $('#unit-toggle').textContent = state.settings.unit === 'kg' ? 'kg ▼ lb' : 'lb ▼ kg';
}

function updateThemeButton() {
  $('#theme-toggle').textContent = state.settings.theme === 'dark' ? '🌙 Dark' : '☀️ Light';
}

function renderPlan() {
  if (openDayRef) {
    renderDay();
    return;
  }
  
  let html = '';
  for (const week of state.weeks) {
    html += `
      <div class="week-card">
        <div class="week-header">
          <h2>${esc(week.name)}</h2>
          <div class="week-actions">
            <button class="icon-btn" onclick="renameWeek('${week.id}')">✎</button>
            <button class="icon-btn" onclick="duplicateWeek('${week.id}')">📋</button>
            <button class="icon-btn" onclick="deleteWeek('${week.id}')">🗑</button>
          </div>
        </div>
        <div class="days-list">
          ${week.days.map(d => {
            const completed = isCompleted(week.id, d.id);
            return `
              <div class="day-item ${completed ? 'completed' : ''}">
                <button class="day-btn" onclick="openDay('${week.id}', '${d.id}')">
                  <span class="day-name">${esc(d.name)}</span>
                  <span class="day-count">${d.exercises.length} ex</span>
                  ${completed ? '<span class="check">✓</span>' : ''}
                </button>
                <div class="day-item-actions">
                  <button class="icon-btn" onclick="renameDay('${week.id}', '${d.id}')">✎</button>
                  <button class="icon-btn" onclick="deleteDay('${week.id}', '${d.id}')">🗑</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <button class="btn-secondary" onclick="addDay('${week.id}')">＋ Add Day</button>
      </div>
    `;
  }
  
  $('#weeks-list').innerHTML = html || '<p class="muted">No weeks yet. Add one to get started!</p>';
}

function deleteDay(weekId, dayId, skipConfirm) {
  const w = getWeek(weekId);
  const d = getDay(weekId, dayId);
  if (!skipConfirm && !confirm(`Delete "${d.name}"?`)) return;
  w.days = w.days.filter(x => x.id !== dayId);
  save(); render();
}

function renderDay() {
  const d = getOpenDay();
  if (!d) return;
  
  $('#day-title').textContent = esc(d.name);
  $('#day-subtitle').textContent = d.durationSec ? `Duration: ${fmtTime(d.durationSec)}` : 'Not started';
  
  const completed = !!d.completedDate;
  $('#complete-btn').textContent = completed ? '✓ Completed' : '✓ Mark Complete';
  $('#complete-btn').classList.toggle('btn-primary', !completed);
  $('#complete-btn').classList.toggle('btn-success', completed);
  
  let html = '';
  for (let i = 0; i < d.exercises.length; i++) {
    const ex = d.exercises[i];
    const libEx = getExerciseByName(ex.exName);
    
    html += `
      <div class="exercise-card">
        <div class="ex-header">
          <h3>${esc(ex.exName)}</h3>
          <button class="icon-btn" onclick="removeExerciseFromDay(${i})">✕</button>
        </div>
        
        ${ex.sets.map((s, j) => `
          <div class="set-row">
            <input type="checkbox" ${s.done ? 'checked' : ''} 
                   onchange="toggleSetDone(${i}, ${j})" class="set-checkbox">
            <select onchange="updateSet(${i}, ${j}, 'type', this.value)" class="set-type ${TYPE_INFO[s.type].cls}">
              ${SET_TYPES.map(t => `<option value="${t}" ${t === s.type ? 'selected' : ''}>${TYPE_INFO[t].name}</option>`).join('')}
            </select>
            <span class="set-num">Set ${j + 1}</span>
            
            <div class="weight-input">
              <button onclick="updateSet(${i}, ${j}, 'weight', -${weightStep()})">−</button>
              <input type="number" step="0.5" value="${dispW(s.weight).toFixed(1)}" 
                     onchange="handleWeightInput(${i}, ${j}, this.value)">
              <span>${unitLabel()}</span>
              <button onclick="updateSet(${i}, ${j}, 'weight', ${weightStep()})">+</button>
            </div>
            
            <div class="reps-input">
              <button onclick="updateSet(${i}, ${j}, 'reps', -1)">−</button>
              <span>${s.reps} reps</span>
              <button onclick="updateSet(${i}, ${j}, 'reps', 1)">+</button>
            </div>
            
            <button class="icon-btn" onclick="removeSetFromExercise(${i}, ${j})">✕</button>
          </div>
        `).join('')}
        
        <div class="ex-actions">
          <button class="btn-secondary" onclick="addSetToExercise(${i})">＋ Set</button>
          <button class="btn-secondary" onclick="startRestForSet(${i})">⏱ ${ex.rest}s Rest</button>
        </div>
      </div>
    `;
  }
  
  $('#day-exercises').innerHTML = html;
}

function renderLibrary() {
  const html = state.exercises.map(ex => `
    <div class="library-item">
      <div>
        <h3>${esc(ex.name)}</h3>
        <p class="muted">Default rest: ${ex.rest}s</p>
      </div>
      <div class="library-actions">
        <button class="icon-btn" onclick="editLibraryExercise('${ex.id}')">✎</button>
        <button class="icon-btn" onclick="deleteLibraryExercise('${ex.id}')">🗑</button>
      </div>
    </div>
  `).join('');
  
  $('#library-list').innerHTML = html;
}

/* ================= INIT ================= */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && openDayRef) {
    startDurationTimer();
  }
});

applyTheme();
render();
