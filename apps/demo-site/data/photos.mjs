// Generates illustrated SVG "photos" for the fictional profiles. Portraits are
// deliberately abstract (no facial features) — the scene photos carry the
// observable, non-sensitive context (hiking, cooking, a dog, …) that Conversa
// is allowed to note.

const hsl = (h, s, l) => `hsl(${h} ${s}% ${l}%)`;

function figure(x, y, h, scale = 1) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <circle cx="0" cy="-70" r="18" fill="${hsl(h, 30, 25)}"/>
    <path d="M-22 -48 Q0 -58 22 -48 L28 10 L-28 10 Z" fill="${hsl(h, 55, 45)}"/>
    <rect x="-20" y="10" width="14" height="45" rx="5" fill="${hsl(h, 20, 22)}"/>
    <rect x="6" y="10" width="14" height="45" rx="5" fill="${hsl(h, 20, 22)}"/>
  </g>`;
}

const SCENES = {
  portrait: (h) => `
    <defs><radialGradient id="g" cx="50%" cy="35%"><stop offset="0" stop-color="${hsl(h, 70, 75)}"/><stop offset="1" stop-color="${hsl(h + 40, 60, 35)}"/></radialGradient></defs>
    <rect width="400" height="500" fill="url(#g)"/>
    <circle cx="200" cy="200" r="80" fill="${hsl(h, 25, 30)}"/>
    <path d="M70 500 Q80 320 200 310 Q320 320 330 500 Z" fill="${hsl(h + 180, 45, 40)}"/>`,
  mountain: (h) => `
    <rect width="400" height="500" fill="${hsl(h, 70, 75)}"/>
    <circle cx="320" cy="90" r="40" fill="#fff6c8"/>
    <polygon points="-20,420 130,150 280,420" fill="${hsl(h, 20, 40)}"/>
    <polygon points="110,420 270,120 430,420" fill="${hsl(h, 25, 30)}"/>
    <polygon points="230,175 270,120 310,175 290,170 270,185 250,170" fill="#fff"/>
    <rect y="400" width="400" height="100" fill="${hsl(110, 35, 35)}"/>
    ${figure(110, 420, 20, 0.9)}
    <rect x="125" y="345" width="22" height="34" rx="6" fill="${hsl(20, 70, 40)}"/>
    <line x1="80" y1="370" x2="70" y2="470" stroke="#5a3b1a" stroke-width="5"/>`,
  beach: (h) => `
    <rect width="400" height="300" fill="${hsl(h, 80, 80)}"/>
    <circle cx="80" cy="80" r="45" fill="#fff2a8"/>
    <rect y="250" width="400" height="120" fill="${hsl(h, 70, 45)}"/>
    <path d="M0 270 Q50 255 100 270 T200 270 T300 270 T400 270" stroke="#fff" stroke-width="5" fill="none" opacity=".7"/>
    <rect y="360" width="400" height="140" fill="#f2d79b"/>
    <rect x="270" y="190" width="18" height="190" rx="9" fill="${hsl(20, 60, 50)}" transform="rotate(-8 280 290)"/>
    <ellipse cx="240" cy="300" rx="22" ry="80" fill="#fff" opacity=".9" transform="rotate(-70 240 300)"/>
    ${figure(140, 420, 200, 0.9)}`,
  cooking: (h) => `
    <rect width="400" height="500" fill="${hsl(h, 40, 85)}"/>
    <rect y="330" width="400" height="170" fill="${hsl(h, 30, 45)}"/>
    <ellipse cx="200" cy="330" rx="110" ry="28" fill="#333"/>
    <rect x="300" y="318" width="90" height="16" rx="8" fill="#222"/>
    <circle cx="170" cy="322" r="16" fill="#e8b341"/><circle cx="215" cy="326" r="14" fill="#d9472b"/><circle cx="240" cy="316" r="10" fill="#4f9a3a"/>
    <path d="M150 250 q10 -30 0 -60 M200 250 q10 -30 0 -60 M250 250 q10 -30 0 -60" stroke="#fff" stroke-width="5" fill="none" opacity=".6"/>
    <rect x="40" y="80" width="80" height="120" rx="8" fill="${hsl(h + 30, 50, 60)}"/>`,
  bike: (h) => `
    <rect width="400" height="500" fill="${hsl(h, 50, 80)}"/>
    <rect y="380" width="400" height="120" fill="${hsl(h, 20, 50)}"/>
    <circle cx="120" cy="360" r="55" stroke="#222" stroke-width="8" fill="none"/>
    <circle cx="290" cy="360" r="55" stroke="#222" stroke-width="8" fill="none"/>
    <path d="M120 360 L190 270 L260 270 L290 360 M190 270 L205 360 L120 360 M205 360 L260 270 M250 250 L275 250" stroke="${hsl(h + 150, 70, 45)}" stroke-width="9" fill="none" stroke-linecap="round"/>
    <rect x="175" y="255" width="40" height="10" rx="5" fill="#222"/>`,
  painting: (h) => `
    <rect width="400" height="500" fill="${hsl(h, 40, 88)}"/>
    <line x1="140" y1="440" x2="200" y2="120" stroke="#7a5230" stroke-width="10"/><line x1="260" y1="440" x2="200" y2="120" stroke="#7a5230" stroke-width="10"/>
    <rect x="110" y="140" width="180" height="150" fill="#fff" stroke="#7a5230" stroke-width="6"/>
    <circle cx="160" cy="200" r="25" fill="${hsl(h + 10, 70, 55)}"/><rect x="190" y="210" width="80" height="60" fill="${hsl(h + 180, 50, 50)}"/>
    <ellipse cx="320" cy="420" rx="45" ry="25" fill="#c89a5a"/><circle cx="305" cy="415" r="7" fill="red"/><circle cx="330" cy="410" r="7" fill="blue"/><circle cx="340" cy="428" r="7" fill="gold"/>`,
  dog: (h) => `
    <rect width="400" height="500" fill="${hsl(h, 40, 75)}"/>
    <rect y="380" width="400" height="120" fill="${hsl(h, 45, 40)}"/>
    ${figure(140, 400, 220, 1)}
    <ellipse cx="280" cy="380" rx="55" ry="30" fill="#b07a45"/>
    <circle cx="330" cy="345" r="24" fill="#b07a45"/><ellipse cx="345" cy="330" rx="8" ry="14" fill="#7a4f2a"/>
    <rect x="240" y="395" width="10" height="30" fill="#b07a45"/><rect x="305" y="395" width="10" height="30" fill="#b07a45"/>
    <path d="M225 375 q-25 -20 -30 -40" stroke="#b07a45" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M160 340 Q220 360 260 370" stroke="#c33" stroke-width="3" fill="none"/>`,
  city: (h) => `
    <rect width="400" height="500" fill="${hsl(h, 50, 22)}"/>
    <circle cx="320" cy="80" r="30" fill="#ffe9a8"/>
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${i * 60 - 10}" y="${200 + ((i * 53) % 120)}" width="55" height="400" fill="${hsl(h + 200, 20, 15 + (i % 3) * 5)}"/>`).join('')}
    ${Array.from({ length: 40 }, (_, i) => `<rect x="${(i * 37) % 400}" y="${250 + ((i * 71) % 220)}" width="8" height="10" fill="#ffd36b" opacity=".8"/>`).join('')}
    <rect y="460" width="400" height="40" fill="${hsl(h, 40, 30)}"/>`,
  books: (h) => `
    <rect width="400" height="500" fill="${hsl(h, 35, 30)}"/>
    ${[0, 1, 2, 3].map((r) => `<rect x="20" y="${60 + r * 110}" width="360" height="10" fill="#6b4a2b"/>` + Array.from({ length: 12 }, (_, i) => `<rect x="${28 + i * 29}" y="${70 + r * 110 - 0}" width="24" height="${70 + ((i * 13 + r * 7) % 25)}" transform="translate(0 ${-((i * 13 + r * 7) % 25) - 70 + 95})" fill="${hsl((h + i * 37 + r * 50) % 360, 50, 50)}"/>`).join('')).join('')}`,
  guitar: (h) => `
    <rect width="400" height="500" fill="${hsl(h, 40, 25)}"/>
    <circle cx="200" cy="120" r="70" fill="${hsl(h, 60, 45)}" opacity=".4"/>
    <ellipse cx="200" cy="360" rx="80" ry="90" fill="#c9843c"/><ellipse cx="200" cy="270" rx="60" ry="60" fill="#c9843c"/>
    <circle cx="200" cy="330" r="22" fill="#3a2410"/>
    <rect x="190" y="80" width="20" height="200" fill="#4a2e14"/><rect x="182" y="60" width="36" height="35" rx="6" fill="#2a1a0a"/>
    <line x1="195" y1="90" x2="195" y2="420" stroke="#eee" stroke-width="1.5"/><line x1="205" y1="90" x2="205" y2="420" stroke="#eee" stroke-width="1.5"/>`,
};

export function renderPhoto(scene, hue) {
  const body = (SCENES[scene] ?? SCENES.portrait)(hue);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500">${body}</svg>`;
}
