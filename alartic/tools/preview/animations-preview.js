/**
 * Animations — version de prévisualisation.
 *
 * Le fichier de production (`src/scripts/animations.ts`) s'appuie sur GSAP +
 * ScrollTrigger, installés via npm. Le registre npm étant injoignable dans cet
 * environnement, cette implémentation reproduit les mêmes motifs
 * (`data-anim="…"`) en CSS/IntersectionObserver, afin que la mise en page et le
 * rythme visuel restent représentatifs.
 *
 * Les états initiaux (`opacity: 0`, etc.) sont posés par `global.css` : sans ce
 * script, le contenu resterait invisible.
 */

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const setTransition = (el, props, duration, delay) => {
  el.style.transition = props
    .map((p) => `${p} ${duration}s ${EASE} ${delay}s`)
    .join(", ");
};

/** Applique l'état final d'un motif d'animation. */
function reveal(el, kind, delay = 0) {
  switch (kind) {
    case "reveal":
    case "hero-stagger":
    case "stagger-children":
    case "typewriter":
      setTransition(el, ["opacity", "transform"], 0.95, delay);
      el.style.opacity = "1";
      el.style.transform = "none";
      break;
    case "mask-reveal":
      setTransition(el, ["clip-path"], 1.1, delay);
      el.style.clipPath = "inset(0 0 0% 0)";
      break;
    case "blur-reveal":
      setTransition(el, ["opacity", "filter"], 1.1, delay);
      el.style.opacity = "1";
      el.style.filter = "blur(0px)";
      break;
    case "scale-in":
      setTransition(el, ["opacity", "transform"], 0.95, delay);
      el.style.opacity = "1";
      el.style.transform = "none";
      break;
    case "hero-devices":
      el.style.visibility = "visible";
      setTransition(el, ["opacity", "transform"], 1.1, delay);
      el.style.opacity = "1";
      el.style.transform = "none";
      break;
    default:
      el.style.opacity = "1";
  }
}

/** Position de départ, appliquée avant la transition. */
function prime(el, kind) {
  if (kind === "reveal" || kind === "stagger-children" || kind === "hero-stagger") {
    el.style.transform = "translateY(44px)";
  } else if (kind === "scale-in") {
    el.style.transform = "scale(0.94) translateY(16px)";
  } else if (kind === "hero-devices") {
    el.style.transform = "translateY(56px)";
  }
}

function observe(el, run) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        run();
        io.disconnect();
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.01 },
  );
  io.observe(el);
}

function initCounters() {
  document.querySelectorAll("[data-counter]").forEach((el) => {
    const target = Number(el.dataset.counter ?? el.textContent ?? "0");
    if (!Number.isFinite(target) || target === 0) return;
    if (REDUCED) { el.textContent = String(target); return; }

    observe(el, () => {
      const duration = 1400;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = String(Math.round(target * eased));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });
}

function initParallax() {
  const items = [...document.querySelectorAll('[data-anim="parallax-y"]')];
  if (!items.length || REDUCED) return;

  const update = () => {
    const vh = window.innerHeight;
    for (const el of items) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > vh) continue;
      const strength = Number(el.dataset.animStrength ?? 50);
      const progress = (rect.top + rect.height / 2 - vh / 2) / vh;
      el.style.transform = `translate3d(0, ${(-progress * strength).toFixed(1)}px, 0)`;
    }
    requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

function initTypewriter() {
  document.querySelectorAll('[data-anim="typewriter"]').forEach((el) => {
    const original = el.dataset.typewriterText ?? el.textContent ?? "";
    el.dataset.typewriterText = original;

    if (REDUCED) { el.style.opacity = "1"; return; }

    el.textContent = "";
    const words = [];
    for (const token of original.split(/(\s+)/)) {
      if (/^\s+$/.test(token)) {
        el.appendChild(document.createTextNode(token));
      } else if (token) {
        const span = document.createElement("span");
        span.className = "typewriter-word";
        span.textContent = token;
        span.style.opacity = "0";
        span.style.transform = "translateY(8px)";
        el.appendChild(span);
        words.push(span);
      }
    }
    el.style.opacity = "1";

    observe(el, () => {
      words.forEach((span, i) => {
        setTransition(span, ["opacity", "transform"], 0.5, i * 0.045);
        span.style.opacity = "1";
        span.style.transform = "none";
      });
    });
  });
}

export function initAnimations() {
  if (REDUCED) {
    document.querySelectorAll("[data-anim]").forEach((el) => {
      el.style.opacity = "1";
      el.style.visibility = "visible";
      el.style.clipPath = "none";
      el.style.filter = "none";
      el.style.transform = "none";
      el.querySelectorAll(":scope > *").forEach((child) => { child.style.opacity = "1"; });
    });
    initCounters();
    return;
  }

  /* Cascade au chargement */
  document.querySelectorAll('[data-anim="hero-stagger"]').forEach((el) => {
    [...el.children].forEach((child, i) => {
      prime(child, "hero-stagger");
      requestAnimationFrame(() => reveal(child, "hero-stagger", 0.12 * i));
    });
  });

  document.querySelectorAll('[data-anim="hero-devices"]').forEach((el) => {
    prime(el, "hero-devices");
    requestAnimationFrame(() => reveal(el, "hero-devices", 0.25));
  });

  /* Au scroll */
  for (const kind of ["reveal", "mask-reveal", "blur-reveal", "scale-in"]) {
    document.querySelectorAll(`[data-anim="${kind}"]`).forEach((el) => {
      prime(el, kind);
      const delay = Number(el.dataset.animDelay ?? 0);
      observe(el, () => reveal(el, kind, delay));
    });
  }

  document.querySelectorAll('[data-anim="stagger-children"]').forEach((el) => {
    const children = [...el.children];
    children.forEach((child) => prime(child, "stagger-children"));
    observe(el, () => {
      children.forEach((child, i) => reveal(child, "stagger-children", 0.09 * i));
    });
  });

  initTypewriter();
  initParallax();
  initCounters();
}

/* Même cycle de vie que le fichier de production : le ClientRouter d'Astro
 * (ou le routeur du bundle de prévisualisation) émet `astro:page-load` au
 * premier rendu comme après chaque navigation. */
document.addEventListener("astro:page-load", () => initAnimations());
