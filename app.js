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
  Sun:'الشمس', Moon: 'القمر', Mercury: 'عطارد', Venus: 'الزهرة', Mars: 'المريخ', Jupiter: 'المشتري', Saturn: 'زحل', Uranus:'أورانوس', Neptune:'نبتون'
};
const SCENE_BODIES = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune'];

let Astro;
let selectedBody = 'Moon';
let activeTab = 'today';
let customLocation = null;
let renderToken = 0;
let selectedCatalogId = 'Sirius';
const CEL = window.CelestialCatalog;

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
function skyClass(body) {
  return body.toLowerCase();
}
function setSkyTheme(sunAltitude) {
  const p = $('#skyPanorama');
  if (sunAltitude > 0) {
    p.style.setProperty('--sky-top','#4c8fd0');
    p.style.setProperty('--sky-mid','#79aede');
    p.style.setProperty('--sky-horizon','#f4bd86');
    p.style.setProperty('--stars-opacity','.05');
  } else if (sunAltitude > -6) {
    p.style.setProperty('--sky-top','#16365f');
    p.style.setProperty('--sky-mid','#6c6186');
    p.style.setProperty('--sky-horizon','#e18c68');
    p.style.setProperty('--stars-opacity','.28');
  } else if (sunAltitude > -12) {
    p.style.setProperty('--sky-top','#0a1b38');
    p.style.setProperty('--sky-mid','#243559');
    p.style.setProperty('--sky-horizon','#65516e');
    p.style.setProperty('--stars-opacity','.62');
  } else {
    p.style.setProperty('--sky-top','#050d20');
    p.style.setProperty('--sky-mid','#0a1832');
    p.style.setProperty('--sky-horizon','#29334c');
    p.style.setProperty('--stars-opacity','.92');
  }
}
function renderSkyScene(date, observer, selectedVis) {
  const wrap = $('#skyObjects');
  const legend = $('#skyLegend');
  wrap.replaceChildren();
  legend.replaceChildren();

  const sunHor = horizon(Astro.Body.Sun, date, observer);
  setSkyTheme(sunHor.altitude);

  const positions = {};
  for (const name of SCENE_BODIES) {
    const hor = horizon(Astro.Body[name], date, observer);
    positions[name] = hor;
    if (hor.altitude <= 0) continue;

    // One fixed 360° projection, always fitting the entire available width.
    const el = document.createElement('div');
    el.className = `sky-object ${skyClass(name)}${name === selectedBody ? ' selected' : ''}`;
    const x = (((hor.azimuth % 360) + 360) % 360) / 360 * 100;
    const y = 81 - Math.min(90, Math.max(0, hor.altitude)) * (72 / 90);
    el.style.left = `${Math.max(1.8, Math.min(98.2, x))}%`;
    el.style.top = `${y}%`;
    el.title = `${BODY_LABELS[name]}: ${dirName(hor.azimuth)} ${Math.round(hor.azimuth)}°، ارتفاع ${Math.round(hor.altitude)}°`;

    const orb = document.createElement('div'); orb.className = 'orb';
    const label = document.createElement('div'); label.className = 'obj-name'; label.textContent = BODY_LABELS[name];
    const data = document.createElement('div'); data.className = 'obj-data';
    data.textContent = `${dirName(hor.azimuth)} · ${arabicNumber.format(Math.round(hor.azimuth))}° · ارتفاع ${arabicNumber.format(Math.round(hor.altitude))}°`;
    el.append(orb,label,data);
    wrap.append(el);

    const chip = document.createElement(name === 'Sun' ? 'span' : 'button');
    if (name !== 'Sun') {
      chip.type = 'button';
      chip.addEventListener('click', () => {
        selectedBody = name;
        $$('.body-chip').forEach(b => b.classList.toggle('active',b.dataset.body === name));
        scheduleRender();
      });
    }
    chip.className = `sky-legend-chip${name === selectedBody ? ' active' : ''}`;
    chip.textContent = `${BODY_LABELS[name]} · ${arabicNumber.format(Math.round(hor.azimuth))}° / ${arabicNumber.format(Math.round(hor.altitude))}°`;
    chip.title = 'السمت / الارتفاع';
    legend.append(chip);
  }

  const catalogLegend = $('#catalogLegend');
  catalogLegend.replaceChildren();
  const loc = currentLocation();
  const visibleCatalog = [];
  const named = $('#showNamedStars').checked ? CEL.stars : [];
  const minors = $('#showMinorBodies').checked ? CEL.asteroids : [];
  for (const item of named.concat(minors)) {
    const p = item.kind === 'star'
      ? CEL.starPosition(item,date,loc.lat,loc.lon)
      : CEL.asteroidPosition(item,date,loc.lat,loc.lon);
    if (p.alt <= 0) continue;
    visibleCatalog.push(p);
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'catalog-marker ' + p.kind +
      (p.id===selectedCatalogId ? ' active' : '');
    marker.style.left = Math.max(2,Math.min(98,(p.az%360+360)%360 / 360 * 100))+'%';
    marker.style.top = (81-Math.min(90,p.alt)*(72/90))+'%';
    marker.title = p.name+' — '+dirName(p.az)+' '+Math.round(p.az)+'° · ارتفاع '+Math.round(p.alt)+'°';
    marker.textContent = p.kind==='asteroid'?'◇':'✦';
    marker.setAttribute('aria-label',marker.title);
    const prominent = p.id==='Sirius'||p.id==='Procyon'||p.id==='Polaris'||p.id==='Canopus'||p.id===selectedCatalogId;
    if (prominent) {
      const name = document.createElement('span');
      name.className = 'catalog-marker-name';
      name.textContent = p.name;
      marker.append(name);
    }
    marker.onclick = () => { selectedCatalogId=p.id; renderSkyScene(date,observer,selectedVis); };
    wrap.append(marker);
  }
  const order = visibleCatalog.slice().sort((x,y)=> x.kind.localeCompare(y.kind) || x.az-y.az);
  for (const p of order) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sky-legend-chip ' + (p.kind==='asteroid'?'minor-chip':'star-chip')+(p.id===selectedCatalogId?' active':'');
    btn.textContent = p.name+' · '+arabicNumber.format(Math.round(p.az))+'°';
    btn.title = dirName(p.az)+' · ارتفاع '+Math.round(p.alt)+'°';
    btn.onclick = () => {selectedCatalogId=p.id;renderSkyScene(date,observer,selectedVis);};
    catalogLegend.append(btn);
  }
  if (!order.length) catalogLegend.textContent = 'لا توجد نجوم أو كويكبات من المجموعة المعروضة فوق الأفق الآن.';
  let chosen = order.find(p=>p.id===selectedCatalogId);
  if (!chosen && selectedCatalogId) {
    const obj = CEL.stars.concat(CEL.asteroids).find(x=>x.id===selectedCatalogId);
    if (obj) chosen=obj.kind==='star'?CEL.starPosition(obj,date,loc.lat,loc.lon):CEL.asteroidPosition(obj,date,loc.lat,loc.lon);
  }
  $('#catalogDetails').textContent = chosen
    ? chosen.name+' · '+(chosen.kind==='star'?'نجم':'كويكب (موقع تقريبي)')+
      ' · '+(chosen.alt>0?'فوق الأفق':'تحت الأفق')+
      ' · '+dirName(chosen.az)+' '+arabicNumber.format(Math.round(chosen.az))+
      '° · الارتفاع '+arabicNumber.format(Math.round(chosen.alt))+'°'+
      (chosen.kind==='asteroid'?' · قد يحتاج منظارًا أو تلسكوبًا':'')
    : 'اختر نجمًا أو كويكبًا لمعرفة اتجاهه وارتفاعه.';

  if (!legend.childElementCount) legend.textContent = 'لا توجد أجرام من المجموعة المحددة فوق الأفق الآن.';
  const banner = $('#belowHorizonBanner');
  const selectedHor = positions[selectedBody] || selectedVis.hor;
  if (selectedHor.altitude <= 0) {
    banner.hidden = false;
    banner.textContent = `${BODY_LABELS[selectedBody]} تحت الأفق الآن — ${dirName(selectedHor.azimuth)} ${arabicNumber.format(Math.round(selectedHor.azimuth))}°`;
  } else {
    banner.hidden = true;
    banner.textContent = '';
  }
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
  renderSkyScene(date, observer, vis);

  $('#currentBodyTitle').textContent = BODY_LABELS[selectedBody];
  $('#directionNow').textContent = vis.hor.altitude > 0
    ? `${dirName(vis.hor.azimuth)} · ${arabicNumber.format(Math.round(vis.hor.azimuth))}°`
    : `تحت الأفق · السمت ${dirName(vis.hor.azimuth)} ${arabicNumber.format(Math.round(vis.hor.azimuth))}°`;
  $('#altitudeNow').textContent = vis.hor.altitude > 0
    ? `ارتفاع ${arabicNumber.format(Math.round(vis.hor.altitude))}° فوق الأفق`
    : `منخفض ${arabicNumber.format(Math.abs(Math.round(vis.hor.altitude)))}° تحت الأفق`;
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

for (const id of ['showNamedStars','showMinorBodies']) {
  $('#'+id).addEventListener('change',()=>scheduleRender());
}
$('.body-chip').forEach(btn => btn.addEventListener('click', () => {
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
