# Météo Monde

La météo de n'importe quelle ville de la planète : maintenant, heure par heure, et sur 7 jours.

Un petit serveur Express, une interface sans framework, et les données d'[Open-Meteo](https://open-meteo.com/).

## Démarrer

```bash
npm install
```

```bash
npm start
```

Puis ouvre <http://localhost:3000>.

Pas de clé d'API à récupérer, pas de compte à créer : Open-Meteo est gratuit pour un usage non commercial. Rien à stocker, donc rien à publier par erreur.

`npm run dev` relance le serveur à chaque modification, `npm test` lance les tests (sans accès réseau).

## Ce que ça fait

Tu cherches une ville, elle s'affiche. Les suggestions montrent la région et le pays, parce qu'il existe un Tokyo en Papouasie-Nouvelle-Guinée et qu'on ne veut pas se tromper.

Le reste : géolocalisation si tu la demandes, villes épinglées en favoris, °C ou °F, thème clair/sombre/automatique, et un bandeau quand un orage approche.

Le fond de la page suit la météo réelle du lieu et son heure locale — dégradé, nuages, pluie qui tombe. Il fait nuit à Sydney, la page est sombre.

## Les adresses

| Adresse | Résultat |
| --- | --- |
| `/meteo/france/paris` | Paris |
| `/meteo/papouasie-nouvelle-guinee/tokyo` | l'autre Tokyo — le pays lève l'ambiguïté |
| `/meteo/tokyo` | pays omis : la ville la plus peuplée de ce nom |
| `/meteo/@48.86,2.35` | un point précis, sans nom |
| `/` | dernière ville consultée, sinon Paris |

Les accents disparaissent du chemin (`/meteo/bresil/sao-paulo`), et les flèches précédent/suivant du navigateur fonctionnent normalement.

Tu verras parfois une ancre `?ll=65.64,-16.91` s'ajouter. C'est le filet de sécurité : le chemin ne contient qu'un nom, qu'il faut retraduire en coordonnées. Ça marche pour presque toutes les villes, mais « Reykjahlíð » devient `reykjahlid`, un nom qu'Open-Meteo ne reconnaît plus. L'application le vérifie après chaque chargement et n'ajoute les coordonnées que dans ces cas-là. L'adresse reste courte d'habitude, et un lien partagé ouvre toujours le bon endroit.

Les anciens liens en `#lat=...` marchent encore : ils sont réécrits au format propre à l'ouverture.

## L'API

| Route | Paramètres | Réponse |
| --- | --- | --- |
| `GET /api/search` | `q` (1–80 caractères), `limit` (1–10, défaut 8) | lieux correspondants |
| `GET /api/weather` | `lat` (−90…90), `lon` (−180…180) | maintenant, 24 h, 7 jours |
| `GET /api/health` | — | état du serveur |

Le site est en lecture seule : toute autre méthode HTTP reçoit un 405.

## Le code

```
server.js              démarrage, arrêt propre, messages d'erreur clairs
src/
  config.js            variables d'environnement, validées
  app.js               assemblage de l'application Express
  security.js          en-têtes de sécurité et limite de débit
  cache.js             cache mémoire, avec expiration et taille bornée
  openMeteo.js         appels à Open-Meteo, réponses normalisées
  weatherCodes.js      codes météo WMO → libellé + icône
  routes/api.js        les trois routes ci-dessus
public/
  index.html           la page (aucun script ni style en ligne)
  styles.css           toute la mise en forme
  app.js               état, événements, appels à l'API
  routes.js            adresses lisibles
  render.js            fabrication du DOM (tuiles, graphique, 7 jours)
  icons.js             icônes SVG animées, dessinées à la main
  format.js            unités et mise en forme des nombres
  store.js             préférences et favoris (localStorage)
test/api.test.js       tests du serveur, avec un faux client météo
```

## Côté sécurité

Le plus simple d'abord : il n'y a aucune clé d'API à protéger, aucun cookie, aucun traceur, et le serveur n'écoute que sur `127.0.0.1` tant que tu ne demandes pas autre chose.

La Content-Security-Policy est stricte, sans `unsafe-inline` : la page n'a ni `<script>`, ni `<style>`, ni attribut `style`, et ne charge rien depuis l'extérieur — les icônes sont des SVG du projet, les polices celles du système. Tout ce qui vient du réseau, de l'URL ou du navigateur est inséré via `textContent`, jamais `innerHTML`.

Côté serveur : entrées validées avant tout usage (longueur, caractères de contrôle, coordonnées bornées), URL sortantes construites vers un hôte fixe, aucun analyseur de corps de requête monté, limite de débit par IP, 8 s maximum accordées à Open-Meteo, et des erreurs qui gardent leurs détails techniques dans les journaux. Les coordonnées sont arrondies au kilomètre avant d'être transmises : assez précis pour la météo, moins bavard sur ta position.

## Réglages

Tout fonctionne sans configuration. Pour personnaliser, crée un fichier `.env` à la racine (il est déjà dans `.gitignore`) avec les variables qui t'intéressent :

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `3000` | port d'écoute |
| `HOST` | `127.0.0.1` | `0.0.0.0` pour ouvrir au réseau local |
| `NODE_ENV` | `development` | `production` active le cache navigateur |
| `RATE_LIMIT_MAX` | `60` | requêtes autorisées par fenêtre |
| `RATE_LIMIT_WINDOW_MS` | `60000` | durée de la fenêtre |
| `UPSTREAM_TIMEOUT_MS` | `8000` | délai accordé à Open-Meteo |
| `CACHE_WEATHER_TTL_MS` | `300000` | fraîcheur des prévisions en cache |
| `CACHE_SEARCH_TTL_MS` | `3600000` | fraîcheur des recherches en cache |
| `TRUST_PROXY` | `false` | uniquement derrière un reverse proxy de confiance |

Attention à ce dernier : `TRUST_PROXY=true` fait confiance à l'en-tête `X-Forwarded-For`. Sans reverse proxy devant, n'importe qui peut alors usurper son IP et contourner la limite de débit.

## Limites connues

Open-Meteo ne sait pas traduire des coordonnées en nom de ville, donc « Ma position » s'affiche sous ce nom, avec le fuseau horaire en repère. Et si quelqu'un t'envoie un lien ancré (`/meteo/islande/reykjahlid?ll=...`), le titre affichera « Reykjahlid » sans accents : le nom est reconstruit depuis le chemin. La météo, elle, est bien la bonne.

Le cache et la limite de débit vivent en mémoire : avec plusieurs instances derrière un répartiteur de charge, il faudrait les partager (Redis). Les prévisions s'arrêtent à 7 jours, la limite du forfait gratuit.
