const $ = id => document.getElementById(id);
let device, timer, generation = 0, mode = '', points = [], wifiToken = '';
let logs = JSON.parse(localStorage.getItem('kt-logs') || '{}');
const scriptedSleep = [5.5, 7, 6, 8, 6.5, 7.5, 8, 5, 7, 8.5, 6, 7.25, 8, 6.75];
const scriptedEnergy = [2, 4, 3, 4, 2, 4, 5, 2, 3, 5, 3, 4, 4, 3];
const status = value => { $('status').textContent = value; };

function draw() {
  const canvas = $('plot'), ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 640, 150);
  ctx.strokeStyle = '#243750';
  for (const y of [30, 75, 120]) {
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(640,y); ctx.stroke();
  }
  if (!points.length) return;
  const bpms = points.map(sample => sample[1]);
  const min = Math.min(...bpms) - 5, max = Math.max(...bpms) + 5;
  ctx.beginPath(); ctx.strokeStyle = '#78ecd0'; ctx.lineWidth = 3;
  bpms.forEach((bpm, i) => {
    const x = 10 + i / Math.max(1, bpms.length - 1) * 620;
    const y = 135 - 120 * (bpm - min) / (max - min);
    if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
}

function renderSamples(samples) {
  points = samples.slice(-60);
  const last = points.at(-1);
  $('pulse').textContent = last ? Math.round(last[1]) : '—';
  $('oxygen').textContent = last?.[2] ?? '—';
  draw();
}

function agent() {
  const demo = mode === 'demo';
  const pairs = demo ? scriptedSleep.map((sleep,i) => ({sleep,energy:scriptedEnergy[i]})) : Object.values(logs);
  const short = pairs.filter(p => p.sleep < 7), long = pairs.filter(p => p.sleep >= 7);
  const mean = group => group.reduce((sum,p) => sum + p.energy,0) / group.length;
  const enough = pairs.length >= 7 && short.length >= 3 && long.length >= 3;
  $('insight').textContent = enough
    ? 'Energy averaged ' + mean(long).toFixed(1) + '/5 after at least 7 hours of sleep and ' + mean(short).toFixed(1) + '/5 after shorter nights.'
    : 'The agent needs at least 7 paired check-ins, including 3 nights in each sleep group.';
  $('evidence').textContent = (demo ? 'Simulated' : 'Personal') + ' check-ins: ' + pairs.length +
    (enough ? ' · ' + long.length + ' longer nights · ' + short.length + ' shorter nights. This comparison shows an association.' : '.');
  $('nudge').textContent = $('nudges').checked && enough && mean(long) - mean(short) >= .5
    ? 'Try a consistent bedtime for a week and compare your energy scores.' : '';
}
function disconnect() {
  generation++;
  clearInterval(timer);
  if (device?.gatt?.connected) device.gatt.disconnect();
  device = undefined;
  mode = '';
  renderSamples([]);
  agent();
  status('Disconnected.');
}
$('stop').onclick = disconnect;
$('demo').onclick = () => {
  disconnect(); mode = 'demo'; agent(); status('SIMULATED · session replay');
  let tick = 0;
  const show = () => {
    const bpm = Math.round(77 + 5*Math.sin(tick/3) + 2*Math.sin(tick*1.6));
    renderSamples([...points,[Date.now()/1000,bpm,97+Number(tick%4===0)]]);
    tick++;
  };
  show();
  timer = setInterval(show, 700);
};
$('ble-connect').onsubmit = async event => {
  event.preventDefault();
  disconnect();
  const attempt = generation;
  if (!navigator.bluetooth) return status('Bluetooth needs a supported Chrome browser and HTTPS or localhost.');
  const namePrefix = $('ble-name').value.trim();
  const options = namePrefix
    ? {filters:[{namePrefix}], optionalServices:['heart_rate']}
    : $('check-watch').checked
      ? {acceptAllDevices:true, optionalServices:['heart_rate']}
      : {filters:[{services:['heart_rate']}]};
  let selected;
  try {
    selected = await navigator.bluetooth.requestDevice(options);
    if (attempt !== generation) return;
    device = selected;
    const gatt = await selected.gatt.connect();
    const service = await gatt.getPrimaryService('heart_rate');
    const measurement = await service.getCharacteristic('heart_rate_measurement');
    if (attempt !== generation) { selected.gatt.disconnect(); return; }
    measurement.addEventListener('characteristicvaluechanged', ({target}) => {
      if (attempt !== generation) return;
      const data = target.value;
      if (data.byteLength < 2) return;
      const flag = data.getUint8(0);
      if ((flag & 6) === 4 || ((flag & 1) && data.byteLength < 3)) return;
      const bpm = flag & 1 ? data.getUint16(1,true) : data.getUint8(1);
      if (bpm > 0) renderSamples([...points,[Date.now()/1000,bpm,null]]);
    });
    selected.addEventListener('gattserverdisconnected', () => {
      if (attempt === generation) disconnect();
    }, {once:true});
    await measurement.startNotifications();
    if (attempt !== generation) return;
    mode = 'ble'; status('BLUETOOTH · ' + (selected.name || 'heart-rate broadcaster'));
  } catch (error) {
    if (selected?.gatt.connected) selected.gatt.disconnect();
    if (attempt === generation) status(error.name === 'NotFoundError'
      ? (selected
          ? 'Device found, but it did not expose the heart-rate service.'
          : 'No device selected. Check the name and capitalization, or clear the search and show nearby devices.')
      : 'Bluetooth: ' + error.message);
  }
};
function parseWatchCsv(raw) {
  const [header, ...rows] = raw.trim().split(/\r?\n/);
  if (header.replace(/^\uFEFF/, '').toLowerCase() !== 'timestamp,bpm') {
    throw Error('Use a CSV with timestamp,bpm as the header.');
  }
  if (!rows.length || rows.length > 10000) throw Error('Include 1 to 10,000 readings.');
  const samples = new Map();
  for (const [i, row] of rows.entries()) {
    const fields = row.split(',').map(value => value.trim());
    const [timestamp, bpm] = fields;
    const time = Date.parse(timestamp);
    const zoned = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/i;
    if (fields.length !== 2 || !zoned.test(timestamp) || !Number.isFinite(time) ||
        !/^\d{1,3}$/.test(bpm) || Number(bpm) < 1 || Number(bpm) > 255) {
      throw Error('Invalid timestamp or bpm on line ' + (i+2) + '.');
    }
    samples.set(time, [time/1000, Number(bpm), null]);
  }
  return [...samples.values()].sort((a,b) => a[0] - b[0]);
}

$('watch-file').onchange = async event => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  disconnect();
  const attempt = generation;
  try {
    if (file.size > 1024 * 1024) throw Error('CSV is larger than 1 MB.');
    const rows = parseWatchCsv(await file.text());
    if (attempt !== generation) return;
    mode = 'imported';
    renderSamples(rows);
    status('IMPORTED HISTORY · ' + rows.length + ' pulse readings · showing the latest ' + points.length);
  } catch (error) {
    if (attempt === generation) status(error.message);
  }
};

const headers = token => ({Authorization:'Bearer ' + token});
$('wifi').onclick = () => {
  disconnect();
  const attempt = generation;
  const token = $('token').value.trim();
  if (!token) return status('Enter the session token printed by server.py.');
  mode = 'wifi';
  wifiToken = token;
  status('Connecting to local receiver…');
  const poll = async () => {
    try {
      const response = await fetch('local/samples',{headers:headers(token)});
      if (!response.ok) throw Error('Receiver rejected the request (' + response.status + ').');
      const samples = await response.json();
      if (attempt !== generation) return;
      renderSamples(samples);
      const age = samples.length ? Math.round(Date.now()/1000 - samples.at(-1)[0]) : null;
      status(age === null ? 'WI-FI · waiting for ESP32' : age <= 12
        ? 'WI-FI · live MAX30102 packet' : 'WI-FI · last packet ' + age + 's ago');
    } catch(error) {
      if (attempt === generation) status(error.message);
    } finally {
      if (attempt === generation) timer = setTimeout(poll, 1000);
    }
  };
  poll();
};
$('checkin').onsubmit = event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const now = new Date();
  const day = [now.getFullYear(),now.getMonth()+1,now.getDate()].join('-');
  logs[day] = Object.fromEntries([...form].map(([k,v]) => [k,Number(v)]));
  localStorage.setItem('kt-logs',JSON.stringify(logs));
  if (mode === 'demo') disconnect();
  agent();
};
$('nudges').onchange = agent;
$('export').onclick = () => {
  const payload = {checkIns: logs, signalSource: mode, recentSamples: points};
  if (mode === 'demo') payload.simulatedCheckIns = scriptedSleep.map((sleep,i) => ({sleep,energy:scriptedEnergy[i]}));
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = 'voltctrl-local.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
};
$('clear').onclick = async () => {
  if (!confirm('Clear local check-ins and the current signal view? Receiver samples are also erased when its token is available.')) return;
  const token = wifiToken || $('token').value.trim();
  disconnect(); logs = {}; localStorage.removeItem('kt-logs'); agent();
  if (!token) return status('Browser data cleared. Receiver data requires its session token.');
  try {
    const result = await fetch('local/samples',{method:'DELETE',headers:headers(token)});
    if (!result.ok) throw Error();
    wifiToken = ''; $('token').value = '';
    status('Browser data and receiver samples cleared.');
  } catch {
    status('Browser data cleared. Receiver samples could not be erased.');
  }
};
draw(); agent();
