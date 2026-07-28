const { customAlphabet } = require('nanoid');

// Excludes visually ambiguous characters (0/O, 1/I/L) since these codes are
// meant to be typed by hand (students joining a class, parents linking).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const generateCode = customAlphabet(ALPHABET, 6);

module.exports = { generateCode };
