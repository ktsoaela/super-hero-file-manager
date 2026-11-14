const path = require('path');

/**
 * Paths the renderer has been shown by a listing. Only these may be streamed,
 * read, opened or used as a transfer source, so a compromised page cannot ask
 * for arbitrary files.
 */
const allowed = new Set();
const MAX = 250000;
const key = (p) => path.resolve(p).toLowerCase();

function allow(p) {
  if (allowed.size >= MAX) allowed.clear();
  allowed.add(key(p));
}

function isAllowed(p) {
  return typeof p === 'string' && path.isAbsolute(p) && allowed.has(key(p));
}

module.exports = { allow, isAllowed };
