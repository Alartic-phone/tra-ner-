/**
 * ALARTIC — Animations data-attribute driven.
 *
 * GSAP + ScrollTrigger auto-hébergés via npm (CDC §5.4, ADR 2026-05-12).
 * Bundlés par Vite dans /_astro/*.js — pas de CDN tiers.
 *
 * `prefers-reduced-motion` désactive tout. Le contenu reste lisible sans JS.
 *
 * ── Tuning 2026-05-12 (recherche bonnes pratiques modernes) ──
 * - Easings : cubic-bezier(0.16, 1, 0.3, 1) = ease-out-expo soft, standard
 *   de fait sur Awwwards. Décélération longue qui imite la physique d'un
 *   objet lourd qui s'arrête (vs power3.out plus "snappy UI").
 * - Durations 0.9-1.2s sur scroll reveal et hero (vs 0.6-0.85s avant
 *   "snappy UI" mais pas éditorial premium).
 * - Translations 40-56px (vs 24-32px) : plus de course = perception
 *   "lente même à duration similaire".
 *
 * ── Patterns ──
 *   <h1 data-anim="hero-stagger">…</h1>        — enfants au load en cascade
 *   <section data-anim="reveal">…</section>    — fade-up au scroll
 *   <div data-anim="stagger-children">…</div>  — enfants au scroll en cascade
 *   <img data-anim="parallax-y" data-anim-strength="50">  — translateY scrub
 *   <img data-anim="mask-reveal">              — clip-path rideau qui se lève
 *   <h1 data-anim="blur-reveal">…</h1>         — filter blur qui se dissipe
 *
 * Attributs optionnels :
 *   data-anim-delay="0.2"     — délai supplémentaire (s)
 *   data-anim-strength="50"   — pour parallax (px)
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* Easing standard Awwwards — décélération longue, "buttery" */
const EASE_OUT_EXPO_SOFT = "cubic-bezier(0.16, 1, 0.3, 1)";

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initAnimations(): void {
  if (REDUCED_MOTION) return;

  /* Cleanup des ScrollTriggers + tweens précédents en cas de navigation
   * client-side ou de bfcache restore. */
  ScrollTrigger.getAll().forEach((st) => st.kill());

  initHeroStagger();
  initRevealOnScroll();
  initStaggerChildrenOnScroll();
  initParallax();
  initMaskReveal();
  initBlurReveal();
  initScaleIn();
  initTypewriter();
  initHeroDevices();
  initCounters();

  /* Refresh ScrollTrigger après chargement complet (polices, images)
   * pour recalculer les positions correctement. */
  if (document.readyState === "complete") {
    ScrollTrigger.refresh();
  } else {
    window.addEventListener("load", () => ScrollTrigger.refresh(), { once: true });
  }
}

/* ───────── Auto-attachement aux events Astro ClientRouter ─────────
 * Le module est importé par chaque page, donc évalué une seule fois côté
 * navigateur (cache JS). Les listeners sont attachés au document qui persiste
 * entre les navigations. Pattern recommandé par la doc Astro.
 *
 * Couvre :
 *   - Premier chargement → astro:page-load fire après init du ClientRouter
 *   - Navigation client-side → astro:page-load fire après swap
 *   - bfcache restore (back/forward) → astro:page-load fire aussi
 */
document.addEventListener("astro:before-swap", () => {
  if (REDUCED_MOTION) return;
  /* Nettoyage agressif avant le swap : ScrollTriggers + tweens en cours. */
  ScrollTrigger.getAll().forEach((st) => st.kill());
  gsap.globalTimeline.clear();
});

document.addEventListener("astro:page-load", () => {
  initAnimations();
});

/* ───────── Hero stagger (au chargement de la page) ───────── */
function initHeroStagger(): void {
  const items = document.querySelectorAll<HTMLElement>('[data-anim="hero-stagger"]');
  if (items.length === 0) return;

  items.forEach((container) => {
    const children = Array.from(container.children) as HTMLElement[];
    const targets = children.length > 0 ? children : [container];

    gsap.set(targets, { opacity: 0, y: 48 });
    gsap.to(targets, {
      opacity: 1,
      y: 0,
      duration: 1.2,
      stagger: 0.12,
      ease: EASE_OUT_EXPO_SOFT,
      delay: 0.15,
    });
  });
}

/* ───────── Reveal au scroll ───────── */
function initRevealOnScroll(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-anim="reveal"]');

  elements.forEach((el) => {
    const delay = parseFloat(el.dataset.animDelay ?? "0");

    gsap.fromTo(
      el,
      { opacity: 0, y: 48 },
      {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: EASE_OUT_EXPO_SOFT,
        delay,
        scrollTrigger: {
          trigger: el,
          start: "top 88%",
          toggleActions: "play none none none",
        },
      },
    );
  });
}

/* ───────── Stagger children au scroll ───────── */
function initStaggerChildrenOnScroll(): void {
  const containers = document.querySelectorAll<HTMLElement>('[data-anim="stagger-children"]');

  containers.forEach((container) => {
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length === 0) return;

    gsap.fromTo(
      children,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.95,
        stagger: 0.1,
        ease: EASE_OUT_EXPO_SOFT,
        scrollTrigger: {
          trigger: container,
          start: "top 85%",
          toggleActions: "play none none none",
        },
      },
    );
  });
}

/* ───────── Parallax vertical scrub lissé ─────────
 * `scrub: 1` (vs `true` brut) lisse l'effet sur 1s — feel "buttery".
 */
function initParallax(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-anim="parallax-y"]');

  elements.forEach((el) => {
    const strength = parseFloat(el.dataset.animStrength ?? "50");

    gsap.fromTo(
      el,
      { y: -strength / 2 },
      {
        y: strength / 2,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top bottom",
          end: "bottom top",
          scrub: 1,
        },
      },
    );
  });
}

/* ───────── Mask reveal (clip-path rideau) ─────────
 * Le rectangle qui couvre l'image se rétracte vers le bas pour la dévoiler.
 * Très Awwwards, premium éditorial. Idéal pour photos produits / hero images.
 */
function initMaskReveal(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-anim="mask-reveal"]');

  elements.forEach((el) => {
    gsap.fromTo(
      el,
      { clipPath: "inset(0 0 100% 0)" },
      {
        clipPath: "inset(0 0 0% 0)",
        duration: 1.3,
        ease: EASE_OUT_EXPO_SOFT,
        scrollTrigger: {
          trigger: el,
          start: "top 85%",
          toggleActions: "play none none none",
        },
      },
    );
  });
}

/* ───────── Blur reveal (mise au point caméra) ─────────
 * filter: blur(12px) + opacity 0 → blur(0) + opacity 1.
 * Réservé au hero et 1-2 sections clés (coût GPU).
 */
function initBlurReveal(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-anim="blur-reveal"]');

  elements.forEach((el) => {
    const delay = parseFloat(el.dataset.animDelay ?? "0");

    gsap.fromTo(
      el,
      { opacity: 0, filter: "blur(14px)" },
      {
        opacity: 1,
        filter: "blur(0px)",
        duration: 1.4,
        ease: EASE_OUT_EXPO_SOFT,
        delay,
        scrollTrigger: {
          trigger: el,
          start: "top 88%",
          toggleActions: "play none none none",
        },
      },
    );
  });
}

/* ───────── Counter (incrémentation des chiffres) ─────────
 * Markup attendu :
 *   <span data-counter data-counter-to="100">100<span>%</span></span>
 * Le JS détecte le premier text node et l'anime de 0 vers la valeur cible.
 * Skip si la cible est 0 (pas d'animation utile, le texte reste tel quel).
 */
function initCounters(): void {
  const elements = document.querySelectorAll<HTMLElement>("[data-counter]");

  elements.forEach((el) => {
    const to = parseInt(el.dataset.counterTo ?? "0", 10);
    if (Number.isNaN(to) || to === 0) return;

    const textNode = el.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

    /* Démarre à 0 immédiatement pour éviter le flash de la valeur finale. */
    textNode.textContent = "0";

    const counter = { val: 0 };
    gsap.to(counter, {
      val: to,
      duration: 1.5,
      ease: EASE_OUT_EXPO_SOFT,
      onUpdate: () => {
        textNode.textContent = String(Math.round(counter.val));
      },
      scrollTrigger: {
        trigger: el,
        start: "top 88%",
        toggleActions: "play none none none",
      },
    });
  });
}

/* ───────── Hero devices (les 2 Pixels démarrent stackés puis se décalent) ─────────
 * Markup attendu (dans le hero) :
 *   <div data-anim="hero-devices">
 *     <img class="hero__device hero__device--rear" />
 *     <img class="hero__device hero__device--front" />
 *   </div>
 * Le wrapper passe en visibility:hidden via CSS pré-anim, on le rend visible
 * après le set initial pour éviter le flash. xPercent/yPercent sont gérés
 * par GSAP (override le transform CSS class de manière prévisible).
 */
function initHeroDevices(): void {
  const containers = document.querySelectorAll<HTMLElement>('[data-anim="hero-devices"]');

  containers.forEach((container) => {
    const rear = container.querySelector<HTMLElement>(".hero__device--rear");
    const front = container.querySelector<HTMLElement>(".hero__device--front");
    if (!rear || !front) return;

    /* Positions de référence */
    const REST = {
      rear: { xPercent: -28, rotation: -10 },
      front: { xPercent: 28, rotation: 6 },
    };
    const HOVER = {
      rear: { xPercent: -38, rotation: -14 },
      front: { xPercent: 38, rotation: 10 },
    };

    /* État initial : phones superposés au centre. */
    gsap.set([rear, front], { x: 0, rotation: 0 });
    gsap.set(container, { visibility: "visible" });

    /* Anime vers les positions de repos. */
    const tl = gsap.timeline({ delay: 0.5 });
    tl.to(rear, { ...REST.rear, duration: 1.4, ease: EASE_OUT_EXPO_SOFT });
    tl.to(front, { ...REST.front, duration: 1.4, ease: EASE_OUT_EXPO_SOFT }, "<0.15");

    /* Hover : décale un peu plus, retour smooth au mouseleave.
     * Activé seulement après la fin de l'animation d'entrée pour ne pas
     * interrompre. overwrite "auto" gère les hover/leave rapides. */
    let ready = false;
    tl.eventCallback("onComplete", () => {
      ready = true;
    });

    container.addEventListener("mouseenter", () => {
      if (!ready) return;
      gsap.to(rear, { ...HOVER.rear, duration: 0.5, ease: EASE_OUT_EXPO_SOFT, overwrite: "auto" });
      gsap.to(front, { ...HOVER.front, duration: 0.5, ease: EASE_OUT_EXPO_SOFT, overwrite: "auto" });
    });

    container.addEventListener("mouseleave", () => {
      if (!ready) return;
      gsap.to(rear, { ...REST.rear, duration: 0.5, ease: EASE_OUT_EXPO_SOFT, overwrite: "auto" });
      gsap.to(front, { ...REST.front, duration: 0.5, ease: EASE_OUT_EXPO_SOFT, overwrite: "auto" });
    });
  });
}

/* ───────── Scale-in (arrivée organique) ─────────
 * Combine un léger scale 0.94 → 1, opacity 0 → 1, et translateY 16 → 0.
 * Sensation d'arrivée avec présence, sans direction marquée. Pas de filter
 * blur (coût GPU et rendu pas pour tout le monde).
 */
function initScaleIn(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-anim="scale-in"]');

  elements.forEach((el) => {
    const delay = parseFloat(el.dataset.animDelay ?? "0");

    gsap.fromTo(
      el,
      { opacity: 0, scale: 0.94, y: 16 },
      {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 1.3,
        ease: EASE_OUT_EXPO_SOFT,
        delay,
        scrollTrigger: {
          trigger: el,
          start: "top 88%",
          toggleActions: "play none none none",
        },
      },
    );
  });
}

/* ───────── Typewriter (mot par mot) ─────────
 * Split le texte par mots, anime chaque mot en cascade rapide.
 * Donne l'effet d'écriture sans utiliser un cursor blink (premium éditorial).
 * À réserver aux citations / titres marquants — pas aux paragraphes longs.
 */
function initTypewriter(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-anim="typewriter"]');

  elements.forEach((el) => {
    /* Si déjà traité (cas navigation ClientRouter qui ré-exécute le script),
     * on reset le contenu original. */
    const originalText = el.dataset.typewriterText ?? el.textContent ?? "";
    el.dataset.typewriterText = originalText;
    el.textContent = "";

    const tokens = originalText.split(/(\s+)/);
    const spans: HTMLSpanElement[] = [];

    tokens.forEach((token) => {
      if (token.match(/^\s+$/)) {
        el.appendChild(document.createTextNode(token));
      } else if (token.length > 0) {
        const span = document.createElement("span");
        span.className = "typewriter-word";
        span.textContent = token;
        spans.push(span);
        el.appendChild(span);
      }
    });

    /* Cache les mots, rend le wrapper visible */
    gsap.set(spans, { opacity: 0, y: 8 });
    gsap.set(el, { opacity: 1 });

    gsap.to(spans, {
      opacity: 1,
      y: 0,
      duration: 0.5,
      stagger: 0.045,
      ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        toggleActions: "play none none none",
      },
    });
  });
}
