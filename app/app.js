// Mothlight No.01 standalone: one straight line, drawn on this device and offline once installed.
// Source (Solo, Duo or the camera), in brightness > Signal.Trails >
// Signal.Colour, the only place colour is decided and the output. There is one feedback loop, one key and one Colour.
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const ISF = '../isf/';
  // inside the NXLX Android or iOS app: the shell is already full screen, keeps the files and brings MIDI
  const SHELL = /NXLXSignal\//.test(navigator.userAgent);
  const SOURCES = {
    osc:     { name: 'Solo', button: 'Solo', file: 'signal-solo.fs', clock: 'rate', period: 100, pages: [
      { label: 'Osc', longs: ['gen.wave', 'gen.form', 'gen.shape'], floats: ['gen.rate', 'gen.bands', 'gen.angle', 'gen.bend'] }] },
    modular: { name: 'Duo', button: 'Duo', file: 'signal-duo.fs', clock: null, pages: [
      { label: 'Osc A', longs: ['gen.a_wave', 'gen.a_form'], floats: ['gen.a_rate', 'gen.a_freq', 'gen.a_angle'] },
      { label: 'Osc B', longs: ['gen.b_wave', 'gen.b_form'], floats: ['gen.b_rate', 'gen.b_freq', 'gen.b_angle'] },
      { label: 'Mix', longs: ['gen.mix_mode', 'gen.shape_kind'], floats: ['gen.mix_amt', 'gen.a_fm', 'gen.shape_size', 'gen.shape_soft'] }] },
    camera:  { name: 'Camera', button: 'Camera', pages: [] }
  };
  const CROSSFADE = 2;   // seconds, between sources
  const FADE = 2;        // seconds, Fade out
  const LFO_PAGES = [
    { label: 'LFO', longs: ['rig.lfo1_to', 'rig.lfo1_shape', 'rig.lfo2_to', 'rig.lfo2_shape'], floats: ['rig.lfo1_rate', 'rig.lfo1_depth', 'rig.lfo2_rate', 'rig.lfo2_depth'] }
  ];
  const DRIFT_PAGES = [
    { label: 'Trails', longs: ['drift.keyinto', 'drift.edges'], floats: ['drift.feed', 'drift.key', 'drift.sharpen', 'rig.delay'] },
    { label: 'Move', longs: ['drift.mirror'], pads: [
      { x: 'drift.turn', y: 'drift.zoom', label: 'Zoom and turn', top: 'In', bottom: 'Out', left: 'Left', right: 'Right' },
      { x: 'drift.shiftx', y: 'drift.shifty', label: 'Slide', top: 'Up', bottom: 'Down', left: 'Left', right: 'Right' }] }
  ];
  const COLOUR_PAGES = [
    { label: 'Colour', longs: ['colour.palette'], floats: ['colour.hue', 'colour.spread', 'rig.cycle', 'colour.sat', 'colour.bright', 'colour.contrast'] }
  ];
  const OUTPUT_PAGES = [
    { label: 'Output', special: 'output', longs: ['colour.mode', 'colour.invert'], floats: ['colour.matte', 'colour.soft'] }
  ];
  // How a fader's travel maps to its value, so the useful range gets most of the fader.
  // Slow: fine at the bottom. Middle: fine around zero. Top: fine near the top.
  const CURVES = { rate: 'slow', bands: 'slow', a_freq: 'slow', b_freq: 'slow', a_rate: 'middle', b_rate: 'middle', lfo1_rate: 'slow', lfo2_rate: 'slow',
    cycle: 'middle', zoom: 'middle', turn: 'middle', shiftx: 'middle', shifty: 'middle', feed: 'top' };
  const LFO_TO = [['Off'], ['Zoom', 'drift', ['zoom'], 0.5], ['Turn', 'drift', ['turn'], 0.5], ['Bend', 'gen', ['a_fm', 'bend'], 0.5],
    ['Angle', 'gen', ['a_angle', 'angle'], 0.25, 0.25], ['Hue', 'colour', ['hue'], 0.25, 1], ['Key', 'drift', ['key'], 0.4]];
  // A fifth entry above marks a target that goes round in a circle, and how fast a ramp may take it round.
  // A ramp on those loops for ever with no jump. The others have ends, so a ramp rises, then glides back in RAMP_BACK of its time
  const RAMP_BACK = 0.15;
  const ramp = x => { if (x < 1 - RAMP_BACK) return x / (1 - RAMP_BACK); const u = (x - 1 + RAMP_BACK) / RAMP_BACK; return 1 - u * u * (3 - 2 * u); };
  const lfoSpec = n => [
    { NAME: 'lfo' + n + '_to', LABEL: 'LFO ' + n + ' to', TYPE: 'long', VALUES: LFO_TO.map((_, k) => k), LABELS: LFO_TO.map(d => d[0]), DEFAULT: 0 },
    { NAME: 'lfo' + n + '_shape', LABEL: 'LFO ' + n + ' shape', TYPE: 'long', VALUES: [0, 1, 2], LABELS: ['Sine', 'Ramp up', 'Ramp down'], DEFAULT: 0 },
    { NAME: 'lfo' + n + '_rate', LABEL: n + ' Speed', TYPE: 'float', MIN: 0.01, MAX: 1, DEFAULT: 0.1 },
    { NAME: 'lfo' + n + '_depth', LABEL: n + ' Depth', TYPE: 'float', MIN: 0, MAX: 1, DEFAULT: 0.3 }];
  // settings of the app itself, kept and shown like a shader's
  const RIG = { isf: { inputs: [{ NAME: 'delay', LABEL: 'Delay', TYPE: 'float', MIN: 1, MAX: 60, DEFAULT: 1, WHOLE: true },
    { NAME: 'cycle', LABEL: 'Hue cycle', TYPE: 'float', MIN: -0.2, MAX: 0.2, DEFAULT: 0 }].concat(lfoSpec(1), lfoSpec(2)) } };
  // Controls that have no effect in the current setting are dimmed, so nothing on a page is a dead end
  const greyPalette = () => S.colour.values.palette === 0 && S.source !== 'camera';
  const notColour = () => S.colour.values.mode !== 0;
  // An LFO option that would do nothing right now. It can still be chosen, and it wakes when the setting changes
  const lfoDead = k => {
    const to = LFO_TO[k];
    if (to.length < 2) return false;
    if (to[1] === 'drift') return !S.driftOn;
    if (to[1] === 'colour') return IDLE['colour.hue']();
    if (S.source === 'camera') return true;
    return to[0] === 'Angle' && S.source === 'modular' && S.gen.values.a_form === 1;   // Solo's Angle still turns its rings
  };
  const lfoIdle = n => { const to = S.rig.values['lfo' + n + '_to']; return to === 0 || lfoDead(to); };
  // a ramp round a circle always goes the whole way round, so Depth has nothing to set
  const lfoLoops = n => S.rig.values['lfo' + n + '_shape'] !== 0 && LFO_TO[S.rig.values['lfo' + n + '_to']].length > 4;
  const DEAD_OPTION = { 'rig.lfo1_to': lfoDead, 'rig.lfo2_to': lfoDead };
  const IDLE = {
    'gen.a_angle': () => S.gen.values.a_form === 1, 'gen.b_angle': () => S.gen.values.b_form === 1,
    'gen.shape_size': () => S.gen.values.shape_kind === 0, 'gen.shape_soft': () => S.gen.values.shape_kind === 0,
    'rig.lfo1_rate': () => lfoIdle(1), 'rig.lfo1_depth': () => lfoIdle(1) || lfoLoops(1), 'rig.lfo2_rate': () => lfoIdle(2), 'rig.lfo2_depth': () => lfoIdle(2) || lfoLoops(2),
    'rig.lfo1_shape': () => lfoIdle(1), 'rig.lfo2_shape': () => lfoIdle(2),
    'colour.palette': notColour, 'colour.hue': () => notColour() || greyPalette(), 'rig.cycle': () => notColour() || greyPalette(),
    'colour.sat': () => notColour() || greyPalette(), 'colour.spread': () => notColour() || S.colour.values.palette === 0 || S.colour.values.palette === 3,
    'colour.bright': () => S.colour.values.mode === 2, 'colour.matte': () => S.colour.values.mode !== 2, 'colour.soft': () => S.colour.values.mode !== 2
  };
  const DETAIL = [['Half', 0.5], ['Three quarters', 0.75], ['Full', 1]];
  const STORE = 'signal-synth-v2';

  const store = {
    get(k, d) { try { const v = localStorage.getItem(STORE + ':' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(STORE + ':' + k, JSON.stringify(v)); } catch (e) {} }
  };

  function say(text) { const m = $('msg'); m.textContent = text; m.hidden = !text; }
  $('msg').onclick = () => say('');
  // anything that slips through is shown, not lost
  window.addEventListener('error', e => say('Something went wrong: ' + e.message));
  window.addEventListener('unhandledrejection', e => say('Something went wrong: ' + (e.reason && e.reason.message || e.reason)));

  // ---- engine and chain --------------------------------------------------------------------------------------
  const canvas = $('out');
  let engine;
  try { engine = SignalCore.Engine(canvas, { scale: 1 }); }
  catch (e) { say('This device cannot draw the synth: ' + e.message); return; }

  const texts = {};
  async function isfText(file) {
    // the download carries the shaders as a script too (isf/signal-isf.js, made by release/build.sh),
    // so the app also opens from an unzipped folder, where a browser will not fetch files
    const bundled = window.SIGNAL_ISF && window.SIGNAL_ISF[file];
    if (!texts[file] && typeof bundled === 'string') texts[file] = bundled;
    if (!texts[file]) {
      // a page opened from a file, not a web address, cannot read the shaders beside it
      const missing = () => Object.assign(new Error(file + ' did not load'), { missing: true });
      let r;
      try { r = await fetch(ISF + file); } catch (e) { throw missing(); }
      if (!r.ok) throw missing();
      texts[file] = await r.text();
    }
    return texts[file];
  }

  const S = {
    source: 'osc', driftOn: true, detail: 0.5, rig: Object.assign({ values: SignalCore.defaults(RIG.isf) }, RIG),
    gen: null, drift: null, colour: null, camStage: null, stages: {}, saved: {}, fade: null,
    frozen: false, faded: false, black: false, level: 1, perform: false, autoDetail: true
  };
  let driftISF, colourISF, genISF = {};

  // Simple and Full stay built, so a switch fades straight away and each keeps its settings
  async function stageFor(key) {
    const src = SOURCES[key];
    if (!genISF[key]) genISF[key] = SignalCore.parseISF(await isfText(src.file));
    if (!S.stages[key]) {
      S.stages[key] = engine.Stage(genISF[key], { clockInput: src.clock, clockPeriod: src.period });
      Object.assign(S.stages[key].values, S.saved[key] || {});
      checked(S.stages[key]);
      if (key === 'osc') S.stages[key].values.spread = 0;   // colour belongs to Signal.Colour here
    }
    return S.stages[key];
  }

  // Saved values are checked against what each stage takes, so a damaged save can never stop the picture
  function checked(stage) {
    for (const spec of stage.isf.inputs) {
      if (spec.TYPE === 'image') continue;
      const v = stage.values[spec.NAME];
      if (spec.TYPE === 'long') { if (spec.VALUES.indexOf(v) < 0) stage.values[spec.NAME] = spec.DEFAULT; }
      else if (typeof v !== 'number' || !isFinite(v)) stage.values[spec.NAME] = spec.DEFAULT;
      else stage.values[spec.NAME] = Math.min(spec.MAX, Math.max(spec.MIN, spec.WHOLE ? Math.round(v) : v));
    }
  }

  function endFade() {
    const f = S.fade; S.fade = null;
    engine.setChain(engine.chain.map(s => s === f ? f.b : s), true);
    f.free();
    if (S.source !== 'camera') stopCamera();
  }
  // What goes at the head of the chain: the new source, or a crossfade into it from the one playing
  function crossfadeTo(old, next) {
    const f = S.fade;
    if (f && f.b === next) return f;
    if (f && f.a === next) { f.a = f.b; f.b = next; f.amount = 1 - f.amount; return f; }   // changed your mind: fade back
    if (f) endFade();
    if (!old || old === next) return next;
    next.alloc();
    return S.fade = engine.Mix(old, next);
  }

  // ---- camera: one video element and one stage for the life of the app, so a fade can always read them -----------
  const camera = { video: null, stream: null, id: null, asking: 0, list: [] };
  const stopTracks = stream => stream.getTracks().forEach(t => t.stop());
  function stopCamera() {
    camera.asking++;
    if (camera.stream) { stopTracks(camera.stream); camera.stream = null; camera.video.srcObject = null; }
  }
  async function listCameras() {
    try { camera.list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && d.deviceId); }
    catch (e) { camera.list = []; }
  }
  function cameraName(d, k) {
    const label = d.label || '';
    if (/facing back/i.test(label)) return 'Back';
    if (/facing front/i.test(label)) return 'Front';
    return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, '') || 'Camera ' + (k + 1);
  }
  function cameraFailed(e) { say('The camera did not start: ' + (e.message || e.name) + '. Allow the camera for this app, or choose another source.'); }
  // only one camera may be open at a time on many devices, so the old one closes first
  async function startCamera() {
    stopCamera();
    const ask = ++camera.asking, wanted = store.get('camera', null);
    const size = { width: { ideal: Math.max(640, engine.size[0]) }, height: { ideal: Math.max(360, engine.size[1]) } };
    const open = video => navigator.mediaDevices.getUserMedia({ video: Object.assign(video, size), audio: false });
    let stream;
    try { stream = await open(wanted ? { deviceId: { exact: wanted } } : { facingMode: 'user' }); }
    catch (e) { if (!wanted) throw e; store.set('camera', null); stream = await open({}); }   // the chosen camera has gone
    if (ask !== camera.asking) { stopTracks(stream); return; }
    const track = stream.getVideoTracks()[0], set = track.getSettings();
    track.onended = () => { if (camera.stream === stream) say('The camera stopped. Check its cable, or choose another source.'); };
    camera.stream = stream; camera.id = set.deviceId || null;
    S.camStage.mirror = set.facingMode === 'user' || /facing front/i.test(track.label);
    camera.video.srcObject = stream;
    await camera.video.play();
    await listCameras();
  }
  function pickCamera(id) {
    store.set('camera', id);
    startCamera().catch(cameraFailed).then(buildPage);
  }
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      await listCameras();
      if (S.source === 'camera' && showing('source')) buildPage();
    });
  }

  async function buildChain(keepValues) {
    const key = S.source;
    let next;
    if (key === 'camera') {
      if (!camera.video) {
        camera.video = document.createElement('video'); camera.video.muted = true; camera.video.playsInline = true;
        S.camStage = engine.CameraStage(camera.video);
      }
      // a camera that did not start is asked for again next time; meanwhile its stage shows black
      if (!camera.stream) await startCamera().catch(cameraFailed);
      if (key !== S.source) { if (!S.fade) stopCamera(); return; }
      next = S.camStage;
    } else {
      next = await stageFor(key);
      if (key !== S.source) return;
      if (keepValues && keepValues.gen) Object.assign(next.values, keepValues.gen);
    }
    const chain = [crossfadeTo(S.gen, next)];
    S.gen = next;
    // leaving the camera turns it off, once a fade from it has finished
    if (key !== 'camera' && !S.fade) stopCamera();
    if (!S.drift) {
      driftISF = driftISF || SignalCore.parseISF(await isfText('signal-trails.fs'));
      S.drift = engine.Stage(driftISF, { ring: 'drift' });
    }
    if (!S.colour) {
      colourISF = colourISF || SignalCore.parseISF(await isfText('signal-colour.fs'));
      S.colour = engine.Stage(colourISF);
    }
    if (keepValues && keepValues.drift) Object.assign(S.drift.values, keepValues.drift);
    if (keepValues && keepValues.colour) Object.assign(S.colour.values, keepValues.colour);
    checked(S.rig); checked(S.drift); checked(S.colour);
    if (S.gen.isf) checked(S.gen);
    S.drift.values.hueturn = 0;   // and so does this
    // Signal.Trails carries on through a source change, so its trails fade across too
    if (S.driftOn) {
      if (engine.chain.indexOf(S.drift) < 0) S.drift.alloc();
      chain.push(S.drift);
    }
    chain.push(S.colour);
    engine.setChain(chain, true);
    $('name').textContent = SOURCES[S.source].name + (S.driftOn ? ' with trails' : '');
    buildTabs();
    save();
  }

  // ---- state saving ------------------------------------------------------------------------------------------
  function snapshot() {
    const gens = {};
    for (const k of ['osc', 'modular']) gens[k] = S.stages[k] ? S.stages[k].values : S.saved[k];
    return JSON.parse(JSON.stringify({ source: S.source, driftOn: S.driftOn, detail: S.detail, gens, rig: S.rig.values,
      gen: S.gen && S.gen.values || {}, drift: S.drift ? S.drift.values : {}, colour: S.colour ? S.colour.values : {} }));
  }
  let saveTimer = 0;
  function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => store.set('state', snapshot()), 400); }

  async function restore(snap) {
    const sourceChanged = snap.source !== S.source;
    S.source = snap.source in SOURCES ? snap.source : 'osc';
    S.driftOn = snap.driftOn !== false;
    Object.assign(S.rig.values, snap.rig || {});
    showDelay(); phase.cycle = 0;
    if (snap.detail && snap.detail !== S.detail) { S.detail = snap.detail; engine.setScale(S.detail); }
    if (sourceChanged || !S.gen || engine.chain.indexOf(S.drift) < 0 === S.driftOn) await buildChain(snap);
    else {
      if (S.gen.values) Object.assign(S.gen.values, snap.gen || {});
      Object.assign(S.drift.values, snap.drift || {}); Object.assign(S.colour.values, snap.colour || {});
      checked(S.rig); checked(S.drift); checked(S.colour);
      if (S.gen.isf) checked(S.gen);
      buildPage(); save();
    }
  }

  // ---- controls ----------------------------------------------------------------------------------------------
  // Every setting is a parameter with an id: "gen.name", "drift.name", "colour.name" or "rig.name". A parameter exists
  // whether or not its page is showing, so a mapped knob always works. "mem:N" and "act:name" are the buttons.
  const controls = {};
  function control(id, c) { controls[id] = c; c.id = id; return c; }
  const params = new WeakMap();
  let views = [];   // redraws for what is on the page now
  function refresh() { views.forEach(v => v()); }

  function inputOf(stage, name) { return stage.isf.inputs.find(i => i.NAME === name); }
  function curveOf(name, spec) {
    const lo = spec.MIN, hi = spec.MAX, span = hi - lo, kind = CURVES[name];
    if (kind === 'slow') return { value: n => lo + span * n * n, norm: v => Math.sqrt((v - lo) / span) };
    if (kind === 'top') return { value: n => lo + span * (1 - (1 - n) * (1 - n)), norm: v => 1 - Math.sqrt(1 - (v - lo) / span) };
    if (kind === 'middle') return {
      value: n => { const u = n * 2 - 1; return hi * Math.sign(u) * u * u; },
      norm: v => 0.5 + Math.sign(v) * Math.sqrt(Math.abs(v) / hi) / 2 };
    return { value: n => lo + span * n, norm: v => (v - lo) / span };
  }
  function param(id) {
    const dot = id.indexOf('.'), stage = S[id.slice(0, dot)], name = id.slice(dot + 1);
    if (!stage || !stage.isf) return null;
    let all = params.get(stage);
    if (!all) params.set(stage, all = {});
    if (all[name]) return all[name];
    const spec = inputOf(stage, name);
    if (!spec) return null;
    const c = { id, spec, kind: spec.TYPE === 'long' ? 'long' : 'float', get: () => +stage.values[name] };
    const changed = () => { refresh(); save(); };
    if (c.kind === 'long') {
      c.set = v => { stage.values[name] = v; changed(); };
      c.setNorm = n => c.set(spec.VALUES[Math.min(spec.VALUES.length - 1, Math.floor(n * spec.VALUES.length))]);
      c.press = () => c.set(spec.VALUES[(spec.VALUES.indexOf(c.get()) + 1) % spec.VALUES.length]);
    } else {
      const curve = curveOf(name, spec);
      c.norm = () => curve.norm(c.get());
      c.set = v => {
        v = Math.min(spec.MAX, Math.max(spec.MIN, v));
        stage.values[name] = spec.WHOLE ? Math.round(v) : v;
        if (name === 'delay') showDelay();
        changed();
      };
      c.setNorm = n => c.set(curve.value(n));
      c.rest = () => { c.set(spec.DEFAULT); };
      c.zero = spec.MIN < 0 ? 0.5 : 0;
    }
    return all[name] = c;
  }
  // the chip shows the delay really heard: a large drawing keeps fewer frames than the fader can ask for
  function showDelay() {
    const ring = S.drift && S.drift.ringSize;
    $('chipDelay').textContent = 'Delay ' + (ring ? Math.min(S.rig.values.delay, ring) : S.rig.values.delay);
  }
  function fmt(c) {
    const v = c.get(), span = c.spec.MAX - c.spec.MIN;
    return c.spec.WHOLE ? String(v) : span <= 0.2 ? v.toFixed(3) : span <= 3 ? v.toFixed(2) : v.toFixed(1);
  }
  // A second tap straight after the first puts a fader or pad back
  function tapTwice(rest) {
    let last = 0, x = 0, y = 0;
    return e => {
      const now = performance.now(), twice = now - last < 300 && Math.hypot(e.clientX - x, e.clientY - y) < 24;
      last = twice ? 0 : now; x = e.clientX; y = e.clientY;
      if (twice) rest();
      return twice;
    };
  }

  // Keyboards and screen readers: arrows nudge, Shift for bigger steps, Home and End go to the ends
  function nudgeKey(e) {
    const step = e.shiftKey ? 0.1 : 0.01;
    return { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: 0.1, PageDown: -0.1 }[e.key] || 0;
  }
  const clamp01 = v => Math.min(1, Math.max(0, v));

  function makeFader(id) {
    const c = param(id);
    if (!c) return null;
    const el = document.createElement('div'); el.className = 'fader';
    const num = document.createElement('span'); num.className = 'num';
    const track = document.createElement('div'); track.className = 'track';
    const fill = document.createElement('i'); fill.className = 'fill';
    const cap = document.createElement('i'); cap.className = 'cap';
    const lab = document.createElement('span'); lab.className = 'caption'; lab.textContent = c.spec.LABEL;
    track.append(fill, cap); el.append(num, track, lab);
    track.tabIndex = 0; track.setAttribute('role', 'slider'); track.setAttribute('aria-label', c.spec.LABEL);
    track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
    function draw() {
      const n = c.norm(), a = Math.min(n, c.zero), b = Math.max(n, c.zero);
      el.classList.toggle('idle', !!IDLE[id] && IDLE[id]());
      cap.style.top = (100 - n * 100) + '%';
      fill.style.top = (100 - b * 100) + '%'; fill.style.bottom = (a * 100) + '%';
      num.textContent = fmt(c);
      track.setAttribute('aria-valuenow', String(Math.round(n * 100))); track.setAttribute('aria-valuetext', num.textContent);
    }
    track.addEventListener('keydown', e => {
      const d = nudgeKey(e), ends = { Home: 0, End: 1 }[e.key], back = e.key === 'Delete' || e.key === 'Backspace';
      if (!d && ends === undefined && !back) return;
      e.preventDefault();
      if (learnPick(c, track, e)) return;
      c.latch = false;
      if (back) c.rest(); else c.setNorm(ends !== undefined ? ends : clamp01(c.norm() + d));
    });
    const twice = tapTwice(c.rest);
    track.addEventListener('pointerdown', e => {
      if (learnPick(c, track, e)) return;
      track.setPointerCapture(e.pointerId); track.classList.add('held'); c.latch = false;
      const r = track.getBoundingClientRect();
      const move = ev => c.setNorm(1 - Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
      if (twice(e)) track.onpointermove = null; else { move(e); track.onpointermove = move; }
      track.onpointerup = track.onpointercancel = () => { track.classList.remove('held'); track.onpointermove = null; };
    });
    views.push(draw); draw();
    return el;
  }

  function makePad(p) {
    const cx = param(p.x), cy = param(p.y);
    if (!cx || !cy) return null;
    const box = document.createElement('div'); box.className = 'padbox';
    const nums = document.createElement('div'); nums.className = 'padnums';
    const lab = document.createElement('span'); lab.className = 'caption'; lab.textContent = p.label;
    const num = document.createElement('span'); num.className = 'num-small';
    nums.append(lab, num);
    const pad = document.createElement('div'); pad.className = 'pad';
    for (const axis of ['h', 'v']) { const i = document.createElement('i'); i.className = axis; pad.append(i); }
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const s = document.createElement('span'); s.className = 'edge ' + side; s.textContent = p[side]; pad.append(s);
    }
    const dot = document.createElement('i'); dot.className = 'dot'; pad.append(dot);
    box.append(nums, pad);
    pad.tabIndex = 0; pad.setAttribute('role', 'group');
    pad.setAttribute('aria-label', p.label + '. Arrow keys move it, Delete centres it');
    function draw() {
      dot.style.left = (cx.norm() * 100) + '%'; dot.style.top = (100 - cy.norm() * 100) + '%';
      num.textContent = fmt(cx) + ' ' + fmt(cy);
    }
    pad.addEventListener('keydown', e => {
      const d = nudgeKey(e), across = e.key === 'ArrowLeft' || e.key === 'ArrowRight', back = e.key === 'Delete' || e.key === 'Backspace';
      if (!d && !back) return;
      e.preventDefault();
      if (learnPick(cx, pad, e, cy)) return;
      cx.latch = cy.latch = false;
      if (back) { cx.set(0); cy.set(0); }
      else if (across) cx.setNorm(clamp01(cx.norm() + d)); else cy.setNorm(clamp01(cy.norm() + d));
    });
    const twice = tapTwice(() => { cx.set(0); cy.set(0); });
    pad.addEventListener('pointerdown', e => {
      if (learnPick(cx, pad, e, cy)) return;
      pad.setPointerCapture(e.pointerId); pad.classList.add('held'); cx.latch = cy.latch = false;
      const r = pad.getBoundingClientRect(), clamp = v => Math.min(1, Math.max(0, v));
      const move = ev => { cx.setNorm(clamp((ev.clientX - r.left) / r.width)); cy.setNorm(1 - clamp((ev.clientY - r.top) / r.height)); };
      if (twice(e)) pad.onpointermove = null; else { move(e); pad.onpointermove = move; }
      pad.onpointerup = pad.onpointercancel = () => { pad.classList.remove('held'); pad.onpointermove = null; };
    });
    views.push(draw); draw();
    return box;
  }

  function makeChoice(id) {
    const c = param(id);
    if (!c) return null;
    const row = document.createElement('div'); row.className = 'choice';
    const lab = document.createElement('span'); lab.className = 'caption'; lab.textContent = c.spec.LABEL;
    const seg = document.createElement('div'); seg.className = 'seg';
    const btns = c.spec.VALUES.map((v, k) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = c.spec.LABELS[k];
      b.onclick = e => { if (learnPick(c, seg, e)) return; c.set(v); };
      seg.append(b); return b;
    });
    const draw = () => {
      row.classList.toggle('idle', !!IDLE[id] && IDLE[id]());
      btns.forEach((b, k) => {
        b.setAttribute('aria-pressed', String(c.spec.VALUES[k] === Math.round(c.get())));
        if (DEAD_OPTION[id]) b.classList.toggle('idle', DEAD_OPTION[id](c.spec.VALUES[k]));
      });
    };
    views.push(draw); row.append(lab, seg); draw();
    return row;
  }

  function makeLocalChoice(label, options, get, set) {
    const row = document.createElement('div'); row.className = 'choice';
    const lab = document.createElement('span'); lab.className = 'caption'; lab.textContent = label;
    const seg = document.createElement('div'); seg.className = 'seg local';
    const btns = options.map(([text, v]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
      b.onclick = () => set(v); seg.append(b); return [b, v];
    });
    btns.forEach(([b, v]) => b.setAttribute('aria-pressed', String(get() === v)));
    row.append(lab, seg); return row;
  }

  // Pages run in signal order: Source, the synth, Trails, Colour, then the LFOs, which reach all of those, and Output
  const SAME_PAGE = { Osc: 'Osc A', 'Osc A': 'Osc', 'Osc B': 'Osc', Mix: 'Osc' };
  let pages = [], current = 0, open = store.get('page', 'Source');
  function buildTabs() {
    showRandom();
    pages = [{ label: 'Source', special: 'source' }].concat(SOURCES[S.source].pages, S.driftOn ? DRIFT_PAGES : [], COLOUR_PAGES, LFO_PAGES, OUTPUT_PAGES);
    current = Math.max(0, pages.findIndex(p => p.label === open || p.label === SAME_PAGE[open]));
    const tabs = $('tabs'); tabs.textContent = '';
    pages.forEach((p, k) => {
      const t = document.createElement('button'); t.type = 'button'; t.className = 'tab'; t.setAttribute('role', 'tab');
      t.textContent = p.label; t.setAttribute('aria-selected', String(k === current));
      t.onclick = () => { open = p.label; store.set('page', open); buildTabs(); };
      tabs.append(t);
    });
    buildPage();
  }
  const showing = special => pages[current] && pages[current].special === special;
  function buildPage() {
    views = [];
    const page = $('page'); page.textContent = '';
    const p = pages[current], box = document.createElement('div'); box.className = 'choices';
    if (p.special === 'source') {
      box.append(
        makeLocalChoice('Source', Object.keys(SOURCES).map(k => [SOURCES[k].button, k]), () => S.source, v => { if (v !== S.source || (v === 'camera' && !camera.stream)) { S.source = v; buildChain(); } }),
        makeLocalChoice('Trails', [['On', true], ['Off', false]], () => S.driftOn, v => { S.driftOn = v; buildChain(); }));
      if (S.source === 'camera' && camera.list.length) box.append(makeLocalChoice('Camera', camera.list.map((d, k) => [cameraName(d, k), d.deviceId]), () => camera.id, pickCamera));
      box.append(makeRandomRow(), makeLocalChoice('Keeps Output', [['Reset', true]], () => false, resetPatch));
      page.append(box);
      return;
    }
    (p.longs || []).forEach(id => { const c = makeChoice(id); if (c) box.append(c); });
    if (p.special === 'output') {
      const detail = makeLocalChoice('Detail', DETAIL, () => S.detail, v => { S.detail = v; slow = 0; engine.setScale(v); buildPage(); save(); });
      detail.classList.toggle('idle', videoOut.on);   // Video out holds its own size, and the setting comes back after
      box.append(detail);
      if (window.nxOut) box.append(makeLocalChoice('Video out', [['Off', false], ['On', true]], () => videoOut.on, setVideoOut));
    }
    if (box.children.length) page.append(box);
    if (p.special === 'output') {
      const where = document.createElement('p'); where.className = 'num-small'; where.id = 'outInfo'; where.hidden = !videoOut.on;
      where.textContent = videoOut.text(); page.append(where);
    }
    if (p.floats) {
      const faders = document.createElement('div'); faders.className = 'faders';
      p.floats.forEach(id => { const f = makeFader(id); if (f) faders.append(f); });
      if (p.special === 'output') {   // beside the faders, so the page stays the same height with Video out on
        const info = document.createElement('p'); info.className = 'num-small'; info.id = 'renderInfo';
        const gi = engine.info(), sz = engine.size;
        info.textContent = 'Drawing ' + sz[0] + ' x ' + sz[1] + ' on ' + gi.gpu + ', WebGL ' + gi.webgl + ', ' + gi.precision + ' precision. Delay up to ' + (S.drift ? S.drift.ringSize : '-') + ' frames.';
        faders.append(info);
      }
      page.append(faders);
    }
    if (p.pads) {
      const pads = document.createElement('div'); pads.className = 'pads';
      p.pads.forEach(d => { const f = makePad(d); if (f) pads.append(f); });
      page.append(pads);
    }
  }

  // ---- presets -----------------------------------------------------------------------------------------------
  function readMems() { const m = store.get('mems', null); return Array.isArray(m) && m.length === 8 ? m : new Array(8).fill(null); }
  let mems = readMems(), lastMem = -1;
  function buildMems() {
    const box = $('mems'); box.textContent = '';
    mems.forEach((m, k) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mem' + (m ? '' : ' empty');
      const t = document.createElement('b'); t.textContent = 'P' + (k + 1);
      const s = document.createElement('small'); s.textContent = m ? 'Saved' : 'Hold: save';
      const bar = document.createElement('i'); bar.className = 'hold';
      b.append(t, s, bar); b.setAttribute('aria-pressed', String(k === lastMem));
      b.setAttribute('aria-label', 'Preset ' + (k + 1) + (m ? ', saved. Enter recalls it, Shift and Enter saves over it' : ', empty. Shift and Enter saves it'));
      b.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        if (e.repeat || learnPick(controls['mem:' + k], b, e)) return;
        if (e.shiftKey) storeMem(k); else recallMem(k);
      });
      let timer = 0, held = false, t0 = 0;
      const anim = () => { if (!timer) return; bar.style.width = Math.min(100, (performance.now() - t0) / 6) + '%'; requestAnimationFrame(anim); };
      b.addEventListener('pointerdown', e => {
        if (learnPick(controls['mem:' + k], b, e)) return;
        held = false; t0 = performance.now(); requestAnimationFrame(anim);
        timer = setTimeout(() => { held = true; timer = 0; bar.style.width = '0'; storeMem(k); }, 600);
      });
      const up = () => { if (timer) { clearTimeout(timer); timer = 0; bar.style.width = '0'; if (!held) recallMem(k); } };
      b.addEventListener('pointerup', up); b.addEventListener('pointerleave', () => { if (timer) { clearTimeout(timer); timer = 0; bar.style.width = '0'; } });
      control('mem:' + k, { kind: 'button', press: () => recallMem(k) });
      box.append(b);
    });
  }
  function storeMem(k) { mems = readMems(); mems[k] = snapshot(); store.set('mems', mems);   // another tab may have saved since
    lastMem = k; buildMems(); }
  function recallMem(k) { if (!mems[k]) return; lastMem = k; restore(mems[k]); buildMems(); }

  // ---- transport ---------------------------------------------------------------------------------------------
  function action(name, fn) { const b = $(name); control('act:' + name, { kind: 'button', press: fn }); b.addEventListener('click', e => { if (learnPick(controls['act:' + name], b, e)) return; fn(); }); }
  action('freeze', () => { S.frozen = !S.frozen; $('freeze').setAttribute('aria-pressed', String(S.frozen)); $('chipFrozen').hidden = !S.frozen; });
  action('fade', () => { S.faded = !S.faded; $('fade').setAttribute('aria-pressed', String(S.faded)); $('chipFaded').hidden = !S.faded; });
  action('clear', () => engine.clear());
  action('random', randomise);
  action('perform', () => setPerform(!S.perform));
  // Blackout: hold to black, tap to come back
  (function () {
    const b = $('black'), bar = b.querySelector('.hold'); let timer = 0, t0 = 0;
    const anim = () => { if (!timer) return; bar.style.width = Math.min(100, (performance.now() - t0) / 6) + '%'; requestAnimationFrame(anim); };
    const setBlack = v => { S.black = v; S.level = v || S.faded ? 0 : 1; $('chipState').textContent = v ? 'Blackout' : 'Live'; $('chipState').className = 'chip ' + (v ? 'prob' : 'live'); b.setAttribute('aria-pressed', String(v)); };
    control('act:black', { kind: 'button', press: () => setBlack(!S.black) });
    b.addEventListener('pointerdown', e => {
      if (learnPick(controls['act:black'], b, e)) return;
      if (S.black) { setBlack(false); return; }
      t0 = performance.now(); timer = setTimeout(() => { timer = 0; bar.style.width = '0'; setBlack(true); }, 600); requestAnimationFrame(anim);
    });
    // from a keyboard, Enter or Space goes to black and back, as a mapped MIDI button does
    b.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (e.repeat || learnPick(controls['act:black'], b, e)) return;
      setBlack(!S.black);
    });
    const cancel = () => { if (timer) { clearTimeout(timer); timer = 0; bar.style.width = '0'; } };
    b.addEventListener('pointerup', cancel); b.addEventListener('pointerleave', cancel);
  })();

  // Random stays in the useful middle of each control, and always comes out moving slowly and bright enough to read
  // What Random may change, chosen on the Source page and kept on this device. Output is never touched
  const RANDOM_GROUPS = [['osc', 'Osc'], ['trails', 'Trails'], ['transform', 'Move'], ['colour', 'Colour'], ['lfo', 'LFO']];
  // with Reduce motion set on the device, Random leaves the LFOs alone until it is turned on here
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const randomIn = Object.assign({ osc: true, trails: true, transform: true, colour: true, lfo: !calm }, store.get('random', null));
  const randomLive = g => g === 'osc' ? S.source !== 'camera' : g === 'trails' || g === 'transform' ? S.driftOn : true;
  const randomOn = g => randomIn[g] === true && randomLive(g);
  function showRandom() { $('random').classList.toggle('idle', !RANDOM_GROUPS.some(g => randomOn(g[0]))); }
  function makeRandomRow() {
    const row = document.createElement('div'); row.className = 'choice';
    const lab = document.createElement('span'); lab.className = 'caption'; lab.textContent = 'Random';
    const seg = document.createElement('div'); seg.className = 'seg local';
    RANDOM_GROUPS.forEach(([g, text]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
      const draw = () => { b.setAttribute('aria-pressed', String(randomIn[g] === true)); b.classList.toggle('idle', !randomLive(g)); };
      b.onclick = () => { randomIn[g] = randomIn[g] !== true; store.set('random', randomIn); draw(); showRandom(); };
      seg.append(b); draw();
    });
    row.append(lab, seg); return row;
  }
  function randomise() {
    const between = (lo, hi) => lo + Math.random() * (hi - lo);
    const chance = p => Math.random() < p;
    const roll = id => {
      const c = param(id);
      if (!c) return;
      if (c.kind === 'long') c.set(c.spec.VALUES[Math.floor(Math.random() * c.spec.VALUES.length)]);
      else c.setNorm(c.zero ? between(0.3, 0.7) : between(0.2, 0.75));
    };
    const off = id => { const c = param(id); if (c) c.set(0); };
    const d = S.drift.values, r = S.rig.values;
    if (randomOn('osc')) {
      SOURCES[S.source].pages.forEach(p => { p.longs.concat(p.floats).forEach(roll); });
      const mixed = param('gen.mix_mode'), dims = mixed && mixed.get() >= 2;   // Multiply and Difference are dark enough without a window
      if (dims || chance(0.6)) { off('gen.shape'); off('gen.shape_kind'); }
      const win = param('gen.shape_size'); if (win) win.set(between(0.7, 1));   // a small window leaves the frame mostly black
      const rate = param('gen.rate'); if (rate) rate.set(between(0.05, 0.3));
    }
    if (randomOn('trails')) {
      roll('drift.edges');
      const lights = S.gen.values.wave !== 3 && chance(0.25);   // keying into the lights swaps them for fading trails, so only the very brightest go
      Object.assign(d, { feed: between(0.86, 0.98), key: lights ? between(0.05, 0.15) : between(0.15, 0.4), keyinto: lights ? 1 : 0, sharpen: chance(0.5) ? 0 : between(0.1, 0.6) });
      r.delay = chance(0.5) ? 1 : Math.round(between(2, 20));
      showDelay();
    }
    if (randomOn('transform')) {
      ['drift.zoom', 'drift.turn', 'drift.shiftx', 'drift.shifty'].forEach(roll);
      d.mirror = chance(0.5) ? 0 : 1 + Math.floor(Math.random() * 3);
    }
    if (randomOn('colour')) {
      // Add, Multiply and Heat already run bright, and would blow out at the usual level
      if (S.source !== 'camera') S.colour.values.palette = 1 + Math.floor(Math.random() * 3);
      const mix = param('gen.mix_mode'), hot = S.colour.values.palette === 3 || (mix && (mix.get() === 1 || mix.get() === 2));
      Object.assign(S.colour.values, { hue: Math.random(), spread: between(0.4, 1.1), contrast: hot ? 1 : 1.25, bright: hot ? 0.85 : S.source === 'modular' ? 1.05 : 1.1, sat: between(0.7, 1.1) });
      r.cycle = chance(0.6) ? 0 : (chance(0.5) ? -1 : 1) * between(0.01, 0.05);
    }
    if (randomOn('lfo')) {
      [1, 2].forEach(n => {
        const open = LFO_TO.map((_, k) => k).filter(k => k > 0 && !lfoDead(k));
        r['lfo' + n + '_to'] = chance(0.5) || !open.length ? 0 : open[Math.floor(Math.random() * open.length)];
        r['lfo' + n + '_shape'] = Math.floor(Math.random() * 3);
        r['lfo' + n + '_rate'] = between(0.03, 0.3);
        r['lfo' + n + '_depth'] = between(0.15, 0.6);
      });
    }
    refresh(); save();
  }
  // Back to a known, readable picture. Presets, MIDI, the source and the output settings stay.
  function resetPatch() {
    const base = stage => Object.assign(stage.values, SignalCore.defaults(stage.isf));
    const keep = { mode: S.colour.values.mode, invert: S.colour.values.invert, matte: S.colour.values.matte, soft: S.colour.values.soft };
    for (const k in S.stages) base(S.stages[k]);
    if (S.stages.osc) S.stages.osc.values.spread = 0;
    base(S.drift); S.drift.values.hueturn = 0;
    base(S.colour); Object.assign(S.colour.values, keep);
    Object.assign(S.rig.values, SignalCore.defaults(RIG.isf));
    showDelay(); phase.cycle = 0;
    engine.clear(); buildPage(); save();
  }

  // ---- perform, full screen, wake lock -----------------------------------------------------------------------
  let wake = null, backTimer = 0;
  async function setPerform(on) {
    S.perform = on; document.body.classList.toggle('perform', on);
    $('back').hidden = true;
    try { if (on && navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); else if (wake) { wake.release(); wake = null; } } catch (e) {}
  }
  canvas.addEventListener('pointerdown', () => {
    if (!S.perform) return;
    $('back').hidden = false; clearTimeout(backTimer); backTimer = setTimeout(() => { $('back').hidden = true; }, 3000);
  });
  $('back').onclick = () => setPerform(false);
  document.addEventListener('visibilitychange', async () => { if (S.perform && !document.hidden && navigator.wakeLock) try { wake = await navigator.wakeLock.request('screen'); } catch (e) {} });

  const rootEl = document.documentElement;
  const goFull = rootEl.requestFullscreen || rootEl.webkitRequestFullscreen;
  const isFull = () => document.fullscreenElement || document.webkitFullscreenElement;
  const showFull = () => { $('full').hidden = SHELL || !goFull || !!isFull() || matchMedia('(display-mode: fullscreen)').matches; };
  $('full').onclick = async () => {
    try { const p = goFull.call(rootEl); if (p && p.then) await p; } catch (e) {}
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) {}
  };
  document.addEventListener('fullscreenchange', showFull); document.addEventListener('webkitfullscreenchange', showFull);
  showFull();

  // ---- MIDI with Learn and pick-up ---------------------------------------------------------------------------
  const midiHeld = {};
  let midiMap = store.get('midi', {}), learning = false, learnTarget = null, learnNext = null, learntKey = null, ports = 0;
  const unmark = () => document.querySelectorAll('.target').forEach(x => x.classList.remove('target'));
  // next: the second axis of a pad, which takes the next knob moved
  function learnPick(c, el, e, next) {
    if (!learning || !c) return false;
    if (e) { e.preventDefault(); e.stopPropagation(); }
    unmark();
    learnTarget = c; learnNext = next || null; learntKey = null; el.classList.add('target');
    $('learnHint').textContent = next ? 'Knob for across' : 'Move a knob';
    return true;
  }
  // Learn MIDI itself is not a control a knob can take, so this button always ends Learn
  function setLearning(on) {
    learning = on; learnTarget = learnNext = null;
    document.body.classList.toggle('learning', on);
    unmark();
    $('learn').setAttribute('aria-pressed', String(on)); $('chipLearn').hidden = !on;
    $('learnHint').textContent = on ? 'Tap a control' : 'Map a knob';
    if (on && !SHELL && !navigator.requestMIDIAccess) say('This browser has no Web MIDI, so a controller cannot be learnt here.');
    else if (on && !ports) say('No MIDI device is connected yet. Tap MIDI learn again to finish.');
  }
  $('learn').addEventListener('click', () => setLearning(!learning));
  function onMidi(ev) {
    const [st, d1, d2] = ev.data; const type = st & 0xf0, ch = st & 0x0f;
    let key = null, val = 0, press = false;
    if (type === 0xb0) { key = 'cc:' + ch + ':' + d1; val = d2 / 127; press = d2 > 63; }
    else if (type === 0x90 && d2 > 0) { key = 'note:' + ch + ':' + d1; press = true; }
    else return;
    if (learning && learnTarget) {
      if (key === learntKey) return;   // the same knob still turning after the first axis of a pad
      midiMap = store.get('midi', {});   // another tab may have learnt since
      for (const k in midiMap) if (midiMap[k] === learnTarget.id) delete midiMap[k];
      midiMap[key] = learnTarget.id; store.set('midi', midiMap);
      learntKey = key; learnTarget = learnNext; learnNext = null;
      if (learnTarget) { $('learnHint').textContent = 'Knob for up/down'; return; }
      unmark(); $('learnHint').textContent = 'Tap a control';
      return;
    }
    const id = midiMap[key];
    const c = !id ? null : id.indexOf(':') > 0 ? controls[id] : param(id);
    if (!c) return;
    if (key.startsWith('cc:') && c.setNorm) {
      // pick-up: a knob takes over only once it passes the value the control already has
      if (!c.latch) { if (c.kind === 'long' || Math.abs(val - c.norm()) < 0.04) c.latch = true; else return; }
      c.setNorm(val);
    } else if (press && c.press && !midiHeld[key]) c.press();
    if (key.startsWith('cc:')) midiHeld[key] = press;
  }
  // the native shell passes MIDI bytes in here (Android MidiManager, iOS CoreMIDI)
  window.nxMidi = bytes => onMidi({ data: bytes });
  window.nxMidiPorts = n => { ports = n; $('chipMidi').hidden = !n; $('chipMidi').textContent = n === 1 ? '1 MIDI device' : n + ' MIDI devices'; };
  if (!SHELL && navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(acc => {
      const hook = () => {
        ports = 0; acc.inputs.forEach(i => { i.onmidimessage = onMidi; ports++; });
        $('chipMidi').hidden = !ports; $('chipMidi').textContent = ports === 1 ? '1 MIDI device' : ports + ' MIDI devices';
      };
      acc.onstatechange = hook; hook();
    }).catch(() => {});
  }

  // ---- video out: the shell serves the picture on the network for a mixer to pull --------------------------------
  const videoOut = {
    on: false, clients: 0, url: '', jobs: null, made: 0, sent: 0, last: 0,
    text() {
      if (!this.url) return 'No network address: join Wi-Fi, or use a USB link.';
      return 'Mixer address ' + this.url + '. ' + (this.clients === 1 ? '1 mixer receiving.' : this.clients + ' mixers receiving.');
    }
  };
  const OUT_FPS = 30, OUT_SIZE = [512, 288];
  function showVideoOut() {
    const c = $('chipOut'), w = $('outInfo');
    c.hidden = !videoOut.on; c.textContent = videoOut.clients ? 'Video out ' + videoOut.clients : 'Video out';
    c.className = videoOut.clients ? 'chip live' : 'chip';
    if (w) { w.hidden = !videoOut.on; w.textContent = videoOut.text(); }
  }
  function setVideoOut(on) {
    const url = on ? window.nxOut.start() : (window.nxOut.stop(), '');
    if (on && url === null) { say('Video out did not start: its port is in use.'); on = false; }
    videoOut.on = on; videoOut.url = url || ''; videoOut.clients = 0;
    store.set('videoOut', on);
    // a mixer gets the same size whatever the tablet's screen is showing, so the Detail setting rests meanwhile
    engine.setFixedSize(on ? OUT_SIZE : null);
    showVideoOut();
    if (showing('output')) buildPage();
  }
  // from the shell, whenever a mixer connects or leaves
  window.nxOutClients = n => { videoOut.clients = n; showVideoOut(); };
  // Two workers turn frames into JPEG, so the drawing thread only reads the picture out. Nothing runs until a mixer is
  // pulling. A frame that finishes after a newer one is dropped.
  function outWorker() {
    const job = { worker: new Worker('out-worker.js'), buf: null, idle: true };
    job.worker.onmessage = e => {
      job.buf = e.data.buf; job.idle = true;
      if (videoOut.on && e.data.n > videoOut.sent) { videoOut.sent = e.data.n; window.nxOut.frame(e.data.jpeg); }
    };
    job.worker.onerror = e => { job.idle = true; say('Video out stopped: ' + e.message); };
    return job;
  }
  function sendFrame(now) {
    const o = videoOut;
    if (!o.clients || now - o.last < 1000 / OUT_FPS - 4) return;
    if (!o.jobs) o.jobs = [outWorker(), outWorker()];
    const job = o.jobs.find(j => j.idle);
    if (!job) return;
    const [w, h] = engine.size, bytes = w * h * 4;
    if (!job.buf || job.buf.byteLength !== bytes) job.buf = new ArrayBuffer(bytes);
    engine.readFrame(new Uint8Array(job.buf));
    job.idle = false; o.last = now;
    job.worker.postMessage({ w, h, n: ++o.made, buf: job.buf }, [job.buf]);
    job.buf = null;
  }

  // A lost graphics context cannot be repaired in place: save, then come back with a new one
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    const last = store.get('lost', 0), now = Date.now();
    store.set('lost', now);
    if (now - last < 10000) { say('The graphics chip stopped twice. Close the app and open it again.'); return; }
    store.set('state', snapshot());
    location.reload();
  });

  // Browser tabs share their saved presets and MIDI map: each tab keeps its own picture, and these stay the same in all of them
  window.addEventListener('storage', e => {
    if (e.key === null || e.key === STORE + ':mems') { mems = readMems(); buildMems(); }
    if (e.key === null || e.key === STORE + ':midi') midiMap = store.get('midi', {});
  });

  // ---- speed clocks and LFOs: added up here so moving a speed never jumps the picture --------------------------------
  const phase = { a: 0, b: 0, cycle: 0, lfo: [0, 0], round: [0, 0] };
  // Flash limit for the Angle LFO. Turning a pattern of stripes moves the stripes past each pixel, and the pixels far
  // from the centre move the most: with many bands even a slow turn swept stripes past them over 20 times a second.
  // So the Angle LFO may only turn as fast as keeps every pixel to 3 light-dark changes a second, counting the
  // oscillator's own Speed in those 3. This gives that fastest turn, in turns a second, for the playing source.
  // The Angle fader and a MIDI knob on it are the player's own hand and are not slowed.
  const TRAILS_LFO_MAX = 0.4;   // swings a second, for an LFO on Zoom or Turn
  const FAR = Math.hypot(16 / 9 / 2, 0.5);   // the corner of the 16:9 drawing: the pixel a turn moves the most
  function angleSpeedLimit() {
    const g = S.gen && S.gen.values;
    if (!g) return 0;
    let perTurn, left;   // stripes swept past the farthest pixel in one whole turn, and the changes a second still free
    if (S.source === 'modular') {
      // Duo's Angle LFO turns Osc A: Lines move by distance, Rays and Spiral by their number of arms
      const f = g.a_freq, form = g.a_form;
      perTurn = form === 1 ? 0 : form === 2 ? Math.ceil(f) : form === 3 ? Math.ceil(f * 0.5) : 6.2831853 * FAR * f;
      left = 3 - Math.abs(g.a_rate);
    } else {
      // Solo: Osc A is always lines. With Lines chosen, Osc B turns too and bends A, by up to Bend's top of 0.6.
      // Speed takes up to 0.98 of the rate, and the shader's own slow drift of the angle takes up to half of what is
      // left (the same sums as in signal-solo.fs)
      const hz = Math.min(g.rate, 3), perRad = FAR * (g.bands + (g.form === 0 ? 0.6 * Math.PI * (g.bands * 0.66 + 1) : 0));
      perTurn = 6.2831853 * perRad;
      left = 3 - 0.98 * hz;
      left -= Math.min(perRad * 0.0474 * hz, left / 2);
    }
    return perTurn > 0 ? Math.max(0, left) / perTurn : Infinity;
  }
  function modulate(dt) {
    const v = S.rig.values, gens = Object.keys(S.stages).map(k => S.stages[k]);
    // both LFOs may be on Angle: they share the limit
    const onAngle = [1, 2].filter(n => LFO_TO[v['lfo' + n + '_to']][0] === 'Angle').length;
    const angleMax = onAngle ? angleSpeedLimit() / onAngle : Infinity;
    S.drift.delay = v.delay;
    for (const stage of gens.concat(S.drift, S.colour)) stage.mods = {};
    const full = S.stages.modular;
    if (full) {
      phase.a = (phase.a + dt * full.values.a_rate) % 1; phase.b = (phase.b + dt * full.values.b_rate) % 1;
      full.uniforms = { nx_on: 1, nx_pa: phase.a, nx_pb: phase.b };
    }
    [1, 2].forEach((n, k) => {
      const to = LFO_TO[v['lfo' + n + '_to']];
      // Zoom and Turn swing the whole trail back and forth: above TRAILS_LFO_MAX swings a second, with many bands,
      // large areas flashed more than 3 times a second (test/flash.mjs), so those two go no faster
      const rate = to[1] === 'drift' && to[0] !== 'Key' ? Math.min(v['lfo' + n + '_rate'], TRAILS_LFO_MAX) : v['lfo' + n + '_rate'];
      phase.lfo[k] = (phase.lfo[k] + dt * rate) % 1;
      if (!to[1]) return;
      const stage = S[to[1]], name = stage.isf && to[2].find(x => inputOf(stage, x));
      if (!name) return;
      const spec = inputOf(stage, name);
      const shape = v['lfo' + n + '_shape'], sign = shape === 2 ? -1 : 1;
      const capped = to[0] === 'Angle';
      if (shape && to.length > 4) {
        // a ramp round the circle turns at a steady speed: no faster than the limit
        const speed = capped ? Math.min(rate * to[4], angleMax) : rate * to[4];
        phase.round[k] = (phase.round[k] + dt * speed) % 1;
        stage.mods[name] = (stage.mods[name] || 0) + sign * phase.round[k];
      } else {
        const wave = shape ? sign * (ramp(phase.lfo[k]) * 2 - 1) : Math.sin(phase.lfo[k] * 6.2831853);
        let size = v['lfo' + n + '_depth'] * (spec.MAX - spec.MIN) * to[3];
        // a sine swing turns fastest as it passes the middle, at 2 pi x Speed x its size: a fast swing gets smaller
        if (capped) size = Math.min(size, angleMax / (6.2831853 * rate));
        stage.mods[name] = (stage.mods[name] || 0) + wave * size;
      }
      if (to.length > 4) {   // past either end of a circle is just further round it
        const was = stage.values[name], turned = was + stage.mods[name];
        stage.mods[name] = turned - Math.floor(turned) - was;
      }
    });
    phase.cycle = (phase.cycle + dt * v.cycle) % 1;
    const hue = S.colour.values.hue + (S.colour.mods.hue || 0) + phase.cycle;
    S.colour.mods.hue = hue - Math.floor(hue) - S.colour.values.hue;
  }

  // ---- the frame loop ----------------------------------------------------------------------------------------
  let frames = 0, fpsT = performance.now(), slow = 0, lastNow = 0;
  function loop(now) {
    const t = now / 1000, step = Math.min(0.25, (now - lastNow) / 1000);
    if (!S.frozen) modulate(Math.min(0.1, step));
    if (S.fade && !S.frozen) {
      S.fade.amount = Math.min(1, S.fade.amount + step / CROSSFADE);
      if (S.fade.amount >= 1) endFade();
    }
    lastNow = now;
    if (!S.black) S.level = Math.min(1, Math.max(0, S.level + (S.faded ? -1 : 1) * step / FADE));
    engine.level = S.level;
    try { engine.render(t, S.frozen); sendFrame(now); } catch (e) { say('Drawing stopped: ' + e.message); return; }
    frames++;
    if (now - fpsT >= 1000) {
      const fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now;
      $('fps').textContent = fps.toFixed(0) + ' fps';
      // keep it smooth: three slow seconds in a row lower the detail one step
      // (a hidden page is not slow drawing, and under 12 is the browser holding frames back)
      slow = fps < 40 && fps >= 12 && !document.hidden ? slow + 1 : 0;
      if (slow >= 3 && S.detail > 0.5 && S.autoDetail && !videoOut.on) {
        S.detail = S.detail > 0.75 ? 0.75 : 0.5; engine.setScale(S.detail); slow = 0; save();
        if (!S.perform) say('Detail lowered to ' + (S.detail === 0.75 ? 'three quarters' : 'half') + ' to keep the picture smooth. Change it on the Output page.');
        if (showing('output')) buildPage();
      }
    }
    requestAnimationFrame(loop);
  }

  // ---- help: shown once on a first open, with the light safety note, and any time from the Help button -----------
  function setHelp(on) {
    $('help').hidden = !on;
    if (on) { store.set('helpSeen', true); $('helpClose').focus({ preventScroll: true }); $('help').querySelector('.helpbox').scrollTop = 0; } else $('helpOpen').focus();
  }
  $('helpVersion').textContent = self.SIGNAL_VERSION || '';
  $('helpOpen').onclick = () => setHelp(true);
  $('helpClose').onclick = () => setHelp(false);
  $('help').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); setHelp(false); }
    else if (e.key === 'Tab') { e.preventDefault(); $('helpClose').focus(); }   // the panel has one control, so focus stays on it
  });
  $('help').addEventListener('click', e => { if (e.target === $('help')) setHelp(false); });
  if (!store.get('helpSeen', false)) setHelp(true);

  // ---- install as an app (home-screen icon, opens full screen) ------------------------------------------------
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('install').hidden = SHELL || !!store.get('installed', false); });
  window.addEventListener('appinstalled', () => { installEvt = null; $('install').hidden = true; say('Mothlight No.01 is installed. Open it from its icon, online or offline.'); });
  $('install').onclick = async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { const c = await installEvt.userChoice; if (c && c.outcome === 'accepted') store.set('installed', true); } catch (e) {}
    installEvt = null; $('install').hidden = true;
  };

  // ---- offline -----------------------------------------------------------------------------------------------
  if (!SHELL && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => { $('chipOffline').hidden = false; }).catch(() => {});
  }

  // ---- start -------------------------------------------------------------------------------------------------
  (async function start() {
    const saved = store.get('state', null);
    if (saved) { S.source = saved.source in SOURCES && saved.source !== 'camera' ? saved.source : 'osc'; S.driftOn = saved.driftOn !== false; S.detail = DETAIL.some(d => d[1] === saved.detail) ? saved.detail : 0.5; S.saved = saved.gens || {}; Object.assign(S.rig.values, saved.rig || {}); }
    engine.setScale(S.detail);
    const failed = e => e.missing ? 'The synth files did not load. Open Mothlight No.01 from its web address, not from a downloaded file.'
      : 'This device\'s graphics could not build the synth: ' + String(e.message || e).split('\n')[0] + '. Try another browser.';
    try { await buildChain(saved); }
    catch (e) {
      // a saved state should never leave a black screen, so try once more from the defaults
      if (!saved || e.missing) { say(failed(e)); return; }
      store.set('state', null);
      S.source = 'osc'; S.driftOn = true; S.saved = {}; S.stages = {}; S.gen = null; S.fade = null;
      Object.assign(S.rig.values, SignalCore.defaults(RIG.isf));
      try { await buildChain(); say('The saved settings did not load, so Mothlight No.01 started fresh. Presets are kept.'); }
      catch (e2) { say(failed(e2)); return; }
    }
    showDelay();
    buildMems();
    if (window.nxOut && store.get('videoOut', false)) setVideoOut(true);
    window.signalSynth = { S, engine, controls, camera, videoOut, param, modulate, randomise, midi: () => midiMap };
    requestAnimationFrame(loop);
    setTimeout(() => { stageFor('osc').then(() => stageFor('modular')).catch(() => {}); }, 1000);
  })();
})();
