'use strict';

/**
 * En-têtes de sécurité, écrits à la main pour éviter une dépendance de plus.
 *
 * La Content-Security-Policy est volontairement très stricte : tout le site
 * (HTML, CSS, JS, icônes SVG) est servi depuis cette origine, donc aucune
 * source externe n'est nécessaire. Pas de 'unsafe-inline' : il n'y a ni
 * <script> ni <style> en ligne dans index.html.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "manifest-src 'self'",
  'upgrade-insecure-requests'
].join('; ');

const PERMISSIONS_POLICY = [
  // La géolocalisation reste autorisée : c'est le bouton « Ma position ».
  'geolocation=(self)',
  'camera=()',
  'microphone=()',
  'payment=()',
  'usb=()',
  'magnetometer=()',
  'accelerometer=()',
  'gyroscope=()'
].join(', ');

function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');

  // Utile seulement en HTTPS ; inoffensif en local, les navigateurs ignorent
  // l'en-tête sur une connexion non chiffrée.
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');

  next();
}

/**
 * Limite de débit en mémoire, par IP, sur une fenêtre fixe.
 *
 * Suffisant pour un serveur mono-processus. Pour plusieurs instances il
 * faudrait un compteur partagé (Redis) : la limite serait sinon appliquée
 * par instance.
 */
function createRateLimiter({ windowMs, max, maxTrackedClients }) {
  /** @type {Map<string, {count: number, resetAt: number}>} */
  const clients = new Map();

  function sweep(now) {
    for (const [key, entry] of clients) {
      if (entry.resetAt <= now) clients.delete(key);
    }
  }

  // Nettoyage périodique pour que les IP inactives ne restent pas en mémoire.
  // unref() : ce minuteur n'empêche pas le processus de se terminer.
  const timer = setInterval(() => sweep(Date.now()), windowMs).unref();

  function middleware(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'inconnu';

    let entry = clients.get(key);
    if (!entry || entry.resetAt <= now) {
      if (!entry && clients.size >= maxTrackedClients) {
        sweep(now);
        if (clients.size >= maxTrackedClients) {
          // Trop de clients suivis simultanément : on refuse plutôt que de
          // laisser la table grossir sans limite.
          res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
          return res.status(429).json({
            error: 'too_many_requests',
            message: 'Serveur momentanément saturé, réessaie dans un instant.'
          });
        }
      }
      entry = { count: 0, resetAt: now + windowMs };
      clients.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((entry.resetAt - now) / 1000)));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({
        error: 'too_many_requests',
        message: 'Trop de requêtes. Patiente quelques secondes.'
      });
    }

    next();
  }

  middleware.reset = () => clients.clear();
  middleware.stop = () => clearInterval(timer);

  return middleware;
}

module.exports = { securityHeaders, createRateLimiter, CSP };
