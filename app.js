// Trip Food · Vetted — mobile-first restaurant app.
// Loads docs-vetted/data/restaurants.json (KEEP + KEEP-WITH-CAVEAT for Korea, vetted picks for Japan).

const CITY_CENTERS = {
  seoul: { lat: 37.555, lng: 126.985, zoom: 13, bbox: [[37.4, 126.75], [37.72, 127.2]] },
  busan: { lat: 35.12,  lng: 129.06,  zoom: 12, bbox: [[35.0, 128.9], [35.3, 129.3]] },
  jeju:  { lat: 33.40,  lng: 126.55,  zoom: 10, bbox: [[33.1, 126.1], [33.6, 127.0]] },
  osaka: { lat: 34.694, lng: 135.502, zoom: 12, bbox: [[34.55, 135.35], [34.85, 135.65]] },
  kyoto: { lat: 35.011, lng: 135.768, zoom: 12, bbox: [[34.85, 135.55], [35.15, 135.95]] },
  tokyo: { lat: 35.689, lng: 139.694, zoom: 11, bbox: [[35.50, 139.40], [35.85, 139.95]] },
};

const JAPAN_CITIES = new Set(["osaka", "kyoto", "tokyo"]);

const FOOD_TYPES = [
  { id: "caveat",               label: "⚠ With caveat", chip: true, filter: "caveat" },
  { id: "veg",                  label: "🌱 Veg-friendly", chip: true, filter: "veg" },
  // --- Korea ---
  { id: "bbq-meat",             label: "BBQ / 고기" },
  { id: "fried-chicken",        label: "치킨" },
  { id: "jjigae-gukbap-soup",   label: "Jjigae / 국밥" },
  { id: "dumplings-mandu",      label: "Mandu / 만두" },
  { id: "tteokbokki-rabokki",   label: "Tteokbokki" },
  { id: "naengmyeon",           label: "Naeng / Milmyeon" },
  { id: "noodles",              label: "Noodles / 국수" },
  { id: "korean-set-solbap",    label: "Set meals" },
  // --- Japan ---
  { id: "ramen",                label: "Ramen / ラーメン" },
  { id: "tonkatsu",             label: "Tonkatsu / とんかつ" },
  { id: "tempura",              label: "Tempura / 天ぷら" },
  { id: "donburi",              label: "Donburi / 丼" },
  { id: "okonomiyaki",          label: "Okonomiyaki" },
  { id: "kushikatsu",           label: "Kushikatsu" },
  { id: "udon-soba",            label: "Udon / Soba" },
  { id: "tofu-yuba",            label: "Tofu / Yuba" },
  { id: "chinese",              label: "Chinese / 中華" },
  // --- shared ---
  { id: "cafe-bakery",          label: "Cafe / bakery" },
  { id: "vegetarian",           label: "Veg 🌱" },
  { id: "other",                label: "Other" },
];

const FOOD_TYPE_LABEL = Object.fromEntries(
  FOOD_TYPES.filter(t => !t.chip).map(t => [t.id, t.label])
);

const STORAGE_KEY = "korea-food-vetted-state-v1";

const state = {
  city: "seoul",
  search: "",
  filters: new Set(),
  view: "list",
  nearMe: false,
  userLoc: null,
  all: [],
};

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (CITY_CENTERS[s.city]) state.city = s.city;
    if (Array.isArray(s.filters)) state.filters = new Set(s.filters);
    if (s.view === "list" || s.view === "map") state.view = s.view;
  } catch {}
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    city: state.city,
    filters: [...state.filters],
    view: state.view,
  }));
}

async function loadData() {
  const res = await fetch("data/restaurants.json", { cache: "no-cache" });
  const data = await res.json();
  state.all = data.restaurants;
}

function haversine(a, b) {
  const R = 6371;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function matchesSearch(r, q) {
  if (!q) return true;
  const sig = Array.isArray(r.signature_ko) ? r.signature_ko.join(' ') : (r.signature_ko || '');
  const sig_en = Array.isArray(r.signature_en) ? r.signature_en.join(' ') : (r.signature_en || '');
  const hay = [
    r.name_ko, r.name_romanized, r.neighborhood, r.address_ko,
    sig, sig_en, r.verdict_reason,
    FOOD_TYPE_LABEL[r.food_type] || "",
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

function matchesFilters(r, filters) {
  if (filters.size === 0) return true;
  const foodFilters = [...filters].filter(f => f !== "caveat" && f !== "veg");
  if (filters.has("caveat") && r.verdict !== "KEEP-WITH-CAVEAT") return false;
  if (filters.has("veg") && !(r.veg === "veg-friendly" || r.veg === "veg-only" || r.veg === "limited")) return false;
  if (foodFilters.length && !foodFilters.includes(r.food_type)) return false;
  return true;
}

function visibleRestaurants() {
  const city = state.city;
  let rows = state.all.filter(r => r.city === city);
  rows = rows.filter(r => matchesSearch(r, state.search));
  rows = rows.filter(r => matchesFilters(r, state.filters));

  if (state.nearMe && state.userLoc) {
    for (const r of rows) r._dist = haversine(state.userLoc, r);
    rows.sort((a, b) => a._dist - b._dist);
  } else {
    rows.sort((a, b) => {
      // KEEP before KEEP-WITH-CAVEAT
      const av = a.verdict === "KEEP" ? 0 : 1;
      const bv = b.verdict === "KEEP" ? 0 : 1;
      if (av !== bv) return av - bv;
      // Then signal count descending
      const as = (a.signals_passed || []).length;
      const bs = (b.signals_passed || []).length;
      if (as !== bs) return bs - as;
      return a.name_ko.localeCompare(b.name_ko);
    });
  }
  return rows;
}

function renderChips() {
  const row = document.getElementById("chip-row");
  row.innerHTML = "";
  // Only show food-type chips for types present in the active city
  const cityTypes = new Set(
    state.all.filter(r => r.city === state.city).map(r => r.food_type)
  );
  for (const t of FOOD_TYPES) {
    if (!t.chip && !cityTypes.has(t.id)) continue;
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.dataset.chip = t.id;
    btn.setAttribute("aria-pressed", state.filters.has(t.id) ? "true" : "false");
    if (!t.chip) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = `var(--ft-${t.id})`;
      btn.appendChild(dot);
    }
    btn.appendChild(document.createTextNode(t.label));
    btn.addEventListener("click", () => {
      if (state.filters.has(t.id)) state.filters.delete(t.id);
      else state.filters.add(t.id);
      saveState();
      renderChips();
      render();
    });
    row.appendChild(btn);
  }
}

function formatDistance(km) {
  if (km == null) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function cardHTML(r) {
  const foodLabel = FOOD_TYPE_LABEL[r.food_type] || r.food_type;
  const badges = [];
  if (r.verdict === "KEEP") badges.push(`<span class="badge badge-vetted">✓ Vetted</span>`);
  if (r.verdict === "KEEP-WITH-CAVEAT") badges.push(`<span class="badge badge-caveat">⚠ Caveat</span>`);
  if (r.is_replacement) badges.push(`<span class="badge badge-swap">↔ Swap</span>`);
  if (r.veg === "veg-friendly" || r.veg === "veg-only") badges.push(`<span class="badge badge-veg">🌱 ${r.veg}</span>`);
  else if (r.veg === "limited") badges.push(`<span class="badge badge-veg">🌱 limited</span>`);

  const distance = r._dist != null ? `<span class="distance">${formatDistance(r._dist)}</span>` : "";
  const roman = r.name_romanized ? `<div class="card-roman">${escapeHtml(r.name_romanized)}</div>` : "";
  const signature = r.signature_en ? `<div class="card-dish">${escapeHtml(r.signature_en)}</div>` : "";
  const neighborhood = r.neighborhood ? `<div class="card-desc">${escapeHtml(r.neighborhood)}</div>` : "";

  // One-line top signals summary (first 2 signals)
  const signals = (r.signals_passed || []).slice(0, 2);
  const signalLine = signals.length
    ? `<div class="signals-list">${signals.map(s => `<span class="badge-signal">${escapeHtml(s)}</span>`).join("")}</div>`
    : "";

  return `
    <div class="card-main">
      <div class="card-header">
        <div>
          <div class="card-name">${escapeHtml(r.name_ko)}</div>
          ${roman}
          ${signature}
        </div>
      </div>
      <div class="card-meta">
        <span class="food-type">
          <span class="dot" style="background: var(--ft-${r.food_type})"></span>
          ${escapeHtml(foodLabel)}
        </span>
        ${distance}
      </div>
      ${neighborhood}
      ${signalLine}
    </div>
    <div class="card-side">
      ${badges.join("")}
    </div>
  `;
}

function escapeHtml(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderList() {
  const rows = visibleRestaurants();
  const list = document.getElementById("list-view");
  if (!rows.length) {
    list.innerHTML = `<div class="empty">No restaurants match these filters.</div>`;
  } else {
    list.innerHTML = rows.map(r =>
      `<div class="card" data-id="${r.id}" role="button" tabindex="0">${cardHTML(r)}</div>`
    ).join("");
    for (const el of list.querySelectorAll(".card")) {
      el.addEventListener("click", () => openDrawer(el.dataset.id));
      el.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDrawer(el.dataset.id); }
      });
    }
  }
  document.getElementById("count").textContent =
    `${rows.length} ${rows.length === 1 ? "spot" : "spots"}`;
}

let mapInst = null;
let markerLayer = null;

function ensureMap() {
  if (mapInst) return mapInst;
  const c = CITY_CENTERS[state.city];
  mapInst = L.map("map", { center: [c.lat, c.lng], zoom: c.zoom, zoomControl: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(mapInst);
  markerLayer = L.layerGroup().addTo(mapInst);
  return mapInst;
}

function renderMap() {
  ensureMap();
  const c = CITY_CENTERS[state.city];
  mapInst.setView([c.lat, c.lng], c.zoom);
  markerLayer.clearLayers();
  const rows = visibleRestaurants();
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    const isCaveat = r.verdict === "KEEP-WITH-CAVEAT";
    const icon = L.divIcon({
      html: `<div class="marker-dot${isCaveat ? ' marker-caveat' : ''}" style="background: var(--ft-${r.food_type})"></div>`,
      className: "",
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    const marker = L.marker([r.lat, r.lng], { icon });
    marker.bindTooltip(r.name_ko, { direction: "top", offset: [0, -6] });
    marker.on("click", () => openDrawer(r.id));
    marker.addTo(markerLayer);
  }
  if (state.nearMe && state.userLoc) {
    const loc = L.circleMarker([state.userLoc.lat, state.userLoc.lng], {
      radius: 7, fillColor: "#2a6cf0", color: "#fff", weight: 2, fillOpacity: 1,
    }).bindTooltip("You", { direction: "top", offset: [0, -4] });
    loc.addTo(markerLayer);
  }
  setTimeout(() => mapInst.invalidateSize(), 50);
}

function render() {
  document.getElementById("list-view").setAttribute("aria-hidden", state.view === "list" ? "false" : "true");
  document.getElementById("map-view").setAttribute("aria-hidden", state.view === "map" ? "false" : "true");
  if (state.view === "list") renderList();
  else renderMap();
}

function openDrawer(id) {
  const r = state.all.find(x => x.id === id);
  if (!r) return;
  const foodLabel = FOOD_TYPE_LABEL[r.food_type] || r.food_type;
  const cityEn = { seoul: "Seoul", busan: "Busan", jeju: "Jeju",
                   osaka: "Osaka", kyoto: "Kyoto", tokyo: "Tokyo" }[r.city] || "";
  const isJapan = JAPAN_CITIES.has(r.city);
  const googleSearch = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name_ko + " " + cityEn)}`;
  const naverUrl = r.naver_url || `https://map.naver.com/p/search/${encodeURIComponent(r.name_ko)}`;
  // Japan: prefer the verified per-shop Tabelog page; fall back to a search.
  const tabelogLink = r.tabelog_url || `https://tabelog.com/rstLst/?sk=${encodeURIComponent(r.name_ko)}`;

  const badges = [];
  if (r.verdict === "KEEP") badges.push(`<span class="badge badge-vetted">✓ Vetted</span>`);
  if (r.verdict === "KEEP-WITH-CAVEAT") badges.push(`<span class="badge badge-caveat">⚠ Caveat</span>`);
  if (r.is_replacement) badges.push(`<span class="badge badge-swap">↔ Swap</span>`);
  if (r.veg === "veg-friendly" || r.veg === "veg-only") badges.push(`<span class="badge badge-veg">🌱 ${r.veg}</span>`);
  else if (r.veg === "limited") badges.push(`<span class="badge badge-veg">🌱 limited</span>`);

  const caveatLine = (r.verdict === "KEEP-WITH-CAVEAT" && r.verdict_reason)
    ? `<div class="caveat-line">⚠ ${escapeHtml(r.verdict_reason)}</div>` : "";

  const signatureSection = r.signature_ko ? `
    <div class="section">
      <h3>Order</h3>
      <p><strong>${escapeHtml(r.signature_ko)}</strong>${r.signature_en ? ` — ${escapeHtml(r.signature_en)}` : ''}</p>
    </div>` : "";

  const metaGrid = `
    <dl class="drawer-meta-grid">
      ${r.neighborhood ? `<dt>Area</dt><dd>${escapeHtml(r.neighborhood)}</dd>` : ""}
      ${r.price_per_person_est ? `<dt>Price</dt><dd>${escapeHtml(r.price_per_person_est)} pp (${escapeHtml(r.price_range_krw || '')})</dd>`
        : (r.price_range_krw ? `<dt>Price</dt><dd>${escapeHtml(r.price_range_krw)}</dd>` : "")}
      ${r.hours ? `<dt>Hours</dt><dd>${escapeHtml(r.hours)}</dd>` : ""}
      ${r.closure_day ? `<dt>Closed</dt><dd>${escapeHtml(r.closure_day)}</dd>` : ""}
      ${r.phone ? `<dt>Phone</dt><dd><a href="tel:${escapeHtml(r.phone)}">${escapeHtml(r.phone)}</a></dd>` : ""}
      ${r.nearest_landmark ? `<dt>Nearest</dt><dd>${escapeHtml(r.nearest_landmark)}</dd>` : ""}
    </dl>
  `;

  const addrSection = r.address_ko ? `
    <div class="section">
      <h3>Address (show to taxi)</h3>
      <div class="addr-row">
        <p>${escapeHtml(r.address_ko)}</p>
        <button data-copy="${escapeHtml(r.address_ko)}">Copy</button>
      </div>
    </div>` : "";

  const signals = r.signals_passed || [];
  const signalsSection = signals.length ? `
    <div class="section">
      <h3>Quality signals (${signals.length})</h3>
      <div class="signals-list">
        ${signals.map(s => `<span class="badge-signal">${escapeHtml(s)}</span>`).join("")}
      </div>
      ${r.latest_naver_review_date ? `<div class="review-freshness">Latest Naver visitor review: ${escapeHtml(r.latest_naver_review_date)}</div>` : ""}
    </div>` : "";

  const flags = r.stage3_flags || [];
  const flagsSection = flags.length ? `
    <div class="section">
      <h3>Flags</h3>
      <ul>${flags.map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>
    </div>` : "";

  const distSection = r._dist != null ? `
    <div class="section">
      <h3>Distance</h3>
      <p>${formatDistance(r._dist)} from your location</p>
    </div>` : "";

  const linksSection = isJapan
    ? `
    <div class="drawer-links">
      <a class="primary" href="${escapeHtml(googleSearch)}" target="_blank" rel="noopener">Google Map</a>
      <a href="${escapeHtml(tabelogLink)}" target="_blank" rel="noopener">Tabelog</a>
    </div>
  `
    : `
    <div class="drawer-links">
      <a class="primary" href="${escapeHtml(naverUrl)}" target="_blank" rel="noopener">Naver Map</a>
      ${r.diningcode_url ? `<a href="${escapeHtml(r.diningcode_url)}" target="_blank" rel="noopener">DiningCode</a>` : ""}
      ${r.kakao_url ? `<a href="${escapeHtml(r.kakao_url)}" target="_blank" rel="noopener">KakaoMap</a>` : ""}
      <a href="${escapeHtml(googleSearch)}" target="_blank" rel="noopener">Google</a>
    </div>
  `;

  const html = `
    <h2 id="drawer-title">${escapeHtml(r.name_ko)}</h2>
    ${r.name_romanized ? `<div class="roman">${escapeHtml(r.name_romanized)}</div>` : ""}
    <div class="meta">
      <span class="food-type">
        <span class="dot" style="background: var(--ft-${r.food_type})"></span>
        ${escapeHtml(foodLabel)}
      </span>
    </div>
    ${badges.length ? `<div class="badges">${badges.join("")}</div>` : ""}
    ${caveatLine}
    ${signatureSection}
    ${metaGrid}
    ${addrSection}
    ${signalsSection}
    ${flagsSection}
    ${distSection}
    ${linksSection}
  `;

  const drawer = document.getElementById("drawer");
  drawer.querySelector(".drawer-body").innerHTML = html;
  drawer.setAttribute("aria-hidden", "false");

  const copyBtn = drawer.querySelector("[data-copy]");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.copy);
        showToast("Korean address copied");
      } catch {
        showToast("Couldn't copy — long-press to select");
      }
    });
  }
}

function closeDrawer() {
  document.getElementById("drawer").setAttribute("aria-hidden", "true");
}

function showToast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 1600);
}

function bindControls() {
  for (const btn of document.querySelectorAll(".city-tab")) {
    btn.addEventListener("click", () => {
      state.city = btn.dataset.city;
      for (const b of document.querySelectorAll(".city-tab"))
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      saveState();
      renderChips();
      render();
    });
    btn.setAttribute("aria-selected", btn.dataset.city === state.city ? "true" : "false");
  }

  for (const btn of document.querySelectorAll(".view-btn")) {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      for (const b of document.querySelectorAll(".view-btn"))
        b.classList.toggle("is-active", b === btn);
      for (const b of document.querySelectorAll(".view-btn"))
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      saveState();
      render();
    });
    btn.classList.toggle("is-active", btn.dataset.view === state.view);
  }

  document.getElementById("search").addEventListener("input", e => {
    state.search = e.target.value.trim();
    if (state.view === "list") renderList();
    else renderMap();
  });

  document.getElementById("near-me").addEventListener("click", () => {
    if (state.nearMe) {
      state.nearMe = false;
      state.userLoc = null;
      document.getElementById("near-me").setAttribute("aria-pressed", "false");
      render();
      return;
    }
    if (!navigator.geolocation) {
      showToast("Geolocation not supported");
      return;
    }
    showToast("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        state.nearMe = true;
        document.getElementById("near-me").setAttribute("aria-pressed", "true");
        render();
        const city = CITY_CENTERS[state.city];
        const [[s, w], [n, e]] = city.bbox;
        if (state.userLoc.lat < s || state.userLoc.lat > n ||
            state.userLoc.lng < w || state.userLoc.lng > e) {
          showToast(`You're outside ${state.city[0].toUpperCase()+state.city.slice(1)} — distances from your current location`);
        }
      },
      err => {
        showToast(`Couldn't get location: ${err.message}`);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  });

  for (const el of document.querySelectorAll("[data-close]")) {
    el.addEventListener("click", closeDrawer);
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });
}

async function main() {
  loadState();
  await loadData();
  bindControls();
  renderChips();
  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

main();
