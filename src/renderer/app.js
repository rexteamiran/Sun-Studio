'use strict';

// ---------- API bridge (real Electron preload, or mock for browser preview) ----------
const api = window.sun || createMockApi();

// ---------- provider metadata (kept in sync with src/main/providers.js) ----------
const PROVIDERS_META = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    type: 'Direct API',
    note: 'platform.openai.com',
    keyHint: 'sk-…',
    aspects: ['1:1', '3:2', '2:3'],
    qualities: ['low', 'medium', 'high'],
    resolutions: null,
    background: true,
    dynamicModels: false,
    models: [
      { id: 'gpt-image-1', label: 'gpt-image-1 · best quality' },
      { id: 'gpt-image-1-mini', label: 'gpt-image-1-mini · faster & cheaper' },
    ],
    defaultModel: 'gpt-image-1',
  },
  aipass: {
    id: 'aipass',
    label: 'AI Pass',
    type: 'OpenAI-compatible wallet',
    note: 'aipass.one',
    keyHint: 'sk-aikey-…',
    aspects: ['1:1', '3:2', '2:3'],
    qualities: ['low', 'medium', 'high'],
    resolutions: null,
    background: true,
    dynamicModels: true,
    models: [
      { id: 'gpt-image-1', label: 'gpt-image-1' },
      { id: 'gpt-image-1-mini', label: 'gpt-image-1-mini' },
      { id: 'dall-e-3', label: 'dall-e-3' },
    ],
    defaultModel: 'gpt-image-1',
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    type: 'Gemini API',
    note: 'aistudio.google.com',
    keyHint: 'AIza…',
    aspects: ['1:1', '3:2', '2:3', '16:9', '9:16', '4:3'],
    qualities: null,
    resolutions: ['1K', '2K', '4K'],
    background: false,
    dynamicModels: false,
    models: [
      { id: 'gemini-nano-banana-2.1', label: 'Nano Banana 2.1 · recommended' },
      { id: 'gemini-3.1-flash-lite-image', label: 'Flash Lite Image · fastest' },
      { id: 'gemini-3.1-flash-image', label: 'Flash Image · up to 4K' },
      { id: 'gemini-3-pro-image', label: 'Nano Banana Pro · 4K' },
      { id: 'gemini-2.5-flash-image', label: 'Nano Banana (legacy)' },
    ],
    defaultModel: 'gemini-nano-banana-2.1',
  },
};

const PROVIDER_IDS = Object.keys(PROVIDERS_META);
const ASPECT_LABELS = { '1:1': 'Square · 1:1', '3:2': 'Landscape · 3:2', '2:3': 'Portrait · 2:3', '16:9': 'Wide · 16:9', '9:16': 'Tall · 9:16', '4:3': 'Classic · 4:3' };
const QUALITY_LABELS = { low: 'Low · fastest', medium: 'Medium', high: 'High · slowest' };
const RESOLUTION_LABELS = { '1K': '1K · default', '2K': '2K · sharp', '4K': '4K · sharpest' };
const IMAGE_MODEL_RE = /image|dall-e|flux|seedream|banana|imagen|stable|sd3|sdxl|recraft|ideogram|grok/i;

// ---------- helpers ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (ts) =>
  new Date(ts).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function toast(msg, type = 'info', ms = 4200) {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .3s';
    setTimeout(() => t.remove(), 320);
  }, ms);
}

const ICONS = {
  save:
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  open:
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  edit:
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  reuse:
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
};

// ---------- state ----------
const state = {
  view: 'create',
  settings: null,
  info: null,
  working: false,
  gallery: [],
  refs: [],
  modalItem: null,
  updateState: { type: 'idle' },
  dynamicModels: {},
};

const meta = () => PROVIDERS_META[state.provider] || PROVIDERS_META.openai;
const modelFor = () => {
  const s = (state.settings && state.settings.settings) || {};
  return (s.models && s.models[state.provider]) || meta().defaultModel;
};

// ---------- navigation ----------
function nav(view) {
  state.view = view;
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  if (view === 'gallery') loadGallery();
  if (view === 'settings') fillSettings();
}

$$('.nav-item').forEach((b) => b.addEventListener('click', () => nav(b.dataset.view)));
$('#banner-key').addEventListener('click', () => nav('settings'));
if (api.onMenuNav) api.onMenuNav(nav);

// ---------- provider pill ----------
function renderProviderPill() {
  const pill = $('#provider-pill');
  pill.innerHTML = '';
  for (const id of PROVIDER_IDS) {
    const m = PROVIDERS_META[id];
    const info = (state.settings && state.settings.providers && state.settings.providers[id]) || { hasKey: false };
    const b = document.createElement('button');
    b.className = 'pp-btn' + (id === state.provider ? ' active' : '');
    b.title = m.label + ' — ' + (info.hasKey ? 'key saved' : 'no key yet');
    b.innerHTML = '<span class="dot' + (info.hasKey ? ' ok' : '') + '"></span><span>' + esc(m.label) + '</span>';
    b.addEventListener('click', () => switchProvider(id));
    pill.appendChild(b);
  }
}

async function switchProvider(id) {
  if (id === state.provider) return;
  try {
    state.settings = await api.updateSettings({ provider: id });
    state.provider = id;
    renderProviderPill();
    renderProviderCards();
    populateAllViewOptions();
    paintKeyUi();
    fillSettings();
    toast('Provider switched to ' + PROVIDERS_META[id].label + '.', 'ok', 2600);
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ---------- per-provider option population ----------
function fillSelect(sel, values, labels) {
  sel.innerHTML = '';
  for (const v of values) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = (labels && labels[v]) || v;
    sel.appendChild(o);
  }
}

function populateViewOptions(view) {
  const m = meta();
  const sizeSel = $('#' + view + '-size');
  const prevSize = sizeSel.value;
  fillSelect(sizeSel, m.aspects, ASPECT_LABELS);
  if (m.aspects.includes(prevSize)) sizeSel.value = prevSize;

  const qSel = $('#' + view + '-quality');
  const qLabel = $('#' + view + '-quality-label');
  if (m.resolutions) {
    qLabel.textContent = 'Resolution';
    fillSelect(qSel, m.resolutions, RESOLUTION_LABELS);
  } else {
    qLabel.textContent = 'Quality';
    fillSelect(qSel, m.qualities, QUALITY_LABELS);
  }

  const bgField = $('#' + view + '-bg-field');
  if (bgField) bgField.style.display = m.background ? '' : 'none';
}

function populateAllViewOptions() {
  for (const v of ['create', 'edit', 'restyle']) populateViewOptions(v);
  updateMaskNote();
}

// ---------- settings / key UI ----------
function paintKeyUi() {
  const s = state.settings;
  const info = (s && s.providers && s.providers[state.provider]) || { hasKey: false, hint: '', encrypted: false };
  const badge = $('#key-badge');
  if (info.hasKey) {
    badge.className = 'key-badge ok';
    badge.textContent = PROVIDERS_META[state.provider].label + ' key ' + (info.hint || '') + (info.encrypted ? ' · encrypted' : '');
    $('#key-banner').hidden = true;
  } else {
    badge.className = 'key-badge warn';
    badge.textContent = 'No ' + PROVIDERS_META[state.provider].label + ' key set';
    $('#key-banner-text').textContent = 'Connect your ' + PROVIDERS_META[state.provider].label + ' API key to start generating.';
    $('#key-banner').hidden = false;
  }
}

async function refreshSettings() {
  try {
    state.settings = await api.getSettings();
  } catch (e) {
    state.settings = { provider: 'openai', settings: {}, providers: {} };
  }
  state.provider = (state.settings && state.settings.provider) || 'openai';
  paintKeyUi();
}

// ---------- provider cards ----------
function renderProviderCards() {
  const wrap = $('#provider-cards');
  wrap.innerHTML = '';
  for (const id of PROVIDER_IDS) {
    const m = PROVIDERS_META[id];
    const info = (state.settings && state.settings.providers && state.settings.providers[id]) || { hasKey: false, hint: '', encrypted: false };
    const card = document.createElement('div');
    card.className = 'prov-card' + (id === state.provider ? ' active' : '');
    card.dataset.provider = id;
    card.innerHTML =
      '<div class="prov-head"><span class="prov-name">' + esc(m.label) + '</span>' +
      (id === state.provider ? '<span class="prov-badge">Active</span>' : '') +
      '</div>' +
      '<div class="prov-type">' + esc(m.type) + ' · ' + esc(m.note) + '</div>' +
      '<div class="prov-status ' + (info.hasKey ? 'ok' : 'warn') + '">' +
      (info.hasKey
        ? 'Key ' + esc(info.hint || '') + (info.encrypted ? ' · encrypted' : '')
        : 'No key saved yet') +
      '</div>' +
      '<div class="key-row"><input type="password" placeholder="' + esc(m.keyHint) + '" autocomplete="off" spellcheck="false" />' +
      '<button class="btn ghost small" data-act="save">Save</button></div>' +
      '<div class="btn-row"><button class="btn ghost small" data-act="test">Test</button>' +
      '<button class="btn primary small" data-act="use"' + (id === state.provider ? ' disabled' : '') + '>Use provider</button></div>' +
      '<div class="status" data-role="status"></div>';

    const input = card.querySelector('input');
    const statusEl = card.querySelector('[data-role="status"]');
    const setStatus = (text, cls) => {
      statusEl.textContent = text;
      statusEl.className = 'status ' + (cls || '');
    };

    card.querySelector('[data-act="save"]').addEventListener('click', async () => {
      const key = input.value.trim();
      if (!key) return setStatus('Paste a key first (' + m.keyHint + ').', 'warn');
      try {
        state.settings = await api.setApiKey(id, key);
        input.value = '';
        renderProviderCards();
        renderProviderPill();
        paintKeyUi();
        fillSettings();
        toast(m.label + ' key saved.', 'ok');
      } catch (e) {
        setStatus(e.message, 'err');
      }
    });

    card.querySelector('[data-act="test"]').addEventListener('click', async () => {
      setStatus('Testing connection…', '');
      try {
        const r = await api.testKey(id);
        setStatus('Connection successful — ' + r.models + ' models available.', 'ok');
        if (m.dynamicModels) {
          state.dynamicModels[id] = r.ids || [];
          fillSettings();
        }
      } catch (e) {
        setStatus(e.message, 'err');
      }
    });

    card.querySelector('[data-act="use"]').addEventListener('click', () => switchProvider(id));

    wrap.appendChild(card);
  }
}

// ---------- settings panel ----------
function modelChoices(id) {
  const m = PROVIDERS_META[id];
  let ids = m.models.map((x) => x.id);
  if (m.dynamicModels && state.dynamicModels[id] && state.dynamicModels[id].length) {
    const imgIds = state.dynamicModels[id].filter((x) => IMAGE_MODEL_RE.test(x));
    ids = imgIds.length ? imgIds : state.dynamicModels[id];
  }
  return ids;
}

function fillSettings() {
  const s = state.settings;
  if (!s) return;
  const d = s.settings || {};

  // model select for the active provider
  const sel = $('#set-model');
  sel.innerHTML = '';
  for (const id of modelChoices(state.provider)) {
    const m = PROVIDERS_META[state.provider].models.find((x) => x.id === id);
    const o = document.createElement('option');
    o.value = id;
    o.textContent = m ? m.label : id;
    sel.appendChild(o);
  }
  sel.value = modelFor(state.provider);
  if (sel.selectedIndex < 0) {
    const o = document.createElement('option');
    o.value = modelFor(state.provider);
    o.textContent = modelFor(state.provider);
    sel.appendChild(o);
    sel.value = modelFor(state.provider);
  }

  $('#outdir-label').textContent = d.outputDir || 'No folder chosen';
  $('#outdir-label').title = d.outputDir || '';
  $('#autosave').checked = !!d.autoSave;
  $('#check-updates').checked = d.checkUpdates !== false;

  if (state.info) {
    $('#about-info').textContent = 'v' + state.info.version + ' · Electron ' + state.info.electron;
  }
  if (state.updateState && state.updateState.type !== 'idle') applyUpdateState(state.updateState);
}

async function saveModelDefault() {
  try {
    const models = {};
    models[state.provider] = $('#set-model').value;
    state.settings = await api.updateSettings({ models });
    toast('Default model saved.', 'ok', 2200);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function bindSettings() {
  $('#set-model').addEventListener('change', saveModelDefault);

  $('#outdir-pick').addEventListener('click', async () => {
    try {
      const dir = await api.pickOutputDir();
      if (!dir) return;
      state.settings = await api.updateSettings({ outputDir: dir });
      fillSettings();
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  $('#outdir-open').addEventListener('click', async () => {
    const d = ((state.settings && state.settings.settings) || {}).outputDir;
    if (!d) return toast('No folder chosen yet.', 'warn');
    try {
      await api.openPath(d);
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  $('#autosave').addEventListener('change', (ev) => {
    api.updateSettings({ autoSave: ev.target.checked }).catch((e) => toast(e.message, 'error'));
  });

  $('#check-updates').addEventListener('change', (ev) => {
    api.updateSettings({ checkUpdates: ev.target.checked }).catch((e) => toast(e.message, 'error'));
  });

  $('#update-check').addEventListener('click', async () => {
    setStatusUpdate('Checking for updates…', '');
    try {
      const r = await api.updateCheck();
      if (r && r.error === 'dev') setStatusUpdate('Updates are only available in the installed app.', 'warn');
    } catch (e) {
      setStatusUpdate(e.message, 'err');
    }
  });
  $('#update-download').addEventListener('click', () => {
    setStatusUpdate('Downloading update…', '');
    api.updateDownload().catch((e) => setStatusUpdate(e.message, 'err'));
  });
  $('#update-install').addEventListener('click', () => api.updateInstall().catch(() => {}));
}

function setStatusUpdate(text, cls) {
  const elx = $('#update-status');
  elx.textContent = text;
  elx.className = 'update-status ' + (cls || '');
}

// ---------- updater UI ----------
function applyUpdateState(u) {
  state.updateState = u;
  const chip = $('#update-chip');
  const bar = $('#update-bar');
  const fill = $('#update-bar-fill');
  const dl = $('#update-download');
  const inst = $('#update-install');

  chip.hidden = true;
  chip.classList.remove('solid');
  bar.hidden = true;
  dl.hidden = true;
  inst.hidden = true;

  switch (u.type) {
    case 'checking':
      setStatusUpdate('Checking for updates…', '');
      break;
    case 'none':
      setStatusUpdate('You are on the latest version' + (u.version ? ' (v' + u.version + ')' : '') + '.', 'ok');
      break;
    case 'available':
      chip.textContent = 'Update v' + u.version + ' available';
      chip.hidden = false;
      setStatusUpdate('Version ' + u.version + ' is available — download it to install.', 'warn');
      dl.hidden = false;
      break;
    case 'progress':
      chip.textContent = 'Downloading ' + (u.percent || 0) + '%';
      chip.hidden = false;
      bar.hidden = false;
      fill.style.width = (u.percent || 0) + '%';
      setStatusUpdate('Downloading update — ' + (u.percent || 0) + '%', '');
      break;
    case 'downloaded':
      chip.textContent = 'Install update' + (u.version ? ' v' + u.version : '');
      chip.hidden = false;
      chip.classList.add('solid');
      setStatusUpdate('Update downloaded — restart to install.', 'ok');
      inst.hidden = false;
      break;
    case 'error':
      setStatusUpdate('Update check failed: ' + (u.message || 'unknown error'), 'err');
      break;
    default:
      break;
  }
}

function bindUpdateChip() {
  $('#update-chip').addEventListener('click', () => {
    const u = state.updateState;
    if (u.type === 'downloaded') {
      api.updateInstall().catch(() => {});
    } else {
      nav('settings');
    }
  });
  if (api.onUpdateEvent) api.onUpdateEvent(applyUpdateState);
  if (api.updateState) {
    api.updateState().then((u) => {
      if (u && u.type && u.type !== 'idle') applyUpdateState(u);
    }).catch(() => {});
  }
}

// ---------- job runner ----------
const timers = {};

function startTimer(view) {
  const elx = $('#' + view + '-timer');
  const t0 = Date.now();
  elx.textContent = '0s';
  timers[view] = setInterval(() => {
    elx.textContent = Math.floor((Date.now() - t0) / 1000) + 's';
  }, 500);
}

function stopTimer(view) {
  clearInterval(timers[view]);
}

function setStage(view, text) {
  const elx = $('#' + view + '-stage');
  if (elx && text) elx.textContent = text;
}

if (api.onStage) api.onStage((t) => { if (t && state.working) setStage(state.view, t); });

async function runJob(view, fn) {
  if (state.working) {
    toast('Wait for the current job to finish.', 'warn');
    return;
  }
  state.working = true;
  const prog = $('#' + view + '-progress');
  const grid = $('#' + view + '-results');
  const empty = $('#' + view + '-empty');
  if (empty) empty.hidden = true;
  if (grid) grid.innerHTML = '';
  if (prog) {
    prog.hidden = false;
    setStage(view, 'Contacting provider…');
    startTimer(view);
  }
  try {
    const items = await fn();
    if (grid) {
      grid.innerHTML = '';
      (items || []).forEach((it) => grid.appendChild(resultCard(it)));
    }
    toast(items && items.length ? items.length + ' image' + (items.length > 1 ? 's' : '') + ' ready — saved to Gallery.' : 'Done.', 'ok');
  } catch (e) {
    if (grid) grid.innerHTML = '';
    if (empty) empty.hidden = false;
    toast(e.message || 'Something went wrong.', 'error', 6500);
  } finally {
    if (prog) {
      prog.hidden = true;
      stopTimer(view);
    }
    state.working = false;
  }
}

// ---------- result cards ----------
function resultCard(item) {
  const card = document.createElement('div');
  card.className = 'result-card';
  card.innerHTML =
    '<img src="' + item.thumb + '" alt="Result" loading="lazy" />' +
    '<div class="rc-actions">' +
    '<button class="rc-btn" data-act="save">' + ICONS.save + 'Save</button>' +
    '<button class="rc-btn" data-act="open">' + ICONS.open + 'Open</button>' +
    '<button class="rc-btn" data-act="edit">' + ICONS.edit + 'Edit</button>' +
    '<button class="rc-btn" data-act="reuse">' + ICONS.reuse + 'Reuse</button>' +
    '</div>';
  card.addEventListener('click', (e) => {
    if (e.target.closest('.rc-btn')) return;
    openModal(item);
  });
  card.querySelector('[data-act="save"]').addEventListener('click', () => saveItem(item));
  card.querySelector('[data-act="open"]').addEventListener('click', async () => {
    if (!item.path) return toast('Available in the desktop app.', 'warn');
    try {
      await api.openPath(item.path);
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  card.querySelector('[data-act="edit"]').addEventListener('click', async () => {
    if (!item.path) return toast('Available in the desktop app.', 'warn');
    nav('edit');
    await loadEditFromPath(item.path);
  });
  card.querySelector('[data-act="reuse"]').addEventListener('click', () => {
    $('#create-prompt').value = item.prompt || '';
    $('#create-count').textContent = (item.prompt || '').length;
    nav('create');
    toast('Prompt copied to Create.', 'ok', 2600);
  });
  return card;
}

async function saveItem(item) {
  try {
    if (item.path) {
      const p = await api.gallerySaveAs(item.id);
      if (p) toast('Saved to ' + p, 'ok', 5200);
    } else {
      const p = await api.exportPng(item.thumb, 'SunStudio.png');
      if (p) toast('Saved image.', 'ok');
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ---------- create ----------
function bindCreate() {
  const ta = $('#create-prompt');
  ta.addEventListener('input', () => {
    $('#create-count').textContent = ta.value.length;
  });
  $('#create-go').addEventListener('click', async () => {
    const prompt = ta.value.trim();
    if (!prompt) return toast('Write a prompt first.', 'warn');
    const info = (state.settings && state.settings.providers && state.settings.providers[state.provider]) || {};
    if (!info.hasKey) {
      toast('Add your ' + meta().label + ' API key in Settings first.', 'warn');
      nav('settings');
      return;
    }
    const m = meta();
    const q = $('#create-quality').value;
    const params = {
      prompt,
      model: modelFor(),
      aspect: $('#create-size').value,
      quality: m.resolutions ? null : q,
      imageSize: m.resolutions ? q : null,
      n: Number($('#create-n').value),
      background: m.background ? $('#create-bg').value : 'auto',
    };
    await runJob('create', () => api.generate(params));
  });
}

// ---------- edit (mask painting) ----------
const editCtx = { srcPath: null, w: 0, h: 0, strokes: 0, tool: 'brush', brush: 40, down: false, last: null };

function canvasPos(e) {
  const mask = $('#edit-mask');
  const r = mask.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (mask.width / r.width),
    y: (e.clientY - r.top) * (mask.height / r.height),
  };
}

function maskCtx() {
  return $('#edit-mask').getContext('2d');
}

function applyStrokeStyle() {
  const c = maskCtx();
  const wrapW = $('#canvas-wrap').getBoundingClientRect().width || 1;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(4, editCtx.brush * (editCtx.w / wrapW));
  if (editCtx.tool === 'erase') {
    c.globalCompositeOperation = 'destination-out';
    c.strokeStyle = 'rgba(0,0,0,1)';
    c.fillStyle = 'rgba(0,0,0,1)';
  } else {
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = 'rgba(255,150,40,0.5)';
    c.fillStyle = 'rgba(255,150,40,0.5)';
  }
}

function drawDot(p) {
  applyStrokeStyle();
  const c = maskCtx();
  c.beginPath();
  c.arc(p.x, p.y, c.lineWidth / 2, 0, Math.PI * 2);
  c.fill();
}

function strokeLine(a, b) {
  if (!a || !b) return;
  applyStrokeStyle();
  const c = maskCtx();
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  c.stroke();
}

function setTool(t) {
  editCtx.tool = t;
  $('#tool-brush').classList.toggle('active', t === 'brush');
  $('#tool-erase').classList.toggle('active', t === 'erase');
}

function updateMaskNote() {
  const note = $('#mask-note');
  const googleMask = meta().type === 'google' && editCtx.strokes > 0;
  if (googleMask) {
    note.textContent = 'Gemini has no mask input — your painted area will be covered with a magenta marker and replaced according to your prompt.';
    note.hidden = false;
  } else {
    note.hidden = true;
  }
}

function clearMask() {
  const mask = $('#edit-mask');
  maskCtx().clearRect(0, 0, mask.width, mask.height);
  editCtx.strokes = 0;
  updateMaskNote();
}

function setEditImage(r) {
  const img = $('#edit-img');
  img.onload = () => {
    const mask = $('#edit-mask');
    mask.width = img.naturalWidth;
    mask.height = img.naturalHeight;
    editCtx.w = img.naturalWidth;
    editCtx.h = img.naturalHeight;
    editCtx.srcPath = r.path || 'browser-file';
    editCtx.strokes = 0;
    $('#edit-start').hidden = true;
    $('#edit-grid').hidden = false;
    updateMaskNote();
  };
  img.src = r.dataUrl;
}

function clearEditImage() {
  editCtx.srcPath = null;
  $('#edit-grid').hidden = true;
  $('#edit-start').hidden = false;
}

async function loadEditFromPath(p) {
  try {
    const r = await api.readImage(p);
    if (!r) return;
    setEditImage(r);
    toast('Image loaded into the editor.', 'ok', 2400);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function opaqueStrokes(maskCanvas) {
  const c = document.createElement('canvas');
  c.width = maskCanvas.width;
  c.height = maskCanvas.height;
  const x = c.getContext('2d');
  x.drawImage(maskCanvas, 0, 0);
  const im = x.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 12) d[i] = 255;
  }
  x.putImageData(im, 0, 0);
  return c;
}

function exportMask() {
  if (!editCtx.strokes) return null;
  const mask = $('#edit-mask');
  const op = opaqueStrokes(mask);
  const off = document.createElement('canvas');
  off.width = mask.width;
  off.height = mask.height;
  const c = off.getContext('2d');
  c.fillStyle = '#000000';
  c.fillRect(0, 0, off.width, off.height);
  c.globalCompositeOperation = 'destination-out';
  c.drawImage(op, 0, 0);
  return off.toDataURL('image/png');
}

// magenta-cover composite for providers without mask support (Google Gemini)
function buildCoveredImage() {
  const base = $('#edit-img');
  if (!base || !base.naturalWidth) return null;
  const mask = $('#edit-mask');
  const op = opaqueStrokes(mask);

  const cover = document.createElement('canvas');
  cover.width = base.naturalWidth;
  cover.height = base.naturalHeight;
  const cx = cover.getContext('2d');
  cx.fillStyle = '#ff00ff';
  cx.fillRect(0, 0, cover.width, cover.height);
  cx.globalCompositeOperation = 'destination-out';
  cx.drawImage(op, 0, 0);

  const out = document.createElement('canvas');
  out.width = base.naturalWidth;
  out.height = base.naturalHeight;
  const ox = out.getContext('2d');
  ox.drawImage(base, 0, 0);
  ox.drawImage(cover, 0, 0);
  return out.toDataURL('image/png');
}

function bindEdit() {
  $('#edit-pick').addEventListener('click', async () => {
    try {
      const r = await api.pickImage();
      if (!r) return;
      setEditImage(r);
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  $('#edit-remove').addEventListener('click', clearEditImage);
  $('#tool-brush').addEventListener('click', () => setTool('brush'));
  $('#tool-erase').addEventListener('click', () => setTool('erase'));
  $('#mask-clear').addEventListener('click', clearMask);
  $('#brush-size').addEventListener('input', (e) => {
    editCtx.brush = Number(e.target.value);
  });

  $$('.chip').forEach((ch) =>
    ch.addEventListener('click', () => {
      const kind = ch.dataset.preset;
      const P = {
        bg: { prompt: 'Remove the background completely and keep the main subject with clean, crisp edges.', bg: 'transparent' },
        enhance: { prompt: 'Restore and enhance this photo: fix noise and artifacts, sharpen details, natural balanced colors.', bg: 'auto' },
        extend: { prompt: 'Extend the scene beyond the current edges naturally, matching lighting, style and perspective.', bg: 'auto' },
      }[kind];
      if (!P) return;
      $('#edit-prompt').value = P.prompt;
      const bgSel = $('#edit-bg');
      if (bgSel && meta().background) bgSel.value = P.bg;
      if (kind === 'bg') clearMask();
    })
  );

  const mask = $('#edit-mask');
  mask.addEventListener('pointerdown', (e) => {
    if (!editCtx.srcPath) return;
    editCtx.down = true;
    try {
      mask.setPointerCapture(e.pointerId);
    } catch (err) { /* ignore */ }
    const p = canvasPos(e);
    editCtx.last = p;
    if (editCtx.tool === 'brush') editCtx.strokes++;
    drawDot(p);
    updateMaskNote();
  });
  mask.addEventListener('pointermove', (e) => {
    if (!editCtx.down) return;
    const p = canvasPos(e);
    strokeLine(editCtx.last, p);
    editCtx.last = p;
  });
  const end = () => {
    editCtx.down = false;
    editCtx.last = null;
  };
  mask.addEventListener('pointerup', end);
  mask.addEventListener('pointercancel', end);

  $('#edit-go').addEventListener('click', async () => {
    const prompt = $('#edit-prompt').value.trim();
    if (!editCtx.srcPath) return toast('Choose an image first.', 'warn');
    if (!prompt) return toast('Describe what should change.', 'warn');
    const info = (state.settings && state.settings.providers && state.settings.providers[state.provider]) || {};
    if (!info.hasKey) {
      toast('Add your ' + meta().label + ' API key in Settings first.', 'warn');
      nav('settings');
      return;
    }

    const m = meta();
    const q = $('#edit-quality').value;
    let imagePath = editCtx.srcPath;
    let maskDataUrl = exportMask();
    let promptFinal = prompt;

    if (m.type === 'google' && maskDataUrl) {
      const covered = buildCoveredImage();
      if (covered) {
        try {
          imagePath = await api.writeTempPng(covered);
        } catch (e) {
          return toast(e.message, 'error');
        }
        maskDataUrl = null;
        promptFinal =
          'Replace the solid magenta-covered area with the following change, keeping everything outside the magenta area unchanged: ' +
          prompt;
      }
    }

    const params = {
      imagePaths: [imagePath],
      maskDataUrl,
      prompt: promptFinal,
      model: modelFor(),
      aspect: $('#edit-size').value,
      quality: m.resolutions ? null : q,
      imageSize: m.resolutions ? q : null,
      n: Number($('#edit-n').value),
      background: m.background ? $('#edit-bg').value : 'auto',
    };
    await runJob('edit', () => api.editImage(params));
  });
}

// ---------- image to image ----------
async function addRef() {
  if (state.refs.length >= 3) return toast('Up to 3 reference images.', 'warn');
  try {
    const r = await api.pickImage();
    if (!r) return;
    state.refs.push(r);
    renderRefs();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function renderRefs() {
  const box = $('#refs');
  box.innerHTML = '';
  state.refs.forEach((r, i) => {
    const slot = document.createElement('div');
    slot.className = 'ref-slot filled';
    slot.innerHTML = '<img src="' + r.dataUrl + '" alt="Reference ' + (i + 1) + '" /><button class="rm" title="Remove">×</button>';
    slot.querySelector('.rm').addEventListener('click', (e) => {
      e.stopPropagation();
      state.refs.splice(i, 1);
      renderRefs();
    });
    box.appendChild(slot);
  });
  const add = document.createElement('button');
  add.className = 'ref-slot add';
  add.innerHTML = '<span class="plus">+</span><span>Add image</span>';
  if (state.refs.length >= 3) add.disabled = true;
  add.addEventListener('click', addRef);
  box.appendChild(add);
}

function bindRestyle() {
  $('#ref-add').addEventListener('click', addRef);
  $('#restyle-go').addEventListener('click', async () => {
    const prompt = $('#restyle-prompt').value.trim();
    if (!state.refs.length) return toast('Add at least one reference image.', 'warn');
    if (!prompt) return toast('Describe the result you want.', 'warn');
    const info = (state.settings && state.settings.providers && state.settings.providers[state.provider]) || {};
    if (!info.hasKey) {
      toast('Add your ' + meta().label + ' API key in Settings first.', 'warn');
      nav('settings');
      return;
    }
    const m = meta();
    const q = $('#restyle-quality').value;
    const params = {
      imagePaths: state.refs.map((r) => r.path),
      prompt,
      model: modelFor(),
      aspect: $('#restyle-size').value,
      quality: m.resolutions ? null : q,
      imageSize: m.resolutions ? q : null,
      n: Number($('#restyle-n').value),
    };
    await runJob('restyle', () => api.editImage(params));
  });
}

// ---------- gallery ----------
async function loadGallery() {
  try {
    const list = await api.galleryList();
    state.gallery = list;
    const grid = $('#gallery-grid');
    grid.innerHTML = '';
    list.forEach((it) => grid.appendChild(galleryCard(it)));
    $('#gallery-empty').hidden = list.length > 0;
    $('#gallery-count').textContent = list.length ? list.length + ' image' + (list.length > 1 ? 's' : '') : '';
  } catch (e) {
    toast(e.message, 'error');
  }
}

function galleryCard(item) {
  const d = document.createElement('div');
  d.className = 'g-item';
  d.innerHTML =
    '<img src="' + item.thumb + '" alt="" loading="lazy" />' +
    '<div class="g-meta"><div class="p">' + esc(item.prompt || 'Image') + '</div>' +
    '<div class="d">' + esc(fmtDate(item.createdAt)) + ' · ' + esc(item.provider || '') + '</div></div>';
  d.addEventListener('click', () => openModal(item));
  return d;
}

function bindGalleryBar() {
  $('#gallery-refresh').addEventListener('click', loadGallery);
  $('#gallery-open').addEventListener('click', async () => {
    try {
      await api.galleryOpenFolder();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

// ---------- modal ----------
function openModal(item) {
  state.modalItem = item;
  $('#modal-img').src = item.thumb;
  const bits = [
    fmtDate(item.createdAt),
    item.provider || item.model,
    item.model,
    item.aspect || item.size,
    item.kind === 'edit' ? 'AI edit' : 'generate',
  ].filter(Boolean);
  $('#modal-meta').textContent = bits.join(' · ');
  $('#modal-prompt').textContent = item.prompt || '(no prompt)';
  $('#modal').hidden = false;
}

function closeModal() {
  $('#modal').hidden = true;
  state.modalItem = null;
}

function bindModal() {
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  });
  $('#modal-save').addEventListener('click', async () => {
    const it = state.modalItem;
    if (!it) return;
    await saveItem(it);
  });
  $('#modal-open').addEventListener('click', async () => {
    const it = state.modalItem;
    if (!it) return;
    if (!it.path) return toast('Available in the desktop app.', 'warn');
    try {
      await api.openPath(it.path);
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  $('#modal-reuse').addEventListener('click', () => {
    const it = state.modalItem;
    if (!it) return;
    $('#create-prompt').value = it.prompt || '';
    $('#create-count').textContent = (it.prompt || '').length;
    closeModal();
    nav('create');
  });
  $('#modal-delete').addEventListener('click', async () => {
    const it = state.modalItem;
    if (!it) return;
    try {
      await api.galleryDelete(it.id);
      closeModal();
      toast('Image deleted.', 'warn', 2600);
      if (state.view === 'gallery') loadGallery();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

// ---------- mock api (plain-browser preview only; the real app uses window.sun) ----------
function createMockApi() {
  const fake = (kind, prompt, aspect, extra) =>
    new Promise((resolve) => {
      setTimeout(() => {
        const c = document.createElement('canvas');
        c.width = 512;
        c.height = 512;
        const g = c.getContext('2d');
        const hue = Math.floor(Math.random() * 60 + 10);
        const grd = g.createLinearGradient(0, 0, 512, 512);
        grd.addColorStop(0, 'hsl(' + hue + ',80%,58%)');
        grd.addColorStop(1, 'hsl(' + ((hue + 120) % 360) + ',70%,28%)');
        g.fillStyle = grd;
        g.fillRect(0, 0, 512, 512);
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.font = 'bold 28px sans-serif';
        g.textAlign = 'center';
        g.fillText('MOCK', 256, 250);
        g.font = '14px sans-serif';
        g.fillText(prompt.slice(0, 44), 256, 290);
        const id = 'mock-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        resolve([
          {
            id,
            thumb: c.toDataURL('image/png'),
            path: null,
            prompt,
            kind,
            provider: state.provider,
            model: modelFor(),
            aspect,
            createdAt: Date.now(),
          },
        ]);
      }, 1800);
    });

  return {
    getInfo: async () => ({ version: '0.0.2', electron: 'mock', platform: 'browser', encryption: 'none', packaged: false }),
    getSettings: async () => ({
      provider: 'openai',
      settings: { models: { openai: 'gpt-image-1', aipass: 'gpt-image-1', google: 'gemini-nano-banana-2.1' }, size: '1:1', quality: 'medium', imageSize: '1K', outputDir: '', autoSave: false, checkUpdates: true },
      providers: {
        openai: { hasKey: false, encrypted: false, hint: '' },
        aipass: { hasKey: false, encrypted: false, hint: '' },
        google: { hasKey: false, encrypted: false, hint: '' },
      },
    }),
    setApiKey: async (id, k) => state.settings,
    updateSettings: async (p) => state.settings,
    testKey: async () => {
      throw new Error('Run the desktop app to test a real key.');
    },
    providerModels: async () => ['gpt-image-1', 'dall-e-3', 'flux-pro'],
    generate: ({ prompt, aspect }) => fake('generate', prompt, aspect),
    editImage: ({ prompt, aspect }) => fake('edit', prompt, aspect),
    pickImage: () =>
      new Promise((resolve) => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.onchange = () => {
          const f = inp.files && inp.files[0];
          if (!f) return resolve(null);
          const rd = new FileReader();
          rd.onload = () => resolve({ path: null, dataUrl: rd.result, width: 0, height: 0 });
          rd.readAsDataURL(f);
        };
        inp.click();
      }),
    readImage: async () => null,
    writeTempPng: async () => 'browser-file',
    galleryList: async () => [],
    galleryDelete: async () => {},
    gallerySaveAs: async () => {
      throw new Error('Save-as works in the desktop app.');
    },
    galleryOpenFolder: async () => toast('Available in the desktop app.', 'warn'),
    openPath: async () => toast('Available in the desktop app.', 'warn'),
    pickOutputDir: async () => null,
    exportPng: async (dataUrl, name) => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = name || 'SunStudio.png';
      a.click();
      return name;
    },
    updateCheck: async () => ({ started: false, error: 'dev' }),
    updateDownload: async () => ({ started: false }),
    updateInstall: async () => {},
    updateState: async () => ({ type: 'idle' }),
    onStage: null,
    onMenuNav: null,
    onUpdateEvent: null,
  };
}

// ---------- init ----------
(async function init() {
  bindCreate();
  bindEdit();
  bindRestyle();
  bindSettings();
  bindGalleryBar();
  bindModal();
  bindUpdateChip();
  try {
    state.info = await api.getInfo();
    $('#ver-num').textContent = 'v' + state.info.version;
  } catch (e) { /* keep static label */ }
  await refreshSettings();
  renderProviderPill();
  renderProviderCards();
  populateAllViewOptions();
  fillSettings();
})();
