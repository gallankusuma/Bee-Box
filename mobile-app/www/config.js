// Per-deployment API endpoints. Edit this file (not game.js) when deploying
// to staging/production or pointing at a real device/LAN IP - it's loaded
// before game.js and nothing else reads process.env in this static app.
window.BEE_BOX_API_HOSTS = {
  // Android emulator: 10.0.2.2 is the special alias for the host machine's
  // localhost. Physical device: replace with your machine's LAN IP.
  native: 'http://10.0.2.2:4000/api',
  // Browser dev: localhost works as-is.
  web: 'http://localhost:4000/api'
};
