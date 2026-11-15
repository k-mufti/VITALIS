// VITALIS logo: holographic card. The slab tilts toward the pointer and a glare +
// foil sheen follow it (styles in styles/type.css). Skipped for reduced motion.

const logos = [...document.querySelectorAll('.logo, .corner.tl')];
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

if (logos.length && !still) {
  let frame = 0, x = 0, y = 0;
  const update = () => {
    frame = 0;
    for (const el of logos) {
      const r = el.getBoundingClientRect();
      if (!r.width) continue;                       // hidden (e.g. sign-in gone)
      const cx = Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / 300));
      const cy = Math.max(-1, Math.min(1, (y - (r.top + r.height / 2)) / 200));
      el.style.transform = `perspective(500px) rotateY(${cx * 18}deg) rotateX(${-cy * 14}deg)`;
      el.style.setProperty('--gx', `${50 + cx * 50}%`);
      el.style.setProperty('--gy', `${50 + cy * 50}%`);
    }
  };
  addEventListener('pointermove', e => {
    x = e.clientX; y = e.clientY;
    if (!frame) frame = requestAnimationFrame(update);
  }, { passive: true });
}
