const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const CITIES = {
  tabuk:   { name: 'تبوك', lat: 28.3838, lon: 36.5662, offset: 180 },
  riyadh:  { name: 'الرياض', lat: 24.7136, lon: 46.6753, offset: 180 },
  jeddah:  { name: 'جدة', lat: 21.4858, lon: 39.1925, offset: 180 },
  makkah:  { name: 'مكة', lat: 21.3891, lon: 39.8579, offset: 180 },
  madinah: { name: 'المدينة المنورة', lat: 24.5247, lon: 39.5692, offset: 180 },
  dammam:  { name: 'الدمام', lat: 26.4207, lon: 50.0888, offset: 180 }
};

const BODY_LABELS = {
  Moon: 'القمر', Mercury: 'عطارد', Venus: 'الزهرة', Mars: 'المريخ', Jupiter: 'المشتري', Saturn: 'زحل'
};

let Astro;
let selectedBody = 'Moon';
let activeTab = 'today';
let customLocation = null;
let renderToken = 0;

const arabicNumber = new Intl.NumberFormat('ar-SA-u-nu-arab', { maximumFractionDigits: 0 });

function pad2(n) { return String(n).padStart(2, '0'); }
function todaySaudi() {
  const now = new Date(Date.now() + 180 * 60000);
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth()+1)}-${pad2(now.getUTCDate())}`;
}
function makeInstant(dateString, hour, offsetMinutes) {
  const [y,m,d] = dateString.split('-').map(Number);
  const h = Math.floor(hour);
  const minute = Math.round((hour-h)*60);
  return new Date(Date.UTC(y,m-1,d,h,minute,0) - offsetMinutes*60000);
}
function localDateString(date, offsetMinutes) {
  const x = new Date(date.getTime() + offsetMinutes*60000);
  return `${x.getUTCFullYear()}-${pad2(x.getUTCMonth()+1)}-${pad2(x.getUTCDate())}`;
}
function addDays(dateString, days) {
  const [y,m,d] = dateString.split('-').map(Number);
  const x = new Date(Date.UTC(y,m-1,d+days,12));
  return `${x.getUTCFullYear()}-${pad2(x.getUTCMonth()+1)}-${pad2(x.getUTCDate())}`;
}
function formatTime(date, offsetMinutes) {
  if (!date) return '—';
  const x = new Date(date.getTime() + offsetMinutes*60000);
  let h = x.getUTCHours();
  const min = x.getUTCMinutes();
  const ap = h < 12 ? 'ص' : 'م';
  h = h % 12 || 12;
  return `${arabicNumber.format(h)}:${pad2(min).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d])} ${ap}`;
}
function formatDay(dateString, offsetMinutes) {
  const date = makeInstant(dateString, 12, offsetMinutes);
  const shifted = new Date(date.getTime() + offsetMinutes*60000);
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-arab', { weekday:'short', day:'numeric', month:'short', timeZone:'UTC' }).format(shifted);
}
function dirName(azimuth) {
  const dirs = ['شمال','شمال شرقي','شرق','جنوب شرقي','جنوب','جنوب غربي','غرب','شمال غربي'];
  const a = ((azimuth % 360) + 360) % 360;
  return dirs[Math.round(a / 45) % 8];
}
function phaseName(angle) {
  const a = ((angle % 360) + 360) % 360;
  if (a < 22.5 || a >= 337.5) return 'محاق';
  if (a < 67.5) return 'هلال متزايد';
  if (a < 112.5) return 'تربيع أول';
  if (a < 157.5) return 'أحدب متزايد';
  if (a < 202.5) return 'بدر';
  if (a < 247.5) return 'أحدب متناقص';
  if (a < 292.5) return 'تربيع أخير';
  return 'هلال متناقص';
}
function currentLocation() {
  return customLocation || CITIES[$('#citySelect').value];
}
function getObserver() {
  const loc = currentLocation();
  return new Astro.Observer(loc.lat, loc.lon, 0);
}
function bodyEnum() { return Astro.Body[selectedBody]; }
function horizon(body, date, observer) {
  const eq = Astro.Equator(body, date, observer, true, true);
  return Astro.Horizon(date, observer, eq.ra, eq.dec, 'normal');
}
function searchEvent(direction, dateString, loc, observer) {
  const start = makeInstant(dateString, 0, loc.offset);
  const event = Astro.SearchRiseSet(bodyEnum(), observer, direction, start, 1.05);
  if (!event) return null;
  if (localDateString(event.date, loc.offset) !== dateString) return null;
  const hor = horizon(bodyEnum(), event.date, observer);
  return { date:event.date, az:hor.azimuth };
}
function scanDay(dateString, loc, observer, options={}) {
  const { darkOnly=false, step=10 } = options;
  let best = null;
  let firstVisible = null;
  let lastVisible = null;
  for (let minute=0; minute<1440; minute+=step) {
    const date = makeInstant(dateString, minute/60, loc.offset);
    const hor = horizon(bodyEnum(), date, observer);
    const sun = horizon(Astro.Body.Sun, date, observer);
    if (!best || hor.altitude > best.alt) best = { date, alt:hor.altitude, az:hor.azimuth };
    const suitable = hor.altitude >= 10 && sun.altitude <= -6;
    if (suitable) {
      if (!firstVisible) firstVisible = { date, alt:hor.altitude, az:hor.azimuth };
      lastVisible = { date, alt:hor.altitude, az:hor.azimuth };
      if (darkOnly && (!best || hor.altitude > best.alt)) best = { date, alt:hor.altitude, az:hor.azimuth };
    }
  }
  let darkBest = null;
  for (let minute=0; minute<1440; minute+=step) {
    const date = makeInstant(dateString, minute/60, loc.offset);
    const hor = horizon(bodyEnum(), date, observer);
    const sun = horizon(Astro.Body.Sun, date, observer);
    if (sun.altitude <= -6 && hor.altitude >= 10 && (!darkBest || hor.altitude > darkBest.alt)) darkBest = { date, alt:hor.altitude, az:hor.azimuth };
  }
  return { best, darkBest, firstVisible, lastVisible, suitable:!!darkBest };
}
function visibilityAt(date, observer) {
  const hor = horizon(bodyEnum(), date, observer);
  const sun = horizon(Astro.Body.Sun, date, observer);
  if (hor.altitude <= 0) return { level:'bad', title:'تحت الأفق', reason:'الجرم غير موجود فوق الأفق في هذا الوقت.', hor, sun };
  if (sun.altitude > -6) return { level:'warn', title:'السماء مضيئة', reason:'الجرم فوق الأفق، لكن ضوء النهار أو الشفق قوي.', hor, sun };
  if (hor.altitude < 10) return { level:'warn', title:'منخفض جدًا', reason:'قريب من الأفق؛ الرؤية تتأثر بالغبار والهواء.', hor, sun };
  return { level:'good', title:'مناسب للرصد', reason:'فوق 10° والسماء مظلمة فلكيًا بما يكفي.', hor, sun };
}

function updateLocationHeader() {
  const loc = currentLocation();
  $('#locationName').textContent = loc.name;
  $('#locationCoords').textContent = `${loc.lat.toFixed(3)}°N · ${loc.lon.toFixed(3)}°E`;
}
function updateTimeLabel() {
  const loc = currentLocation();
  $('#timeLabel').textContent = formatTime(makeInstant($('#dateInput').value, Number($('#timeInput').value), loc.offset), loc.offset);
}
function setCompass(hor) {
  const altitude = Math.max(0, Math.min(90, hor.altitude));
  const radius = 43 * (90-altitude)/90;
  const angle = (hor.azimuth - 90) * Math.PI/180;
  const x = 50 + radius*Math.cos(angle);
  const y = 50 + radius*Math.sin(angle);
  $('#bodyDot').style.left = `${x}%`;
  $('#bodyDot').style.top = `${y}%`;
  $('#azLine').style.transform = `rotate(${hor.azimuth-90}deg)`;
}
function setTabs() {
  $$('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === activeTab));
  $$('.tab-page').forEach(page => page.classList.remove('active-page'));
  $(`#${activeTab}Tab`).classList.add('active-page');
}

async function render() {
  if (!Astro) return;
  const token = ++renderToken;
  updateLocationHeader(); updateTimeLabel();
  const loc = currentLocation();
  const observer = getObserver();
  const dateString = $('#dateInput').value;
  const date = makeInstant(dateString, Number($('#timeInput').value), loc.offset);
  const vis = visibilityAt(date, observer);
  setCompass(vis.hor);

  $('#currentBodyTitle').textContent = BODY_LABELS[selectedBody];
  $('#directionNow').textContent = `${dirName(vis.hor.azimuth)} · ${arabicNumber.format(Math.round(vis.hor.azimuth))}°`;
  $('#altitudeNow').textContent = `ارتفاع ${arabicNumber.format(Math.round(vis.hor.altitude))}° فوق الأفق`;
  $('#visibilityReason').textContent = vis.reason;
  $('#visibilityBadge').textContent = vis.title;
  $('#visibilityBadge').className = `badge ${vis.level}`;

  const rise = searchEvent(+1, dateString, loc, observer);
  const set = searchEvent(-1, dateString, loc, observer);
  const dayScan = scanDay(dateString, loc, observer, {step:10});
  $('#riseTime').textContent = rise ? formatTime(rise.date, loc.offset) : '—';
  $('#riseDir').textContent = rise ? `${dirName(rise.az)} · ${arabicNumber.format(Math.round(rise.az))}°` : 'لا يوجد حدث في هذا اليوم';
  $('#setTime').textContent = set ? formatTime(set.date, loc.offset) : '—';
  $('#setDir').textContent = set ? `${dirName(set.az)} · ${arabicNumber.format(Math.round(set.az))}°` : 'لا يوجد حدث في هذا اليوم';
  $('#maxAlt').textContent = `${arabicNumber.format(Math.round(dayScan.best.alt))}°`;
  $('#maxTime').textContent = formatTime(dayScan.best.date, loc.offset);
  $('#bestTime').textContent = dayScan.darkBest ? formatTime(dayScan.darkBest.date, loc.offset) : 'لا يوجد';
  $('#bestDir').textContent = dayScan.darkBest ? `${dirName(dayScan.darkBest.az)} · ارتفاع ${arabicNumber.format(Math.round(dayScan.darkBest.alt))}°` : 'لا توجد نافذة مناسبة وفق الشرط الحالي';

  if (selectedBody === 'Moon') {
    $('#moonInfo').hidden = false;
    const phase = Astro.MoonPhase(date);
    const illum = Astro.Illumination(Astro.Body.Moon, date);
    $('#moonPhase').textContent = phaseName(phase);
    $('#moonIllumination').textContent = `${arabicNumber.format(Math.round(illum.phase_fraction*100))}%`;
  } else {
    $('#moonInfo').hidden = true;
  }

  const weekRows = [];
  let weekCount = 0;
  let monthCount = 0;
  const monthRows = [];
  for (let i=0; i<30; i++) {
    if (token !== renderToken) return;
    const ds = addDays(dateString, i);
    const result = scanDay(ds, loc, observer, {step:20});
    if (result.suitable) monthCount++;
    if (i<7) {
      if (result.suitable) weekCount++;
      weekRows.push({ds, result});
    }
    monthRows.push({ds, result});
    if (i % 5 === 4) await new Promise(requestAnimationFrame);
  }
  if (token !== renderToken) return;

  $('#weekCount').textContent = `${arabicNumber.format(weekCount)} / ٧`;
  $('#weekProgress').style.width = `${weekCount/7*100}%`;
  $('#monthCount').textContent = `${arabicNumber.format(monthCount)} / ٣٠`;
  $('#monthProgress').style.width = `${monthCount/30*100}%`;
  $('#weekList').innerHTML = weekRows.map(({ds,result}) => {
    if (!result.suitable) return `<article class="forecast-row panel weak"><span class="date">${formatDay(ds,loc.offset)}</span><span class="detail">رصد ضعيف وفق الشرط الفلكي</span></article>`;
    const b = result.darkBest;
    return `<article class="forecast-row panel good"><span class="date">${formatDay(ds,loc.offset)}</span><span class="detail">أفضل وقت ${formatTime(b.date,loc.offset)} · ${dirName(b.az)} · ارتفاع ${arabicNumber.format(Math.round(b.alt))}°</span></article>`;
  }).join('');
  $('#monthGrid').innerHTML = monthRows.map(({ds,result}) => {
    if (!result.suitable) return `<article class="month-day"><strong>${formatDay(ds,loc.offset)}</strong><span>غير مناسب</span></article>`;
    return `<article class="month-day good"><strong>${formatDay(ds,loc.offset)}</strong><span>${formatTime(result.darkBest.date,loc.offset)} · ${arabicNumber.format(Math.round(result.darkBest.alt))}°</span></article>`;
  }).join('');
}

function scheduleRender() {
  clearTimeout(scheduleRender.timer);
  scheduleRender.timer = setTimeout(render, 70);
}

$$('.body-chip').forEach(btn => btn.addEventListener('click', () => {
  selectedBody = btn.dataset.body;
  $$('.body-chip').forEach(x => x.classList.toggle('active', x === btn));
  scheduleRender();
}));
$$('.tab').forEach(btn => btn.addEventListener('click', () => {
  activeTab = btn.dataset.tab;
  setTabs();
}));
$('#citySelect').addEventListener('change', () => { customLocation=null; $('#useLocationBtn').textContent='استخدم موقعي'; scheduleRender(); });
$('#dateInput').addEventListener('change', scheduleRender);
$('#timeInput').addEventListener('input', () => { updateTimeLabel(); scheduleRender(); });
$('#useLocationBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { alert('هذا المتصفح لا يدعم تحديد الموقع.'); return; }
  const btn = $('#useLocationBtn');
  btn.disabled = true; btn.textContent = 'جاري تحديد الموقع…';
  navigator.geolocation.getCurrentPosition(pos => {
    customLocation = {
      name:'موقعي الحالي',
      lat:pos.coords.latitude,
      lon:pos.coords.longitude,
      offset:-new Date().getTimezoneOffset()
    };
    btn.disabled=false; btn.textContent='تم تحديد الموقع ✓';
    scheduleRender();
  }, () => {
    btn.disabled=false; btn.textContent='استخدم موقعي';
    alert('لم يتم السماح بالوصول للموقع. يمكنك الاستمرار باختيار المدينة يدويًا.');
  }, { enableHighAccuracy:true, timeout:10000, maximumAge:600000 });
});

$('#dateInput').value = todaySaudi();
const nowSaudi = new Date(Date.now() + 180*60000);
$('#timeInput').value = Math.round((nowSaudi.getUTCHours()+nowSaudi.getUTCMinutes()/60)*2)/2;
updateLocationHeader(); updateTimeLabel(); setTabs();

try {
  Astro = await import('https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/+esm');
  $('#loadingPanel').hidden = true;
  $('#appContent').hidden = false;
  await render();
} catch (err) {
  console.error(err);
  $('#loadingPanel').textContent = 'تعذر تحميل محرك الحساب الفلكي. تحقق من اتصال الإنترنت ثم أعد فتح الصفحة.';
}


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
