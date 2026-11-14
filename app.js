/* 一分钟慢下来
 * 声音由 Web Audio API 在浏览器里即时生成，不加载外部音频文件，
 * 也不使用任何第三方库或付费接口。
 */
(function () {
  "use strict";

  var DURATION_MS = 60000;
  var FORM_END = 0.04;
  var LAND_START = 0.95;

  var dropWrap = document.getElementById("drop-wrap");
  var pool = document.getElementById("pool");
  var progressFill = document.getElementById("progress-fill");
  var panelStart = document.getElementById("panel-start");
  var panelEnd = document.getElementById("panel-end");
  var btnStart = document.getElementById("btn-start");
  var btnAgain = document.getElementById("btn-again");
  var btnSound = document.getElementById("btn-sound");

  var soundMode = "off";
  var phase = "start";
  var rafId = 0;
  var elapsed = 0;
  var lastStamp = 0;
  var running = false;

  var audio = {
    ctx: null,
    master: null,
    nodes: [],
    timers: [],
    mode: "off"
  };

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function easeFall(u) {
    /* 接近匀速，略带一点重力，避免前半分钟几乎不动 */
    return 0.9 * u + 0.1 * u * u;
  }

  function setVar(name, value) {
    dropWrap.style.setProperty(name, value);
  }

  function dropRange() {
    var h = window.innerHeight || 800;
    var start = Math.round(h * 0.18);
    var poolBottom = Math.round(h * 0.10);
    var poolHeight = h >= 800 ? 32 : 28;
    var dropHeight = h >= 800 ? 66 : 60;
    var end = h - poolBottom - Math.round(poolHeight * 0.55) - dropHeight;
    return { start: start, end: Math.max(start + 80, end) };
  }

  function render(t) {
    t = clamp(t, 0, 1);
    var range = dropRange();
    var y;
    var scale = 1;
    var squash = 1;
    var opacity = 1;
    var wobble = 0;
    var shadowOpacity;
    var shadowScale;

    if (t <= 0) {
      y = range.start;
      scale = 1;
    } else if (t < FORM_END) {
      var f = t / FORM_END;
      y = range.start;
      scale = 0.86 + 0.18 * f;
      squash = 1 + 0.06 * Math.sin(f * Math.PI);
    } else if (t < LAND_START) {
      var u = (t - FORM_END) / (LAND_START - FORM_END);
      var fall = easeFall(u);
      y = range.start + (range.end - range.start) * fall;
      wobble = Math.sin(u * Math.PI * 2.15) * 2.2 * Math.sin(u * Math.PI);
      squash = 1 - 0.04 * fall;
      scale = 1;
    } else {
      var l = (t - LAND_START) / (1 - LAND_START);
      y = range.end + 4 * l;
      squash = 1 - 0.62 * Math.min(1, l * 1.8);
      scale = 1 + 0.25 * Math.min(1, l * 1.4);
      opacity = 1 - clamp((l - 0.15) / 0.55, 0, 1);
    }

    var near = t < FORM_END ? 0 : Math.min(1, (t - FORM_END) / (LAND_START - FORM_END));
    shadowOpacity = 0.1 + near * 0.28;
    shadowScale = 0.5 + near * 0.85;
    if (t >= LAND_START) {
      var l2 = (t - LAND_START) / (1 - LAND_START);
      shadowOpacity *= 1 - l2;
    }

    setVar("--drop-x", wobble.toFixed(2) + "px");
    setVar("--drop-y", Math.round(y) + "px");
    setVar("--drop-scale", scale.toFixed(3));
    setVar("--drop-squash", squash.toFixed(3));
    setVar("--drop-opacity", opacity.toFixed(3));
    setVar("--shadow-opacity", shadowOpacity.toFixed(3));
    setVar("--shadow-scale", shadowScale.toFixed(3));
    progressFill.style.transform = "scaleX(" + t.toFixed(4) + ")";

    if (t >= LAND_START) {
      pool.classList.add("is-rippling");
    } else {
      pool.classList.remove("is-rippling");
    }
  }

  function showPanel(which, instant) {
    var showStart = which === "start";
    var showEnd = which === "end";
    if (instant) {
      panelStart.classList.add("is-instant");
      panelEnd.classList.add("is-instant");
    }
    panelStart.classList.toggle("is-on", showStart);
    panelEnd.classList.toggle("is-on", showEnd);
    panelStart.toggleAttribute("hidden", !showStart);
    panelEnd.toggleAttribute("hidden", !showEnd);
    panelStart.setAttribute("aria-hidden", showStart ? "false" : "true");
    panelEnd.setAttribute("aria-hidden", showEnd ? "false" : "true");
    if (instant) {
      void panelStart.offsetWidth;
      panelStart.classList.remove("is-instant");
      panelEnd.classList.remove("is-instant");
    }
  }

  function resetToStart() {
    running = false;
    elapsed = 0;
    lastStamp = 0;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    phase = "start";
    dropWrap.classList.add("is-idle");
    pool.classList.remove("is-rippling");
    render(0);
    showPanel("start", true);
  }

  function finish() {
    running = false;
    elapsed = DURATION_MS;
    lastStamp = 0;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    phase = "end";
    render(1);
    showPanel("end");
    btnAgain.focus();
  }

  function frame(now) {
    if (!running) return;
    if (document.hidden) {
      lastStamp = 0;
      rafId = requestAnimationFrame(frame);
      return;
    }
    if (!lastStamp) lastStamp = now;
    elapsed += now - lastStamp;
    lastStamp = now;
    var t = clamp(elapsed / DURATION_MS, 0, 1);
    render(t);
    if (t >= 1) {
      finish();
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  function startMinute() {
    running = true;
    elapsed = 0;
    lastStamp = 0;
    phase = "playing";
    dropWrap.classList.remove("is-idle");
    pool.classList.remove("is-rippling");
    showPanel(null);
    render(0);
    audio.resume();
    rafId = requestAnimationFrame(frame);
  }

  /* —— 声音 —— */

  function noiseBuffer(ctx, seconds, kind) {
    var rate = ctx.sampleRate;
    var length = Math.floor(rate * seconds);
    var buffer = ctx.createBuffer(1, length, rate);
    var data = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < length; i++) {
      var white = Math.random() * 2 - 1;
      if (kind === "brown") {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else if (kind === "pink") {
        last = 0.97 * last + 0.03 * white;
        data[i] = (white * 0.4 + last * 0.6) * 0.8;
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  function track(node) {
    audio.nodes.push(node);
    return node;
  }

  function connectSource(ctx, buffer, dest, filterType, freq, q, gainValue) {
    var src = track(ctx.createBufferSource());
    src.buffer = buffer;
    src.loop = true;
    var filter = track(ctx.createBiquadFilter());
    filter.type = filterType;
    filter.frequency.value = freq;
    if (q) filter.Q.value = q;
    var gain = track(ctx.createGain());
    gain.gain.value = gainValue;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start();
    return { src: src, filter: filter, gain: gain };
  }

  function startRain(ctx, dest) {
    var bed = noiseBuffer(ctx, 3, "white");
    connectSource(ctx, bed, dest, "bandpass", 2200, 0.65, 0.07);
    var hiss = noiseBuffer(ctx, 2.4, "white");
    connectSource(ctx, hiss, dest, "highpass", 4200, 0.5, 0.03);

    function drip() {
      if (audio.mode !== "rain" || !audio.ctx) return;
      var t = ctx.currentTime;
      var src = track(ctx.createBufferSource());
      src.buffer = bed;
      var bp = track(ctx.createBiquadFilter());
      bp.type = "bandpass";
      bp.frequency.value = 1400 + Math.random() * 1800;
      bp.Q.value = 1.2;
      var g = track(ctx.createGain());
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.045 + Math.random() * 0.03, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09 + Math.random() * 0.05);
      src.connect(bp);
      bp.connect(g);
      g.connect(dest);
      src.start(t);
      src.stop(t + 0.16);
      audio.timers.push(setTimeout(drip, 180 + Math.random() * 420));
    }
    drip();
  }

  function startForest(ctx, dest) {
    var wind = noiseBuffer(ctx, 4, "brown");
    var layer = connectSource(ctx, wind, dest, "lowpass", 900, 0.7, 0.08);
    var leaves = noiseBuffer(ctx, 3, "pink");
    connectSource(ctx, leaves, dest, "bandpass", 1600, 0.8, 0.03);

    if (layer.filter && typeof layer.filter.frequency.linearRampToValueAtTime === "function") {
      function sway() {
        if (audio.mode !== "forest" || !audio.ctx) return;
        var t = ctx.currentTime;
        var next = 700 + Math.random() * 500;
        layer.filter.frequency.linearRampToValueAtTime(next, t + 3.5);
        audio.timers.push(setTimeout(sway, 3500));
      }
      sway();
    }

    function chirp() {
      if (audio.mode !== "forest" || !audio.ctx) return;
      var t = ctx.currentTime;
      var osc = track(ctx.createOscillator());
      var g = track(ctx.createGain());
      var f0 = 1600 + Math.random() * 1700;
      osc.type = "sine";
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(400, f0 * (0.72 + Math.random() * 0.4)),
        t + 0.16
      );
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.018, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g);
      g.connect(dest);
      osc.start(t);
      osc.stop(t + 0.26);
      audio.timers.push(setTimeout(chirp, 5000 + Math.random() * 7000));
    }
    audio.timers.push(setTimeout(chirp, 1600 + Math.random() * 1800));
  }

  function stopAudioGraph() {
    audio.timers.forEach(function (id) {
      clearTimeout(id);
    });
    audio.timers = [];
    audio.nodes.forEach(function (node) {
      try {
        if (node.stop) node.stop();
      } catch (e) {}
      try {
        node.disconnect();
      } catch (e2) {}
    });
    audio.nodes = [];
  }

  audio.ensure = function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!audio.ctx) {
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.55;
      audio.master.connect(audio.ctx.destination);
    }
    return true;
  };

  audio.resume = function () {
    if (audio.ctx && audio.ctx.state === "suspended") {
      audio.ctx.resume();
    }
  };

  audio.setMode = function (mode) {
    if (!audio.ensure()) {
      soundMode = "off";
      audio.mode = "off";
      return false;
    }
    audio.resume();
    stopAudioGraph();
    audio.mode = mode;
    if (mode === "rain") startRain(audio.ctx, audio.master);
    if (mode === "forest") startForest(audio.ctx, audio.master);
    return true;
  };

  var SOUND_LABEL = { off: "声音：关", rain: "声音：雨声", forest: "声音：林间" };
  var SOUND_CYCLE = { off: "rain", rain: "forest", forest: "off" };

  function updateSoundLabel() {
    var label = SOUND_LABEL[soundMode];
    btnSound.textContent = label;
    btnSound.setAttribute("aria-label", label);
  }

  function cycleSound() {
    var next = SOUND_CYCLE[soundMode];
    if (next === "off") {
      audio.setMode("off");
      soundMode = "off";
    } else {
      var ok = audio.setMode(next);
      soundMode = ok ? next : "off";
    }
    updateSoundLabel();
  }

  btnStart.addEventListener("click", function () {
    startMinute();
  });

  btnAgain.addEventListener("click", function () {
    startMinute();
  });

  btnSound.addEventListener("click", function () {
    cycleSound();
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) lastStamp = 0;
  });

  window.addEventListener("resize", function () {
    var t = phase === "start" ? 0 : phase === "end" ? 1 : clamp(elapsed / DURATION_MS, 0, 1);
    render(t);
  });

  /* QA 钩子：用同一套 render() 把画面定在某一时刻。正式使用不会碰到。 */
  window.__qa = {
    duration: DURATION_MS,
    get elapsed() {
      return elapsed;
    },
    get phase() {
      return phase;
    },
    get soundMode() {
      return soundMode;
    },
    seek: function (ms) {
      var t = clamp(ms / DURATION_MS, 0, 1);
      dropWrap.classList.remove("is-idle");
      if (t <= 0) {
        resetToStart();
        return;
      }
      if (t >= 1) {
        elapsed = DURATION_MS;
        running = false;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        phase = "end";
        render(1);
        showPanel("end", true);
        return;
      }
      elapsed = ms;
      lastStamp = 0;
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      phase = "playing";
      showPanel(null, true);
      render(t);
    },
    start: startMinute,
    reset: resetToStart
  };

  render(0);
  showPanel("start", true);
})();
