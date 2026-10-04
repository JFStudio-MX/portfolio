/* Joshua Flores · Portafolio
   Trailer, idioma, parallax, paneo de eventos, reveals, lightbox. */
(function () {
  'use strict';

  var doc = document.documentElement;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Sin GSAP no hay animación: mostrar todo de inmediato.
  if (!hasGsap) doc.classList.remove('js-motion', 'play-intro');
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

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

  function setLang(next, persist) {
    if (next !== 'es' && next !== 'en') next = 'es';
    lang = next;
    doc.lang = next;
    $$('[data-en], [data-en-html]').forEach(function (el) {
      if (el.dataset.es === undefined) el.dataset.es = el.innerHTML;
      el.innerHTML = next === 'en' ? (el.dataset.en || el.dataset.enHtml) : el.dataset.es;
    });
    $$('[data-en-aria-label]').forEach(function (el) {
      if (el.dataset.esAriaLabel === undefined) el.dataset.esAriaLabel = el.getAttribute('aria-label') || '';
      el.setAttribute('aria-label', next === 'en' ? el.dataset.enAriaLabel : el.dataset.esAriaLabel);
    });
    $$('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === next)); });
    document.title = META[next].title;
    var d = $('meta[name="description"]'); if (d) d.setAttribute('content', META[next].desc);
    var wa = $('#waLink'); if (wa) wa.href = 'https://wa.me/525527130635?text=' + encodeURIComponent(META[next].wa);
    if (persist) store.set('jf-lang', next);
    if (hasGsap) ScrollTrigger.refresh();
  }

  (function initLang() {
    var param = (location.search.match(/[?&]lang=(es|en)/) || [])[1];
    var saved = store.get('jf-lang');
    var browser = (navigator.language || 'es').toLowerCase().indexOf('en') === 0 ? 'en' : 'es';
    var initial = param || saved || browser;
    if (initial === 'en') setLang('en', false);
    $$('.lang button').forEach(function (b) {
      b.addEventListener('click', function () { setLang(b.dataset.lang, true); });
    });
  })();

  /* ---------------- Nav ---------------- */
  var nav = $('#nav');
  var sentinel = document.createElement('div');
  sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:48px;pointer-events:none';
  document.body.prepend(sentinel);
  new IntersectionObserver(function (e) {
    nav.classList.toggle('is-solid', !e[0].isIntersecting);
  }).observe(sentinel);

  var navLinks = $$('.nav__links a');
  var sectionObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var id = en.target.id;
      navLinks.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + id); });
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['trabajo', 'servicios', 'experiencia', 'contacto'].forEach(function (id) {
    var s = document.getElementById(id); if (s) sectionObs.observe(s);
  });

  // Menú móvil
  var menu = $('#menu'), menuBtn = $('#menuBtn');
  function toggleMenu(open) {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menuBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('is-locked', open);
    if (open) $('#menuClose').focus(); else menuBtn.focus();
  }
  menuBtn.addEventListener('click', function () { toggleMenu(true); });
  $('#menuClose').addEventListener('click', function () { toggleMenu(false); });
  $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { toggleMenu(false); }); });

  /* ---------------- Hero (entrada) ---------------- */
  function heroIn() {
    if (!hasGsap || reduceMQ.matches) return;
    var tl = gsap.timeline({ defaults: { ease: 'expo.out', duration: 1.1 } });
    tl.fromTo('.hero__img', { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, stagger: 0.12, clearProps: 'clipPath' }, 0)
      .from('.hero__img img', { scale: 1.25, duration: 1.8, stagger: 0.12 }, 0)
      .from('[data-hero="eyebrow"]', { y: 20, opacity: 0 }, 0.15)
      .from('[data-hero="name"]', { yPercent: 18, opacity: 0, duration: 1.3 }, 0.2)
      .from('[data-hero="sub"]', { y: 24, opacity: 0 }, 0.45)
      .from('[data-hero="ctas"] > *', { y: 24, opacity: 0, stagger: 0.08 }, 0.55);
  }

  /* ---------------- Trailer ---------------- */
  var intro = $('#intro');
  var introTl = null;

  function endIntro() {
    if (introTl) { introTl.kill(); introTl = null; }
    store.set('jf-intro-seen', '1');
    if (hasGsap) {
      gsap.fromTo(intro, { clipPath: 'inset(0% 0% 0% 0%)' }, {
        clipPath: 'inset(0% 0% 100% 0%)', duration: 0.8, ease: 'expo.inOut',
        onComplete: function () {
          intro.hidden = true;
          gsap.set(intro, { clearProps: 'clipPath,backgroundColor' });
          document.body.classList.remove('is-locked');
          doc.classList.remove('play-intro');
          ScrollTrigger.refresh();
        }
      });
      setTimeout(heroIn, 350);
    } else {
      intro.hidden = true;
      document.body.classList.remove('is-locked');
    }
  }

  function playIntro() {
    if (!hasGsap || reduceMQ.matches) return false;
    intro.hidden = false;
    document.body.classList.add('is-locked');
    window.scrollTo(0, 0);

    var marks = $$('.intro__frame .crop__m', intro);
    var regs = $$('.intro__reg', intro);
    var scenes = {};
    $$('.intro__scene', intro).forEach(function (s) { scenes[s.dataset.scene] = s; });
    var shots = $$('.intro__montage img', intro);
    var dot = $('.intro__dot', intro);

    gsap.set(intro, { clearProps: 'clipPath,backgroundColor' });
    gsap.set(Object.keys(scenes).map(function (k) { return scenes[k]; }), { autoAlpha: 0 });
    gsap.set(marks, { scale: 0, transformOrigin: '50% 50%' });
    marks.forEach(function (m) {
      // conserva el espejo de cada esquina
      var sx = m.classList.contains('crop__m--tr') || m.classList.contains('crop__m--br') ? -1 : 1;
      var sy = m.classList.contains('crop__m--bl') || m.classList.contains('crop__m--br') ? -1 : 1;
      m.dataset.sx = sx; m.dataset.sy = sy;
    });
    gsap.set(regs, { scale: 0, rotation: -180, autoAlpha: 0 });
    gsap.set('.intro__grid', { opacity: 0 });
    gsap.set('.intro__montage', { autoAlpha: 0 });
    gsap.set(shots, { opacity: 0 });
    gsap.set(dot, { scale: 0 });
    gsap.set('.intro__progress i', { scaleX: 0 });
    gsap.set('.sep__l--c', { x: -70, y: 0 });
    gsap.set('.sep__l--m', { x: 70, y: 10 });
    gsap.set('.sep__l--y', { x: 0, y: -46 });
    gsap.set('.intro__role', { autoAlpha: 0, y: 14 });
    gsap.set('.sep__w', { opacity: 0 });
    gsap.set('.sep__l', { opacity: 1 });

    var tl = gsap.timeline({ onComplete: endIntro });
    introTl = tl;
    var TOTAL = 8.4;
    tl.to('.intro__progress i', { scaleX: 1, duration: TOTAL, ease: 'none' }, 0);

    // 1. Marcas de corte, registro y retícula (exposed grid)
    marks.forEach(function (m) {
      tl.fromTo(m, { scaleX: 0, scaleY: 0 }, { scaleX: +m.dataset.sx, scaleY: +m.dataset.sy, duration: 0.6, ease: 'expo.out' }, 0.05);
    });
    tl.to(regs, { scale: 1, rotation: 0, autoAlpha: 1, duration: 0.8, ease: 'expo.out', stagger: 0.06 }, 0.1)
      .to('.intro__grid', { opacity: 1, duration: 0.35, ease: 'power2.out' }, 0.25)
      .to('.intro__grid', { opacity: 0.25, duration: 0.8 }, 0.6);

    // 2. Nombre en separaciones CMYK que entran en registro
    tl.to(scenes.name, { autoAlpha: 1, duration: 0.01 }, 0.7)
      .from('.sep__l', { opacity: 0, duration: 0.3, stagger: 0.07 }, 0.7)
      .to('.sep__l', { x: 0, y: 0, duration: 1.4, ease: 'power4.inOut' }, 0.85)
      .to(regs, { rotation: 90, duration: 1.4, ease: 'power4.inOut' }, 0.85)
      .to('.sep__w', { opacity: 1, duration: 0.25 }, 2.2)
      .set('.sep__l', { opacity: 0 }, 2.45)
      .to('.intro__role', { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out' }, 2.1)
      .to(scenes.name, { autoAlpha: 0, duration: 0.18 }, 3.05)
      .to('.intro__grid', { opacity: 0, duration: 0.3 }, 3.05);

    // 3. Cifras en cortes rápidos
    ['s1', 's2', 's3'].forEach(function (k, i) {
      var at = 3.2 + i * 0.68;
      tl.fromTo(scenes[k], { autoAlpha: 0, scale: 1.12 }, { autoAlpha: 1, scale: 1, duration: 0.42, ease: 'expo.out' }, at)
        .to(scenes[k], { autoAlpha: 0, duration: 0.12 }, at + 0.56);
    });

    // 4. Montaje dentro del formato
    var mStart = 5.3;
    tl.to('.intro__montage', { autoAlpha: 1, duration: 0.01 }, mStart);
    shots.forEach(function (img, i) {
      var at = mStart + i * 0.22;
      tl.fromTo(img, { opacity: 1, scale: 1.12 }, { scale: 1, duration: 0.5, ease: 'expo.out' }, at)
        .set(img, { opacity: 0 }, at + 0.22 + (i === shots.length - 1 ? 0.25 : 0));
    });

    // 5. El punto rojo aterriza y abre el sitio
    var dStart = mStart + shots.length * 0.22 + 0.3;
    tl.to('.intro__montage', { autoAlpha: 0, duration: 0.01 }, dStart)
      .to(dot, { scale: 1, duration: 0.45, ease: 'back.out(3)' }, dStart)
      .to(regs, { scale: 0, autoAlpha: 0, duration: 0.4, ease: 'expo.in' }, dStart)
      .to(marks, { opacity: 0, duration: 0.3 }, dStart + 0.1)
      .to(dot, { scale: 160, duration: 0.7, ease: 'expo.in' }, dStart + 0.55);

    return true;
  }

  $('#introSkip').addEventListener('click', endIntro);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !intro.hidden) endIntro();
  });
  $('#replayIntro').addEventListener('click', function () {
    if (!playIntro()) heroIn();
  });

  /* ---------------- Movimiento al hacer scroll ---------------- */
  function initScroll() {
    if (!hasGsap) return;
    var mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: no-preference)', function () {
      // Parallax del hero: cada capa a su profundidad
      $$('[data-speed]').forEach(function (el) {
        gsap.to(el, {
          yPercent: parseFloat(el.dataset.speed) * -100,
          ease: 'none',
          scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
        });
      });
      gsap.to('.hero__copy', {
        yPercent: -14, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
      });

      // Reveals
      ScrollTrigger.batch('[data-reveal]', {
        start: 'top 90%',
        once: true,
        onEnter: function (b) { gsap.to(b, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.07, overwrite: true }); }
      });
      $$('[data-mask]').forEach(function (el) {
        gsap.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, {
          clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top 85%', once: true }
        });
        var img = $('img', el);
        if (img) gsap.fromTo(img, { scale: 1.2 }, { scale: 1, duration: 1.8, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
      });
      // Marcas de corte que se dibujan al entrar
      $$('[data-crop]').forEach(function (box) {
        var ms = $$(':scope > .crop__m', box);
        ms.forEach(function (m) {
          var sx = m.classList.contains('crop__m--tr') || m.classList.contains('crop__m--br') ? -1 : 1;
          var sy = m.classList.contains('crop__m--bl') || m.classList.contains('crop__m--br') ? -1 : 1;
          gsap.fromTo(m, { scaleX: 0, scaleY: 0, transformOrigin: '50% 50%' }, {
            scaleX: sx, scaleY: sy, duration: 0.9, ease: 'expo.out', delay: 0.3,
            scrollTrigger: { trigger: box, start: 'top 85%', once: true }
          });
        });
      });

      // Contadores
      $$('[data-count]').forEach(function (el) {
        var end = parseInt(el.dataset.count, 10);
        var o = { v: 0 };
        el.textContent = '0';
        gsap.to(o, {
          v: end, duration: 1.6, ease: 'expo.out',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
          onUpdate: function () { el.textContent = Math.round(o.v); }
        });
      });
    });

    // Paneo horizontal de eventos (desktop)
    mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', function () {
      var pan = $('#pan'), chapter = $('#eventos'), track = $('.pan__track', pan);
      pan.classList.add('is-pinned');
      chapter.classList.add('is-pinning');
      var dist = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };
      var tween = gsap.to(track, {
        x: function () { return -dist(); },
        ease: 'none',
        scrollTrigger: {
          trigger: chapter, start: 'top top', end: function () { return '+=' + dist(); },
          pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1
        }
      });
      return function () {
        pan.classList.remove('is-pinned');
        chapter.classList.remove('is-pinning');
        tween.scrollTrigger && tween.scrollTrigger.kill();
        gsap.set(track, { clearProps: 'transform' });
      };
    });

    // Recalcular cuando cargan imágenes que cambian alturas
    window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  }

  // Botones del carrusel en móvil / sin movimiento
  $$('[data-pan]').forEach(function (b) {
    b.addEventListener('click', function () {
      var vp = $('.pan__viewport');
      var panel = $('.pan__panel');
      vp.scrollBy({ left: (panel ? panel.getBoundingClientRect().width + 16 : 300) * parseInt(b.dataset.pan, 10), behavior: reduceMQ.matches ? 'auto' : 'smooth' });
    });
  });

  /* ---------------- Lightbox ---------------- */
  var lb = $('#lb'), lbImg = $('#lbImg'), lbCap = $('#lbCap'), lbCount = $('#lbCount');
  var group = [], idx = 0, lastFocus = null;

  function srcOf(btn) { var i = $('img', btn); return i ? (i.getAttribute('src') || i.dataset.src) : ''; }
  function show(i) {
    idx = (i + group.length) % group.length;
    var btn = group[idx];
    var img = $('img', btn);
    lbImg.src = srcOf(btn);
    lbImg.alt = img ? img.alt : '';
    lbCap.textContent = btn.dataset.cap || '';
    lbCount.textContent = (idx + 1) + ' / ' + group.length;
  }
  function openLb(name, i) {
    group = $$('[data-lb="' + name + '"]');
    if (!group.length) return;
    lastFocus = document.activeElement;
    lb.hidden = false;
    document.body.classList.add('is-locked');
    show(i || 0);
    $('#lbClose').focus();
  }
  function closeLb() {
    lb.hidden = true;
    lbImg.removeAttribute('src');
    document.body.classList.remove('is-locked');
    if (lastFocus) lastFocus.focus();
  }
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
      if (e.key === 'Escape' && menu.classList.contains('is-open')) toggleMenu(false);
      return;
    }
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowRight') show(idx + 1);
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'Tab') { // mantener el foco dentro del visor
      var f = $$('button', lb), first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  var sx = null;
  lb.addEventListener('pointerdown', function (e) { sx = e.clientX; });
  lb.addEventListener('pointerup', function (e) {
    if (sx === null) return;
    var dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
  });

  /* ---------------- YouTube (fachada) ---------------- */
  $$('[data-yt]').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + b.dataset.yt + '?autoplay=1&rel=0';
      f.title = 'YouTube';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      b.replaceWith(f);
      f.parentNode.classList.add('yt');
    }, { once: true });
  });

  /* ---------------- Copiar correo ---------------- */
  var copyBtn = $('#copyMail');
  copyBtn.addEventListener('click', function () {
    var label = $('span', copyBtn);
    var done = function () {
      var prev = label.innerHTML;
      label.textContent = META[lang].copied;
      $('use', copyBtn).setAttribute('href', '#i-check');
      setTimeout(function () { label.innerHTML = prev; $('use', copyBtn).setAttribute('href', '#i-copy'); }, 2000);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(copyBtn.dataset.copy).then(done, function () { location.href = 'mailto:' + copyBtn.dataset.copy; });
    else location.href = 'mailto:' + copyBtn.dataset.copy;
  });

  /* ---------------- Arranque ---------------- */
  initScroll();
  if (doc.classList.contains('play-intro')) {
    if (!playIntro()) heroIn();
  } else {
    heroIn();
  }
})();
