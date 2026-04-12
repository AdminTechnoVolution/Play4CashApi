def get_lang_mock(query, data, headers):
    supported = ['es', 'en', 'fr', 'de', 'it', 'pt']
    
    # 1. Query parameter
    query_lang = query.get('lang')
    if query_lang:
        normalized = query_lang.split('-')[0].lower()
        if normalized in supported:
            return normalized

    # 2. Stored data
    if data.get('lang'):
        return data['lang']

    # 3. Accept-Language header
    header_lang = headers.get('accept-language')
    if header_lang:
        first = header_lang.split(',')[0].split(';')[0].split('-')[0].strip().lower()
        if first in supported:
            return first

    return 'en'

tests = [
    { 'name': 'Query param es-ES', 'query': { 'lang': 'es-ES' }, 'data': {}, 'headers': {}, 'expected': 'es' },
    { 'name': 'Query param en-US', 'query': { 'lang': 'en-US' }, 'data': {}, 'headers': {}, 'expected': 'en' },
    { 'name': 'Accept-Language list', 'query': {}, 'data': {}, 'headers': { 'accept-language': 'es-CO,es;q=0.9,en;q=0.8' }, 'expected': 'es' },
    { 'name': 'Accept-Language weight only', 'query': {}, 'data': {}, 'headers': { 'accept-language': 'fr;q=0.9,en;q=0.8' }, 'expected': 'fr' },
    { 'name': 'Unsupported turns to default (en)', 'query': { 'lang': 'id-ID' }, 'data': {}, 'headers': { 'accept-language': 'ru' }, 'expected': 'en' },
    { 'name': 'Data takes priority if no query', 'query': {}, 'data': { 'lang': 'de' }, 'headers': { 'accept-language': 'es' }, 'expected': 'de' },
    { 'name': 'Query takes priority over data', 'query': { 'lang': 'pt' }, 'data': { 'lang': 'de' }, 'headers': { 'accept-language': 'es' }, 'expected': 'pt' },
]

failed = 0
for t in tests:
    result = get_lang_mock(t['query'], t['data'], t['headers'])
    if result == t['expected']:
        print(f"✅ {t['name']}: Got '{result}'")
    else:
        print(f"❌ {t['name']}: Expected '{t['expected']}', but got '{result}'")
        failed += 1

if failed == 0:
    print("\nAll tests passed! 🚀")
else:
    exit(1)
