'use strict';
/**
 * Publiczna dokumentacja API załączników.
 *
 * Nie ma tu żadnej logiki biznesowej — tylko opis kontraktu, który można
 * wygodnie otworzyć w Postmanie, Insomnii albo wygenerować z OpenAPI.
 */

const { ALLOWED_EXTENSIONS, ALLOWED_LABEL } = require('./attachments');

function formats() {
  return ALLOWED_EXTENSIONS.map((ext) => ext.slice(1));
}

function apiSummary(limits) {
  return {
    ok: true,
    name: 'Plan zajęć — publiczne API',
    version: '2.0.0',
    auth: 'Brak. Endpointy planu, materiałów i licznika są publiczne.',
    cors: 'Brak nagłówków CORS. Używaj z curl/Postmana/serwera; przeglądarka z innej domeny nie wyśle POST.',
    formats: formats(),
    formatsLabel: ALLOWED_LABEL,
    limits,
    dimensions: {
      description: 'GET /api/groups zwraca cały katalog uczelni z gotowymi wymiarami.',
      field: 'kierunek, np. „Informatyka”',
      specialty: 'specjalność z nazwy grupy; null na pierwszym roku — wtedy jej nie wybierasz',
      year: 'rok studiów = ceil(semestr / 2), np. 1sem+2sem → 1',
      nabory: 'lata naboru = rok akademicki toku − (rok studiów − 1)',
      degree: 'typ studiów: 1st, 2st, jmgr, podypl, inż',
      mode: 'tryb: N (niestacjonarne) albo S (stacjonarne)',
      ay: 'rok akademicki planu — parametr każdego endpointu; bez niego obowiązuje bieżący',
    },
    endpoints: [
      {
        method: 'GET',
        path: '/api/groups',
        description: 'Pełny katalog grup z wymiarami (kierunek, specjalność, rok, nabór, typ studiów).',
        query: { refresh: '1 — pomiń 24-godzinny cache katalogu' },
      },
      {
        method: 'GET',
        path: '/api/plan',
        description: 'Aktualny plan grupy. Z niego bierze się pole classes[].id do uploadu.',
        query: { group: 'numer grupy, np. 21188', ay: 'rok akademicki, np. 2025 (opcjonalny)' },
      },
      {
        method: 'GET',
        path: '/api/plan?groups=…',
        description: 'Plan scalony z kilku grup (wykład + ćwiczenia/laby/lektorat). '
          + 'Zajęcia cudzych grup są odsiewane na serwerze; pierwsza grupa jest bazą.',
        query: {
          groups: 'numery grup po przecinku, np. 21613,21614 (maks. MAX_PLAN_GROUPS)',
          ay: 'rok akademicki planu (opcjonalny)',
        },
      },
      {
        method: 'GET',
        path: '/api/ideis/kierunki',
        description: 'Kierunki z formularza uczelni (stały wydział) z tłumaczeniem na katalog grup '
          + 'oraz rocznikami, które mają grupy na kierunku (krok 2 kreatora).',
      },
      {
        method: 'GET',
        path: '/api/ideis/specjalnosci',
        description: 'Specjalności kierunku: oferta z formularza plus starsze nazwy z katalogu. '
          + 'Z parametrem „nabor” tylko te, które mają grupy w tym roczniku (liczniki też są rocznikowe).',
        query: {
          kierunek: 'numer kierunku z formularza (np. 2333) albo „katalog:<kierunek>”',
          nabor: 'rocznik, np. 2024 (opcjonalny)',
        },
      },
      {
        method: 'GET',
        path: '/api/ideis/tryby',
        description: 'Tryby studiów dostępne w wyborze (krok 4 kreatora) — tylko wartości z grupami.',
        query: {
          kierunek: 'numer kierunku z formularza albo „katalog:<kierunek>”',
          nabor: 'rocznik, np. 2024 (opcjonalny)',
          spec: 'wartość specjalności z katalogu (opcjonalna, brak = bez zawężania)',
        },
      },
      {
        method: 'POST',
        path: '/api/visit',
        description: 'Zlicza jedno wejście do aplikacji. Ciało JSON: {"source":"web"|"pwa"|"apk"}.',
        body: { source: '"web" (przeglądarka), "pwa" (standalone) albo "apk" (aplikacja Android)' },
      },
      {
        method: 'GET',
        path: '/api/visits',
        description: 'Aktualny licznik wejść: suma, podział na przeglądarkę, PWA i aplikację oraz rozbicie na dni i godziny.',
      },
      {
        method: 'GET',
        path: '/api/notes',
        description: 'Notatki na kafelkach zajęć — mapa „identyfikator zajęć → notatka”.',
      },
      {
        method: 'POST',
        path: '/api/notes',
        description: 'Zapis notatki na kafelku (maks. 15 znaków). Pusta treść usuwa notatkę. Ciało JSON. '
          + 'Wymaga `group` albo `groups` (+ `ay`) — zajęcia muszą być w tym planie.',
        body: {
          classId: 'identyfikator zajęć z planu',
          text: 'treść notatki, maks. 15 znaków (puste = usuń)',
        },
      },
      {
        method: 'GET',
        path: '/api/feedback',
        description: 'Lista propozycji i zgłoszeń błędów (od najnowszych, limit 200).',
      },
      {
        method: 'POST',
        path: '/api/feedback',
        description: 'Anonimowe zgłoszenie błędu lub propozycji. Ciało JSON.',
        body: {
          kind: '"idea" albo "bug"',
          message: 'treść (3–2000 znaków)',
          version: 'wersja aplikacji (opcjonalna)',
          platform: 'web / android (opcjonalna)',
        },
      },
      {
        method: 'GET',
        path: '/api/attachments',
        description: 'Lista materiałów przypisanych do konkretnych zajęć.',
        query: { group: 'numer grupy', class: 'identyfikator zajęć z planu' },
      },
      {
        method: 'POST',
        path: '/api/attachments',
        description: 'Dodanie pliku. Ciało żądania to surowe bajty pliku (nie multipart).',
        query: {
          group: 'numer grupy',
          class: 'identyfikator zajęć z planu',
          name: 'opcjonalna nazwa pliku; alternatywa dla nagłówka x-file-name',
        },
        headers: {
          'x-plan-upload': '1 — wymagane',
          'x-file-name': 'nazwa pliku URL-encoded; wymagana, gdy nie ma ?name=',
        },
      },
      {
        method: 'POST',
        path: '/api/attachments/links',
        description: 'Dodanie bezpośredniego linku do materiału. Ciało to JSON.',
        query: {
          group: 'numer grupy',
          class: 'identyfikator zajęć z planu',
        },
        headers: {
          'x-plan-upload': '1 — wymagane',
        },
        body: {
          url: 'pełny adres http:// lub https://',
          title: 'opcjonalny tytuł, maks. 120 znaków',
        },
      },
      {
        method: 'DELETE',
        path: '/api/attachments/:id',
        description: 'Usunięcie pliku. Publiczne, bez logowania.',
        query: { group: 'numer grupy', class: 'identyfikator zajęć' },
        headers: { 'x-plan-upload': '1 — wymagane' },
      },
      {
        method: 'DELETE',
        path: '/api/attachments/links/:id',
        description: 'Usunięcie linku. Publiczne, bez logowania.',
        query: { group: 'numer grupy', class: 'identyfikator zajęć' },
        headers: { 'x-plan-upload': '1 — wymagane' },
      },
      {
        method: 'GET',
        path: '/api/attachments/:id',
        description: 'Pobranie pliku. Wymaga tych samych group i class co upload.',
        query: { group: 'numer grupy', class: 'identyfikator zajęć' },
      },
      {
        method: 'GET',
        path: '/api/openapi.json',
        description: 'Maszynopisany opis OpenAPI 3.1 dla generatorów klientów i Swaggera.',
      },
    ],
    examples: {
      findClass: 'curl -s "https://ideis.mati-it.pl/api/plan?group=21188"',
      catalog: 'curl -s "https://ideis.mati-it.pl/api/groups"',
      olderNabor: 'curl -s "https://ideis.mati-it.pl/api/plan?group=21188&ay=2025"',
      upload: 'curl -X POST "https://ideis.mati-it.pl/api/attachments?group=21188&class=<ID>&name=notatka.pdf" -H "x-plan-upload: 1" --data-binary @notatka.pdf',
      addLink: 'curl -X POST "https://ideis.mati-it.pl/api/attachments/links?group=21188&class=<ID>" -H "content-type: application/json" -H "x-plan-upload: 1" --data "{\\"url\\":\\"https://example.com/material\\",\\"title\\":\\"Materiał\\"}"',
      deleteFile: 'curl -X DELETE "https://ideis.mati-it.pl/api/attachments/<FILE_ID>?group=21188&class=<ID>" -H "x-plan-upload: 1"',
      deleteLink: 'curl -X DELETE "https://ideis.mati-it.pl/api/attachments/links/<LINK_ID>?group=21188&class=<ID>" -H "x-plan-upload: 1"',
      list: 'curl -s "https://ideis.mati-it.pl/api/attachments?group=21188&class=<ID>"',
      note: 'curl -X POST "https://ideis.mati-it.pl/api/notes?group=21188" -H "content-type: application/json" --data "{\\"classId\\":\\"2026-11-16|09:00|10:30|74835|Wyk|21188\\",\\"text\\":\\"Kolos\\"}"',
    },
    errors: {
      400: 'brak grupy/klasy/nazwy, pusty plik, zły URL lub JSON',
      403: 'niezgodny nagłówek Origin',
      404: 'nie ma takich zajęć albo pliku',
      409: 'limit liczby plików/linków dla zajęć lub duplikat linku',
      413: 'plik lub limit miejsca przekroczony',
      415: 'niedozwolony typ lub zła sygnatura pliku',
      429: 'limit operacji na IP',
      507: 'brak miejsca globalnie',
    },
  };
}

function openApiDocument(limits) {
  const groupParam = {
    name: 'group',
    in: 'query',
    required: true,
    schema: { type: 'string', pattern: '^\\d{2,8}$' },
    example: '21188',
  };
  const classParam = {
    name: 'class',
    in: 'query',
    required: true,
    schema: { type: 'string' },
    example: '2026-10-17|9:00|10:30|74835|Wyk|Infor. 1st 1sem WykN',
  };
  /** Rok akademicki planu: nabór + rok studiów − 1. Bez niego obowiązuje bieżący. */
  const ayParam = {
    name: 'ay',
    in: 'query',
    required: false,
    schema: { type: 'string', pattern: '^\\d{4}$' },
    example: '2025',
    description: 'Rok rozpoczęcia roku akademickiego planu (2025 = 2025/2026).',
  };
  const groupAndYear = [groupParam, ayParam];

  return {
    openapi: '3.1.0',
    info: {
      title: 'Plan zajęć — publiczne API',
      version: '2.0.0',
      description: 'Publiczne API planu, katalogu grup, materiałów zajęciowych i licznika wejść. Bez uwierzytelniania.',
    },
    servers: [{ url: '/' }],
    tags: [{ name: 'catalog' }, { name: 'attachments' }, { name: 'visits' }, { name: 'notes' }],
    paths: {
      '/api/attachments': {
        get: {
          tags: ['attachments'],
          summary: 'Lista załączników danych zajęć',
          parameters: [...groupAndYear, classParam],
          responses: {
            200: {
              description: 'Lista plików i limity',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/AttachmentList' } } },
            },
            404: { description: 'Nie ma takich zajęć' },
          },
        },
        post: {
          tags: ['attachments'],
          summary: 'Dodaj plik do zajęć',
          description: 'Ciało żądania to surowe bajty pliku. Nie używaj multipart/form-data.',
          parameters: [
            ...groupAndYear,
            classParam,
            {
              name: 'name',
              in: 'query',
              required: false,
              schema: { type: 'string', maxLength: 1200 },
              description: 'Nazwa pliku; jeśli pominięta, użyj nagłówka x-file-name.',
            },
            {
              name: 'x-plan-upload',
              in: 'header',
              required: true,
              schema: { type: 'string', enum: ['1'] },
              description: 'Znacznik uploadu wymagany przez serwer.',
            },
            {
              name: 'x-file-name',
              in: 'header',
              required: false,
              schema: { type: 'string' },
              description: 'Nazwa pliku URL-encoded; wymagana, gdy nie ma ?name=.',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/octet-stream': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          responses: {
            201: {
              description: 'Plik dodany',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/AttachmentList' } } },
            },
            400: { description: 'Brak nazwy/klasy albo pusty plik' },
            403: { description: 'Niezgodny Origin' },
            409: { description: 'Limit plików dla zajęć' },
            413: { description: 'Plik lub limit miejsca' },
            415: { description: 'Zły typ lub sygnatura' },
            429: { description: 'Limit operacji na IP' },
            507: { description: 'Brak miejsca globalnie' },
          },
        },
      },
      '/api/attachments/links': {
        post: {
          tags: ['attachments'],
          summary: 'Dodaj link do materiału',
          description: 'Linki są oddzielone od plików: nie zajmują miejsca i mają własny limit.',
          parameters: [
            ...groupAndYear,
            classParam,
            {
              name: 'x-plan-upload',
              in: 'header',
              required: true,
              schema: { type: 'string', enum: ['1'] },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LinkInput' },
              },
            },
          },
          responses: {
            201: {
              description: 'Link dodany',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/AttachmentList' } } },
            },
            400: { description: 'Zły URL lub JSON' },
            409: { description: 'Limit linków lub duplikat' },
            429: { description: 'Limit operacji na IP' },
          },
        },
      },
      '/api/attachments/{id}': {
        get: {
          tags: ['attachments'],
          summary: 'Pobierz załącznik',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-f0-9]{24}$' } },
            groupParam,
            classParam,
          ],
          responses: {
            200: {
              description: 'Plik',
              content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
            },
            404: { description: 'Nie znaleziono pliku' },
          },
        },
        delete: {
          tags: ['attachments'],
          summary: 'Usuń plik',
          description: 'Usuwanie jest publiczne — każdy może usunąć plik znając jego ID, grupę i zajęcia.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-f0-9]{24}$' } },
            groupParam,
            classParam,
            {
              name: 'x-plan-upload',
              in: 'header',
              required: true,
              schema: { type: 'string', enum: ['1'] },
            },
          ],
          responses: {
            200: {
              description: 'Plik usunięty',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/AttachmentList' } } },
            },
            404: { description: 'Nie znaleziono pliku' },
            429: { description: 'Limit operacji na IP' },
          },
        },
      },
      '/api/attachments/links/{id}': {
        delete: {
          tags: ['attachments'],
          summary: 'Usuń link',
          description: 'Usuwanie jest publiczne — każdy może usunąć link znając jego ID, grupę i zajęcia.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-f0-9]{24}$' } },
            groupParam,
            classParam,
            {
              name: 'x-plan-upload',
              in: 'header',
              required: true,
              schema: { type: 'string', enum: ['1'] },
            },
          ],
          responses: {
            200: {
              description: 'Link usunięty',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/AttachmentList' } } },
            },
            404: { description: 'Nie znaleziono linku' },
            429: { description: 'Limit operacji na IP' },
          },
        },
      },
      '/api/visits': {
        get: {
          tags: ['visits'],
          summary: 'Licznik wejść (przeglądarka, PWA i aplikacja Android)',
          responses: {
            200: {
              description: 'Aktualny stan licznika',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Visits' } } },
            },
          },
        },
      },
      '/api/notes': {
        get: {
          tags: ['notes'],
          summary: 'Notatki na kafelkach zajęć („Kolos”, „Egzamin”)',
          description: 'Mapa „identyfikator zajęć → notatka”. Notatka jest wspólna dla wszystkich.',
          responses: {
            200: {
              description: 'Wszystkie notatki',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Notes' } } },
            },
          },
        },
        post: {
          tags: ['notes'],
          summary: 'Zapis lub usunięcie notatki',
          description: 'Pusta treść usuwa notatkę. Maks. 15 znaków, jedna linia. '
            + 'Notatka może dotyczyć tylko zajęć, które są w planie wskazanym przez '
            + '`group`/`groups` (+ `ay`), i tylko z bieżącego roku akademickiego.',
          parameters: [
            { ...groupParam, required: false },
            {
              name: 'groups',
              in: 'query',
              description: 'Plan scalony: numery grup po przecinku (alternatywa dla `group`)',
              schema: { type: 'string' },
            },
            ayParam,
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/NoteInput' } },
            },
          },
          responses: {
            200: { description: 'Notatka zapisana albo usunięta' },
            400: { description: 'Zły identyfikator zajęć, data spoza roku albo za długa notatka' },
            403: { description: 'Niezgodny nagłówek Origin' },
            404: { description: 'Nie ma takich zajęć w planie wskazanej grupy' },
            429: { description: 'Limit operacji na IP albo pełny magazyn notatek' },
            503: { description: 'Nie udało się zapisać notatki (dysk) — nic nie zostało zapisane' },
          },
        },
      },
      '/api/visit': {
        post: {
          tags: ['visits'],
          summary: 'Zlicza jedno wejście do aplikacji',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    source: { type: 'string', enum: ['web', 'pwa', 'apk'], default: 'web' },
                  },
                },
              },
            },
          },
          responses: {
            204: { description: 'Zliczono' },
            400: { description: 'Nieprawidłowy JSON' },
            403: { description: 'Niezgodny nagłówek Origin' },
          },
        },
      },
      '/api/plan': {
        get: {
          tags: ['attachments'],
          summary: 'Aktualny plan grupy (źródło identyfikatorów zajęć)',
          parameters: [...groupAndYear],
          responses: {
            200: { description: 'Plan grupy' },
          },
        },
      },
      '/api/groups': {
        get: {
          tags: ['catalog'],
          summary: 'Pełny katalog grup z wymiarami',
          description: 'Kierunek, specjalność, rok studiów, nabór, typ studiów i tryb — po jednym polu na grupę.',
          parameters: [
            {
              name: 'refresh',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['1'] },
              description: 'Pomiń 24-godzinny cache katalogu.',
            },
          ],
          responses: {
            200: { description: 'Katalog grup' },
          },
        },
      },
    },
    components: {
      schemas: {
        Notes: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            maxLength: { type: 'integer', example: 15 },
            notes: {
              type: 'object',
              description: 'Identyfikator zajęć → notatka (maks. 15 znaków)',
              additionalProperties: { type: 'string' },
              example: { '2026-11-16|09:00|10:30|74835|Wyk|21188': 'Kolos' },
            },
          },
        },
        NoteInput: {
          type: 'object',
          required: ['classId'],
          properties: {
            classId: { type: 'string', example: '2026-11-16|09:00|10:30|74835|Wyk|21188' },
            text: { type: 'string', maxLength: 15, example: 'Kolos', description: 'Puste pole usuwa notatkę' },
          },
        },
        Visits: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            total: { type: 'integer', example: 1234 },
            web: { type: 'integer', example: 1000 },
            pwa: { type: 'integer', example: 134 },
            apk: { type: 'integer', example: 100 },
            firstAt: { type: ['string', 'null'], format: 'date-time' },
            lastAt: { type: ['string', 'null'], format: 'date-time' },
            updatedAt: { type: ['string', 'null'], format: 'date-time' },
            since: {
              type: ['string', 'null'],
              format: 'date-time',
              description: 'Początek rozbicia na dni i godziny (starsze wejścia są tylko w sumie)',
            },
            days: {
              type: 'object',
              description: 'Wejścia po dniach (strefa Europe/Warsaw, ostatnie 180 dni)',
              additionalProperties: {
                type: 'object',
                properties: {
                  web: { type: 'integer' },
                  pwa: { type: 'integer' },
                  apk: { type: 'integer' },
                },
              },
              example: { '2026-11-16': { web: 12, pwa: 3, apk: 5 } },
            },
            hours: {
              type: 'object',
              description: 'Wejścia po godzinie doby (0–23, strefa Europe/Warsaw)',
              additionalProperties: {
                type: 'object',
                properties: {
                  web: { type: 'integer' },
                  pwa: { type: 'integer' },
                  apk: { type: 'integer' },
                },
              },
              example: { 18: { web: 9, pwa: 2, apk: 4 } },
            },
          },
        },
        LinkInput: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', format: 'uri', example: 'https://example.com/material.pdf' },
            title: { type: 'string', maxLength: 120, example: 'Materiał do zajęć' },
          },
        },
        Link: {
          type: 'object',
          required: ['id', 'url', 'title'],
          properties: {
            id: { type: 'string', pattern: '^[a-f0-9]{24}$' },
            url: { type: 'string', format: 'uri' },
            title: { type: 'string' },
            host: { type: 'string' },
            addedAt: { type: 'string', format: 'date-time' },
          },
        },
        Attachment: {
          type: 'object',
          required: ['id', 'name', 'ext', 'mime', 'size', 'url'],
          properties: {
            id: { type: 'string', pattern: '^[a-f0-9]{24}$' },
            name: { type: 'string' },
            ext: { type: 'string', enum: formats() },
            kind: { type: 'string' },
            mime: { type: 'string' },
            size: { type: 'integer' },
            uploadedAt: { type: 'string', format: 'date-time' },
            url: { type: 'string' },
          },
        },
        AttachmentList: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            group: { type: 'string' },
            classId: { type: 'string' },
            attachment: { $ref: '#/components/schemas/Attachment' },
            attachments: { type: 'array', items: { $ref: '#/components/schemas/Attachment' } },
            link: { $ref: '#/components/schemas/Link' },
            links: { type: 'array', items: { $ref: '#/components/schemas/Link' } },
            limits: {
              type: 'object',
              properties: {
                maxFileBytes: { type: 'integer', example: limits.maxFileBytes },
                maxFilesPerClass: { type: 'integer', example: limits.maxFilesPerClass },
                maxLinksPerClass: { type: 'integer', example: limits.maxLinksPerClass },
                maxBytesPerClass: { type: 'integer', example: limits.maxBytesPerClass },
                maxTotalBytes: { type: 'integer', example: limits.maxTotalBytes },
                allowed: { type: 'array', items: { type: 'string' } },
                allowedLabel: { type: 'string', example: limits.allowedLabel || ALLOWED_LABEL },
              },
            },
          },
        },
      },
    },
  };
}

module.exports = { apiSummary, openApiDocument };
