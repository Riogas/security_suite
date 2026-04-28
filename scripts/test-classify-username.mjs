/**
 * Script standalone para validar classifyUsername sin framework de tests.
 * Ejecutar: node scripts/test-classify-username.mjs
 * No modifica produccion — solo lee e imprime resultados.
 */

// Copia inline de la funcion para no depender de path-aliases de Next.
// La implementacion exacta esta en src/lib/auth/classifyUsername.ts
function classifyUsername(raw) {
  const trimmed = (raw || '').trim();
  if (trimmed.length === 0) return 'invalid';
  if (/^\d+$/.test(trimmed)) return 'numeric';
  return 'alpha';
}

// ── Casos de prueba ──────────────────────────────────────────────────────────

const cases = [
  // AC-CLASS-01: alpha = al menos un caracter no-digito
  { input: 'DMEDAGLIA',        expected: 'alpha',   desc: 'AC-CLASS-01 / AC-00a — usuario tipico GSIST' },
  { input: 'jgomez',          expected: 'alpha',   desc: 'AC-CLASS-01 — lowercase' },
  { input: 'user123',         expected: 'alpha',   desc: 'AC-CLASS-01 — alfanumerico con digitos' },
  { input: 'abc',             expected: 'alpha',   desc: 'AC-CLASS-01 — solo letras' },
  { input: 'a',               expected: 'alpha',   desc: 'AC-CLASS-01 — un solo caracter alfabetico' },
  { input: '  DMEDAGLIA  ',   expected: 'alpha',   desc: 'AC-CLASS-01 — trim de espacios' },
  { input: 'USUARIO-AD',      expected: 'alpha',   desc: 'AC-CLASS-01 — caracter especial no-digito' },

  // AC-CLASS-02: numeric = solo digitos
  { input: '12345',           expected: 'numeric', desc: 'AC-CLASS-02 — usuario numerio tipico USUMOBILE' },
  { input: '0',               expected: 'numeric', desc: 'AC-CLASS-02 — digito unico' },
  { input: '9999999',         expected: 'numeric', desc: 'AC-CLASS-02 — varios digitos' },
  { input: '  456  ',         expected: 'numeric', desc: 'AC-CLASS-02 — trim de espacios' },

  // AC-00a: vacio → invalid
  { input: '',                expected: 'invalid', desc: 'AC-00a — string vacia' },
  { input: '   ',             expected: 'invalid', desc: 'AC-00a — solo espacios' },
  { input: null,              expected: 'invalid', desc: 'AC-00a — null (coercion)' },
  { input: undefined,         expected: 'invalid', desc: 'AC-00a — undefined (coercion)' },
];

// ── Runner ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

for (const { input, expected, desc } of cases) {
  const actual = classifyUsername(input);
  const ok = actual === expected;
  if (ok) {
    console.log(`  PASS  [${desc}]  input=${JSON.stringify(input)} → ${actual}`);
    passed++;
  } else {
    console.error(`  FAIL  [${desc}]  input=${JSON.stringify(input)} → expected=${expected}, got=${actual}`);
    failed++;
  }
}

console.log(`\n${passed + failed} tests, ${passed} pasaron, ${failed} fallaron.`);
if (failed > 0) process.exit(1);
