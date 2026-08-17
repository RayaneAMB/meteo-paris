// Fabrication du DOM : ciel, tuiles de détail, graphique horaire, liste 7 jours.
//
// Règle de sécurité tenue partout dans ce fichier : innerHTML n'est utilisé que
// pour les icônes, qui sont des chaînes constantes définies dans icons.js. Tout
// ce qui vient du réseau (noms de lieux, libellés, nombres) passe par
// textContent, donc rien ne peut être interprété comme du HTML.

import { weatherIcon, weatherIconArt, uiIcon } from './icons.js';
import * as f from './format.js';

const SVGNS = 'http://www.w3.org/2000/svg';

let uid = 0;

/** Crée un élément SVG avec ses attributs, et son texte éventuel. */
function s(tag, attrs = {}, texte) {
  const noeud = document.createElementNS(SVGNS, tag);
  for (const [cle, valeur] of Object.entries(attrs)) {
    if (valeur !== null && valeur !== undefined) noeud.setAttribute(cle, String(valeur));
  }
  if (texte !== undefined && texte !== null) noeud.textContent = String(texte);
  return noeud;
}

/** Crée un élément HTML ; `texte` est toujours inséré via textContent. */
function h(tag, classe, texte) {
  const noeud = document.createElement(tag);
  if (classe) noeud.className = classe;
  if (texte !== undefined && texte !== null) noeud.textContent = String(texte);
  return noeud;
}

/* ------------------------------------------------------------------- Ciel */

// Palettes de dégradé : [haut, milieu, bas] pour le jour et pour la nuit.
const CIELS = {
  degage: {
    jour: ['#2f86e8', '#6cb7f4', '#cbe8fb'],
    nuit: ['#060d22', '#101d45', '#26386b'],
    glowJour: 'rgba(255, 244, 205, 0.95)',
    nuages: 0.14
  },
  partiel: {
    jour: ['#3f8ed8', '#86bde4', '#dbe9f3'],
    nuit: ['#0a1330', '#16244f', '#2e4271'],
    glowJour: 'rgba(255, 246, 220, 0.72)',
    nuages: 0.5
  },
  couvert: {
    jour: ['#6d7f92', '#9aa9b8', '#ccd4dc'],
    nuit: ['#131a26', '#222c3c', '#3a4655'],
    glowJour: 'rgba(255, 255, 255, 0.26)',
    nuages: 0.8
  },
  brouillard: {
    jour: ['#8e959d', '#b3b9c0', '#d8dbdf'],
    nuit: ['#171b21', '#262b33', '#3c424b'],
    glowJour: 'rgba(255, 255, 255, 0.3)',
    nuages: 0.9
  },
  pluie: {
    jour: ['#4a5d72', '#728696', '#a3b1bf'],
    nuit: ['#0b1220', '#17222f', '#2b3746'],
    glowJour: 'rgba(255, 255, 255, 0.2)',
    nuages: 0.7,
    precip: 'pluie'
  },
  averses: {
    jour: ['#557089', '#7f95a8', '#b2c0cd'],
    nuit: ['#0d1524', '#1a2634', '#2f3c4c'],
    glowJour: 'rgba(255, 250, 230, 0.4)',
    nuages: 0.6,
    precip: 'averses'
  },
  'pluie-forte': {
    jour: ['#3c4d60', '#5d7185', '#8b9bab'],
    nuit: ['#080e18', '#131c28', '#24303e'],
    glowJour: 'rgba(255, 255, 255, 0.16)',
    nuages: 0.85,
    precip: 'pluie-forte'
  },
  neige: {
    jour: ['#7d8fa4', '#a8bccf', '#dfeaf4'],
    nuit: ['#141c2a', '#232f42', '#3d4b60'],
    glowJour: 'rgba(255, 255, 255, 0.4)',
    nuages: 0.85,
    precip: 'neige'
  },
  orage: {
    jour: ['#2f3547', '#4b5268', '#757c94'],
    nuit: ['#06080f', '#10131f', '#1f2433'],
    glowJour: 'rgba(255, 255, 255, 0.14)',
    nuages: 0.85,
    precip: 'pluie-forte'
  }
};

const GROUPES = {
  clear: 'degage',
  'mostly-clear': 'degage',
  'partly-cloudy': 'partiel',
  overcast: 'couvert',
  fog: 'brouillard',
  drizzle: 'pluie',
  rain: 'pluie',
  'heavy-rain': 'pluie-forte',
  showers: 'averses',
  'freezing-rain': 'pluie',
  snow: 'neige',
  'heavy-snow': 'neige',
  'snow-showers': 'neige',
  thunder: 'orage',
  'thunder-hail': 'orage'
};

/** Accorde les couleurs du fond à la météo affichée. */
export function appliquerCiel(condition, estJour) {
  const groupe = CIELS[GROUPES[condition?.icon] ?? 'partiel'];
  const [c1, c2, c3] = estJour ? groupe.jour : groupe.nuit;
  const racine = document.documentElement;

  racine.style.setProperty('--sky-1', c1);
  racine.style.setProperty('--sky-2', c2);
  racine.style.setProperty('--sky-3', c3);
  racine.style.setProperty('--nuages', String(groupe.nuages));
  racine.style.setProperty('--glow', estJour ? groupe.glowJour : 'rgba(190, 210, 255, 0.35)');
  racine.style.setProperty('--glow-x', estJour ? '78%' : '22%');
  racine.style.setProperty('--glow-y', estJour ? '9%' : '13%');

  const couche = document.getElementById('sky-precip');
  if (groupe.precip) couche.dataset.precip = groupe.precip;
  else delete couche.dataset.precip;
}

/* ----------------------------------------------------------------- Tuiles */

function tuile({ icone, titre, valeur, unite, note, visuel, large = false }) {
  const li = h('li', `tuile${large ? ' tuile--large' : ''}`);

  const tete = h('div', 'tuile__tete');
  const glyphe = h('span');
  glyphe.innerHTML = uiIcon(icone); // constante interne, pas de données réseau
  tete.append(glyphe, h('span', null, titre));

  const ligne = h('p', 'tuile__valeur', valeur);
  if (unite) ligne.append(h('small', null, ` ${unite}`));

  li.append(tete, ligne);
  if (note) li.append(h('p', 'tuile__note', note));
  if (visuel) {
    const boite = h('div', 'tuile__visuel');
    boite.append(visuel);
    li.append(boite);
  }
  return li;
}

function anneau(ratio) {
  const rayon = 26;
  const circonference = 2 * Math.PI * rayon;
  const svg = s('svg', { class: 'anneau', viewBox: '0 0 64 64', 'aria-hidden': 'true' });
  svg.append(
    s('circle', { class: 'anneau__fond', cx: 32, cy: 32, r: rayon }),
    s('circle', {
      class: 'anneau__jauge',
      cx: 32,
      cy: 32,
      r: rayon,
      'stroke-dasharray': circonference.toFixed(2),
      'stroke-dashoffset': (circonference * (1 - Math.min(1, Math.max(0, ratio)))).toFixed(2)
    })
  );
  return svg;
}

function boussole(degres) {
  const svg = s('svg', { class: 'boussole', viewBox: '0 0 64 64', 'aria-hidden': 'true' });
  svg.append(
    s('circle', { class: 'boussole__cercle', cx: 32, cy: 32, r: 26 }),
    s('text', { class: 'boussole__texte', x: 32, y: 13, 'text-anchor': 'middle' }, 'N')
  );

  // La flèche montre où va le vent : la direction fournie est celle d'où il
  // vient, d'où le demi-tour.
  const groupe = s('g', { transform: `rotate(${((degres ?? 0) + 180).toFixed(1)} 32 32)` });
  groupe.append(s('path', { class: 'boussole__fleche', d: 'M32 17l7 26-7-6-7 6z' }));
  svg.append(groupe);
  return svg;
}

function barreUv(ratio) {
  const boite = h('div', 'uv-barre');
  const curseur = h('span', 'uv-curseur');
  curseur.style.setProperty('--pos', `${(Math.min(1, Math.max(0, ratio)) * 100).toFixed(1)}%`);
  boite.append(curseur);
  return boite;
}

/** Arc du soleil : lever, coucher, et position actuelle sur la trajectoire. */
function arcSoleil(leverIso, coucherIso, minutesActuelles) {
  const svg = s('svg', { class: 'arc-soleil', viewBox: '0 0 240 78', 'aria-hidden': 'true' });
  const lever = f.minutesDeIso(leverIso);
  const coucher = f.minutesDeIso(coucherIso);

  svg.append(
    s('path', { class: 'arc-soleil__trace', d: 'M14 60 A 106 50 0 0 1 226 60' }),
    s('line', { class: 'arc-soleil__sol', x1: 0, y1: 60, x2: 240, y2: 60 })
  );

  if (lever !== null && coucher !== null && coucher > lever && minutesActuelles !== null) {
    const brut = (minutesActuelles - lever) / (coucher - lever);
    const progres = Math.min(1, Math.max(0, brut));
    const angle = Math.PI * progres;
    svg.append(
      s('circle', {
        class: 'arc-soleil__astre',
        cx: (120 - 106 * Math.cos(angle)).toFixed(1),
        cy: (60 - 50 * Math.sin(angle)).toFixed(1),
        r: 6,
        opacity: brut < 0 || brut > 1 ? 0.35 : 1
      })
    );
  }

  svg.append(
    s('text', { class: 'arc-soleil__texte', x: 8, y: 74 }, `↑ ${f.heureDeIso(leverIso)}`),
    s('text', { class: 'arc-soleil__texte', x: 232, y: 74, 'text-anchor': 'end' }, `↓ ${f.heureDeIso(coucherIso)}`)
  );
  return svg;
}

/** Grille des conditions détaillées. */
export function rendreTuiles(hote, meteo, systeme) {
  const u = f.SYSTEMES[systeme];
  const actuel = meteo.current;
  const jour = meteo.daily[0] ?? {};
  const vitesse = actuel.windSpeed;
  const direction = f.cardinal(actuel.windDirection);
  const uv = f.niveauUv(actuel.uvIndex);
  const minutes = f.minutesDeIso(actuel.time);

  // L'écart est calculé dans l'unité affichée : 1 °C d'écart vaut 1,8 °F.
  const ressentiAffiche = f.tempBrute(actuel.apparentTemperature, systeme);
  const reelleAffichee = f.tempBrute(actuel.temperature, systeme);
  const ecartRessenti =
    ressentiAffiche !== null && reelleAffichee !== null ? ressentiAffiche - reelleAffichee : null;

  const dureeJour =
    f.minutesDeIso(jour.sunset) !== null && f.minutesDeIso(jour.sunrise) !== null
      ? f.minutesDeIso(jour.sunset) - f.minutesDeIso(jour.sunrise)
      : null;

  const tuiles = [
    tuile({
      icone: 'thermometre',
      titre: 'Ressenti',
      valeur: f.temp(actuel.apparentTemperature, systeme),
      note:
        ecartRessenti === null
          ? null
          : Math.abs(ecartRessenti) < 0.5
            ? "conforme à la température de l'air"
            : `${f.pourcent(Math.abs(ecartRessenti))}° ${ecartRessenti > 0 ? 'de plus' : 'de moins'} que l'air`
    }),
    tuile({
      icone: 'goutte',
      titre: 'Humidité',
      valeur: f.pourcent(actuel.humidity),
      unite: '%',
      visuel: anneau((actuel.humidity ?? 0) / 100)
    }),
    tuile({
      icone: 'boussole',
      titre: 'Vent',
      valeur: f.vent(vitesse, systeme),
      unite: u.vent,
      note: [direction ? f.elision(direction.long) : null, f.forceVent(vitesse)].filter(Boolean).join(' · '),
      visuel: boussole(actuel.windDirection)
    }),
    tuile({
      icone: 'nuage',
      titre: 'Précipitations',
      valeur: f.pluie(jour.precipitationSum, systeme),
      unite: `${u.pluie} aujourd'hui`,
      note:
        jour.precipitationProbabilityMax === null || jour.precipitationProbabilityMax === undefined
          ? null
          : `risque max ${f.pourcent(jour.precipitationProbabilityMax)} %`
    }),
    tuile({
      icone: 'uv',
      titre: 'Indice UV',
      valeur: f.pourcent(actuel.uvIndex),
      note: `${uv.libelle}${
        jour.uvIndexMax !== null && jour.uvIndexMax !== undefined
          ? ` · max du jour ${f.pourcent(jour.uvIndexMax)}`
          : ''
      }`,
      visuel: barreUv(uv.ratio)
    }),
    tuile({
      icone: 'jauge',
      titre: 'Pression',
      valeur: f.pression(actuel.pressure, systeme),
      unite: u.pression
    }),
    tuile({
      icone: 'oeil',
      titre: 'Visibilité',
      valeur: f.distance(actuel.visibility, systeme),
      unite: u.distance
    }),
    tuile({
      icone: 'nuage',
      titre: 'Nébulosité',
      valeur: f.pourcent(actuel.cloudCover),
      unite: '%',
      note: `rafales jusqu'à ${f.vent(actuel.windGusts, systeme)} ${u.vent}`
    }),
    tuile({
      icone: 'soleil',
      titre: 'Course du soleil',
      valeur: f.duree(dureeJour),
      unite: 'de jour',
      visuel: arcSoleil(jour.sunrise, jour.sunset, minutes),
      large: true
    })
  ];

  hote.replaceChildren(...tuiles);
}

/* --------------------------------------------------- Graphique heure par heure */

/** Catmull-Rom converti en courbes de Bézier : un tracé souple sans dépendance. */
function cheminLisse(points, hautMin, basMax) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;

  const borne = (y) => Math.min(basMax, Math.max(hautMin, y));
  let d = `M${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = borne(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = borne(p2.y - (p3.y - p1.y) / 6);

    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const PAS = 66;
const HAUTEUR = 208;
const COURBE_HAUT = 84;
const COURBE_BAS = 132;
const BASE_PLUIE = 176;
const BARRE_MAX = 34;

export function rendreHoraire(hote, meteo, systeme) {
  const heures = meteo.hourly ?? [];
  if (heures.length === 0) {
    hote.replaceChildren(h('p', 'tuile__note', 'Prévisions horaires indisponibles pour ce lieu.'));
    return;
  }

  const largeur = heures.length * PAS;
  const temperatures = heures.map((heure) => f.tempBrute(heure.temperature, systeme)).filter((t) => t !== null);
  const min = Math.min(...temperatures);
  const max = Math.max(...temperatures);
  const etendue = max - min < 1 ? 1 : max - min;

  const y = (celsius) => {
    const valeur = f.tempBrute(celsius, systeme);
    if (valeur === null) return null;
    return COURBE_BAS - ((valeur - min) / etendue) * (COURBE_BAS - COURBE_HAUT);
  };

  const svg = s('svg', {
    class: 'graphe',
    viewBox: `0 0 ${largeur} ${HAUTEUR}`,
    width: largeur,
    height: HAUTEUR,
    role: 'img',
    'aria-label': `Températures et risque de pluie pour les ${heures.length} prochaines heures`
  });

  const idDegrade = `graphe-degrade-${(uid += 1)}`;
  const defs = s('defs');
  const degrade = s('linearGradient', { id: idDegrade, x1: 0, y1: 0, x2: 0, y2: 1 });
  degrade.append(
    s('stop', { offset: '0%', 'stop-color': 'var(--chaud)', 'stop-opacity': '0.34' }),
    s('stop', { offset: '100%', 'stop-color': 'var(--chaud)', 'stop-opacity': '0' })
  );
  defs.append(degrade);
  svg.append(defs);

  // 1. Bandes de nuit, en arrière-plan.
  heures.forEach((heure, i) => {
    if (heure.isDay) return;
    svg.append(s('rect', { class: 'graphe__nuit', x: i * PAS, y: 0, width: PAS, height: 148 }));
  });

  // 2. Séparateurs de journée.
  heures.forEach((heure, i) => {
    if (i === 0) return;
    const jourActuel = String(heure.time).slice(0, 10);
    const jourPrecedent = String(heures[i - 1].time).slice(0, 10);
    if (jourActuel === jourPrecedent) return;

    svg.append(s('line', { class: 'graphe__jour', x1: i * PAS, y1: 4, x2: i * PAS, y2: BASE_PLUIE }));
    const nom = new Date(`${jourActuel}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' });
    svg.append(s('text', { class: 'graphe__jour-texte', x: i * PAS + 6, y: 32 }, nom.toUpperCase()));
  });

  // 3. Aire et courbe des températures.
  const points = heures
    .map((heure, i) => ({ x: i * PAS + PAS / 2, y: y(heure.temperature) }))
    .filter((point) => point.y !== null)
    .map((point) => ({ x: point.x, y: Number(point.y.toFixed(1)) }));

  if (points.length > 1) {
    const trace = cheminLisse(points, COURBE_HAUT - 6, COURBE_BAS + 6);
    svg.append(
      s('path', {
        class: 'graphe__aire',
        fill: `url(#${idDegrade})`,
        d: `${trace} L${points.at(-1).x} ${COURBE_BAS + 14} L${points[0].x} ${COURBE_BAS + 14} Z`
      }),
      s('path', { class: 'graphe__courbe', d: trace })
    );
  }

  // 4. Colonne par colonne : heure, icône, point, température, pluie.
  heures.forEach((heure, i) => {
    const cx = i * PAS + PAS / 2;
    const maintenant = i === 0;

    svg.append(
      s(
        'text',
        {
          class: `graphe__heure${maintenant ? ' graphe__heure--maintenant' : ''}`,
          x: cx,
          y: 15,
          'text-anchor': 'middle'
        },
        maintenant ? 'Maint.' : f.heureDeIso(heure.time).replace(':00', ' h')
      )
    );

    const icone = s('svg', { x: cx - 14, y: 24, width: 28, height: 28, viewBox: '0 0 64 64' });
    // Contenu constant venant d'icons.js : pas de données réseau ici.
    icone.innerHTML = weatherIconArt(heure.condition?.icon, heure.isDay);
    svg.append(icone);

    const py = y(heure.temperature);
    if (py !== null) {
      svg.append(
        s('circle', { class: 'graphe__point', cx, cy: py.toFixed(1), r: 3.4 }),
        s('text', { class: 'graphe__temp', x: cx, y: (py - 12).toFixed(1), 'text-anchor': 'middle' },
          f.temp(heure.temperature, systeme))
      );
    }

    const proba = heure.precipitationProbability;
    if (typeof proba === 'number' && proba > 0) {
      const hauteur = Math.max(2.5, (proba / 100) * BARRE_MAX);
      svg.append(
        s('rect', {
          class: 'graphe__barre',
          x: cx - 9,
          y: (BASE_PLUIE - hauteur).toFixed(1),
          width: 18,
          height: hauteur.toFixed(1),
          rx: 3
        })
      );
      if (proba >= 15) {
        svg.append(
          s('text', { class: 'graphe__proba', x: cx, y: 190, 'text-anchor': 'middle' }, `${f.pourcent(proba)} %`)
        );
      }
    }
  });

  // 5. Ligne de sol des barres de pluie.
  svg.append(s('line', { class: 'graphe__base', x1: 0, y1: BASE_PLUIE, x2: largeur, y2: BASE_PLUIE }));

  hote.replaceChildren(svg);
}

/* -------------------------------------------------------------- Sept jours */

function nomDeJour(dateIso, index) {
  if (index === 0) return { principal: "Aujourd'hui", secondaire: null };

  const date = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return { principal: dateIso, secondaire: null };

  const jourCourt = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  if (index === 1) return { principal: 'Demain', secondaire: jourCourt };

  return { principal: date.toLocaleDateString('fr-FR', { weekday: 'long' }), secondaire: jourCourt };
}

export function rendreJours(hote, meteo, systeme) {
  const jours = (meteo.daily ?? []).slice(0, 7);
  if (jours.length === 0) {
    hote.replaceChildren(h('li', 'tuile__note', 'Prévisions journalières indisponibles.'));
    return;
  }

  const mins = jours.map((jour) => f.tempBrute(jour.min, systeme)).filter((v) => v !== null);
  const maxs = jours.map((jour) => f.tempBrute(jour.max, systeme)).filter((v) => v !== null);
  const bas = Math.min(...mins);
  const haut = Math.max(...maxs);
  const etendue = haut - bas < 1 ? 1 : haut - bas;

  const lignes = jours.map((jour, index) => {
    const li = h('li', 'jour');
    const { principal, secondaire } = nomDeJour(jour.date, index);

    const nom = h('div', 'jour__nom', principal);
    if (secondaire) nom.append(h('small', null, secondaire));

    const bloc = h('div', 'jour__icone');
    const icone = h('span');
    icone.innerHTML = weatherIcon(jour.condition?.icon, true);
    bloc.append(icone);
    bloc.title = jour.condition?.label ?? '';

    if (typeof jour.precipitationProbabilityMax === 'number' && jour.precipitationProbabilityMax >= 15) {
      bloc.append(h('span', 'jour__proba', `${f.pourcent(jour.precipitationProbabilityMax)}%`));
    }

    const piste = h('div', 'jour__piste');
    const plage = h('div', 'jour__plage');
    const jourMin = f.tempBrute(jour.min, systeme);
    const jourMax = f.tempBrute(jour.max, systeme);

    if (jourMin !== null && jourMax !== null) {
      const depart = ((jourMin - bas) / etendue) * 100;
      const largeur = Math.max(4, ((jourMax - jourMin) / etendue) * 100);
      plage.style.setProperty('--depart', `${depart.toFixed(1)}%`);
      plage.style.setProperty('--largeur', `${Math.min(100 - depart, largeur).toFixed(1)}%`);
    }
    piste.append(plage);

    // Repère de la température actuelle, sur la ligne du jour même.
    const actuelle = f.tempBrute(meteo.current?.temperature, systeme);
    if (index === 0 && actuelle !== null) {
      const repere = h('span', 'jour__maintenant');
      const position = Math.min(100, Math.max(0, ((actuelle - bas) / etendue) * 100));
      repere.style.setProperty('--pos', `${position.toFixed(1)}%`);
      repere.title = 'température actuelle';
      piste.append(repere);
    }

    li.append(nom, bloc, h('div', 'jour__min', f.temp(jour.min, systeme)), piste,
      h('div', 'jour__max', f.temp(jour.max, systeme)));
    return li;
  });

  hote.replaceChildren(...lignes);
}
