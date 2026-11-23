// Mothlight No.01 core: an ISF 2 runner for WebGL. A chain of stages (a generator or the camera, then effects),
// each with its own passes and persistent buffers, plus the two NXLX extensions:
//   - a history: a light, low-resolution copy of a persistent buffer, kept for a few seconds (Echo and Smear)
//   - a rate-true clock: TIME is kept so that TIME * rate never jumps when the rate input moves
// No DOM beyond the canvas it is given.
'use strict';
(function (root) {

  function parseISF(text) {
    const m = text.match(/^\s*\/\*([\s\S]*?)\*\//);
    if (!m) throw new Error('Not an ISF file: no header');
    const meta = JSON.parse(m[1]);
    const inputs = (meta.INPUTS || []).map(i => Object.assign({}, i));
    for (const i of inputs) {
      if (i.TYPE === 'long') {
        i.VALUES = i.VALUES || (i.LABELS || []).map((_, n) => n);
        i.MIN = Math.min.apply(null, i.VALUES); i.MAX = Math.max.apply(null, i.VALUES);
      }
      if (i.DEFAULT === undefined) i.DEFAULT = i.TYPE === 'point2D' ? [0.5, 0.5] : i.TYPE === 'color' ? [1, 1, 1, 1] : i.TYPE === 'bool' ? 0 : (i.MIN || 0);
    }
    const isFilter = inputs.some(i => i.NAME === 'inputImage');
    return { meta, inputs, isFilter, passes: meta.PASSES && meta.PASSES.length ? meta.PASSES : [{}], body: text.slice(m[0].length) };
  }

  function defaults(isf) {
    const v = {};
    for (const i of isf.inputs) if (i.TYPE !== 'image') v[i.NAME] = Array.isArray(i.DEFAULT) ? i.DEFAULT.slice() : i.DEFAULT;
    return v;
  }

  const VS = 'attribute vec2 pos; varying vec2 isf_FragNormCoord; void main(){ isf_FragNormCoord = pos*.5+.5; gl_Position = vec4(pos,0.,1.); }';
  const BLIT = 'precision mediump float; uniform sampler2D src; uniform float level; varying vec2 isf_FragNormCoord; void main(){ gl_FragColor = vec4(texture2D(src, isf_FragNormCoord).rgb*level, 1.); }';
  // the camera: cover the frame, and a front camera is mirrored like a mirror
  const CAM = 'precision mediump float; uniform sampler2D src; uniform vec2 fit; uniform float mirror; varying vec2 isf_FragNormCoord; void main(){ vec2 c = (isf_FragNormCoord-.5)*fit+.5; gl_FragColor = vec4(texture2D(src, vec2(mix(c.x, 1.-c.x, mirror), 1.-c.y)).rgb, 1.); }';
  const MIX = 'precision mediump float; uniform sampler2D a; uniform sampler2D b; uniform float amount; varying vec2 isf_FragNormCoord; void main(){ gl_FragColor = vec4(mix(texture2D(a, isf_FragNormCoord).rgb, texture2D(b, isf_FragNormCoord).rgb, amount), 1.); }';
  const GLSL_TYPE = { float: 'float', long: 'int', bool: 'bool', event: 'bool', point2D: 'vec2', color: 'vec4', image: 'sampler2D' };

  function Engine(canvas, opts) {
    opts = opts || {};
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false }) || canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) throw new Error('This browser has no WebGL');
    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const precision = hp && hp.precision > 0 ? 'highp' : 'mediump';

    function shader(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function program(fs) {
      const p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, 'pos'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let k = 0; k < n; k++) { const a = gl.getActiveUniform(p, k); u[a.name] = gl.getUniformLocation(p, a.name); }
      return { p, u };
    }
    const blit = program(BLIT), cam = program(CAM), blend = program(MIX);
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    function makeTarget(w, h) {
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fbo };
    }
    function freeTarget(t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    function clearTarget(t) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }

    let w = 0, h = 0, scale = opts.scale || 1, frame = 0, fixed = null;
    const histBytes = opts.histBytes || 44 * 1024 * 1024;
    const canKeep = typeof gl.blitFramebuffer === 'function';   // the history needs WebGL 2

    // A stage: one ISF file, its program, its buffers. A persistent target can keep a history of past frames.
    function Stage(isf, sopts) {
      sopts = sopts || {};
      const targets = isf.passes.map(p => p.TARGET).filter((t, n, a) => t && a.indexOf(t) === n);
      const images = isf.inputs.filter(i => i.TYPE === 'image').map(i => i.NAME);
      const head = ['precision ' + precision + ' float;', 'precision ' + precision + ' int;',
        'uniform float TIME; uniform float TIMEDELTA; uniform vec2 RENDERSIZE; uniform int PASSINDEX; uniform int FRAMEINDEX;',
        'varying vec2 isf_FragNormCoord;',
        '#define IMG_NORM_PIXEL(s,c) texture2D(s,c)',
        '#define IMG_THIS_NORM_PIXEL(s) texture2D(s,isf_FragNormCoord)',
        '#define IMG_PIXEL(s,c) texture2D(s,(c)/RENDERSIZE)',
        '#define IMG_THIS_PIXEL(s) texture2D(s,isf_FragNormCoord)',
        '#define IMG_SIZE(s) RENDERSIZE']
        .concat(isf.inputs.map(i => 'uniform ' + GLSL_TYPE[i.TYPE] + ' ' + i.NAME + ';'))
        .concat(targets.map(t => 'uniform sampler2D ' + t + ';'))
        .concat(sopts.history && canKeep ? ['#define NXLX_HISTORY 1', 'uniform sampler2D pastA; uniform sampler2D pastB; uniform sampler2D pastC;'] : [])
        .join('\n');
      const prog = program(head + '\n' + isf.body);
      const histOf = canKeep && sopts.history || null;   // name of a persistent target to keep a history of
      // a clock that wraps at a whole number of every cycle in the shader never loses precision on a long run
      const clockPeriod = sopts.clockPeriod || Infinity;
      let bufs = {}, hist = [], stamps = [], hhead = 0, filled = 0, lastKept = -1, hw = 0, hh = 0, out = null;

      const st = {
        isf, values: defaults(isf), mods: {}, uniforms: {}, historySeconds: 0, clockInput: sopts.clockInput || null,
        clock: { t: 0, scaled: 0 },
        alloc() {
          for (const k in bufs) bufs[k].forEach(freeTarget);
          hist.forEach(freeTarget); if (out) freeTarget(out);
          bufs = {}; hist = []; stamps = []; hhead = 0; filled = 0; lastKept = -1;
          for (const t of targets) bufs[t] = [makeTarget(w, h), makeTarget(w, h)];
          if (histOf) {   // at most 256 pixels wide: soft copies are all Echo and Smear need, and they fit seconds in memory
            hw = Math.min(w, 256); hh = Math.max(1, Math.round(h * hw / w));
            const n = Math.max(2, Math.min(300, Math.floor(histBytes / (hw * hh * 4))));   // 300 at 60 a second: 5 seconds
            for (let k = 0; k < n; k++) hist.push(makeTarget(hw, hh));
          }
          out = makeTarget(w, h);
        },
        clear() { for (const k in bufs) bufs[k].forEach(clearTarget); hist.forEach(clearTarget); filled = 0; lastKept = -1; clearTarget(out); },
        get out() { return out; },
        // time: seconds; dt: seconds since the last frame; input: texture of the stage before, or null
        render(time, dt, input, frozen) {
          gl.useProgram(prog.p);
          const u = prog.u;
          for (const i of isf.inputs) {
            const loc = u[i.NAME]; if (!loc || i.TYPE === 'image') continue;
            const v = st.values[i.NAME];
            // mods are the app's modulation, added on top of what the control shows
            if (i.TYPE === 'float') gl.uniform1f(loc, Math.min(i.MAX, Math.max(i.MIN, +v + (st.mods[i.NAME] || 0))));
            else if (i.TYPE === 'long') gl.uniform1i(loc, Math.round(+v));
            else if (i.TYPE === 'bool' || i.TYPE === 'event') gl.uniform1i(loc, v ? 1 : 0);
            else if (i.TYPE === 'point2D') gl.uniform2f(loc, v[0], v[1]);
            else if (i.TYPE === 'color') gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
          }
          for (const k in st.uniforms) if (u[k]) gl.uniform1f(u[k], st.uniforms[k]);
          // rate-true clock: keep TIME * rate continuous when the rate moves
          let T = time;
          if (st.clockInput) {
            const r = Math.max(1e-3, Math.min(+st.values[st.clockInput] || 0, 3));
            if (!frozen) st.clock.scaled = (st.clock.scaled + dt * r) % clockPeriod;
            T = st.clock.scaled / r;
          }
          if (u.TIME) gl.uniform1f(u.TIME, T);
          if (u.TIMEDELTA) gl.uniform1f(u.TIMEDELTA, dt);
          if (u.RENDERSIZE) gl.uniform2f(u.RENDERSIZE, w, h);
          if (u.FRAMEINDEX) gl.uniform1i(u.FRAMEINDEX, frame);
          const read = frame % 2, write = 1 - read;
          st.historySeconds = hist.length / 60;
          // the kept picture nearest to s seconds ago (the oldest kept, while the history fills)
          const back = s => {
            const have = Math.min(filled, hist.length), want = time - s;
            let k = 0;
            while (k < have - 1 && stamps[(hhead - 1 - k + hist.length * 2) % hist.length] > want) k++;
            return hist[(hhead - 1 - k + hist.length * 2) % hist.length];
          };
          const ET = +st.values.echotime || 0, smear = Math.round(+st.values.delaystyle || 0) === 1;
          const taps = !hist.length || !filled ? null : smear ? { pastA: back(ET / 3), pastB: back(ET * 2 / 3), pastC: back(ET) }
            : { pastA: back(ET), pastB: back(ET * 2), pastC: back(ET * 3) };
          let unit = 0;
          for (const name of images) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, input ? input.tex : out.tex); gl.uniform1i(u[name], unit++); }
          if (histOf) for (const name of ['pastA', 'pastB', 'pastC']) {
            if (!u[name]) continue;
            gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, taps ? taps[name].tex : hist.length ? hist[0].tex : null); gl.uniform1i(u[name], unit++);   // never the picture being drawn: that is a feedback loop
          }
          isf.passes.forEach((pass, k) => {
            targets.forEach((t, j) => {
              gl.activeTexture(gl.TEXTURE0 + unit + j);
              const written = isf.passes.slice(0, k).some(pp => pp.TARGET === t);
              const tex = bufs[t][written ? write : read];
              gl.bindTexture(gl.TEXTURE_2D, tex.tex);
              gl.uniform1i(u[t], unit + j);
            });
            const dst = pass.TARGET ? bufs[pass.TARGET][write] : out;
            gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, w, h);
            if (u.PASSINDEX) gl.uniform1i(u.PASSINDEX, k);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          });
          if (histOf && hist.length && !frozen && (lastKept < 0 || time - lastKept >= 1 / 61 || time < lastKept)) {   // a small copy, at most 60 a second
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, bufs[histOf][write].fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, hist[hhead].fbo);
            gl.blitFramebuffer(0, 0, w, h, 0, 0, hw, hh, gl.COLOR_BUFFER_BIT, gl.LINEAR);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
            stamps[hhead] = time; lastKept = time; hhead = (hhead + 1) % hist.length; filled++;
          }
          return out;
        },
        free() { for (const k in bufs) bufs[k].forEach(freeTarget); hist.forEach(freeTarget); if (out) freeTarget(out); gl.deleteProgram(prog.p); }
      };
      if (w) st.alloc();
      return st;
    }

    // The camera as a source stage
    function CameraStage(video) {
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      let out = null;
      const st = {
        camera: true, values: {}, mirror: true,
        alloc() { if (out) freeTarget(out); out = makeTarget(w, h); },
        clear() { clearTarget(out); },
        get out() { return out; },
        render(time, dt, input, frozen) {
          if (!frozen && video.readyState >= 2 && video.videoWidth) {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
          }
          gl.useProgram(cam.p);
          const va = video.videoWidth ? video.videoWidth / video.videoHeight : w / h, oa = w / h;
          gl.uniform2f(cam.u.fit, oa > va ? 1 : oa / va, oa > va ? va / oa : 1);
          gl.uniform1f(cam.u.mirror, st.mirror ? 1 : 0);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(cam.u.src, 0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo); gl.viewport(0, 0, w, h);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          return out;
        },
        free() { if (out) freeTarget(out); gl.deleteTexture(tex); }
      };
      return st;
    }

    // A crossfade between two source stages: both run while it lasts, and amount goes from 0 (a) to 1 (b)
    function Mix(a, b) {
      let out = makeTarget(w, h);
      const st = {
        a, b, amount: 0, values: {},
        alloc() { st.a.alloc(); st.b.alloc(); freeTarget(out); out = makeTarget(w, h); },
        clear() { st.a.clear(); st.b.clear(); clearTarget(out); },
        get out() { return out; },
        render(time, dt, input, frozen) {
          const ta = st.a.render(time, dt, null, frozen), tb = st.b.render(time, dt, null, frozen), n = st.amount;
          gl.useProgram(blend.p);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ta.tex); gl.uniform1i(blend.u.a, 0);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tb.tex); gl.uniform1i(blend.u.b, 1);
          gl.uniform1f(blend.u.amount, n * n * (3 - 2 * n));
          gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo); gl.viewport(0, 0, w, h);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          return out;
        },
        free() { freeTarget(out); }
      };
      return st;
    }

    let chain = [];
    // what was shown has just been freed: a read before the next frame must not touch it
    function allocChain() { shown = null; chain.forEach(s => s.alloc()); }
    const MAX_SIDE = 1920;   // a large screen still draws at a size the device can keep up with
    function resize(force) {
      // the drawing is always 16:9, sized by the device's screen and the chosen detail. The window and the panel have
      // no say, so resizing leaves the picture and the trails alone and the page only shows it. A fixed size wins
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const side = Math.min(MAX_SIDE, Math.max(screen.width, screen.height) * dpr);
      const dw = fixed ? fixed[0] : Math.max(16, Math.round(side * scale / 2) * 2);
      const dh = fixed ? fixed[1] : Math.max(16, Math.round(dw * 9 / 32) * 2);
      if (dw === w && dh === h && !force) return;
      w = dw; h = dh; canvas.width = w; canvas.height = h;
      allocChain();
    }

    let lastT = 0, level = 1, shown = null, grab = null;
    function drawShown(fbo, vw, vh) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, vw, vh);
      gl.useProgram(blit.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shown ? shown.tex : null);
      gl.uniform1i(blit.u.src, 0); gl.uniform1f(blit.u.level, level);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    return {
      gl, precision,
      Stage: (isf, o) => Stage(isf, o), CameraStage, Mix,
      // the caller owns the stages (and frees the ones it drops); every stage in the chain starts clean,
      // unless keep is true: then their pictures and trails carry on and the caller clears any new stage itself
      setChain(stages, keep) { chain = stages; if (w && !keep) allocChain(); resize(); },
      get chain() { return chain; },
      setScale(s) { scale = s; resize(!fixed); },
      setFixedSize(size) { fixed = size; resize(true); },
      get scale() { return scale; },
      get size() { return [w, h]; },
      set level(v) { level = v; },
      clear() { chain.forEach(s => s.clear()); },
      render(time, frozen) {
        resize();
        const dt = Math.min(0.1, Math.max(0, time - lastT)); lastT = time;
        let tex = null;
        if (!frozen) for (const s of chain) tex = s.render(time, dt, tex, frozen);
        else tex = chain.length ? chain[chain.length - 1].out : null;
        shown = tex;
        drawShown(null, w, h);
        frame++;
      },
      // the finished picture at the drawing size, Blackout and fades included, bottom row first
      readFrame(pixels) {
        if (!grab || grab.w !== w || grab.h !== h) {
          if (grab) freeTarget(grab);
          grab = Object.assign(makeTarget(w, h), { w, h });
        }
        drawShown(grab.fbo, w, h);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      },
      info() {
        // Firefox gives the real name through RENDERER and warns about the old extension, so it is not asked there
        const ext = navigator.userAgent.indexOf('Firefox/') >= 0 ? null : gl.getExtension('WEBGL_debug_renderer_info');
        return { webgl: (window.WebGL2RenderingContext && gl instanceof WebGL2RenderingContext) ? 2 : 1, precision,
          gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
      }
    };
  }

  root.MothlightCore = { parseISF, defaults, Engine };
})(window);
