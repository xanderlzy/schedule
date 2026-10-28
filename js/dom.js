// Tiny DOM + formatting helpers. Text is always inserted as text nodes (no innerHTML).
import { parseISO, pad } from './model.js';

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith('--')) el.style.setProperty(p, val);
        else el.style[p] = val;
      }
    }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && !k.startsWith('aria')) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  prev: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 100-10 5 5 0 000 10z',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  chevron: 'M6 9l6 6 6-6',
  pin: 'M12 21s-6-5.6-6-11a6 6 0 1112 0c0 5.4-6 11-6 11zM12 12a2 2 0 100-4 2 2 0 000 4z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4',
};

export function icon(name, size = 18) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
}

export function fmtTime(t) {
  if (!t) return '';
  const [H, M] = t.split(':').map(Number);
  const suffix = H >= 12 ? 'pm' : 'am';
  const h12 = ((H + 11) % 12) + 1;
  return M ? `${h12}:${pad(M)}${suffix}` : `${h12}${suffix}`;
}

export const fmtRange = (a, b) => (a && b ? `${fmtTime(a)} – ${fmtTime(b)}` : fmtTime(a));

export const fmtDate = (isoStr, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  parseISO(isoStr).toLocaleDateString('en-GB', opts);

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const EASE = 'cubic-bezier(.2,.8,.2,1)';

/** Slide + fade new content in from a direction (-1 left, 1 right, 0 up). */
export function enter(el, dir = 0, distance = 24) {
  if (reducedMotion() || !el.animate) return;
  const from = dir ? `translateX(${dir * distance}px)` : `translateY(${distance / 2}px)`;
  el.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE });
}

/** Staggered entrance for a list of elements. */
export function stagger(els, step = 18, max = 14) {
  if (reducedMotion()) return;
  [...els].forEach((el, i) => {
    el.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], {
      duration: 320, easing: EASE, delay: Math.min(i, max) * step, fill: 'backwards',
    });
  });
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
