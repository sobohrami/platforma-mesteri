/**
 * Moderație automată MVP: reguli RO + URL + spam simplu.
 * Returnează { status: 'approved'|'flagged'|'rejected', codes: [], message: string }
 */

const RO_BAD = [
  'pula',
  'muie',
  'fut',
  'dracu',
  'cacat',
  'prost',
  'tampit',
];

function normalizeForProfanity(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-zăâîșțăâî]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasUrl(s) {
  const t = String(s || '');
  return /https?:\/\/|www\.|\.(ro|com|net|eu|org)\b/i.test(t) || /\b[a-z0-9-]+\.(ro|com|net|eu)\b/i.test(t);
}

function profanityCheck(text) {
  const n = normalizeForProfanity(text);
  for (const w of RO_BAD) {
    if (n.includes(w)) return true;
  }
  return false;
}

function spamHeuristic(title, description) {
  const t = `${title} ${description}`;
  const upper = (t.match(/[A-ZĂÂÎȘȚ]/g) || []).length;
  const ratio = t.length ? upper / t.length : 0;
  if (ratio > 0.5 && t.length > 20) return 'prea_multe_majuscule';
  const punct = (t.match(/[!?.]{3,}/g) || []).length;
  if (punct > 2) return 'punctuatie_excesiva';
  return null;
}

function moderateContent({ title, description, categoryId, cityId }) {
  const codes = [];
  if (!title || String(title).trim().length < 5) codes.push('titlu_scurt');
  if (!description || String(description).trim().length < 20) codes.push('descriere_scurta');
  if (!categoryId) codes.push('categorie_lipsa');
  if (!cityId) codes.push('oras_lipsa');
  if (codes.length) {
    return {
      status: 'rejected',
      codes,
      message: 'Conținutul nu îndeplinește cerințele minime.',
    };
  }
  if (hasUrl(title) || hasUrl(description)) {
    return {
      status: 'rejected',
      codes: ['link_interzis'],
      message: 'Linkurile externe nu sunt permise în titlu sau descriere.',
    };
  }
  if (profanityCheck(title) || profanityCheck(description)) {
    return {
      status: 'rejected',
      codes: ['limbaj_inadecvat'],
      message: 'Limbaj inadecvat detectat.',
    };
  }
  const spam = spamHeuristic(title, description);
  if (spam) {
    return {
      status: 'flagged',
      codes: [spam],
      message: 'Conținut suspect pentru verificare manuală.',
    };
  }
  return { status: 'approved', codes: [], message: '' };
}

module.exports = { moderateContent };
