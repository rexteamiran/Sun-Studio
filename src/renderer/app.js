'use strict';

// ---------- API bridge (real Electron preload, or mock for browser preview) ----------
const api = window.sun || createMockApi();

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
  working: false,
  gallery: [],
  refs: [],
  modalItem: null,
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

// ---------- settings ----------
function paintKeyUi() {
  const s = state.settings;
  const badge = $('#key-badge');
  if (s && s.hasKey) {
    badge.className = 'key-badge ok';
    badge.textContent = 'Key ' + s.hint + (s.encrypted ? ' · encrypted' : '');
    $('#key-banner').hidden = true;
  } else {
    badge.className = 'key-badge warn';
    badge.textContent = 'No API key set';
    $('#key-banner').hidden = false;
  }
}

async function refreshSettings() {
  try {
    state.settings = await api.getSettings();
  } catch (e) {
    state.settings = { settings: {}, hasKey: false, encrypted: false, hint: '' };
  }
  paintKeyUi();
}

function fillSettings() {
  const s = state.settings;
  if (!s) return;
  const d = s.settings || {};
  $('#set-model').value = d.model || 'gpt-image-1';
  $('#set-quality').value = d.quality || 'medium';
  $('#set-size').value = d.size || '1024x1024';
  $('#outdir-label').textContent = d.outputDir || 'No folder chosen';
  $('#outdir-label').title = d.outputDir || '';
  $('#autosave').checked = !!d.autoSave;
  if (s.hasKey) {
    setKeyStatus('Key saved (' + (s.encrypted ? 'encrypted with DPAPI' : 'plain text — encryption unavailable') + '): ' + s.hint, 'ok');
  } else {
    setKeyStatus('No key saved yet. Get one at platform.openai.com/api-keys', '');
  }
}

function setKeyStatus(text, cls) {
  const elx = $('#key-status');
  elx.textContent = text;
  elx.className = 'status ' + (cls || '');
}

async function saveDefaults() {
  try {
    await api.updateSettings({ model: $('#set-model').value, quality: $('#set-quality').value, size: $('#set-size').value });
  } catch (e) {
    toast(e.message, 'error');
  }
}

function bindSettings() {
  $('#key-eye').addEventListener('click', () => {
    const inp = $('#key-input');
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    $('#key-eye').textContent = show ? 'Hide' : 'Show';
  });

  $('#key-save').addEventListener('click', async () => {
    const key = $('#key-input').value.trim();
    if (!key) {
      setKeyStatus('Paste a key first (it starts with sk-).', 'warn');
      return;
    }
    try {
      state.settings = await api.setApiKey(key);
      $('#key-input').value = '';
      paintKeyUi();
      fillSettings();
      toast('API key saved.', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  $('#key-remove').addEventListener('click', async () => {
    try {
      state.settings = await api.setApiKey('');
      paintKeyUi();
      fillSettings();
      toast('API key removed.', 'warn');
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  $('#key-test').addEventListener('click', async () => {
    setKeyStatus('Testing connection…', '');
    try {
      const r = await api.testKey();
      setKeyStatus(
        'Connection successful — ' + r.models + ' models available' + (r.hasImageModel ? '.' : ' (image models not listed by name).'),
        'ok'
      );
    } catch (e) {
      setKeyStatus(e.message, 'err');
    }
  });

  $('#set-model').addEventListener('change', saveDefaults);
  $('#set-quality').addEventListener('change', saveDefaults);
  $('#set-size').addEventListener('change', saveDefaults);

  $('#outdir-pick').addEventListener('click', async () => {
    try {
      const dir = await api.pickOutputDir();
      if (!dir) return;
      await api.updateSettings({ outputDir: dir });
      state.settings = await api.getSettings();
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
}

// ---------- job runner (progress + results) ----------
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
    setStage(view, 'Contacting OpenAI…');
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
    if (!state.settings || !state.settings.hasKey) {
      toast('Add your OpenAI API key in Settings first.', 'warn');
      nav('settings');
      return;
    }
    const params = {
      prompt,
      size: $('#create-size').value,
      quality: $('#create-quality').value,
      n: Number($('#create-n').value),
      background: $('#create-bg').value,
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

function clearMask() {
  const mask = $('#edit-mask');
  maskCtx().clearRect(0, 0, mask.width, mask.height);
  editCtx.strokes = 0;
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

function exportMask() {
  if (!editCtx.strokes) return null;
  const mask = $('#edit-mask');
  const off = document.createElement('canvas');
  off.width = mask.width;
  off.height = mask.height;
  const c = off.getContext('2d');
  c.fillStyle = '#000000';
  c.fillRect(0, 0, off.width, off.height);
  c.globalCompositeOperation = 'destination-out';
  c.drawImage(mask, 0, 0);
  return off.toDataURL('image/png');
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
      $('#edit-bg').value = P.bg;
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
    if (!state.settings || !state.settings.hasKey) {
      toast('Add your OpenAI API key in Settings first.', 'warn');
      nav('settings');
      return;
    }
    const params = {
      imagePaths: [editCtx.srcPath],
      maskDataUrl: exportMask(),
      prompt,
      size: $('#edit-size').value,
      quality: $('#edit-quality').value,
      n: Number($('#edit-n').value),
      background: $('#edit-bg').value,
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
    if (!state.settings || !state.settings.hasKey) {
      toast('Add your OpenAI API key in Settings first.', 'warn');
      nav('settings');
      return;
    }
    const params = {
      imagePaths: state.refs.map((r) => r.path),
      prompt,
      size: $('#restyle-size').value,
      quality: $('#restyle-quality').value,
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
    '<div class="d">' + esc(fmtDate(item.createdAt)) + ' · ' + esc(item.kind || '') + '</div></div>';
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
    item.model,
    item.size,
    'quality: ' + (item.quality || '—'),
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
  const fake = (kind, prompt, size, quality) =>
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
          { id, thumb: c.toDataURL('image/png'), path: null, prompt, kind, model: 'mock', size, quality, createdAt: Date.now() },
        ]);
      }, 1800);
    });

  return {
    getSettings: async () => ({
      settings: { model: 'gpt-image-1', size: '1024x1024', quality: 'medium', outputDir: '', autoSave: false },
      hasKey: false,
      encrypted: false,
      hint: '',
    }),
    setApiKey: async (k) => ({ settings: {}, hasKey: !!k, encrypted: false, hint: k ? k.slice(0, 6) + '…' : '' }),
    updateSettings: async () => ({}),
    testKey: async () => {
      throw new Error('Run the desktop app to test a real key.');
    },
    generate: ({ prompt, size, quality }) => fake('generate', prompt, size, quality),
    editImage: ({ prompt, size, quality }) => fake('edit', prompt, size, quality),
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
    onStage: null,
    onMenuNav: null,
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
  await refreshSettings();
  fillSettings();
})();
