require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const gameRoutes = require('./routes/game');
const classesRoutes = require('./routes/classes');
const parentLinksRoutes = require('./routes/parentLinks');
const invitesRoutes = require('./routes/invites');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);

const app = express();

// CSP allowlist matches the external resources actually referenced by
// teacher-web/index.html and mobile-app/www/index.html: Google Fonts'
// stylesheet (fonts.googleapis.com) pulls the actual font files from
// fonts.gstatic.com, Font Awesome is served from cdnjs.cloudflare.com, and
// mobile-app additionally loads Chart.js/canvas-confetti from jsdelivr.
// This only shapes responses this API itself serves (error pages, any
// future admin page) - the frontends are static sites served elsewhere -
// but the rest of helmet's headers (X-Content-Type-Options, Referrer-Policy,
// frame-ancestors, etc.) apply to every response either way. Review.md P2 item 11.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin(origin, callback) {
    // No Origin header = not a browser request (curl, native app code outside
    // a WebView, server-to-server) - nothing for CORS to police here.
    if(!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} is not allowed`));
  },
  // Needed so the browser actually stores/sends the httpOnly refresh-token
  // cookie (teacher-web only, see utils/refreshCookie.js) - safe to enable
  // because origin is an explicit allowlist above, never a wildcard.
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/parent-links', parentLinksRoutes);
app.use('/api/invites', invitesRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Only bind a real port when run directly (`node src/server.js`) - tests
// import `app` and drive it in-process via supertest instead.
if(require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`Bee Box backend listening on http://localhost:${PORT}`));
}

module.exports = app;
