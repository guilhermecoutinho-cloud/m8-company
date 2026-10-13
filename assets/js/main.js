/* =========================================================
   M8 COMPANY — main.js
   Vanilla, no dependencies. One shared rAF ticker; every
   subscriber is gated by IntersectionObserver visibility.
   ========================================================= */
(() => {
  'use strict';

  const d = document;
  const root = d.documentElement;
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => Array.from(c.querySelectorAll(s));

  /* ---------- math helpers ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeOutExpo = t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const fmtNum = (v, dec) => new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  const docTop = el => el.getBoundingClientRect().top + window.scrollY;
  const mq = q => window.matchMedia(q).matches;

  /* ---------- feature detection ---------- */
  if (!(window.CSS && CSS.registerProperty)) root.classList.add('no-at-property');

  /* ---------- global scroll state ---------- */
  const S = {
    y: window.scrollY, prevY: window.scrollY, vel: 0, v: 0, dir: 1,
    vw: window.innerWidth, vh: window.innerHeight
  };

  /* ---------- motion preference (OS reduced motion OR the on-page pause toggle) ---------- */
  const motionOff = () => RM || root.classList.contains('motion-paused');

  /* ---------- shared ticker ----------
     Goes idle when nothing is moving: it keeps running only while the page
     scrolled in the last ~500ms or a subscriber returns true ("still animating"). */
  const subs = new Set();
  let rafId = 0;
  let lastScrollT = 0;
  function tick(t) {
    rafId = 0;
    S.vel = S.y - S.prevY;
    S.prevY = S.y;
    S.v = lerp(S.v, S.vel, 0.2);
    if (S.vel < -1) S.dir = -1; else if (S.vel > 1) S.dir = 1;
    let busy = (t - lastScrollT) < 500 || Math.abs(S.v) > 0.05;
    subs.forEach(fn => { if (fn(t) === true) busy = true; });
    if (subs.size && busy) wake();
  }
  function wake() { if (!rafId && !d.hidden) rafId = requestAnimationFrame(tick); }
  const addSub = fn => { subs.add(fn); wake(); };
  const delSub = fn => { subs.delete(fn); };
  d.addEventListener('visibilitychange', () => { if (!d.hidden) wake(); });

  /* ---------- pause-all-motion toggle (nav + footer) ---------- */
  (function motionToggle() {
    const btns = $$('[data-motion-toggle]');
    function sync() {
      const off = root.classList.contains('motion-paused');
      btns.forEach(b => {
        if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', off ? 'true' : 'false');
        else b.textContent = off ? 'Play animations' : 'Pause animations';
      });
    }
    btns.forEach(b => b.addEventListener('click', () => {
      const off = !root.classList.contains('motion-paused');
      root.classList.toggle('motion-paused', off);
      try { localStorage.setItem('m8-motion', off ? 'off' : 'on'); } catch (e) { /* storage blocked */ }
      sync();
      window.dispatchEvent(new CustomEvent('m8:motion', { detail: { off } }));
      wake();
    }));
    sync();
  })();

  /* tiny standalone tween */
  function tween(dur, ease, update, done) {
    let start = 0, id = 0, dead = false;
    const step = now => {
      if (dead) return;
      if (!start) start = now;
      const p = clamp((now - start) / dur, 0, 1);
      update(ease(p));
      if (p < 1) id = requestAnimationFrame(step); else if (done) done();
    };
    id = requestAnimationFrame(step);
    return () => { dead = true; cancelAnimationFrame(id); };
  }

  /* visibility watcher → runs on(true/false) */
  function watch(el, cb, opts) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { cb(true); return; }
    const io = new IntersectionObserver(entries => entries.forEach(e => cb(e.isIntersecting, e)), opts || { threshold: 0 });
    io.observe(el);
    return io;
  }

  /* resize registry (debounced 150ms) */
  const resizers = [];
  const onResize = fn => resizers.push(fn);
  let rT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rT);
    rT = setTimeout(() => {
      const wChanged = window.innerWidth !== S.vw;
      S.vw = window.innerWidth; S.vh = window.innerHeight;
      resizers.forEach(fn => fn(wChanged));
    }, 150);
  });
  const fontsReady = (d.fonts && d.fonts.ready) ? Promise.race([d.fonts.ready, new Promise(r => setTimeout(r, 1200))]) : Promise.resolve();

  /* =========================================================
     SCROLL: progress bar, nav state, hide-on-scroll
     ========================================================= */
  const nav = $('#nav');
  const progressBar = $('.progress__bar');
  let menuOpen = false;
  let scrollQueued = false;
  let lastNavY = window.scrollY;
  function scrollFrame() {
    scrollQueued = false;
    const y = S.y;
    const max = Math.max(1, d.documentElement.scrollHeight - S.vh);
    if (progressBar) progressBar.style.transform = `scaleX(${clamp(y / max, 0, 1)})`;
    nav.classList.toggle('is-scrolled', y > 40);
    const dy = y - lastNavY;
    if (Math.abs(dy) > 6) {
      if (dy > 0 && y > 400 && !menuOpen && !nav.contains(d.activeElement)) nav.classList.add('is-hidden');
      else if (dy < 0) nav.classList.remove('is-hidden');
      lastNavY = y;
    }
    if (y <= 400) nav.classList.remove('is-hidden');
  }
  window.addEventListener('scroll', () => {
    S.y = window.scrollY;
    lastScrollT = performance.now();
    if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(scrollFrame); }
    wake();
  }, { passive: true });
  nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));
  scrollFrame();

  /* =========================================================
     NAV: active link indicator
     ========================================================= */
  (function navActive() {
    const links = $$('.nav__links a[data-nav]');
    const ind = $('.nav__indicator');
    const ul = $('.nav__links ul');
    if (!links.length || !('IntersectionObserver' in window)) return;
    let current = null;
    function place() {
      const a = links.find(l => l.dataset.nav === current);
      links.forEach(l => (l === a ? l.setAttribute('aria-current', 'true') : l.removeAttribute('aria-current')));
      if (!a) { ind.classList.remove('is-on'); return; }
      ind.style.setProperty('--ix', `${a.offsetLeft - ul.offsetLeft}px`);
      ind.style.setProperty('--iw', `${a.offsetWidth / 100}`);
      ind.classList.add('is-on');
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { current = e.target.id; place(); } });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('main > section[id]').forEach(s => io.observe(s));
    onResize(place);
    fontsReady.then(place);
  })();

  /* =========================================================
     MOBILE MENU
     ========================================================= */
  (function mobileMenu() {
    const toggle = $('.nav__toggle');
    const menu = $('#mobile-menu');
    const label = $('.nav__toggle-label');
    if (!toggle || !menu) return;
    let closeT = 0;
    const focusables = () => [toggle, ...$$('a, button', menu)];
    // everything behind the full-screen menu leaves the accessibility tree while it is open
    const behind = () => [$('#main'), $('#footer'), $('.sticky-cta'), $('.skip-link'), $('.logo'), $('.nav__links'), $('.nav__cta'), $('.motion-toggle')].filter(Boolean);
    const setInert = on => behind().forEach(el => { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      if (e.key === 'Tab') {
        const f = focusables();
        const i = f.indexOf(d.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    }
    function open() {
      clearTimeout(closeT);
      menuOpen = true;
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      label.textContent = 'Close';
      root.style.overflow = 'hidden';
      setInert(true);
      nav.classList.add('menu-open');
      nav.classList.remove('is-hidden');
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
      d.addEventListener('keydown', onKey);
      setTimeout(() => { const a = $('a', menu); if (a) a.focus({ preventScroll: true }); }, RM ? 10 : 250);
    }
    function close(returnFocus) {
      if (!menuOpen) return;
      menuOpen = false;
      menu.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      label.textContent = 'Menu';
      root.style.overflow = '';
      setInert(false);
      d.removeEventListener('keydown', onKey);
      closeT = setTimeout(() => { menu.hidden = true; nav.classList.remove('menu-open'); }, RM ? 220 : 720);
      if (returnFocus) toggle.focus();
    }
    toggle.addEventListener('click', () => (menuOpen ? close(true) : open()));
    $$('a', menu).forEach(a => a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      if (!href || href.charAt(0) !== '#') { close(false); return; }
      e.preventDefault();
      if (href === '#audit') { close(false); goToForm(); return; }
      const target = $(href);
      close(false);
      if (target) {
        target.scrollIntoView({ behavior: RM ? 'auto' : 'smooth' });
        setTimeout(() => {
          if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        }, RM ? 0 : 600);
      }
    }));
    onResize(() => { if (S.vw >= 900 && menuOpen) close(false); });
  })();

  /* =========================================================
     REVEALS
     ========================================================= */
  (function reveals() {
    const items = $$('[data-reveal]');
    const splits = $$('.split');
    if (!('IntersectionObserver' in window)) {
      items.concat(splits).forEach(el => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
    items.forEach(el => io.observe(el));
    const io2 = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io2.unobserve(e.target); }
    }), { threshold: 0.3 });
    splits.forEach(el => io2.observe(el));
    // safety net: above the fold after 3s
    window.addEventListener('load', () => setTimeout(() => {
      items.concat(splits).forEach(el => { if (el.getBoundingClientRect().top < S.vh) el.classList.add('is-in'); });
    }, 3000));
  })();

  /* =========================================================
     COUNT-UP
     ========================================================= */
  function countUp(el, dur, ease, done) {
    const end = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.decimals || '0', 10);
    const pre = el.dataset.prefix || '';
    const suf = el.dataset.suffix || '';
    const set = v => { el.textContent = pre + fmtNum(v, dec) + suf; };
    if (RM) { set(end); if (done) done(); return; }
    el.style.minWidth = `${el.textContent.length * 0.62}ch`;
    set(0);
    tween(dur, ease, p => set(end * p), () => { set(end); if (done) done(); });
  }
  (function stats() {
    $$('.stat__num[data-count]').forEach(el => {
      if (RM || !('IntersectionObserver' in window)) { el.classList.add('is-done'); return; }
      const io = new IntersectionObserver(es => es.forEach(e => {
        if (!e.isIntersecting) return;
        io.disconnect();
        countUp(el, 1800, easeOutExpo, () => el.classList.add('is-done'));
      }), { threshold: 0.5 });
      io.observe(el);
    });
  })();

  /* =========================================================
     MAGNETIC BUTTONS
     ========================================================= */
  (function magnetic() {
    if (!FINE || RM) return;
    $$('.btn-magnetic').forEach(btn => {
      if (btn.closest('form')) return;
      const inner = $('.btn__inner', btn);
      const st = { tx: 0, ty: 0, x: 0, y: 0, lx: 0, ly: 0, ltx: 0, lty: 0, on: false };
      const run = () => {
        st.x = lerp(st.x, st.tx, 0.15); st.y = lerp(st.y, st.ty, 0.15);
        st.lx = lerp(st.lx, st.ltx, 0.15); st.ly = lerp(st.ly, st.lty, 0.15);
        btn.style.translate = `${st.x.toFixed(2)}px ${st.y.toFixed(2)}px`;
        if (inner) inner.style.translate = `${st.lx.toFixed(2)}px ${st.ly.toFixed(2)}px`;
        return true;
      };
      btn.addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        const r = btn.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        st.tx = clamp(dx * 0.35, -14, 14); st.ty = clamp(dy * 0.35, -14, 14);
        st.ltx = dx * 0.18; st.lty = dy * 0.18;
        st.ltx = clamp(st.ltx, -10, 10); st.lty = clamp(st.lty, -8, 8);
        if (!st.on) { st.on = true; btn.classList.add('is-mag'); addSub(run); }
      });
      btn.addEventListener('pointerleave', () => {
        st.on = false; delSub(run);
        st.tx = st.ty = st.ltx = st.lty = st.x = st.y = st.lx = st.ly = 0;
        btn.classList.remove('is-mag');
        btn.style.translate = '0px 0px';
        if (inner) inner.style.translate = '0px 0px';
      });
    });
  })();

  /* =========================================================
     CUSTOM CURSOR (additive; native cursor never hidden)
     ========================================================= */
  (function cursor() {
    if (!FINE || RM) return;
    const dot = d.createElement('div'); dot.className = 'cursor-dot'; dot.setAttribute('aria-hidden', 'true');
    const ring = d.createElement('div'); ring.className = 'cursor-ring'; ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML = '<span class="cursor-ring__c"></span><span class="cursor-ring__l"></span>';
    const lab = $('.cursor-ring__l', ring);
    d.body.append(dot, ring);
    const p = { x: -100, y: -100, rx: -100, ry: -100 };
    let running = false;
    const run = () => {
      p.rx = lerp(p.rx, p.x, 0.18); p.ry = lerp(p.ry, p.y, 0.18);
      ring.style.transform = `translate3d(${p.rx}px, ${p.ry}px, 0)`;
      if (Math.abs(p.rx - p.x) < 0.1 && Math.abs(p.ry - p.y) < 0.1) { running = false; delSub(run); return false; }
      return true;
    };
    d.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      p.x = e.clientX; p.y = e.clientY;
      dot.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      root.classList.add('has-cursor');
      if (!running) { running = true; addSub(run); } else wake();
    }, { passive: true });
    d.addEventListener('mouseleave', () => root.classList.remove('has-cursor'));
    d.addEventListener('mouseover', e => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const field = t.closest('input:not([type="range"]):not([type="radio"]), select, textarea');
      root.classList.toggle('cursor-off', !!field || d.activeElement && d.activeElement.matches && d.activeElement.matches('input:not([type="range"]):not([type="radio"]), select, textarea'));
      const link = t.closest('a, button, summary, label, input[type="range"], [role="button"]');
      const zone = t.closest('[data-cursor]');
      ring.classList.toggle('is-link', !!link);
      dot.classList.toggle('is-hide', !!link);
      if (!link && zone) {
        lab.textContent = zone.dataset.cursor === 'drag' ? '← DRAG →' : 'VIEW';
        ring.classList.add('is-label');
      } else {
        ring.classList.remove('is-label');
      }
    });
    d.addEventListener('focusin', e => {
      if (e.target.matches && e.target.matches('input:not([type="range"]):not([type="radio"]), select, textarea')) root.classList.add('cursor-off');
    });
    d.addEventListener('focusout', () => root.classList.remove('cursor-off'));
  })();

  /* =========================================================
     HERO
     ========================================================= */
  const hero = $('#hero');
  let heroVisible = true;
  watch(hero, v => { heroVisible = v; if (v) wake(); });
  const heroActive = () => heroVisible && !d.hidden;

  /* --- A. intro sequence --- */
  const heroTimeline = { drawn: false };
  (function heroIntro() {
    if (RM) {
      hero.classList.add('is-copy', 'is-intro', 'is-hl', 'is-ui', 'is-drawn', 'is-area');
      return;
    }
    // sub-copy + CTAs are never gated on web fonts (they start visible at reduced opacity)
    void hero.offsetWidth; // commit the start state so the transition always runs
    setTimeout(() => hero.classList.add('is-copy'), 60);
    // only the kinetic headline (and the decorative dashboard after it) waits for fonts
    fontsReady.then(() => {
      void hero.offsetWidth;
      setTimeout(() => hero.classList.add('is-intro'), 0);
      setTimeout(() => hero.classList.add('is-ui'), 380);
      setTimeout(() => hero.classList.add('is-hl'), 900);
      setTimeout(() => { startSparkDraw(); }, 1500);
      setTimeout(() => { startSlot(); }, 1700);
    });
  })();

  /* --- B. rotating word slot --- */
  let slotWidths = [];
  const slot = $('.slot');
  const stack = $('.slot__stack');
  const slotWords = $$('.slot__word');
  let slotIdx = 0;
  function splitChars(el) {
    const txt = el.textContent;
    el.textContent = '';
    [...txt].forEach((c, i) => {
      const s = d.createElement('span');
      s.className = 'ch'; s.style.setProperty('--c', i); s.textContent = c;
      el.appendChild(s);
    });
  }
  function measureSlot() {
    if (!slot) return;
    slotWords.forEach(w => { w.style.width = 'max-content'; });
    slotWidths = slotWords.map(w => w.getBoundingClientRect().width);
    const lh = slot.getBoundingClientRect().height;
    slot.style.width = `${slotWidths[slotIdx]}px`;
    stack.style.transform = `translateY(${-slotIdx * lh}px)`;
  }
  function startSlot() {
    if (!slot || RM) return;
    slotWords.forEach(splitChars);
    measureSlot();
    onResize(measureSlot);
    setInterval(() => {
      if (!heroActive() || motionOff()) return;
      slotIdx = (slotIdx + 1) % slotWords.length;
      const w = slotWords[slotIdx];
      const lh = slot.getBoundingClientRect().height;
      w.classList.add('is-pre');
      void w.offsetWidth;
      stack.style.transform = `translateY(${-slotIdx * lh}px)`;
      slot.style.width = `${slotWidths[slotIdx]}px`;
      requestAnimationFrame(() => w.classList.remove('is-pre'));
    }, 2400);
  }

  /* --- C. Noise → Signal canvas --- */
  (function noiseCanvas() {
    const cv = $('.hero__canvas');
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1, step = 18;
    let t = 0, phase = 0;
    const ptr = { x: 0, y: 0, tx: 0, ty: 0, last: -1e9 };
    // value noise
    const perm = new Uint8Array(512);
    (function seed() {
      const p = [...Array(256).keys()];
      let s = 1337;
      for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
      for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    })();
    const hash = (x, y) => perm[(x + perm[y & 255]) & 255] / 255;
    const fade = q => q * q * (3 - 2 * q);
    function noise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const a = hash(xi & 255, yi & 255), b = hash((xi + 1) & 255, yi & 255);
      const c = hash(xi & 255, (yi + 1) & 255), e = hash((xi + 1) & 255, (yi + 1) & 255);
      const u = fade(xf), v = fade(yf);
      return lerp(lerp(a, b, u), lerp(c, e, u), v);
    }
    // backing store covers the first screen only (the hero can be 2x the viewport on phones)
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, FINE ? 2 : 1.5);
      const w = hero.clientWidth, h = Math.min(hero.clientHeight, Math.max(window.innerHeight, 560));
      if (w === W && h === H && cv.width) return false;
      W = w; H = h;
      cv.style.height = `${H}px`;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      step = W < 768 ? 26 : 18;
      if (!ptr.x) { ptr.x = ptr.tx = W * 0.62; ptr.y = ptr.ty = H * 0.5; }
      return true;
    }
    const BUCKETS = 6;
    const buckets = Array.from({ length: BUCKETS }, () => []);
    function draw() {
      ctx.clearRect(0, 0, W, H);
      buckets.forEach(b => (b.length = 0));
      ctx.beginPath();
      const R = 200;
      for (let y = step / 2; y < H; y += step) {
        for (let x = step / 2; x < W; x += step) {
          const dx = x - ptr.x, dy = y - ptr.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const f = dist < R ? smoothstep(R, 0, dist) : 0;
          let a = noise(x * 0.004 * 4, y * 0.004 * 4 + t) * Math.PI * 2;
          if (f > 0.02) {
            a = Math.atan2(Math.sin(a), Math.cos(a)) * (1 - f);
            const off = Math.sin((x / 120) * Math.PI * 2 + phase) * 10 * f;
            const len = 6 + 6 * f;
            buckets[Math.min(BUCKETS - 1, Math.floor(f * BUCKETS))].push(x, y + off, a, len);
          } else {
            const c = Math.cos(a) * 3, s = Math.sin(a) * 3;
            ctx.moveTo(x - c, y - s); ctx.lineTo(x + c, y + s);
          }
        }
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(138,138,147,.3)';
      ctx.stroke();
      for (let k = 0; k < BUCKETS; k++) {
        const b = buckets[k];
        if (!b.length) continue;
        const f = (k + 0.5) / BUCKETS;
        const r = Math.round(lerp(138, 198, f)), g = Math.round(lerp(138, 255, f)), bl = Math.round(lerp(147, 0, f));
        ctx.strokeStyle = `rgba(${r},${g},${bl},${lerp(0.3, 0.7, f).toFixed(3)})`;
        ctx.lineWidth = 1 + f * 0.6;
        ctx.beginPath();
        for (let i = 0; i < b.length; i += 4) {
          const x = b[i], y = b[i + 1], a = b[i + 2], h = b[i + 3] / 2;
          const c = Math.cos(a) * h, s = Math.sin(a) * h;
          ctx.moveTo(x - c, y - s); ctx.lineTo(x + c, y + s);
        }
        ctx.stroke();
      }
    }
    let odd = false;
    function frame(now) {
      // idle when paused, hidden, or scrolled past the canvas (it only covers the first screen)
      if (!heroActive() || motionOff() || S.y > H) return false;
      // touch devices: 30fps is plenty for an ambient field
      odd = !odd;
      if (!FINE && odd) return true;
      t += FINE ? 0.004 : 0.008; phase += FINE ? 0.03 : 0.06;
      if (now - ptr.last > 2500) {
        const tt = now / 1000;
        ptr.tx = W * 0.6 + 0.3 * W * Math.sin(tt * 0.7) * 0.9;
        ptr.ty = H * 0.5 + 0.25 * H * Math.sin(tt * 1.1);
      }
      ptr.x = lerp(ptr.x, ptr.tx, 0.12); ptr.y = lerp(ptr.y, ptr.ty, 0.12);
      draw();
      return true;
    }
    size();
    if (RM) {
      ptr.x = W * 0.5; ptr.y = H * 0.5; draw();
      const still = () => { if (size()) { ptr.x = W * 0.5; ptr.y = H * 0.5; draw(); } };
      if ('ResizeObserver' in window) new ResizeObserver(still).observe(hero); else onResize(still);
      return;
    }
    draw();
    hero.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = hero.getBoundingClientRect();
      ptr.tx = e.clientX - r.left; ptr.ty = e.clientY - r.top; ptr.last = performance.now();
      wake();
    }, { passive: true });
    watch(hero, v => (v ? addSub(frame) : delSub(frame)));
    window.addEventListener('m8:motion', () => { if (heroVisible) wake(); });
    const resized = () => { if (size()) draw(); };
    if ('ResizeObserver' in window) new ResizeObserver(resized).observe(hero); else onResize(resized);
  })();

  /* --- D. cluster parallax --- */
  (function parallax() {
    if (!FINE || RM) return;
    const cluster = $('.cluster');
    const wraps = $$('.cluster .dwrap, .cluster .toast');
    if (!cluster) return;
    const st = { tx: 0, ty: 0, x: 0, y: 0 };
    hero.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      st.tx = clamp((e.clientX / S.vw) * 2 - 1, -1, 1);
      st.ty = clamp((e.clientY / S.vh) * 2 - 1, -1, 1);
      wake();
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { st.tx = 0; st.ty = 0; wake(); });
    const run = () => {
      if (S.vw < 1024 || !heroActive()) return false;
      if (Math.abs(st.x - st.tx) < 0.001 && Math.abs(st.y - st.ty) < 0.001) return false;
      st.x = lerp(st.x, st.tx, 0.08); st.y = lerp(st.y, st.ty, 0.08);
      cluster.style.transform = `rotateX(${(-st.y * 4).toFixed(3)}deg) rotateY(${(st.x * 4).toFixed(3)}deg)`;
      wraps.forEach(w => {
        const dep = parseFloat(w.dataset.depth || '6');
        w.style.transform = `translate3d(${(st.x * dep).toFixed(2)}px, ${(st.y * dep).toFixed(2)}px, 0)`;
      });
      return true;
    };
    watch(hero, v => (v ? addSub(run) : delSub(run)));
  })();

  /* --- sparkline draw + live mode + toast --- */
  const spark = {
    line: $('.spark__line'), area: $('.spark__area'), spend: $('.spark__spend'), group: $('.spark__series'),
    rev: $('[data-rev]'), data: [], spendData: [], min: 0, max: 0
  };
  const STEP = 320 / 21;
  function buildData() {
    let v = 100;
    let s = 40;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 24; i++) {
      v *= 1 + (rnd() * 2 - 1) * 0.05 + 0.045;
      s *= 1 + (rnd() * 2 - 1) * 0.02 + 0.01;
      spark.data.push(v); spark.spendData.push(s);
    }
    spark.min = 40; spark.max = Math.max(...spark.data) * 1.25;
  }
  const yOf = v => 112 - ((v - spark.min) / (spark.max - spark.min)) * 100;
  function pathFrom(arr) {
    let dStr = '';
    arr.forEach((v, i) => {
      const x = (i - 1) * STEP, y = yOf(v);
      if (i === 0) dStr += `M${x.toFixed(1)},${y.toFixed(1)}`;
      else {
        const px = (i - 2) * STEP, py = yOf(arr[i - 1]);
        const mx = (px + x) / 2;
        dStr += ` C${mx.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
      }
    });
    return dStr;
  }
  function renderSpark() {
    const l = pathFrom(spark.data);
    spark.line.setAttribute('d', l);
    spark.area.setAttribute('d', `${l} L${(22 * STEP).toFixed(1)},120 L${(-STEP).toFixed(1)},120 Z`);
    spark.spend.setAttribute('d', pathFrom(spark.spendData));
  }
  if (spark.line) { buildData(); renderSpark(); }

  function startSparkDraw() {
    if (!spark.line) return;
    hero.classList.add('is-drawn');
    const svgEl = spark.line.ownerSVGElement;
    const sc = Math.max(svgEl.clientWidth / 320, svgEl.clientHeight / 120, 1);
    const L = spark.line.getTotalLength() * sc * 1.05;
    spark.line.style.strokeDasharray = `${L}`;
    spark.line.style.strokeDashoffset = `${L}`;
    tween(1600, easeInOutCubic, p => { spark.line.style.strokeDashoffset = `${L * (1 - p)}`; }, () => {
      spark.line.style.strokeDasharray = '';
      spark.line.style.strokeDashoffset = '';
      hero.classList.add('is-area');
      heroTimeline.drawn = true;
      startLive();
      startToast();
    });
  }
  let revValue = 1842390;
  function startLive() {
    if (RM) return;
    let busy = false;
    setInterval(() => {
      if (!heroActive() || busy || motionOff()) return;
      busy = true;
      const last = spark.data[spark.data.length - 1];
      let next = last * (1 + (Math.random() * 2 - 1) * 0.06 + 0.015);
      if (next > spark.max * 0.92) next = last * (1 - Math.random() * 0.05);
      if (next < spark.max * 0.45) next = last * (1 + Math.random() * 0.05);
      spark.data.shift(); spark.data.push(next);
      const ls = spark.spendData[spark.spendData.length - 1];
      spark.spendData.shift(); spark.spendData.push(ls * (1 + (Math.random() * 2 - 1) * 0.015));
      renderSpark();
      tween(600, x => x, p => {
        spark.group.setAttribute('transform', `translate(${(STEP * (1 - p)).toFixed(2)} 0)`);
      }, () => { busy = false; });
      const from = revValue;
      revValue += Math.round(40 + Math.random() * 220);
      const to = revValue;
      tween(350, easeOutCubic, p => { spark.rev.textContent = USD.format(Math.round(from + (to - from) * p)); });
    }, 3000);
  }
  function startToast() {
    const el = $('.toast__text');
    if (!el || RM) return;
    // PLACEHOLDER: illustrative messages for the example dashboard (labelled "illustrative data" in the hero).
    // Replace with real, permissioned client events or keep them clearly labelled before launch.
    const msgs = [
      'New booked call: Oakhaven Heating & Air',
      'Order #10482: Ridgeback Outdoor · $312.40',
      'SQL created: Cobalt Ledger · Enterprise plan',
      'Creative test winner: Hook B +41% CTR'
    ];
    let i = 0;
    setInterval(() => {
      if (!heroActive() || motionOff()) return;
      i = (i + 1) % msgs.length;
      el.classList.remove('is-enter');
      el.classList.add('is-out');
      setTimeout(() => {
        el.textContent = msgs[i];
        el.classList.remove('is-out');
        el.classList.add('is-pre');
        void el.offsetWidth;
        el.classList.remove('is-pre');
        el.classList.add('is-enter');
      }, 300);
    }, 4000);
  }

  /* =========================================================
     PROOF MARQUEES (velocity-reactive)
     ========================================================= */
  (function marquees() {
    if (RM) return;
    const rows = $$('.marquee').map(el => ({
      el, track: $('.marquee__track', el), group: $('.marquee__group', el),
      rowDir: parseFloat(el.dataset.dir || '1'), x: 0, half: 0, mult: 1, target: 1, skew: 0
    }));
    if (!rows.length) return;
    const measure = () => rows.forEach(r => {
      r.half = r.group.getBoundingClientRect().width;
      if (r.rowDir < 0 && r.x === 0) r.x = -r.half;
    });
    rows.forEach(r => {
      r.el.addEventListener('pointerenter', () => { r.target = 0; });
      r.el.addEventListener('pointerleave', () => { r.target = 1; });
      r.el.addEventListener('focusin', () => { r.target = 0; });
      r.el.addEventListener('focusout', () => { r.target = 1; });
    });
    const run = () => {
      if (motionOff()) return false;
      const vel = S.v;
      rows.forEach(r => {
        if (!r.half) return;
        r.mult = lerp(r.mult, r.target, 0.1);
        r.x -= (0.6 + Math.abs(vel) * 0.25) * S.dir * r.rowDir * r.mult;
        while (r.x <= -r.half) r.x += r.half;
        while (r.x > 0) r.x -= r.half;
        r.skew = lerp(r.skew, clamp(vel * -0.15, -8, 8), 0.1);
        r.track.style.transform = `translate3d(${r.x.toFixed(2)}px,0,0) skewX(${r.skew.toFixed(2)}deg)`;
      });
      return true;
    };
    let proofVisible = false;
    fontsReady.then(() => { measure(); watch($('#proof'), v => { proofVisible = v; v ? addSub(run) : delSub(run); }); });
    window.addEventListener('m8:motion', () => { if (proofVisible) wake(); });
    onResize(measure);
  })();

  /* =========================================================
     MANIFESTO word lighting
     ========================================================= */
  (function manifesto() {
    const el = $('[data-manifesto]');
    if (!el || RM) return;
    const frag = d.createDocumentFragment();
    Array.from(el.childNodes).forEach(node => {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(d.createTextNode(part)); return; }
          const s = d.createElement('span'); s.className = 'w'; s.textContent = part; frag.appendChild(s);
        });
      } else if (node.nodeType === 1) {
        node.classList.add('w'); frag.appendChild(node);
      }
    });
    el.textContent = '';
    el.appendChild(frag);
    el.classList.add('is-split');
    const words = $$('.w', el);
    const n = words.length;
    const last = new Array(n).fill(-1);
    let top = 0, h = 0;
    const measure = () => { top = docTop(el); h = el.offsetHeight; };
    measure();
    onResize(measure);
    fontsReady.then(measure);
    // fully lit by the time the block's centre reaches mid-viewport; 0.3 floor keeps unlit words legible
    let lastP = -1;
    const run = () => {
      const rectTop = top - S.y;
      const p = clamp((S.vh * 0.85 - rectTop) / (h * 0.6 + S.vh * 0.2), 0, 1);
      if (Math.abs(p - lastP) < 0.0005) return false;
      lastP = p;
      for (let i = 0; i < n; i++) {
        const o = 0.3 + 0.7 * smoothstep(i / n - 0.02, i / n + 0.04, p);
        const r = Math.round(o * 100);
        if (r !== last[i]) { last[i] = r; words[i].style.opacity = (r / 100).toString(); }
        if (words[i].classList.contains('key')) words[i].classList.toggle('is-lit', p > i / n);
      }
      return false;
    };
    words.forEach(w => { w.style.opacity = '0.3'; });
    watch(el, v => (v ? addSub(run) : delSub(run)), { rootMargin: '10% 0px' });
  })();

  /* =========================================================
     SPOTLIGHTS (comparison column + pricing cards)
     ========================================================= */
  (function spotlights() {
    if (!FINE) return;
    const cmp = $('.compare');
    const col = $('.compare__m8-bg');
    if (cmp && col) {
      cmp.addEventListener('pointermove', e => {
        const r = col.getBoundingClientRect();
        col.style.setProperty('--x', `${e.clientX - r.left}px`);
        col.style.setProperty('--y', `${e.clientY - r.top}px`);
      }, { passive: true });
    }
    $$('.plan').forEach(p => p.addEventListener('pointermove', e => {
      const r = p.getBoundingClientRect();
      p.style.setProperty('--x', `${e.clientX - r.left}px`);
      p.style.setProperty('--y', `${e.clientY - r.top}px`);
    }, { passive: true }));
  })();

  /* =========================================================
     SERVICES: inline illustrations (every width, every pointer type)
     ========================================================= */
  (function services() {
    // each illustration loops only while it is on screen
    $$('.svc__illo .illo').forEach(il => watch(il, v => il.classList.toggle('is-playing', v)));

    // "Get a plan" → prefill the message + jump to the form
    $$('.svc__cta').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const msg = $('#f-msg');
      if (msg && !msg.value.trim()) msg.value = `I'm most interested in ${a.dataset.service}. `;
      goToForm();
    }));
  })();

  /* =========================================================
     WORK: pinned horizontal case track + per-card dashboards
     ========================================================= */
  function liveCase(card) {
    if (card.classList.contains('is-live')) return;
    card.classList.add('is-live');
    $$('.ccount', card).forEach(el => countUp(el, 1200, easeOutCubic));
  }
  (function cases() {
    const wrap = $('.cases');
    const track = $('.cases__track');
    const cards = $$('.case');
    if (!wrap || !track) return;
    const bar = $('.cases__bar i');
    const count = $('.cases__count b');
    const pinOK = () => S.vw >= 1024 && !RM;
    let pinned = false;
    const st = { top: 0, h: 0, dist: 0, x: 0, tx: 0, p: 0, idx: -1 };
    let cardGeo = [];

    function setup() {
      const want = pinOK();
      if (want !== pinned) {
        pinned = want;
        wrap.classList.toggle('is-pinned', pinned);
        if (!pinned) { wrap.style.height = ''; track.style.transform = ''; }
      }
      if (pinned) {
        st.dist = Math.max(0, track.scrollWidth - S.vw);
        wrap.style.height = `${S.vh + st.dist}px`;
        st.top = docTop(wrap);
        st.h = S.vh + st.dist;
        cardGeo = cards.map(c => ({ left: c.offsetLeft, w: c.offsetWidth }));
      }
    }
    const run = () => {
      if (!pinned) return false;
      st.p = clamp((S.y - st.top) / Math.max(1, st.h - S.vh), 0, 1);
      st.tx = -st.p * st.dist;
      st.x = lerp(st.x, st.tx, 0.1);
      if (Math.abs(st.x - st.tx) < 0.05) st.x = st.tx;
      track.style.transform = `translate3d(${st.x.toFixed(2)}px,0,0)`;
      if (bar) bar.style.transform = `scaleX(${st.p.toFixed(4)})`;
      cardGeo.forEach((g, i) => {
        const l = g.left + st.x, r = l + g.w;
        const vis = (Math.min(r, S.vw) - Math.max(l, 0)) / g.w;
        if (vis >= 0.4) liveCase(cards[i]);
      });
      const idx = Math.min(cards.length - 1, Math.round(st.p * (cards.length - 1)));
      if (idx !== st.idx && count) { st.idx = idx; count.textContent = String(idx + 1).padStart(2, '0'); }
      return st.x !== st.tx;
    };
    setup();
    fontsReady.then(setup);
    window.addEventListener('load', setup);
    onResize(setup);
    watch(wrap, v => (v ? addSub(run) : delSub(run)));

    // non-pinned (mobile / reduced motion): IO at 40%
    cards.forEach(c => {
      if (RM) { liveCase(c); return; }
      watch(c, v => { if (v && !pinned) liveCase(c); }, { threshold: 0.4 });
    });

    // keyboard: centre the card holding focus
    cards.forEach((c, i) => c.addEventListener('focusin', () => {
      if (!pinned || !cardGeo[i]) return;
      const target = cardGeo[i].left + cardGeo[i].w / 2 - S.vw / 2;
      const p = clamp(target / Math.max(1, st.dist), 0, 1);
      window.scrollTo({ top: st.top + p * (st.h - S.vh), behavior: 'auto' });
    }));
  })();

  /* =========================================================
     ROI CALCULATOR
     ========================================================= */
  const calcState = { summary: '', extra: 0, type: 'E-commerce', spend: 20000 };
  (function calculator() {
    const spend = $('#spend');
    const roas = $('#roas');
    if (!spend || !roas) return;
    const spendOut = $('#spendOut'), roasOut = $('#roasOut');
    const oToday = $('#outToday'), oProj = $('#outProj'), oRoas = $('#outRoas'), oExtra = $('#outExtra');
    const fToday = $('.cbar__fill--today'), fM8 = $('.cbar__fill--m8');
    const live = $('#calcLive');
    const radios = $$('input[name="btype"]');
    let touched = false;
    const shown = { today: 40000, proj: 54000, roas: 2.7, extra: 168000 };
    let lastExtra = 168000;
    let cancel = null;
    let liveT = 0;
    const r100 = v => Math.round(v / 100) * 100;

    function fill(input) {
      const min = +input.min, max = +input.max;
      input.style.setProperty('--fill', `${((+input.value - min) / (max - min)) * 100}%`);
    }
    function compute() {
      const s = +spend.value, r = +roas.value;
      const radio = radios.find(x => x.checked) || radios[0];
      // PLACEHOLDER model: category lift, tapered for accounts that already run a strong ROAS
      // (full lift up to 2x, ~half at 3.5x, 10% of it at 4.7x and above)
      const lift = parseFloat(radio.dataset.lift) * clamp((5 - r) / 3, 0.1, 1);
      const current = s * r;
      const projected = current * (1 + lift);
      return {
        s, r, type: radio.value,
        today: r100(current), proj: r100(projected),
        roas: Math.round((projected / s) * 10) / 10,
        extra: r100((projected - current) * 12),
        ratio: current / projected
      };
    }
    function paint(v) {
      oToday.textContent = `${USD.format(v.today)} / mo`;
      oProj.textContent = `${USD.format(v.proj)} / mo`;
      oRoas.textContent = `${v.roas.toFixed(1)}x`;
      oExtra.textContent = `+${USD.format(v.extra)}`;
    }
    function render(animate) {
      const c = compute();
      spendOut.textContent = `${USD.format(c.s)} / mo`;
      roasOut.textContent = `${c.r.toFixed(1)}x`;
      spend.setAttribute('aria-valuetext', `${USD.format(c.s)} per month`);
      roas.setAttribute('aria-valuetext', `${c.r.toFixed(1)}x`);
      fill(spend); fill(roas);
      fToday.style.transform = `scaleX(${c.ratio.toFixed(4)})`;
      fM8.style.transform = 'scaleX(1)';
      calcState.summary = `Spend ${USD.format(c.s)}/mo · ROAS ${c.r.toFixed(1)}x · ${c.type} · Est. +${USD.format(c.extra)}/yr`;
      calcState.extra = c.extra; calcState.type = c.type; calcState.spend = c.s;
      if (cancel) cancel();
      if (!animate || RM) {
        Object.assign(shown, { today: c.today, proj: c.proj, roas: c.roas, extra: c.extra });
        paint(shown);
      } else {
        const from = { ...shown };
        cancel = tween(450, easeOutCubic, p => {
          shown.today = from.today + (c.today - from.today) * p;
          shown.proj = from.proj + (c.proj - from.proj) * p;
          shown.roas = from.roas + (c.roas - from.roas) * p;
          shown.extra = from.extra + (c.extra - from.extra) * p;
          paint({ today: Math.round(shown.today), proj: Math.round(shown.proj), roas: shown.roas, extra: Math.round(shown.extra) });
        }, () => { cancel = null; });
      }
      if (c.extra > lastExtra * 1.1 && !RM) {
        oExtra.classList.remove('is-pulse'); void oExtra.offsetWidth; oExtra.classList.add('is-pulse');
      }
      lastExtra = c.extra;
      clearTimeout(liveT);
      // announce only changes the user made (never the self-demo)
      if (touched) liveT = setTimeout(() => {
        live.textContent = `Revenue from ads today ${USD.format(c.today)} per month. Projected with M8 ${USD.format(c.proj)} per month, ROAS ${c.roas.toFixed(1)}x. Extra revenue per year: ${USD.format(c.extra)}.`;
      }, 600);
    }
    [spend, roas].forEach(inp => inp.addEventListener('input', () => { touched = true; render(true); }));
    radios.forEach(r => r.addEventListener('change', () => { touched = true; render(true); }));
    fill(spend); fill(roas);
    render(false);

    // self-demo on first view
    let demoDone = false;
    if (!RM) {
      watch($('.calc'), (v) => {
        if (!v || touched || demoDone) return;
        demoDone = true;
        const from = 5000, to = 20000;
        tween(1200, easeInOutCubic, p => {
          if (touched) return;
          spend.value = String(Math.round((from + (to - from) * p) / 1000) * 1000);
          render(false);
        }, () => { if (!touched) { spend.value = '20000'; render(false); } });
      }, { threshold: 0.5 });
    }

    $('#calcCta').addEventListener('click', e => {
      e.preventDefault();
      const s = calcState.spend;
      const bucket = s < 10000 ? 'Under $10K' : s < 25000 ? '$10K – $25K' : s < 75000 ? '$25K – $75K' : '$75K+';
      const sel = $('#f-budget');
      if (sel) { sel.value = bucket; clearError(sel.closest('.field')); }
      const hidden = $('#f-calc');
      if (hidden) hidden.value = calcState.summary;
      const chip = $('#calcChip');
      if (chip) { chip.textContent = `Your estimate: +${USD.format(calcState.extra)}/yr · ${calcState.type}`; chip.hidden = false; }
      goToForm();
    });
  })();

  /* =========================================================
     PROCESS: scroll-drawn ∞ (desktop) / timeline (mobile)
     ========================================================= */
  (function process() {
    const sec = $('#process');
    if (!sec) return;
    const steps = $$('.step', sec);
    const list = $('.steps', sec);
    const loop = $('.loop', sec);
    const draw = $('.loop__draw', sec);
    const comet = $$('.loop__comet circle', sec);
    const dayEl = $('.loop__day b', sec);
    // very short viewports get the full-copy timeline instead of the pinned loop
    const pinOK = () => S.vw >= 1024 && S.vh >= 700 && !RM;
    let pinned = false;
    let L = 0;
    const st = { top: 0, h: 0, listTop: 0, listH: 0, stepTops: [] };
    const THR = [0.10, 0.30, 0.60, 0.80];

    function activate(i, on) {
      const s = steps[i];
      if (on && !s.classList.contains('is-active')) {
        s.classList.add('is-active', 'is-pop');
        setTimeout(() => s.classList.remove('is-pop'), 950);
      } else if (!on && s.classList.contains('is-active') && pinned) {
        s.classList.remove('is-active');
      }
    }
    if (RM) {
      steps.forEach(s => s.classList.add('is-active'));
      list.style.setProperty('--p', '1');
      return;
    }
    function setup() {
      const want = pinOK();
      if (want !== pinned) {
        pinned = want;
        sec.classList.toggle('is-pinned', pinned);
        steps.forEach(s => s.classList.remove('is-active'));
      }
      st.top = docTop(sec); st.h = sec.offsetHeight;
      st.listTop = docTop(list); st.listH = list.offsetHeight;
      st.stepTops = steps.map(s => docTop(s) - st.listTop);
      if (pinned && draw) {
        L = draw.getTotalLength();
        draw.style.strokeDasharray = `${L}`;
      }
    }
    const segDay = p => {
      if (p < 0.3) return Math.round((p / 0.3) * 7);
      if (p < 0.6) return Math.round(7 + ((p - 0.3) / 0.3) * 11);
      if (p < 0.8) return Math.round(18 + ((p - 0.6) / 0.2) * 12);
      return Math.round(30 + ((p - 0.8) / 0.15) * 8);
    };
    let lastDay = -1;
    const run = () => {
      if (pinned) {
        const p = clamp((S.y - st.top) / Math.max(1, st.h - S.vh), 0, 1);
        draw.style.strokeDashoffset = `${L * (1 - p)}`;
        comet.forEach((c, k) => {
          const idx = 3 - k; // c3..c0 order in DOM → trailing first
          const at = clamp(L * (p - idx * 0.015), 0, L);
          const pt = draw.getPointAtLength(at);
          c.setAttribute('cx', pt.x.toFixed(1)); c.setAttribute('cy', pt.y.toFixed(1));
        });
        steps.forEach((s, i) => activate(i, p >= THR[i]));
        const day = segDay(p);
        if (day !== lastDay && dayEl) { lastDay = day; dayEl.textContent = String(day); }
        loop.classList.toggle('is-inf', p > 0.95);
      } else {
        const rectTop = st.listTop - S.y;
        const p = clamp((S.vh * 0.7 - rectTop) / Math.max(1, st.listH), 0, 1);
        list.style.setProperty('--p', p.toFixed(4));
        steps.forEach((s, i) => {
          if (S.vw >= 900) { if (st.listTop + st.stepTops[i] - S.y < S.vh * 0.8) activate(i, true); }
          else if (p * st.listH >= st.stepTops[i] + 10) activate(i, true);
        });
      }
    };
    setup();
    fontsReady.then(setup);
    window.addEventListener('load', setup);
    onResize(setup);
    watch(sec, v => (v ? addSub(run) : delSub(run)));
  })();

  /* =========================================================
     TESTIMONIALS
     ========================================================= */
  (function testimonials() {
    const sec = $('#testimonials');
    const fig = $('.tst__fig');
    if (!sec || !fig) return;
    const quote = $('.tst__quote', fig);
    const qp = $('p', quote);
    const by = $('.tst__by', fig);
    const avatar = $('.avatar', by);
    const nm = $('.tst__name', by);
    const role = $('.tst__role', by);
    const cards = $$('.tcard');
    const countEl = $('.tst__count b');
    const barI = $('.tst__bar i');
    const controls = $('.tst__controls');
    const data = cards.map(c => ({
      // the big feature has its own decorative quote mark, so strip the typographic quotes here
      text: $('.tcard__q', c).textContent.trim().replace(/^[“"]\s*/, '').replace(/\s*[”"]$/, ''),
      name: $('.tcard__name', c).textContent,
      role: $('.tcard__role', c).textContent,
      ini: $('.avatar', c).textContent,
      tone: $('.avatar', c).dataset.tone || ''
    }));
    let cur = 0;
    let inView = false, hovered = false, focused = false;
    let userStopped = false;
    let timer = 0;
    const feature = $('.tst__feature');
    const playBtn = $('.tst__play');

    function syncCards() {
      cards.forEach((c, i) => { c.hidden = i === cur; });
      if (countEl) countEl.textContent = String(cur + 1).padStart(2, '0');
    }
    function setAvatar(q) { avatar.textContent = q.ini; avatar.dataset.tone = q.tone; }
    // user-initiated changes are announced; autoplay rotations are not (APG carousel pattern)
    function show(i, user) {
      i = (i + data.length) % data.length;
      if (i === cur) return;
      cur = i;
      const q = data[i];
      fig.setAttribute('aria-live', user ? 'polite' : 'off');
      syncCards();
      if (RM) {
        qp.textContent = q.text; nm.textContent = q.name; role.textContent = q.role; setAvatar(q);
        schedule();
        return;
      }
      quote.classList.add('is-out');
      setTimeout(() => {
        qp.textContent = '';
        q.text.split(' ').forEach((w, k) => {
          const o = d.createElement('span'); o.className = 'qw';
          const n = d.createElement('span'); n.textContent = w;
          n.style.transitionDelay = `${Math.min(k * 50, 600)}ms`;
          o.appendChild(n);
          qp.appendChild(o); qp.appendChild(d.createTextNode(' '));
        });
        nm.textContent = q.name; role.textContent = q.role; setAvatar(q);
        quote.classList.remove('is-out');
        quote.classList.add('is-pre'); by.classList.add('is-pre');
        void quote.offsetWidth;
        requestAnimationFrame(() => { quote.classList.remove('is-pre'); by.classList.remove('is-pre'); });
      }, 300);
      schedule();
    }
    function canRun() { return !motionOff() && !userStopped && inView && !hovered && !focused && !d.hidden; }
    function schedule() {
      clearTimeout(timer);
      if (barI) { barI.classList.remove('is-run'); void barI.offsetWidth; }
      if (!canRun()) return;
      if (barI) barI.classList.add('is-run');
      timer = setTimeout(() => show(cur + 1, false), 7000);
    }
    function setStopped(v) {
      userStopped = v;
      if (playBtn) {
        playBtn.dataset.playing = v ? 'false' : 'true';
        playBtn.setAttribute('aria-label', v ? 'Play testimonial autoplay' : 'Pause testimonial autoplay');
      }
      schedule();
    }
    syncCards();
    // once someone navigates by hand, autoplay stays off until they press play
    $$('.tst__btn[data-dir]').forEach(b => b.addEventListener('click', () => { setStopped(true); show(cur + parseInt(b.dataset.dir, 10), true); }));
    if (playBtn) playBtn.addEventListener('click', () => setStopped(!userStopped));
    cards.forEach((c, i) => $('.tcard__btn', c).addEventListener('click', () => {
      setStopped(true);
      show(i, true);
      if (S.vw < 900) feature.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' });
    }));
    controls.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); setStopped(true); show(cur + 1, true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setStopped(true); show(cur - 1, true); }
    });
    window.addEventListener('m8:motion', schedule);
    feature.addEventListener('pointerenter', () => { hovered = true; schedule(); });
    feature.addEventListener('pointerleave', () => { hovered = false; schedule(); });
    sec.addEventListener('focusin', () => { focused = true; schedule(); });
    sec.addEventListener('focusout', e => { if (!sec.contains(e.relatedTarget)) { focused = false; schedule(); } });
    d.addEventListener('visibilitychange', schedule);
    watch(feature, v => { inView = v; schedule(); }, { threshold: 0.3 });
  })();

  /* =========================================================
     PRICING: checks draw + price count-up
     ========================================================= */
  (function pricing() {
    const plans = $$('.plan');
    const wrap = $('.plans');
    if (!wrap) return;
    if (RM) { plans.forEach(p => p.classList.add('is-checked', 'is-settled')); return; }
    // each card fires on its own first view (stacked cards on mobile are far apart)
    const stacked = () => S.vw < 900;
    plans.forEach(p => {
      let io = null;
      io = watch(p, v => {
        if (!v || p.dataset.done) return;
        p.dataset.done = '1';
        if (io) io.disconnect();
        const delay = stacked() ? 0 : parseInt(getComputedStyle(p).getPropertyValue('--i') || '0', 10) * 120;
        setTimeout(() => {
          p.classList.add('is-checked');
          const pc = $('.pcount', p);
          if (pc) countUp(pc, 900, easeOutCubic);
        }, delay + 250);
        setTimeout(() => p.classList.add('is-settled'), 1400 + delay);
      }, { threshold: 0.3 });
    });
  })();

  /* =========================================================
     FAQ accordion
     ========================================================= */
  (function faq() {
    const items = $$('.faq__item');
    items.forEach(it => { if (it.open) it.classList.add('is-open'); });
    function close(it) {
      if (!it.open) return;
      it.classList.remove('is-open');
      if (RM) { it.open = false; return; }
      const a = $('.faq__a', it);
      let done = false;
      const fin = () => { if (done) return; done = true; if (!it.classList.contains('is-open')) it.open = false; a.removeEventListener('transitionend', onEnd); };
      const onEnd = e => { if (e.target === a) fin(); };
      a.addEventListener('transitionend', onEnd);
      setTimeout(fin, 500);
    }
    function open(it) {
      if (S.vw >= 1024) items.forEach(o => { if (o !== it) close(o); });
      it.open = true;
      if (RM) { it.classList.add('is-open'); return; }
      requestAnimationFrame(() => requestAnimationFrame(() => it.classList.add('is-open')));
    }
    items.forEach(it => {
      $('summary', it).addEventListener('click', e => {
        e.preventDefault();
        if (it.open && it.classList.contains('is-open')) close(it); else open(it);
      });
    });
  })();

  /* =========================================================
     CONTACT: giant fill + fit, form
     ========================================================= */
  function goToForm() {
    const card = $('#audit');
    if (!card) return;
    const form = $('#leadForm');
    const formUp = form && !form.hidden;
    // a tall card (phones) is aligned to its top so the title + first field are in view
    const tall = card.offsetHeight > S.vh - 120;
    card.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: tall ? 'start' : 'center' });
    setTimeout(() => {
      // mouse/keyboard users land in the first field; on touch we avoid popping the keyboard
      const target = formUp ? (FINE ? $('#f-name') : $('.form-title')) : $('.success__title');
      if (target) target.focus({ preventScroll: true });
    }, RM ? 0 : 750);
  }

  // every "#audit" CTA (nav, hero, cases, pricing, sticky bar, footer) lands on the form itself
  function setPlan(plan) {
    const hidden = $('#f-plan');
    const chip = $('#planChip');
    if (hidden) hidden.value = plan;
    if (chip) { chip.textContent = `Interested in: ${plan}`; chip.hidden = false; }
  }
  d.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target instanceof Element ? e.target.closest('a[href="#audit"]') : null;
    if (!a) return;
    e.preventDefault();
    if (a.dataset.plan) setPlan(a.dataset.plan);
    goToForm();
  });

  (function giant() {
    const g = $('.giant');
    const wrap = $('.giant-wrap');
    const fill = $('.giant__fill');
    const base = $('.giant__base');
    if (!g) return;
    function fit() {
      g.style.fontSize = '';
      const cs = getComputedStyle(wrap);
      const avail = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // stacked words on small screens: fit the widest word, otherwise the whole line
      const stacked = getComputedStyle($(".giant__w", base)).display === "block";
      const w = stacked ? Math.max(...$$(".giant__w", base).map(x => x.getBoundingClientRect().width)) : base.scrollWidth;
      const fs = parseFloat(getComputedStyle(g).fontSize);
      if (w > 0) g.style.fontSize = `${Math.floor(fs * (avail / w) * 0.995)}px`;
    }
    fontsReady.then(fit);
    onResize(fit);
    if (RM) return;
    let top = 0, h = 0;
    const measure = () => { top = docTop(g); h = g.offsetHeight; };
    fontsReady.then(measure); onResize(measure); window.addEventListener('load', measure);
    let lastP = -1;
    const run = () => {
      const rt = top - S.y;
      const end = S.vh * 0.4 - h / 2;
      const p = clamp((S.vh - rt) / Math.max(1, S.vh - end), 0, 1);
      const r = Math.round(p * 1000);
      if (r !== lastP) { lastP = r; fill.style.backgroundPositionX = `${100 - p * 100}%`; }
    };
    watch(g, v => { if (v) measure(); v ? addSub(run) : delSub(run); });
  })();

  function clearError(field) {
    if (!field) return;
    const input = $('.field__input', field);
    const err = $('.field__err', field);
    field.classList.remove('is-invalid');
    if (input) { input.setAttribute('aria-invalid', 'false'); input.removeAttribute('aria-describedby'); }
    if (err) err.hidden = true;
  }

  (function form() {
    const form = $('#leadForm');
    if (!form) return;
    const success = $('#formSuccess');
    const body = $('.form-card__body');
    const live = $('#formLive');
    const btn = $('.btn--submit', form);
    const rules = {
      name: v => v.trim().length > 0,
      email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
      website: v => /\w+\.\w{2,}/.test(v.trim()),
      budget: v => !!v
    };
    const fields = Object.keys(rules).map(n => form.elements[n]);
    const dirty = new Set();
    function validate(input, shake) {
      const ok = rules[input.name](input.value);
      const field = input.closest('.field');
      const err = $('.field__err', field);
      if (ok) { clearError(field); return true; }
      field.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', err.id); // error text is only linked once it exists
      err.hidden = false;
      if (shake && !RM) { field.classList.remove('is-shake'); void field.offsetWidth; field.classList.add('is-shake'); }
      return false;
    }
    fields.forEach(f => {
      f.addEventListener('input', () => { dirty.add(f.name); if (f.closest('.field').classList.contains('is-invalid')) validate(f, false); });
      f.addEventListener('change', () => { dirty.add(f.name); if (f.tagName === 'SELECT') validate(f, false); });
      f.addEventListener('blur', () => { if (dirty.has(f.name)) validate(f, false); });
    });
    $$('.field', form).forEach(f => f.addEventListener('animationend', () => f.classList.remove('is-shake')));

    // burst particles
    const burst = $('.burst');
    if (burst) {
      for (let i = 0; i < 12; i++) {
        const p = d.createElement('i');
        const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 60 + Math.random() * 60;
        p.style.setProperty('--tx', `${Math.cos(ang) * dist}px`);
        p.style.setProperty('--ty', `${Math.sin(ang) * dist}px`);
        p.style.setProperty('--r', `${Math.round(Math.random() * 360)}deg`);
        burst.appendChild(p);
      }
    }

    /* ---- delivery ----
       PLACEHOLDER: set data-endpoint on form#leadForm to a real endpoint (Formspree, HubSpot Forms,
       a Zapier/Make webhook or your own /api/lead). It receives the lead as a JSON POST and the
       success screen only shows after a 2xx response. With no endpoint, the visitor's email app
       opens with the request pre-filled, so a lead is never silently dropped. */
    const ENDPOINT = (form.dataset.endpoint || '').trim();
    const INBOX = (form.getAttribute('action') || '').replace(/^mailto:/i, '') || 'hello@m8company.com';
    const errBox = $('#formError');
    if (!ENDPOINT) console.warn('[M8] #leadForm has no data-endpoint: submissions fall back to mailto:' + INBOX + '. Wire a backend before launch.');
    const wait = ms => new Promise(r => setTimeout(r, ms));

    async function deliver(detail) {
      if (!ENDPOINT) {
        const lines = [
          `Name: ${detail.name}`, `Email: ${detail.email}`, `Website: ${detail.website}`,
          `Monthly ad spend: ${detail.budget}`,
          detail.plan && `Plan of interest: ${detail.plan}`,
          detail.calc_summary && `ROI calculator: ${detail.calc_summary}`
        ].filter(Boolean);
        if (detail.message) lines.push('', detail.message);
        const url = `mailto:${INBOX}?subject=${encodeURIComponent(`Free growth audit request: ${detail.website}`)}&body=${encodeURIComponent(lines.join('\n'))}`;
        window.location.href = url;
        return 'mailto';
      }
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(detail)
      });
      if (!res.ok) throw new Error(`Lead endpoint responded ${res.status}`);
      return 'sent';
    }
    function showError() {
      errBox.innerHTML = '';
      errBox.append('Something went wrong sending your request. Please try again, or email ');
      const a = d.createElement('a'); a.href = `mailto:${INBOX}`; a.textContent = INBOX;
      errBox.append(a, '.');
      errBox.hidden = false;
    }
    function showSuccess(mode, detail) {
      const first = detail.name.split(/\s+/)[0] || 'there';
      const site = detail.website.replace(/^https?:\/\//i, '').replace(/\/$/, '') || 'your site';
      if (mode === 'mailto') {
        $('#successTitle').textContent = 'ALMOST THERE.';
        $('#successBody').textContent = `Thanks, ${first}. Your email app should now be open with your audit request filled in. Hit send and a senior strategist will review ${site} and reply within one business day.`;
        $('#successAlt').textContent = `Email app didn't open? Write to ${INBOX}`;
      } else {
        $('#successBody').textContent = `Thanks, ${first}. A senior strategist will review ${site} and email you within one business day to lock in your audit time.`;
      }
      const h1 = body.offsetHeight;
      body.style.height = `${h1}px`;
      form.classList.add('is-leaving');
      setTimeout(() => {
        form.hidden = true;
        success.hidden = false;
        success.classList.add('is-pre');
        body.style.height = 'auto';
        const h2 = body.offsetHeight;
        body.style.height = `${h1}px`;
        void body.offsetHeight;
        body.style.height = `${h2}px`;
        requestAnimationFrame(() => {
          success.classList.remove('is-pre');
          if (!RM) { success.classList.add('is-anim'); if (burst) burst.classList.add('is-go'); }
        });
        setTimeout(() => { body.style.height = ''; }, 600);
        $('.success__title', success).focus({ preventScroll: true });
        live.textContent = mode === 'mailto'
          ? 'Almost there. Your email app should open with your request. Send it and we will reply within one business day.'
          : "You're in. We'll email you within one business day.";
      }, RM ? 0 : 300);
    }

    let sent = false;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (sent) return;
      errBox.hidden = true;
      const bad = fields.filter(f => !validate(f, true));
      if (bad.length) {
        live.textContent = '';
        setTimeout(() => { live.textContent = `Please fix ${bad.length} field${bad.length > 1 ? 's' : ''}.`; }, 50);
        bad[0].focus();
        return;
      }
      sent = true;
      const detail = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        website: form.elements.website.value.trim(),
        budget: form.elements.budget.value,
        plan: form.elements.plan ? form.elements.plan.value : '',
        message: form.elements.message.value.trim(),
        calc_summary: form.elements.calc_summary.value,
        page: window.location.href.split('#')[0]
      };
      const isBot = !!form.elements.company_fax.value;
      btn.classList.add('is-loading');
      btn.setAttribute('aria-disabled', 'true');
      live.textContent = 'Sending your request.';
      const t0 = performance.now();
      let mode = 'sent';
      if (!isBot) {
        try {
          mode = await deliver(detail);
        } catch (err) {
          console.error('[M8] lead delivery failed', err);
          sent = false;
          btn.classList.remove('is-loading');
          btn.removeAttribute('aria-disabled');
          live.textContent = '';
          showError();
          return;
        }
      }
      await wait(Math.max(0, 700 - (performance.now() - t0)));
      if (!isBot) window.dispatchEvent(new CustomEvent('m8:lead', { detail: { ...detail, delivery: mode } }));
      showSuccess(mode, detail);
    });
  })();

  /* =========================================================
     FOOTER: wordmark rise + 8 → ∞, back to top
     ========================================================= */
  (function footer() {
    const ft = $('#footer');
    const wm = $('.wordmark');
    const svg = $('.wordmark__svg');
    const top = $('.totop');
    if (top) top.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' });
      const m = $('#main');
      setTimeout(() => m.focus({ preventScroll: true }), RM ? 0 : 800);
    });
    if (!wm) return;
    if (RM) { wm.classList.add('is-inf'); return; }
    watch(wm, (v) => { if (v) { wm.classList.add('is-inf'); } }, { threshold: 0.6 });
    let fTop = 0, fH = 0, cur = 30;
    const measure = () => { fTop = docTop(ft); fH = ft.offsetHeight; };
    measure(); onResize(measure); window.addEventListener('load', measure); fontsReady.then(measure);
    const run = () => {
      const rt = fTop - S.y;
      const p = clamp((S.vh - rt) / Math.min(fH, S.vh), 0, 1);
      const target = (1 - p) * 30;
      if (Math.abs(cur - target) < 0.01) return false; // settled: let the ticker sleep
      cur = lerp(cur, target, 0.1);
      svg.style.transform = `translateY(${cur.toFixed(2)}%)`;
      return true;
    };
    watch(ft, v => (v ? addSub(run) : delSub(run)));
  })();

  /* =========================================================
     OFF-SCREEN GATING for infinite CSS loops
     (blobs, pulses, bobbing cards, the featured plan's spinning border)
     ========================================================= */
  (function gateLoops() {
    if (RM) return;
    [hero, $('#pricing'), $('#contact')].forEach(sec => {
      if (sec) watch(sec, v => sec.classList.toggle('is-offscreen', !v));
    });
  })();

  /* =========================================================
     MOBILE STICKY CTA
     ========================================================= */
  (function stickyCta() {
    const bar = $('.sticky-cta');
    if (!bar) return;
    const a = $('a', bar);
    const vis = { hero: true, contact: false, footer: false };
    function update() {
      const on = !vis.hero && !vis.contact && !vis.footer && S.vw < 768;
      bar.classList.toggle('is-on', on);
      bar.setAttribute('aria-hidden', on ? 'false' : 'true');
      a.tabIndex = on ? 0 : -1;
      d.body.classList.toggle('has-sticky', on);
    }
    watch(hero, v => { vis.hero = v; update(); });
    watch($('#contact'), v => { vis.contact = v; update(); });
    watch($('#footer'), v => { vis.footer = v; update(); });
    onResize(update);
  })();

})();
