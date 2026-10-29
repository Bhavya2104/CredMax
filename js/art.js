// Card artwork drawn as inline SVG, inspired by (not copied from) each card's
// design: HSBC Live+'s crossing light beams over a red-to-blue wash, and BOB
// Eterna's looping cyan ribbon over a dotted wave. The base colour comes from
// CSS (.ctile.<id>, .mini-card.<id>); these layers sit on top.
//
// `uid` keeps gradient ids unique when the same card is drawn twice.

function hsbc(uid) {
  // Beam A runs steeply down-right, beam B shallowly up-right; they cross at (199, 126).
  return `<defs>
      <radialGradient id="hb-${uid}" cx="0.42" cy="0.12" r="0.65">
        <stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="hp-${uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset="1" stop-color="#fff" stop-opacity=".03"/>
      </linearGradient>
      <linearGradient id="ha-${uid}" gradientUnits="userSpaceOnUse" x1="150" y1="0" x2="228" y2="202">
        <stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset=".55" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity=".3"/>
      </linearGradient>
      <linearGradient id="hl-${uid}" gradientUnits="userSpaceOnUse" x1="30" y1="202" x2="320" y2="72">
        <stop offset="0" stop-color="#fff" stop-opacity=".15"/><stop offset=".6" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity=".5"/>
      </linearGradient>
    </defs>
    <rect width="320" height="202" fill="url(#hb-${uid})"/>
    <polygon points="150,0 320,0 320,72 199,126" fill="url(#hp-${uid})"/>
    <polygon points="199,126 320,72 320,202 228,202" fill="#fff" fill-opacity=".07"/>
    <polygon points="0,0 150,0 199,126 30,202 0,202" fill="#000" fill-opacity=".06"/>
    <g fill="none" stroke-linecap="round">
      <path d="M150 0 228 202" stroke="#fff" stroke-opacity=".16" stroke-width="7"/>
      <path d="M30 202 320 72" stroke="#fff" stroke-opacity=".12" stroke-width="7"/>
      <path d="M150 0 228 202" stroke="url(#ha-${uid})" stroke-width="1.6"/>
      <path d="M30 202 320 72" stroke="url(#hl-${uid})" stroke-width="1.4"/>
    </g>`;
}

function bob(uid) {
  const ribbon = 'M-24 196C36 176 66 116 92 84 122 46 184 40 196 78 208 118 152 140 120 120 94 103 108 62 152 52';
  const strands = [0, 1, 2, 3].map((k) => `<path d="${ribbon}" transform="translate(${k * 6} ${k * -3})" stroke="url(#br-${uid})" stroke-opacity="${(0.95 - k * 0.2).toFixed(2)}" stroke-width="2.2"/>`).join('');
  return `<defs>
      <radialGradient id="bg-${uid}" cx="0.18" cy="0.08" r="0.75">
        <stop offset="0" stop-color="#22a3bf" stop-opacity=".45"/><stop offset="1" stop-color="#22a3bf" stop-opacity="0"/>
      </radialGradient>
      <pattern id="bd-${uid}" width="5" height="5" patternUnits="userSpaceOnUse">
        <circle cx="2.5" cy="2.5" r=".8" fill="#8fe6f7"/>
      </pattern>
      <linearGradient id="bf-${uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".6"/>
      </linearGradient>
      <mask id="bm-${uid}"><rect width="320" height="202" fill="url(#bf-${uid})"/></mask>
      <linearGradient id="br-${uid}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#0b7fa3"/><stop offset=".55" stop-color="#3cc8ec"/><stop offset="1" stop-color="#8be3f7"/>
      </linearGradient>
    </defs>
    <rect width="320" height="202" fill="url(#bg-${uid})"/>
    <g mask="url(#bm-${uid})">
      <path d="M110 202C170 146 236 172 320 106V202Z" fill="url(#bd-${uid})" opacity=".55"/>
      <path d="M40 202C130 172 220 196 320 150V202Z" fill="url(#bd-${uid})" opacity=".7"/>
    </g>
    <g fill="none" stroke-linecap="round">
      <path d="${ribbon}" stroke="#19b8e0" stroke-opacity=".16" stroke-width="10"/>
      ${strands}
    </g>
    <path d="M281 184c0-6 7-6 11 0s11 6 11 0-7-6-11 0-11 6-11 0z" fill="none" stroke="#d9b866" stroke-width="1.5" opacity=".9"/>`;
}

export function cardArt(id, uid) {
  const body = id === 'hsbc' ? hsbc(uid) : id === 'bob' ? bob(uid) : '';
  if (!body) return '';
  return `<svg class="art" viewBox="0 0 320 202" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${body}</svg>`;
}
