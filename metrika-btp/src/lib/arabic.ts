/**
 * Mise en forme de l'arabe pour pdf-lib (qui dessine de gauche à droite et
 * n'applique ni le chaînage des lettres ni le sens RTL). On convertit chaque
 * lettre vers sa forme contextuelle (isolée/initiale/médiane/finale), on gère
 * la ligature lam-alef, puis on réordonne visuellement (bidi simplifié) pour
 * un rendu lisible. Pour un arabe parfait (RTL complet), préférer l'export DOCX.
 */

// base → [isolée, finale, initiale, médiane]. dualJoin = se lie à la lettre suivante.
const FORMS: Record<string, { f: [string, string, string, string]; dual: boolean }> = {
  "ء": { f: ["ﺀ", "ﺀ", "ﺀ", "ﺀ"], dual: false }, // hamza
  "آ": { f: ["ﺁ", "ﺂ", "ﺁ", "ﺂ"], dual: false }, // alef madda
  "أ": { f: ["ﺃ", "ﺄ", "ﺃ", "ﺄ"], dual: false }, // alef hamza above
  "ؤ": { f: ["ﺅ", "ﺆ", "ﺅ", "ﺆ"], dual: false }, // waw hamza
  "إ": { f: ["ﺇ", "ﺈ", "ﺇ", "ﺈ"], dual: false }, // alef hamza below
  "ئ": { f: ["ﺉ", "ﺊ", "ﺋ", "ﺌ"], dual: true },  // yeh hamza
  "ا": { f: ["ﺍ", "ﺎ", "ﺍ", "ﺎ"], dual: false }, // alef
  "ب": { f: ["ﺏ", "ﺐ", "ﺑ", "ﺒ"], dual: true },  // beh
  "ة": { f: ["ﺓ", "ﺔ", "ﺓ", "ﺔ"], dual: false }, // teh marbuta
  "ت": { f: ["ﺕ", "ﺖ", "ﺗ", "ﺘ"], dual: true },  // teh
  "ث": { f: ["ﺙ", "ﺚ", "ﺛ", "ﺜ"], dual: true },  // theh
  "ج": { f: ["ﺝ", "ﺞ", "ﺟ", "ﺠ"], dual: true },  // jeem
  "ح": { f: ["ﺡ", "ﺢ", "ﺣ", "ﺤ"], dual: true },  // hah
  "خ": { f: ["ﺥ", "ﺦ", "ﺧ", "ﺨ"], dual: true },  // khah
  "د": { f: ["ﺩ", "ﺪ", "ﺩ", "ﺪ"], dual: false }, // dal
  "ذ": { f: ["ﺫ", "ﺬ", "ﺫ", "ﺬ"], dual: false }, // thal
  "ر": { f: ["ﺭ", "ﺮ", "ﺭ", "ﺮ"], dual: false }, // reh
  "ز": { f: ["ﺯ", "ﺰ", "ﺯ", "ﺰ"], dual: false }, // zain
  "س": { f: ["ﺱ", "ﺲ", "ﺳ", "ﺴ"], dual: true },  // seen
  "ش": { f: ["ﺵ", "ﺶ", "ﺷ", "ﺸ"], dual: true },  // sheen
  "ص": { f: ["ﺹ", "ﺺ", "ﺻ", "ﺼ"], dual: true },  // sad
  "ض": { f: ["ﺽ", "ﺾ", "ﺿ", "ﻀ"], dual: true },  // dad
  "ط": { f: ["ﻁ", "ﻂ", "ﻃ", "ﻄ"], dual: true },  // tah
  "ظ": { f: ["ﻅ", "ﻆ", "ﻇ", "ﻈ"], dual: true },  // zah
  "ع": { f: ["ﻉ", "ﻊ", "ﻋ", "ﻌ"], dual: true },  // ain
  "غ": { f: ["ﻍ", "ﻎ", "ﻏ", "ﻐ"], dual: true },  // ghain
  "ف": { f: ["ﻑ", "ﻒ", "ﻓ", "ﻔ"], dual: true },  // feh
  "ق": { f: ["ﻕ", "ﻖ", "ﻗ", "ﻘ"], dual: true },  // qaf
  "ك": { f: ["ﻙ", "ﻚ", "ﻛ", "ﻜ"], dual: true },  // kaf
  "ل": { f: ["ﻝ", "ﻞ", "ﻟ", "ﻠ"], dual: true },  // lam
  "م": { f: ["ﻡ", "ﻢ", "ﻣ", "ﻤ"], dual: true },  // meem
  "ن": { f: ["ﻥ", "ﻦ", "ﻧ", "ﻨ"], dual: true },  // noon
  "ه": { f: ["ﻩ", "ﻪ", "ﻫ", "ﻬ"], dual: true },  // heh
  "و": { f: ["ﻭ", "ﻮ", "ﻭ", "ﻮ"], dual: false }, // waw
  "ى": { f: ["ﻯ", "ﻰ", "ﻯ", "ﻰ"], dual: false }, // alef maksura
  "ي": { f: ["ﻱ", "ﻲ", "ﻳ", "ﻴ"], dual: true },  // yeh
};

// Ligatures lam + alef → forme isolée/finale.
const LAM_ALEF: Record<string, [string, string]> = {
  "ا": ["ﻻ", "ﻼ"], // lam-alef
  "آ": ["ﻵ", "ﻶ"], // lam-alef madda
  "أ": ["ﻷ", "ﻸ"], // lam-alef hamza above
  "إ": ["ﻹ", "ﻺ"], // lam-alef hamza below
};

const DIACRITICS = /[ً-ٰٟ]/; // harakat (zéro largeur, ignorées pour le chaînage)

/** Vrai si la chaîne contient des caractères arabes. */
export function isArabic(s: string): boolean {
  return /[؀-ۿ]/.test(s);
}

function isLetter(ch: string): boolean {
  return !!FORMS[ch];
}

/** Applique les formes contextuelles + ligatures à une chaîne arabe (ordre logique). */
function reshape(text: string): string {
  const chars = [...text];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (DIACRITICS.test(ch)) continue; // on retire les harakat (rarement présentes)
    const form = FORMS[ch];
    if (!form) { out.push(ch); continue; }

    // Voisins significatifs (en ignorant diacritiques).
    let p = i - 1; while (p >= 0 && DIACRITICS.test(chars[p])) p--;
    let n = i + 1; while (n < chars.length && DIACRITICS.test(chars[n])) n++;
    const prev = p >= 0 ? chars[p] : "";
    const next = n < chars.length ? chars[n] : "";

    // Ligature lam-alef : si lam suivi d'un alef.
    if (ch === "ل" && LAM_ALEF[next]) {
      const joinsPrev = isLetter(prev) && FORMS[prev].dual;
      out.push(LAM_ALEF[next][joinsPrev ? 1 : 0]);
      i = n; // on saute l'alef
      continue;
    }
    // Si on est sur un alef déjà consommé par la ligature précédente → ignoré via i=n.

    const joinsPrev = isLetter(prev) && FORMS[prev].dual;
    const joinsNext = form.dual && isLetter(next);
    const idx = joinsPrev && joinsNext ? 3 : joinsPrev ? 1 : joinsNext ? 2 : 0;
    out.push(form.f[idx]);
  }
  return out.join("");
}

/**
 * Met en forme une ligne pour un rendu LTR (pdf-lib) : reshaping arabe + bidi
 * simplifié (réordonne les segments, inverse les segments arabes, conserve
 * l'ordre des segments latins/chiffres).
 */
export function shapeArabicLine(line: string): string {
  if (!isArabic(line)) return line;
  // Découpe en segments arabes / non-arabes (les espaces suivent le segment courant).
  const segs: { ar: boolean; text: string }[] = [];
  for (const ch of line) {
    const ar = /[؀-ۿ]/.test(ch);
    const last = segs[segs.length - 1];
    if (last && last.ar === ar) last.text += ch;
    else segs.push({ ar, text: ch });
  }
  // Ordre visuel RTL : on inverse la suite des segments.
  const visual = segs
    .slice()
    .reverse()
    .map((s) => (s.ar ? [...reshape(s.text)].reverse().join("") : s.text))
    .join("");
  return visual;
}
