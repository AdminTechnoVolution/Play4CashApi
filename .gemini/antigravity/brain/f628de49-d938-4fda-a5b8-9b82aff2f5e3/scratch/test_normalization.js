function getLangMock(query, data, headers) {
  const supported = ['es', 'en', 'fr', 'de', 'it', 'pt'];
  
  // 1. Priority: query parameter (e.g. ?lang=es-ES)
  const queryLang = query?.lang;
  if (queryLang) {
    const normalized = queryLang.split('-')[0].toLowerCase();
    if (supported.includes(normalized)) return normalized;
  }

  // 2. Stored data (already normalized)
  if (data?.lang) return data.lang;

  // 3. Fallback: accept-language header
  const headerLang = headers?.['accept-language'];
  if (headerLang) {
    // Split by comma for lists, then by semicolon for weights, then by dash for regions
    const first = headerLang.split(',')[0].split(';')[0].split('-')[0].trim().toLowerCase();
    if (supported.includes(first)) return first;
  }

  return 'en';
}

const tests = [
  { name: 'Query param es-ES', query: { lang: 'es-ES' }, data: {}, headers: {}, expected: 'es' },
  { name: 'Query param en-US', query: { lang: 'en-US' }, data: {}, headers: {}, expected: 'en' },
  { name: 'Accept-Language list', query: {}, data: {}, headers: { 'accept-language': 'es-CO,es;q=0.9,en;q=0.8' }, expected: 'es' },
  { name: 'Accept-Language weight only', query: {}, data: {}, headers: { 'accept-language': 'fr;q=0.9,en;q=0.8' }, expected: 'fr' },
  { name: 'Unsupported turns to default (en)', query: { lang: 'id-ID' }, data: {}, headers: { 'accept-language': 'ru' }, expected: 'en' },
  { name: 'Data takes priority if no query', query: {}, data: { lang: 'de' }, headers: { 'accept-language': 'es' }, expected: 'de' },
  { name: 'Query takes priority over data', query: { lang: 'pt' }, data: { lang: 'de' }, headers: { 'accept-language': 'es' }, expected: 'pt' },
];

let failed = 0;
tests.forEach(t => {
  const result = getLangMock(t.query, t.data, t.headers);
  if (result === t.expected) {
    console.log(`✅ ${t.name}: Got "${result}"`);
  } else {
    console.error(`❌ ${t.name}: Expected "${t.expected}", but got "${result}"`);
    failed++;
  }
});

if (failed === 0) {
  console.log("\nAll tests passed! 🚀");
} else {
  process.exit(1);
}
