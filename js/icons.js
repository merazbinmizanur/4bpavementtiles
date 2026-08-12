// ============================================================
// 4B PAVEMENT TILES — inline SVG icon set (stroke-based, 24x24)
// ============================================================
const wrap = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const Icon = {
  // Company logo — used everywhere a brand mark appears (headers, splash
  // screens). A real <img> instead of a drawn icon; the maskable variant is
  // used because it's specifically designed to crop cleanly into any
  // container shape (the rounded-square .brand-mark, the larger splash ring).
  brand: `<img src="icons/icon-maskable-512.png" alt="4B Pavement Tiles" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block;">`,
  home: wrap(`<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>`),
  sale: wrap(`<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.6a2 2 0 0 0 2 1.4h8.8a2 2 0 0 0 2-1.6L22 8H6"/>`),
  factory: wrap(`<path d="M3 21V10l5 3V10l5 3V10l5 3v8H3z"/><path d="M7 21v-4M12 21v-4M17 21v-4"/>`),
  box: wrap(`<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v9l9 5 9-5V8"/><path d="M12 13v9"/>`),
  transfer: wrap(`<path d="M7 7h11l-3-3"/><path d="M17 17H6l3 3"/>`),
  people: wrap(`<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="8.5" r="2.6"/><path d="M16 14.2c2.7.4 5 2.4 5 5.8"/>`),
  badge: wrap(`<circle cx="12" cy="8" r="4"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>`),
  calendarCheck: wrap(`<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18"/><path d="M8 3v3M16 3v3"/><path d="M8.5 14.5l2 2 4-4"/>`),
  wallet: wrap(`<rect x="2.5" y="6" width="19" height="13" rx="2.2"/><path d="M17 12.5h3"/><path d="M2.5 9.5h19"/>`),
  message: wrap(`<path d="M4 5h16v11H8l-4 4V5z"/>`),
  chart: wrap(`<path d="M4 20V10M11 20V4M18 20v-7"/><path d="M2 20h20"/>`),
  settings: wrap(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`),
  logout: wrap(`<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>`),
  plus: wrap(`<path d="M12 5v14M5 12h14"/>`),
  close: wrap(`<path d="M18 6L6 18M6 6l12 12"/>`),
  edit: wrap(`<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>`),
  trash: wrap(`<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>`),
  chevronRight: wrap(`<path d="M9 6l6 6-6 6"/>`),
  chevronLeft: wrap(`<path d="M15 6l-6 6 6 6"/>`),
  search: wrap(`<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>`),
  phone: wrap(`<path d="M22 16.9v2a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 1H6a2 2 0 0 1 2 1.7c.1 1.1.4 2.2.7 3.2a2 2 0 0 1-.5 2.1L7 9.3a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c1 .4 2.1.6 3.2.8A2 2 0 0 1 22 16.9z"/>`),
  check: wrap(`<path d="M20 6L9 17l-5-5"/>`),
  clock: wrap(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.3 2"/>`),
  alert: wrap(`<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9L1.8 18a1.7 1.7 0 0 0 1.5 2.5h17.4a1.7 1.7 0 0 0 1.5-2.5L13.7 3.9a1.7 1.7 0 0 0-3 0z"/>`),
  inbox: wrap(`<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.4 5H18.6l3.4 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l3.4-7z"/>`),
  empty: wrap(`<circle cx="12" cy="12" r="9"/><path d="M8 15s1.5-2 4-2 4 2 4 2"/><path d="M9 9h.01M15 9h.01"/>`),
  spinnerCircle: wrap(`<path d="M21 12a9 9 0 1 1-9-9"/>`),
  more: wrap(`<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>`),
  minus: wrap(`<path d="M5 12h14"/>`),
  bell: wrap(`<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>`),
  clipboard: wrap(`<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M8 11h8M8 15h5"/>`),
  truck: wrap(`<rect x="1" y="6" width="14" height="11" rx="1.5"/><path d="M15 10h4l3 3v4h-7z"/><circle cx="6" cy="19" r="1.8"/><circle cx="18" cy="19" r="1.8"/>`),
  heart: wrap(`<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z"/>`),
};
