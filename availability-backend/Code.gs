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
const VALID_ROLES = ['instructor', 'student'];

const PEOPLE_HEADERS = ['id', 'email', 'name', 'role', 'level'];
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
  events.forEach(ev => { keys[ev.key] = true; });

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
  const role = VALID_ROLES.indexOf(p.role) === -1 ? 'student' : p.role;
  if (!name || !email) throw new Error('Name and email are required.');
  if (findByEmail_(email)) throw new Error('That email is already on the list.');
  const id = Utilities.getUuid().slice(0, 8);
  sheet_('People', PEOPLE_HEADERS).appendRow([id, email, name, role, String(p.level || '').trim()]);
  return getAdminData_();
}

function updatePerson_(p) {
  const sh = sheet_('People', PEOPLE_HEADERS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] !== p.id) continue;
    const row = values[i];
    if (p.name !== undefined) row[2] = String(p.name).trim() || row[2];
    if (p.email !== undefined) row[1] = normEmail_(p.email) || row[1];
    if (p.role !== undefined && VALID_ROLES.indexOf(p.role) !== -1) row[3] = p.role;
    if (p.level !== undefined) row[4] = String(p.level).trim();
    sh.getRange(i + 1, 1, 1, PEOPLE_HEADERS.length).setValues([row]);
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
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    role: VALID_ROLES.indexOf(r.role) === -1 ? 'student' : r.role,
    level: String(r.level || '')
  };
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
  }
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
