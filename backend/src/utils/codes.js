const { customAlphabet } = require('nanoid');
const prisma = require('../db');

// Excludes visually ambiguous characters (0/O, 1/I/L) since these codes are
// meant to be typed by hand (students joining a class, parents linking).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const generateCode = customAlphabet(ALPHABET, 6);

// How long a student's parent-link code stays claimable. Claiming it
// regenerates a fresh code+expiry (see routes/parentLinks.js), so this also
// functions as the "single-use" window in practice.
const LINK_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function linkCodeExpiry() {
  return new Date(Date.now() + LINK_CODE_TTL_MS);
}

// Shared by registration (auth.js) and code regeneration (parentLinks.js).
async function uniqueLinkCode() {
  for(let i = 0; i < 5; i++) {
    const code = generateCode();
    const clash = await prisma.studentProfile.findUnique({ where: { linkCode: code } });
    if(!clash) return code;
  }
  throw new Error('Could not generate a unique link code, please retry');
}

module.exports = { generateCode, linkCodeExpiry, uniqueLinkCode };
