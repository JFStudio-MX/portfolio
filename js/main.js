/* Joshua Flores · Portafolio
   Trailer de servicios, idioma, scroll suave, reveals, paneo de eventos,
   slideshow web y lightbox. Funciona igual en la portada y en los casos. */
(function () {
  'use strict';

  var doc = document.documentElement;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = reduceMQ.matches;

  // Sin GSAP no hay animación: mostrar todo de inmediato.
  if (!hasGsap) doc.classList.remove('js-motion');
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* ---------------- Scroll suave (Lenis) ---------------- */
  var lenis = null;
  if (window.Lenis && hasGsap && !reduce) {
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true, anchors: { offset: -64 } });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
  }
  function lock() { document.body.classList.add('is-locked'); if (lenis) lenis.stop(); }
  function unlock() { document.body.classList.remove('is-locked'); if (lenis) lenis.start(); }

  /* ---------------- Idioma ---------------- */
  var META = {
    es: {
      title: 'Joshua Flores · Diseñador gráfico y multimedia',
      desc: 'Diseñador gráfico y multimedia en Ciudad de México. E-commerce, imagen de producto con IA, gran formato para eventos como el Mundial FIFA 2026 y diseño web.',
      wa: 'Hola Joshua, vi tu portafolio y me gustaría platicar de un proyecto.',
      copied: 'Copiado'
    },
    en: {
      title: 'Joshua Flores · Graphic & multimedia designer',
      desc: 'Graphic and multimedia designer in Mexico City. E-commerce, AI product imagery, large format for events like the FIFA World Cup 2026, and web design.',
      wa: 'Hi Joshua, I saw your portfolio and would like to talk about a project.',
      copied: 'Copied'
    }
  };
  var lang = 'es';
  var isHome = !!$('#trailer');

  function setLang(next, persist) {
    if (next !== 'es' && next !== 'en') next = 'es';
    lang = next;
    doc.lang = next;
    $$('[data-en]').forEach(function (el) {
      if (el.dataset.es === undefined) el.dataset.es = el.innerHTML;
      el.innerHTML = next === 'en' ? el.dataset.en : el.dataset.es;
    });
    $$('[data-en-aria-label]').forEach(function (el) {
      if (el.dataset.esAriaLabel === undefined) el.dataset.esAriaLabel = el.getAttribute('aria-label') || '';
      el.setAttribute('aria-label', next === 'en' ? el.dataset.enAriaLabel : el.dataset.esAriaLabel);
    });
    $$('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === next)); });
    if (isHome) {
      document.title = META[next].title;
      var d = $('meta[name="description"]'); if (d) d.setAttribute('content', META[next].desc);
    }
    var wa = $('#waLink'); if (wa) wa.href = 'https://wa.me/525527130635?text=' + encodeURIComponent(META[next].wa);
    if (persist) store.set('jf-lang', next);
    if (hasGsap) ScrollTrigger.refresh();
  }

  (function initLang() {
    var param = (location.search.match(/[?&]lang=(es|en)/) || [])[1];
    var saved = store.get('jf-lang');
    var browser = (navigator.language || 'es').toLowerCase().indexOf('en') === 0 ? 'en' : 'es';
    if ((param || saved || browser) === 'en') setLang('en', false);
    $$('.lang button').forEach(function (b) {
      b.addEventListener('click', function () { setLang(b.dataset.lang, true); });
    });
  })();

  /* ---------------- Nav ---------------- */
  var nav = $('#nav');
  var sentinel = document.createElement('div');
  sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:48px;pointer-events:none';
  document.body.prepend(sentinel);
  new IntersectionObserver(function (e) { nav.classList.toggle('is-solid', !e[0].isIntersecting); }).observe(sentinel);

  function spy(links, targets, margin) {
    if (!links.length) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id); });
      });
    }, { rootMargin: margin });
    targets.forEach(function (t) { if (t) obs.observe(t); });
  }
  spy($$('.nav__links a[href^="#"]'), ['trabajo', 'servicios', 'experiencia', 'contacto'].map(function (id) { return document.getElementById(id); }), '-45% 0px -50% 0px');
  spy($$('.case-toc a'), $$('.chap'), '-30% 0px -60% 0px');

  // Menú móvil
  var menu = $('#menu'), menuBtn = $('#menuBtn');
  function toggleMenu(open) {
    if (!menu) return;
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) { lock(); $('#menuClose').focus(); } else { unlock(); menuBtn.focus(); }
  }
  if (menu) {
    menuBtn.addEventListener('click', function () { toggleMenu(true); });
    $('#menuClose').addEventListener('click', function () { toggleMenu(false); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { toggleMenu(false); }); });
  }

  /* ---------------- Reveals: aparecen al entrar, se desvanecen al salir ---------------- */
  // En los casos de estudio se marcan automáticamente los bloques de contenido.
  $$('.case-hero > *, .case-summary > div, .case-leadfig, .chap > *, .case-figs > *, .case-cards > *, .case-stats > div, .case-next, .case-cta').forEach(function (el) {
    if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', '');
  });
  if (doc.classList.contains('js-motion')) {
    var groups = new Map();
    $$('[data-reveal]').forEach(function (el) {
      var p = el.parentElement;
      var n = groups.get(p) || 0;
      groups.set(p, n + 1);
      el.style.setProperty('--d', Math.min(n, 6) * 70 + 'ms');
    });
    var rio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle('is-in', en.isIntersecting); });
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.08 });
    $$('[data-reveal]').forEach(function (el) { rio.observe(el); });
  }

  /* ---------------- Hero (entrada) ---------------- */
  function heroIn() {
    var items = $$('[data-hero]');
    if (!items.length) return;
    if (!hasGsap) { items.forEach(function (el) { el.style.opacity = 1; el.style.transform = 'none'; }); return; }
    if (reduce) { gsap.to(items, { opacity: 1, duration: 1.2, ease: 'power2.out', stagger: 0.1, delay: 0.1 }); return; }
    gsap.to(items, { opacity: 1, y: 0, duration: 1.4, ease: 'expo.out', stagger: 0.1, delay: 0.1 });
    gsap.fromTo('.hero__marks .crop__m', { opacity: 0 }, { opacity: 1, duration: 1.2, stagger: 0.08, delay: 0.5 });
  }

  /* ---------------- Trailer de servicios (en bucle) ---------------- */
  var intro = $('#intro');
  var trailerTl = null, userPaused = false, inView = false;

  function typeInto(el, tl, at, dur) {
    var full = el.textContent;
    var o = { n: 0 };
    tl.set(el, { textContent: '' }, at);
    tl.to(o, { n: full.length, duration: dur, ease: 'none', onUpdate: function () { el.textContent = full.slice(0, Math.round(o.n)); } }, at);
  }
  function countUp(el, tl, at, dur) {
    var end = parseFloat(el.dataset.tvCount || '0');
    var o = { v: 0 };
    tl.set(el, { textContent: '0' }, at);
    tl.to(o, { v: end, duration: dur, ease: 'expo.out', onUpdate: function () { el.textContent = Math.round(o.v); } }, at);
  }

  function buildTrailer() {
    var q = function (s) { return $(s, intro); };
    var qa = function (s) { return $$(s, intro); };
    var regs = qa('.intro__reg');
    var wipe = q('.tv-wipe');
    var sc = {};
    qa('[data-scene]').forEach(function (s) { sc[s.dataset.scene] = s; });
    var layers = qa('.sep__l');
    var SPLIT = [{ x: -70, y: 0 }, { x: 70, y: 10 }, { x: 0, y: -46 }];

    // Estado inicial = estado final: el nombre separado en tintas CMYK.
    gsap.set(Object.keys(sc).map(function (k) { return sc[k]; }), { autoAlpha: 0 });
    gsap.set(sc.name, { autoAlpha: 1 });
    gsap.set(q('.intro__grid'), { opacity: 0.18 });
    gsap.set(wipe, { scaleX: 0, transformOrigin: '0% 50%' });
    layers.forEach(function (l, k) { gsap.set(l, { x: SPLIT[k].x, y: SPLIT[k].y, opacity: 1 }); });
    gsap.set(q('.sep__w'), { opacity: 0 });
    gsap.set($('.intro__role', sc.name), { autoAlpha: 0, y: 14 });

    var tl = gsap.timeline({ repeat: -1, paused: true });

    // ---- Nombre: las tintas entran en registro
    tl.to(layers, { x: 0, y: 0, duration: 1.3, ease: 'power4.inOut' }, 0.1)
      .to(regs, { rotation: '+=90', duration: 1.3, ease: 'power4.inOut' }, 0.1)
      .to(q('.sep__w'), { opacity: 1, duration: 0.25 }, 1.3)
      .to(layers, { opacity: 0, duration: 0.01 }, 1.55)
      .to($('.intro__role', sc.name), { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out' }, 1.35);

    var prev = sc.name;
    function cut(to, at) {
      var from = prev;
      tl.set(wipe, { transformOrigin: '0% 50%' }, at)
        .to(wipe, { scaleX: 1, duration: 0.3, ease: 'power3.in' }, at)
        .set(from, { autoAlpha: 0 }, at + 0.3)
        .set(to, { autoAlpha: 1 }, at + 0.3)
        .set(wipe, { transformOrigin: '100% 50%' }, at + 0.3)
        .to(wipe, { scaleX: 0, duration: 0.38, ease: 'power3.out' }, at + 0.3);
      prev = to;
      return at + 0.3;
    }
    function titleIn(scene, at) {
      tl.fromTo($('.tv__num', scene), { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.6, ease: 'expo.out' }, at)
        .fromTo($('.tv__title .display', scene), { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out' }, at + 0.05);
    }

    var STEP = 2.3, S = 2.6, s;
    // 01 · IA
    s = cut(sc.ai, S);
    titleIn(sc.ai, s);
    tl.fromTo($('.tv-prompt', sc.ai), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out' }, s);
    typeInto($('.tv-type', sc.ai), tl, s + 0.1, 0.75);
    tl.fromTo($('.tv-ai__frame img', sc.ai), { filter: 'blur(22px) grayscale(1) brightness(.5)', scale: 1.12 }, { filter: 'blur(0px) grayscale(0) brightness(1)', scale: 1, duration: 1.1, ease: 'power2.out' }, s + 0.75)
      .fromTo($('.tv-scan', sc.ai), { top: '0%', opacity: 1 }, { top: '100%', duration: 1.0, ease: 'power1.inOut' }, s + 0.75)
      .to($('.tv-scan', sc.ai), { opacity: 0, duration: 0.2 }, s + 1.75);

    // 02 · E-commerce
    s = cut(sc.ecom, S + STEP);
    titleIn(sc.ecom, s);
    var OX = [-160, 40, 180, -140, 60, 200], OY = [-120, -180, -90, 140, 190, 120], OR = [-12, 6, 14, -8, 10, -6];
    qa('.tv-grid img').forEach(function (im, k) {
      tl.fromTo(im, { opacity: 0, scale: 0.7, x: OX[k], y: OY[k], rotation: OR[k] }, { opacity: 1, scale: 1, x: 0, y: 0, rotation: 0, duration: 0.8, ease: 'expo.out' }, s + 0.05 + k * 0.07);
    });
    countUp($('[data-tv-count]', sc.ecom), tl, s + 0.3, 1.3);
    tl.fromTo($('.tv__meta', sc.ecom), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, s + 0.25);

    // 03 · Gran formato
    s = cut(sc.events, S + STEP * 2);
    titleIn(sc.events, s);
    tl.fromTo($('.tv-banner__strip', sc.events), { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: 'power3.inOut' }, s + 0.05)
      .fromTo($('.tv-banner__strip img', sc.events), { scale: 1.2 }, { scale: 1, duration: 1.8, ease: 'power2.out' }, s + 0.05)
      .fromTo($('.tv-ruler__line', sc.events), { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: 'power3.inOut' }, s + 0.2);
    countUp($('[data-tv-count]', sc.events), tl, s + 0.2, 1.3);

    // 04 · Video
    s = cut(sc.video, S + STEP * 3);
    titleIn(sc.video, s);
    var tc = $('.tv-tc', sc.video);
    tl.fromTo($('.tv-phone', sc.video), { opacity: 0, scale: 0.86 }, { opacity: 1, scale: 1, duration: 0.8, ease: 'expo.out' }, s)
      .fromTo($('.tv-phone img', sc.video), { scale: 1.18 }, { scale: 1, duration: 2, ease: 'none' }, s)
      .fromTo(qa('.tv-clip'), { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'expo.out', stagger: 0.1 }, s + 0.15)
      .fromTo($('.tv-playhead', sc.video), { left: '0%' }, { left: '100%', duration: 1.7, ease: 'none' }, s + 0.35);
    (function () {
      var o = { f: 0 };
      tl.to(o, { f: 15 * 24, duration: 1.7, ease: 'none', onUpdate: function () {
        var f = Math.round(o.f), sec = Math.floor(f / 24), fr = f % 24;
        tc.textContent = '00:' + (sec < 10 ? '0' : '') + sec + ':' + (fr < 10 ? '0' : '') + fr;
      } }, s + 0.35);
    })();

    // 05 · Web
    s = cut(sc.web, S + STEP * 4);
    titleIn(sc.web, s);
    tl.fromTo($('.tv-browser', sc.web), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' }, s);
    typeInto($('.tv-url', sc.web), tl, s + 0.15, 0.6);
    tl.fromTo($('.tv-browser__view img', sc.web), { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 1.2, ease: 'expo.out' }, s + 0.7);

    // ---- Regreso al nombre; las tintas se separan y conectan con el inicio del bucle
    s = cut(sc.name, S + STEP * 5);
    tl.set(layers, { opacity: 0 }, s - 0.01)
      .set(q('.sep__w'), { opacity: 1 }, s - 0.01)
      .set($('.intro__role', sc.name), { autoAlpha: 1, y: 0 }, s - 0.01)
      .to($('.intro__role', sc.name), { autoAlpha: 0, y: 14, duration: 0.5 }, s + 1.1)
      .set(layers, { opacity: 1 }, s + 1.2)
      .to(q('.sep__w'), { opacity: 0, duration: 0.25 }, s + 1.2);
    layers.forEach(function (l, k) { tl.to(l, { x: SPLIT[k].x, y: SPLIT[k].y, duration: 1.1, ease: 'power4.inOut' }, s + 1.25); });
    tl.to(regs, { rotation: '-=90', duration: 1.1, ease: 'power4.inOut' }, s + 1.25);
    tl.to({}, { duration: 0.15 }, s + 2.35);

    tl.fromTo(q('.intro__progress i'), { scaleX: 0 }, { scaleX: 1, duration: tl.duration(), ease: 'none' }, 0);
    return tl;
  }

  function syncTrailer() {
    if (!trailerTl) return;
    if (inView && !userPaused) trailerTl.play(); else trailerTl.pause();
  }

  if (intro && hasGsap) {
    trailerTl = buildTrailer();
    new IntersectionObserver(function (e) { inView = e[0].isIntersecting; syncTrailer(); }, { threshold: 0.35 }).observe(intro);
    var tbtn = $('#trailerToggle');
    tbtn.addEventListener('click', function () {
      userPaused = !userPaused;
      tbtn.setAttribute('aria-pressed', String(userPaused));
      $('use', tbtn).setAttribute('href', userPaused ? '#i-play' : '#i-pause');
      var es = userPaused ? 'Reproducir trailer' : 'Pausar trailer', en = userPaused ? 'Play trailer' : 'Pause trailer';
      tbtn.dataset.esAriaLabel = es; tbtn.dataset.enAriaLabel = en;
      tbtn.setAttribute('aria-label', lang === 'en' ? en : es);
      syncTrailer();
    });
  }

  /* ---------------- Scroll: contadores y paneo ---------------- */
  function initScroll() {
    if (!hasGsap) return;
    var mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', function () {
      $$('[data-count]').forEach(function (el) {
        var end = parseInt(el.dataset.count, 10), o = { v: 0 };
        el.textContent = '0';
        gsap.to(o, {
          v: end, duration: 1.8, ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          onUpdate: function () { el.textContent = Math.round(o.v); }
        });
      });
    });
    if ($('#pan')) mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', function () {
      var pan = $('#pan'), chapter = $('#eventos'), track = $('.pan__track', pan);
      pan.classList.add('is-pinned');
      chapter.classList.add('is-pinning');
      var dist = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };
      var tween = gsap.to(track, {
        x: function () { return -dist(); }, ease: 'none',
        scrollTrigger: { trigger: chapter, start: 'top top', end: function () { return '+=' + dist(); }, pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 }
      });
      return function () {
        pan.classList.remove('is-pinned'); chapter.classList.remove('is-pinning');
        if (tween.scrollTrigger) tween.scrollTrigger.kill();
        gsap.set(track, { clearProps: 'transform' });
      };
    });
    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  }

  $$('[data-pan]').forEach(function (b) {
    b.addEventListener('click', function () {
      var vp = $('.pan__viewport'), panel = $('.pan__panel');
      vp.scrollBy({ left: (panel ? panel.getBoundingClientRect().width + 16 : 300) * parseInt(b.dataset.pan, 10), behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  /* ---------------- Slideshow de sitios web ---------------- */
  (function slideshow() {
    var root = $('#slides');
    if (!root) return;
    var slides = $$('.slide', root), infos = $$('.slide-info', root), bars = $$('.slides__bars i', root), count = $('.slides__count', root);
    var i = 0, DUR = 6, timer = null, visible = false, hovering = false, barTween = null;
    function show(n, user) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); s.setAttribute('aria-hidden', String(k !== i)); s.tabIndex = k === i ? 0 : -1; });
      infos.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      bars.forEach(function (b, k) { b.classList.toggle('is-done', k < i); var f = $('b', b); if (hasGsap) gsap.set(f, { scaleX: k < i ? 1 : 0 }); });
      count.textContent = '0' + (i + 1) + ' / 0' + slides.length;
      run();
    }
    function run() {
      if (barTween) barTween.kill();
      clearTimeout(timer);
      if (reduce || !visible || hovering) return;
      var f = $('b', bars[i]);
      if (hasGsap) barTween = gsap.fromTo(f, { scaleX: 0 }, { scaleX: 1, duration: DUR, ease: 'none', onComplete: function () { show(i + 1); } });
      else timer = setTimeout(function () { show(i + 1); }, DUR * 1000);
    }
    $$('[data-slide]', root).forEach(function (b) { b.addEventListener('click', function () { show(i + parseInt(b.dataset.slide, 10), true); }); });
    var view = $('.slides__view', root);
    view.addEventListener('mouseenter', function () { hovering = true; run(); });
    view.addEventListener('mouseleave', function () { hovering = false; run(); });
    var sx = null, moved = false;
    view.addEventListener('pointerdown', function (e) { sx = e.clientX; moved = false; });
    view.addEventListener('pointerup', function (e) {
      if (sx === null) return;
      var dx = e.clientX - sx; sx = null;
      if (Math.abs(dx) > 40) { moved = true; show(i + (dx < 0 ? 1 : -1), true); }
    });
    view.addEventListener('click', function (e) { if (moved) { e.preventDefault(); moved = false; } }, true);
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; run(); }, { threshold: 0.35 }).observe(root);
    show(0);
  })();

  /* ---------------- Lightbox ---------------- */
  var lb = $('#lb'), lbImg = $('#lbImg'), lbCap = $('#lbCap'), lbCount = $('#lbCount');
  if (lb) {
    var group = [], idx = 0, lastFocus = null;
    var srcOf = function (btn) { var im = $('img', btn); return im ? (im.getAttribute('src') || im.dataset.src) : ''; };
    var show = function (n) {
      idx = (n + group.length) % group.length;
      var btn = group[idx], im = $('img', btn);
      lbImg.style.opacity = 0;
      lbImg.onload = function () { lbImg.style.transition = 'opacity .5s'; lbImg.style.opacity = 1; };
      lbImg.src = srcOf(btn);
      lbImg.alt = im ? im.alt : '';
      lbCap.textContent = btn.dataset.cap || '';
      lbCount.textContent = (idx + 1) + ' / ' + group.length;
    };
    var openLb = function (name, n) {
      group = $$('[data-lb="' + name + '"]');
      if (!group.length) return;
      lastFocus = document.activeElement;
      lb.hidden = false;
      lock();
      show(n || 0);
      $('#lbClose').focus();
    };
    var closeLb = function () {
      lb.hidden = true;
      lbImg.removeAttribute('src');
      unlock();
      if (lastFocus) lastFocus.focus();
    };
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-lb]');
      if (t) { var name = t.dataset.lb; openLb(name, $$('[data-lb="' + name + '"]').indexOf(t)); return; }
      var o = e.target.closest('[data-lb-open]');
      if (o) openLb(o.dataset.lbOpen, parseInt(o.dataset.lbIndex || '0', 10));
    });
    $('#lbClose').addEventListener('click', closeLb);
    $('#lbPrev').addEventListener('click', function () { show(idx - 1); });
    $('#lbNext').addEventListener('click', function () { show(idx + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb__stage')) closeLb(); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) {
        if (e.key === 'Escape' && menu && menu.classList.contains('is-open')) toggleMenu(false);
        return;
      }
      if (e.key === 'Escape') closeLb();
      if (e.key === 'ArrowRight') show(idx + 1);
      if (e.key === 'ArrowLeft') show(idx - 1);
      if (e.key === 'Tab') {
        var f = $$('button', lb), first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    var px = null;
    lb.addEventListener('pointerdown', function (e) { px = e.clientX; });
    lb.addEventListener('pointerup', function (e) {
      if (px === null) return;
      var dx = e.clientX - px; px = null;
      if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
    });
  }

  /* ---------------- Copiar correo ---------------- */
  var copyBtn = $('#copyMail');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var label = $('span', copyBtn);
    var done = function () {
      var prevHtml = label.innerHTML;
      label.textContent = META[lang].copied;
      $('use', copyBtn).setAttribute('href', '#i-check');
      setTimeout(function () { label.innerHTML = prevHtml; $('use', copyBtn).setAttribute('href', '#i-copy'); }, 2000);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(copyBtn.dataset.copy).then(done, function () { location.href = 'mailto:' + copyBtn.dataset.copy; });
    else location.href = 'mailto:' + copyBtn.dataset.copy;
  });

  /* ---------------- Arranque ---------------- */
  initScroll();
  heroIn();
})();
