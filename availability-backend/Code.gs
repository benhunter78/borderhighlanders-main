/**
 * Border Highlanders availability backend (Google Apps Script).
 *
 * Stores people and availability in the Google Sheet this script is attached to,
 * and reads upcoming events from the band Google Calendar.
 * See availability-backend/README.md for setup steps.
 */

const CALENDAR_ID = 'ouoharbh0blj995hi71nio95tg@group.calendar.google.com';
const DAYS_AHEAD = 60;          // how far ahead to list calendar events
const VALID_STATUS = ['yes', 'maybe', 'no'];
const VALID_ROLES = ['member', 'student'];
const PRACTICE_TITLE = 'band practice'; // events with this title are practices; everything else is a performance

const PEOPLE_HEADERS = ['id', 'email', 'name', 'role', 'level', 'instructor', 'instrument'];
const VALID_INSTRUMENTS = ['piper', 'snare', 'tenor', 'bass', 'drum major'];
const LESSON_SUFFIX = '#lesson'; // each practice also has a lesson slot, keyed as <practice key>#lesson
const AVAIL_HEADERS = ['personId', 'eventKey', 'status', 'updated'];

/* ---------- Web entry points ---------- */

function doGet(e) {
  return json_(handle_((e && e.parameter) || {}));
}

function doPost(e) {
  let p = {};
  try {
    p = JSON.parse(e.postData.contents);
  } catch (err) {
    p = (e && e.parameter) || {};
  }
  return json_(handle_(p));
}

function handle_(p) {
  try {
    switch (p.action) {
      case 'data':         return getData_();
      case 'whoami':       return whoami_(p.email);
      case 'setStatus':    return withLock_(() => setStatus_(p));
      case 'adminData':    requireAdmin_(p); return getAdminData_();
      case 'addPerson':    requireAdmin_(p); return withLock_(() => addPerson_(p));
      case 'updatePerson': requireAdmin_(p); return withLock_(() => updatePerson_(p));
      case 'removePerson': requireAdmin_(p); return withLock_(() => removePerson_(p));
      default:             return { error: 'Unknown action' };
    }
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
}

/* ---------- Reads ---------- */

function getData_() {
  const events = getEvents_();
  const keys = {};
  events.forEach(ev => {
    keys[ev.key] = true;
    if (ev.type === 'practice') keys[ev.key + LESSON_SUFFIX] = true;
  });

  const availability = {};
  readRows_(sheet_('Availability', AVAIL_HEADERS)).forEach(r => {
    if (!keys[r.eventKey] || VALID_STATUS.indexOf(r.status) === -1) return;
    (availability[r.eventKey] = availability[r.eventKey] || {})[r.personId] = r.status;
  });

  return { people: publicPeople_(), events: events, availability: availability };
}

function getAdminData_() {
  return { people: readRows_(sheet_('People', PEOPLE_HEADERS)).map(cleanPerson_) };
}

function whoami_(email) {
  const person = findByEmail_(email);
  if (!person) return { error: 'That email is not on the list. Ask the Pipe Major to add you.' };
  const p = cleanPerson_(person);
  delete p.email;
  return { person: p };
}

function getEvents_() {
  const cal = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) throw new Error('Calendar not found. Make sure the script owner can see the band calendar.');
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
  return cal.getEvents(start, end).map(ev => ({
    // Recurring events share an ID, so include the start time to make the key unique.
    key: ev.getId() + '|' + ev.getStartTime().getTime(),
    title: ev.getTitle(),
    type: eventType_(ev.getTitle()),
    start: ev.getStartTime().toISOString(),
    end: ev.getEndTime().toISOString(),
    allDay: ev.isAllDayEvent(),
    location: ev.getLocation() || ''
  }));
}

/* ---------- Writes ---------- */

function setStatus_(p) {
  let person;
  if (p.personId && p.adminKey) {
    requireAdmin_(p);
    person = readRows_(sheet_('People', PEOPLE_HEADERS)).filter(r => r.id === p.personId)[0];
  } else {
    person = findByEmail_(p.email);
  }
  if (!person) throw new Error('Person not found.');
  if (!p.eventKey) throw new Error('Missing event.');
  const key = String(p.eventKey);
  const isLesson = key.slice(-LESSON_SUFFIX.length) === LESSON_SUFFIX;
  const cal = CalendarApp.getCalendarById(CALENDAR_ID);
  const ev = cal && cal.getEventById(key.split('|')[0]);
  if (!ev) throw new Error('Event not found.');
  const type = eventType_(ev.getTitle());
  const who = cleanPerson_(person);
  if (isLesson) {
    if (type !== 'practice') throw new Error('Event not found.');
    if (!(who.role === 'student' || who.instructor)) throw new Error('Only students and instructors mark lessons.');
  } else if (!who.member) {
    throw new Error('Only band members can mark ' + (type === 'practice' ? 'practices.' : 'performances.'));
  }
  const status = String(p.status || '');
  if (status && VALID_STATUS.indexOf(status) === -1) throw new Error('Invalid status.');

  const sh = sheet_('Availability', AVAIL_HEADERS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === person.id && values[i][1] === p.eventKey) {
      if (status) {
        sh.getRange(i + 1, 3, 1, 2).setValues([[status, new Date()]]);
      } else {
        sh.deleteRow(i + 1);
      }
      return { ok: true };
    }
  }
  if (status) sh.appendRow([person.id, p.eventKey, status, new Date()]);
  return { ok: true };
}

function addPerson_(p) {
  const name = String(p.name || '').trim();
  const email = normEmail_(p.email);
  if (!name || !email) throw new Error('Name and email are required.');
  if (findByEmail_(email)) throw new Error('That email is already on the list.');
  const person = normalizeRecord_({
    id: Utilities.getUuid().slice(0, 8),
    email: email,
    name: name,
    role: p.role,
    level: p.level,
    instructor: p.instructor,
    instrument: p.instrument
  });
  const sh = sheet_('People', PEOPLE_HEADERS);
  sh.appendRow(headerRow_(sh).map(h => person[h] !== undefined ? person[h] : ''));
  return getAdminData_();
}

function updatePerson_(p) {
  const sh = sheet_('People', PEOPLE_HEADERS);
  const headers = headerRow_(sh);
  const values = sh.getDataRange().getValues();
  const col = h => headers.indexOf(h);
  for (let i = 1; i < values.length; i++) {
    if (values[i][col('id')] !== p.id) continue;
    const row = values[i];
    const current = {};
    headers.forEach((h, j) => { current[h] = row[j]; });
    if (p.name !== undefined) current.name = String(p.name).trim() || current.name;
    if (p.email !== undefined) current.email = normEmail_(p.email) || current.email;
    if (p.role !== undefined) current.role = p.role;
    if (p.level !== undefined) current.level = p.level;
    if (p.instructor !== undefined) current.instructor = p.instructor;
    if (p.instrument !== undefined) current.instrument = p.instrument;
    const person = normalizeRecord_(current);
    const out = headers.map((h, j) => person[h] !== undefined ? person[h] : row[j]);
    sh.getRange(i + 1, 1, 1, out.length).setValues([out]);
    return getAdminData_();
  }
  throw new Error('Person not found.');
}

function removePerson_(p) {
  const people = sheet_('People', PEOPLE_HEADERS);
  const pv = people.getDataRange().getValues();
  for (let i = pv.length - 1; i >= 1; i--) {
    if (pv[i][0] === p.id) people.deleteRow(i + 1);
  }
  const avail = sheet_('Availability', AVAIL_HEADERS);
  const av = avail.getDataRange().getValues();
  for (let i = av.length - 1; i >= 1; i--) {
    if (av[i][0] === p.id) avail.deleteRow(i + 1);
  }
  return getAdminData_();
}

/* ---------- Helpers ---------- */

function requireAdmin_(p) {
  const key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key) throw new Error('ADMIN_KEY is not set in Script Properties.');
  if (String(p.adminKey || '') !== key) throw new Error('Incorrect admin key.');
}

function publicPeople_() {
  return readRows_(sheet_('People', PEOPLE_HEADERS)).map(r => {
    const p = cleanPerson_(r);
    delete p.email;
    return p;
  });
}

function cleanPerson_(r) {
  const raw = String(r.role || '').trim().toLowerCase();
  // Older rows may have role "instructor"; those are treated as band members who instruct.
  const role = (raw === 'member' || raw === 'instructor') ? 'member' : 'student';
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    role: role,
    member: role === 'member',   // band members can mark performances
    instructor: role === 'member' && (raw === 'instructor' || isTruthy_(r.instructor)),
    level: role === 'student' ? String(r.level || '') : '',
    instrument: normInstrument_(r.instrument)
  };
}

/** Values to write to the sheet for a person, keyed by header name. */
function normalizeRecord_(r) {
  const c = cleanPerson_(r);
  return {
    id: c.id,
    email: normEmail_(c.email),
    name: c.name.trim(),
    role: c.role,
    level: c.level.trim(),
    instructor: c.instructor ? 'yes' : '',
    instrument: c.instrument
  };
}

function normInstrument_(v) {
  let s = String(v || '').trim().toLowerCase();
  if (s === 'pipes' || s === 'pipe') s = 'piper';
  if (s === 'drummajor' || s === 'dm') s = 'drum major';
  return VALID_INSTRUMENTS.indexOf(s) === -1 ? '' : s;
}

function headerRow_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

function isTruthy_(v) {
  return v === true || /^(true|yes|y|x|1)$/i.test(String(v || '').trim());
}

function eventType_(title) {
  return String(title || '').trim().toLowerCase() === PRACTICE_TITLE ? 'practice' : 'performance';
}

function findByEmail_(email) {
  const e = normEmail_(email);
  if (!e) return null;
  return readRows_(sheet_('People', PEOPLE_HEADERS)).filter(r => normEmail_(r.email) === e)[0] || null;
}

function normEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    return sh;
  }
  // Add any header columns introduced by newer versions of this script.
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const existing = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  headers.forEach(h => {
    if (existing.indexOf(h) === -1) {
      existing.push(h);
      sh.getRange(1, existing.length).setValue(h);
    }
  });
  return sh;
}

function readRows_(sh) {
  const values = sh.getDataRange().getValues();
  const headers = values.shift() || [];
  return values
    .filter(row => row.some(v => v !== ''))
    .map(row => {
      const o = {};
      headers.forEach((h, i) => { o[h] = row[i]; });
      return o;
    });
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to create the sheets and grant permissions. */
function setup() {
  sheet_('People', PEOPLE_HEADERS);
  sheet_('Availability', AVAIL_HEADERS);
  Logger.log('Upcoming events found: ' + getEvents_().length);
}
