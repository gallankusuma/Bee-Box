require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const gameRoutes = require('./routes/game');
const classesRoutes = require('./routes/classes');
const parentLinksRoutes = require('./routes/parentLinks');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);

const app = express();
app.use(cors({
  origin(origin, callback) {
    // No Origin header = not a browser request (curl, native app code outside
    // a WebView, server-to-server) - nothing for CORS to police here.
    if(!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} is not allowed`));
  }
}));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/parent-links', parentLinksRoutes);

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
