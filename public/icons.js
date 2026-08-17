// Icônes dessinées en SVG, sans aucune image téléchargée depuis l'extérieur.
//
// Deux contraintes ont façonné ce fichier :
//   1. La Content-Security-Policy interdit les styles en ligne, donc aucun
//      attribut style="" ici : les animations et les décalages sont dans
//      styles.css (classes wx-*, sélecteurs :nth-of-type).
//   2. Une animation CSS sur `transform` écrase l'attribut transform="" du même
//      élément. D'où les groupes imbriqués : le groupe extérieur place l'objet,
//      le groupe intérieur est animé.

// Une même icône peut apparaître plusieurs fois sur la page : ce compteur évite
// les identifiants dupliqués (HTML invalide).
let uid = 0;

const SUN_RAYS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i * Math.PI) / 4;
  const inner = 17;
  const outer = 23;
  return `<line x1="${(32 + Math.cos(angle) * inner).toFixed(1)}" y1="${(32 + Math.sin(angle) * inner).toFixed(1)}" x2="${(32 + Math.cos(angle) * outer).toFixed(1)}" y2="${(32 + Math.sin(angle) * outer).toFixed(1)}"/>`;
}).join('');

/** Soleil : le disque est fixe, seule la couronne de rayons tourne. */
const sun = (cx = 32, cy = 32, r = 12) => `
  <g class="wx-sun">
    <circle cx="${cx}" cy="${cy}" r="${r}"/>
    <g transform="translate(${cx - 32} ${cy - 32})"><g class="wx-rays">${SUN_RAYS}</g></g>
  </g>`;

const moon = () => {
  const id = `wx-moon-${(uid += 1)}`;
  return `
  <mask id="${id}">
    <rect width="64" height="64" fill="#000"/>
    <circle cx="30" cy="33" r="16" fill="#fff"/>
    <circle cx="45" cy="23" r="14" fill="#000"/>
  </mask>
  <g class="wx-moon">
    <g class="wx-float">
      <circle cx="30" cy="33" r="16" mask="url(#${id})"/>
    </g>
    <circle class="wx-star" cx="49" cy="42" r="1.7"/>
    <circle class="wx-star" cx="44" cy="52" r="1.2"/>
  </g>`;
};

/** Nuage : groupe extérieur pour le placement, groupe intérieur pour la dérive. */
const cloud = (dx = 0, dy = 0, scale = 1, extraClass = '') => `
  <g transform="translate(${dx} ${dy}) scale(${scale})">
    <g class="wx-cloud ${extraClass}">
      <g class="wx-drift">
        <circle cx="25" cy="29" r="10"/>
        <circle cx="39" cy="27" r="12"/>
        <rect x="14" y="31" width="36" height="13" rx="6.5"/>
      </g>
    </g>
  </g>`;

const drops = (count = 3, modifier = '') =>
  `<g class="wx-rain ${modifier}">${Array.from({ length: count }, (_, i) => {
    const x = count === 1 ? 32 : 21 + i * (26 / (count - 1));
    return `<line class="wx-drop" x1="${x.toFixed(1)}" y1="46" x2="${(x - 2).toFixed(1)}" y2="53"/>`;
  }).join('')}</g>`;

const drizzle = () =>
  `<g class="wx-rain wx-rain--fine">${Array.from({ length: 4 }, (_, i) => {
    const x = 22 + i * 7;
    return `<line class="wx-drop" x1="${x}" y1="47" x2="${x - 1}" y2="51"/>`;
  }).join('')}</g>`;

const flakes = (count = 3) =>
  `<g class="wx-snow">${Array.from({ length: count }, (_, i) => {
    const x = count === 1 ? 32 : 22 + i * (24 / (count - 1));
    return `<circle class="wx-flake" cx="${x.toFixed(1)}" cy="49" r="2.3"/>`;
  }).join('')}</g>`;

const bolt = () => '<path class="wx-bolt" d="M34 33l-11 15h7.5l-2.5 12 12-16h-7.5l1.5-11z"/>';

const hail = () => `
  <g class="wx-snow">
    <circle class="wx-flake" cx="23" cy="50" r="2.2"/>
    <circle class="wx-flake" cx="44" cy="50" r="2.2"/>
  </g>`;

const fogLines = () => `
  <g class="wx-fog">
    <line class="wx-fog-line" x1="14" y1="32" x2="50" y2="32"/>
    <line class="wx-fog-line" x1="18" y1="40" x2="46" y2="40"/>
    <line class="wx-fog-line" x1="15" y1="48" x2="49" y2="48"/>
  </g>`;

const ice = () => `
  <g class="wx-ice">
    <line x1="40" y1="44" x2="40" y2="54"/>
    <line x1="35" y1="47" x2="45" y2="51"/>
    <line x1="45" y1="47" x2="35" y2="51"/>
  </g>`;

/** Compose une icône à partir de la clé renvoyée par l'API (src/weatherCodes.js). */
function weatherArt(key, isDay) {
  switch (key) {
    case 'clear':
      return isDay ? sun() : moon();
    case 'mostly-clear':
      return isDay ? sun(28, 27, 11) + cloud(10, 12, 0.6) : moon() + cloud(10, 13, 0.55);
    case 'partly-cloudy':
      return (isDay ? sun(41, 21, 9) : moon()) + cloud(-2, 7, 0.95);
    case 'overcast':
      return cloud(-7, 1, 0.78, 'wx-cloud--pale') + cloud(5, 7, 0.95);
    case 'fog':
      return cloud(0, -8, 0.78, 'wx-cloud--pale') + fogLines();
    case 'drizzle':
      return cloud(0, -3, 0.95) + drizzle();
    case 'rain':
      return cloud(0, -3, 0.95) + drops(3);
    case 'heavy-rain':
      return cloud(0, -3, 1) + drops(5, 'wx-rain--fort');
    case 'showers':
      return (isDay ? sun(47, 17, 7) : '') + cloud(-3, -2, 0.88) + drops(3);
    case 'freezing-rain':
      return cloud(0, -5, 0.9) + drops(2) + ice();
    case 'snow':
      return cloud(0, -3, 0.95) + flakes(3);
    case 'heavy-snow':
      return cloud(0, -3, 1) + flakes(5);
    case 'snow-showers':
      return (isDay ? sun(47, 17, 7) : '') + cloud(-3, -2, 0.88) + flakes(3);
    case 'thunder':
      return cloud(0, -7, 0.95, 'wx-cloud--sombre') + bolt();
    case 'thunder-hail':
      return cloud(0, -7, 0.95, 'wx-cloud--sombre') + bolt() + hail();
    default:
      return `
        <g class="wx-cloud wx-cloud--pale"><circle cx="32" cy="32" r="18"/></g>
        <text class="wx-inconnu" x="32" y="41" text-anchor="middle">?</text>`;
  }
}

/** Icône météo complète, à injecter dans un conteneur (contenu 100 % statique). */
export function weatherIcon(key, isDay = true) {
  return `<svg class="wx" viewBox="0 0 64 64" role="img" focusable="false" aria-hidden="true">${weatherArt(key, isDay)}</svg>`;
}

/**
 * Dessin seul, sans balise <svg> englobante : pour l'insérer dans un SVG
 * existant (le graphique horaire, par exemple).
 */
export function weatherIconArt(key, isDay = true) {
  return weatherArt(key, isDay);
}

const UI = {
  loupe: '<circle cx="27" cy="27" r="16"/><line x1="39" y1="39" x2="53" y2="53"/>',
  position:
    '<path d="M32 6c-10 0-18 8-18 18 0 13 18 34 18 34s18-21 18-34c0-10-8-18-18-18z"/><circle cx="32" cy="24" r="6.5" class="glyph-trou"/>',
  soleil:
    '<circle cx="32" cy="32" r="11"/><g><line x1="32" y1="5" x2="32" y2="13"/><line x1="32" y1="51" x2="32" y2="59"/><line x1="5" y1="32" x2="13" y2="32"/><line x1="51" y1="32" x2="59" y2="32"/><line x1="13" y1="13" x2="19" y2="19"/><line x1="45" y1="45" x2="51" y2="51"/><line x1="13" y1="51" x2="19" y2="45"/><line x1="45" y1="19" x2="51" y2="13"/></g>',
  lune: '<path d="M38 8a24 24 0 1 0 18 42A28 28 0 0 1 38 8z"/>',
  auto: '<circle cx="32" cy="32" r="19"/><path d="M32 13a19 19 0 0 1 0 38z" class="glyph-plein"/>',
  etoile: '<path d="M32 8l7.6 15.9 17.4 2.4-12.7 12.1 3.1 17.3L32 47.5 16.6 55.7l3.1-17.3L7 26.3l17.4-2.4z"/>',
  boussole: '<path d="M32 9l10 36-10-8-10 8z"/>',
  goutte: '<path d="M32 6s16 19 16 30a16 16 0 0 1-32 0C16 25 32 6 32 6z"/>',
  thermometre:
    '<path d="M32 8a7 7 0 0 1 7 7v21a13 13 0 1 1-14 0V15a7 7 0 0 1 7-7z"/><line x1="32" y1="25" x2="32" y2="43"/>',
  oeil: '<path d="M4 32s10-16 28-16 28 16 28 16-10 16-28 16S4 32 4 32z"/><circle cx="32" cy="32" r="7"/>',
  nuage: '<circle cx="25" cy="29" r="10"/><circle cx="39" cy="27" r="12"/><rect x="14" y="31" width="36" height="13" rx="6.5"/>',
  jauge: '<path d="M10 45a22 22 0 1 1 44 0"/><line x1="32" y1="45" x2="45" y2="27"/>',
  uv: '<circle cx="32" cy="32" r="10"/><path d="M32 5v8M32 51v8M5 32h8M51 32h8"/>',
  brand:
    '<circle cx="32" cy="32" r="20" class="brand__globe"/><ellipse cx="32" cy="32" rx="9" ry="20" class="brand__meridien"/><line x1="12" y1="32" x2="52" y2="32" class="brand__equateur"/>'
};

/** Petites icônes d'interface (loupe, position, thème, favoris...). */
export function uiIcon(name, extraClass = '') {
  const art = UI[name] ?? UI.loupe;
  return `<svg class="glyph ${extraClass}" viewBox="0 0 64 64" role="img" focusable="false" aria-hidden="true">${art}</svg>`;
}
