# Obraz produkcyjny aplikacji „Plan zajęć — wybór kierunku i grupy”.
#
# Zero zależności z npm — kopiujemy tylko kod i uruchamiamy go na oficjalnym
# obrazie Node. Dzięki temu build trwa sekundy i nie wymaga sieci.
#
#   docker compose up -d --build
#
FROM node:22-alpine

# Katalog aplikacji = katalog roboczy (serwer czyta stąd .env i cache).
WORKDIR /app

# Kod aplikacji. Kolejność od najrzadziej do najczęściej zmienianych.
# public/selection.js jest współdzielony: ładuje go przeglądarka i serwer.
COPY package.json ./
COPY server ./server
COPY public ./public

# Cache planu musi być zapisywalny dla użytkownika node (uid 1000).
RUN mkdir -p /app/.cache && chown -R node:node /app

USER node

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    CACHE_DIR=/app/.cache \
    TZ=Europe/Warsaw

EXPOSE 3000

# Healthcheck bez curla (Alpine go nie ma) — korzystamy z wbudowanego fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
