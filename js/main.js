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
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
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
    $$('[data-cv]').forEach(function (el) { el.setAttribute('href', 'docs/Joshua_Flores_CV_' + (next === 'en' ? 'EN' : 'ES') + '.pdf'); });
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

  /* ---------------- Fichas apiladas ---------------- */
  // Cada sección se queda fija al llegar a su final y la siguiente sube encima.
  // Las secciones más altas que la pantalla se recorren completas antes de quedarse fijas.
  // Las posiciones se calculan con el alto real de cada ficha (no dependen de transformaciones).
  var reelCovered = false;
  (function initStack() {
    if (!$('#trailer')) return;   // solo en la portada; los casos de estudio se leen de corrido
    var cards = $$('main > section, main > article');
    if (cards.length < 2) return;
    var tops = [], vh = innerHeight;
    cards.forEach(function (c, i) {
      c.classList.add('is-card');
      c.style.setProperty('--zi', i + 1);
      var sh = document.createElement('i'); sh.className = 'card-shade'; sh.setAttribute('aria-hidden', 'true');
      c.appendChild(sh); c._shade = sh;
    });
    doc.classList.add('stack-on');
    function measureStack() {
      vh = innerHeight;
      var y = $('main').offsetTop;
      cards.forEach(function (c, i) {
        tops[i] = y; y += c.offsetHeight;
        c.style.top = Math.min(0, vh - c.offsetHeight) + 'px';
      });
    }
    measureStack();
    function within(el, card) { var y = 0; while (el && el !== card) { y += el.offsetTop; el = el.offsetParent; } return y; }
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]'); if (!a) return;
      var el = document.getElementById(a.getAttribute('href').slice(1)); if (!el) return;
      var card = el.closest('.is-card'); if (!card) return;
      e.preventDefault();
      measureStack();
      var y = tops[cards.indexOf(card)] + (el === card ? 0 : within(el, card));
      if (lenis) lenis.scrollTo(y, { duration: 1.4 }); else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    });
    if (!hasGsap) { window.addEventListener('resize', measureStack); return; }
    ScrollTrigger.addEventListener('refreshInit', measureStack);
    cards.forEach(function (c, i) {
      if (!cards[i + 1]) return;
      // Inicio: la ficha siguiente aparece sobre la parte visible de la actual; fin: la cubre por completo
      var range = { start: function () { return tops[i + 1] - Math.min(c.offsetHeight, vh); }, end: function () { return tops[i + 1]; }, scrub: true, invalidateOnRefresh: true };
      // La capa se desenfoca y oscurece a la vez; solo se anima su opacidad (barato para la GPU)
      gsap.fromTo(c._shade, { opacity: 0 }, { opacity: 1, ease: 'none', scrollTrigger: range });
      // Totalmente cubierta: deja de pintarse (slideshows y gráficos escondidos no consumen)
      ScrollTrigger.create({ start: function () { return tops[i + 1] + 2; }, end: 'max', toggleClass: { targets: c, className: 'is-covered' } });
      if (c.id === 'trailer') {
        gsap.fromTo($('.showreel', c), { filter: 'blur(0px)' }, { filter: 'blur(18px)', ease: 'none', scrollTrigger: { start: range.start, end: range.end, scrub: true, invalidateOnRefresh: true } });
        ScrollTrigger.create({ start: function () { return tops[1]; }, end: 'max', onToggle: function (st) { reelCovered = st.isActive; if (window.__syncReel) window.__syncReel(); } });
      }
    });
    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  })();

  /* ---------------- Showreel (js/reel.js) ---------------- */
  var reelEl = $('#reel');
  if (reelEl && window.JFReel && hasGsap) (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
    var reel = window.JFReel.init(reelEl), userPaused = false, inView = false;
    var syncReel = function () { if (inView && !reelCovered && !userPaused) reel.play(); else reel.pause(); };
    window.__syncReel = syncReel;
    new IntersectionObserver(function (e) { inView = e[0].isIntersecting; syncReel(); }, { threshold: 0.3 }).observe(reelEl);
    var tbtn = $('#trailerToggle');
    tbtn.addEventListener('click', function () {
      userPaused = !userPaused;
      tbtn.setAttribute('aria-pressed', String(userPaused));
      $('use', tbtn).setAttribute('href', userPaused ? '#i-play' : '#i-pause');
      var es = userPaused ? 'Reproducir showreel' : 'Pausar showreel', en = userPaused ? 'Play showreel' : 'Pause showreel';
      tbtn.dataset.esAriaLabel = es; tbtn.dataset.enAriaLabel = en;
      tbtn.setAttribute('aria-label', lang === 'en' ? en : es);
      syncReel();
    });
    window.__reel = reel;
  });

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
  $$('.slides').forEach(function slideshow(root) {
    var slides = $$('.slide', root), infos = $$('.slide-info', root), bars = $$('.slides__bars i', root), count = $('.slides__count', root);
    var i = 0, DUR = parseFloat(root.dataset.dur || '2.5'), timer = null, visible = false, hovering = false, barTween = null;
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
    view.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    new IntersectionObserver(function (e) { visible = e[0].isIntersecting; run(); }, { threshold: 0.35 }).observe(root);
    show(0);
  });


  $$('.case-table tbody tr').forEach(function (tr) { tr.style.setProperty('--i', Array.prototype.indexOf.call(tr.parentNode.children, tr)); });

  /* ---------------- Gráficos vectoriales animados (Liga ADB) ---------------- */
  (function graphics() {
    var els = $$('[data-graphic]');
    if (!els.length || !hasGsap) return;
    $$('.case-table tbody tr').forEach(function (tr, k) { tr.style.setProperty('--i', Array.prototype.indexOf.call(tr.parentNode.children, tr)); });
    function hot(tl, list, at, step, hold) {
      list.forEach(function (el, k) {
        tl.call(function () { el.classList.add('is-hot'); }, null, at + k * step)
          .call(function () { el.classList.remove('is-hot'); }, null, at + k * step + (hold || step));
      });
    }
    var build = {
      pipeline: function (g) {
        var tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2, paused: true });
        var rows = $$('.lg-xr', g), frows = $$('.lg-fr', g), dot = $('.lg-link__dot', g);
        var horiz = window.matchMedia('(min-width: 700px)').matches;
        tl.set(frows, { opacity: 0, x: 18 }).set($$('.lg-c b', g), { scaleX: 0, transformOrigin: '0 50%' });
        tl.to($$('.lg-c b', g), { scaleX: 1, duration: 0.3, stagger: 0.04, ease: 'power2.out' }, 0.2);
        rows.forEach(function (r, k) {
          var at = 1.4 + k * 0.55;
          tl.call(function () { $$('.lg-c', r).forEach(function (c) { c.classList.add('is-hot'); }); }, null, at)
            .call(function () { $$('.lg-c', r).forEach(function (c) { c.classList.remove('is-hot'); }); }, null, at + 0.5)
            .fromTo(dot, horiz ? { left: '0%', top: '50%' } : { top: '0%', left: '50%' }, horiz ? { left: '100%', duration: 0.45, ease: 'power1.inOut' } : { top: '100%', duration: 0.45, ease: 'power1.inOut' }, at)
            .to(frows[k], { opacity: 1, x: 0, duration: 0.45, ease: 'expo.out' }, at + 0.4);
        });
        tl.to({}, { duration: 1.5 });
        return tl;
      },
      badges: function (g) {
        var tl = gsap.timeline({ repeat: -1, repeatDelay: 2.4, paused: true });
        var b = $$('.lg-badge', g);
        tl.fromTo(b, { rotationX: -70, opacity: 0, y: -10 }, { rotationX: 0, opacity: 1, y: 0, duration: 0.9, ease: 'back.out(1.6)', stagger: 0.18 }, 0)
          .fromTo($$('.lg-badge__name, .lg-badge__role', g), { scaleX: 0, transformOrigin: '50% 50%' }, { scaleX: 1, duration: 0.5, ease: 'expo.out', stagger: 0.06 }, 0.6)
          .fromTo($$('.lg-badge__code', g), { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'power2.out', stagger: 0.12 }, 1.0)
          .to(b, { y: -4, duration: 0.6, yoyo: true, repeat: 1, ease: 'sine.inOut', stagger: 0.1 }, 2.2);
        return tl;
      },
      layers: function (g) {
        var tl = gsap.timeline({ repeat: -1, repeatDelay: 1, paused: true });
        var rows = $$('.lg-ly', g), vals = $$('.lg-val', g);
        tl.set(vals, { opacity: 0, x: 12 });
        rows.forEach(function (r, k) {
          var at = 0.4 + k * 0.6;
          tl.call(function () { r.classList.add('is-hot'); }, null, at)
            .to(vals[k], { opacity: 1, x: 0, duration: 0.4, ease: 'expo.out' }, at + 0.1)
            .call(function () { r.classList.remove('is-hot'); }, null, at + 0.55);
        });
        tl.to({}, { duration: 1.8 });
        return tl;
      },
      flow: function (g) {
        var tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8, paused: true });
        var before = $$('.lg-lane--before .lg-st', g), after = $$('.lg-lane--after .lg-st', g), pulse = $('.lg-pulse', g);
        hot(tl, before, 0.3, 0.75);
        tl.fromTo(pulse, { left: '0%', opacity: 1 }, { left: '80%', duration: 1.6, ease: 'none' }, 4.3)
          .to(pulse, { opacity: 0, duration: 0.2 }, 5.9);
        hot(tl, after, 4.3, 0.32, 1.2);
        tl.to({}, { duration: 1.2 });
        return tl;
      }
    };
    els.forEach(function (g) {
      var make = build[g.dataset.graphic];
      if (!make) return;
      var tl = make(g);
      if (reduce) { tl.progress(1).pause(); return; }
      new IntersectionObserver(function (e) { if (e[0].isIntersecting) tl.play(); else tl.pause(); }, { threshold: 0.25 }).observe(g);
    });
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
