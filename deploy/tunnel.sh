#!/usr/bin/env bash
# Weryfikacja wspólnego tunelu Cloudflare (plan-zajec-tunnel).
#
# Ten projekt NIE stawia drugiego cloudflared. Korzysta z istniejącego tunelu
# `plan-zajec-tunnel` (--network host), który widzi aplikację pod
# 127.0.0.1:3002. Nowy hostname dodaje się po stronie Cloudflare przez API:
#
#   GET  /accounts/<acc>/cfd_tunnel/<tunel>/configurations
#   PUT  ... ta sama lista + {hostname: "ideis.mati-it.pl",
#                            service: "http://127.0.0.1:3002"}
#   POST /zones/<zone>/dns_records  CNAME ideis -> <tunel>.cfargotunnel.com
#
# Uwaga: PUT /configurations nadpisuje CAŁĄ listę ingress — zawsze pobierz
# aktualną konfigurację i dopisz regułę przed http_status:404.
set -euo pipefail

NAME="${TUNNEL_CONTAINER:-plan-zajec-tunnel}"
TARGET="${UPSTREAM:-http://127.0.0.1:3002}"

if ! docker inspect "$NAME" >/dev/null 2>&1; then
  echo "[tunnel] brak kontenera $NAME — uruchom go najpierw" >&2
  exit 1
fi

echo "[tunnel] kontener: $NAME"
docker inspect "$NAME" --format '  network: {{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
docker inspect "$NAME" --format '  status:  {{.State.Status}}'

if curl -fsS -m 10 "$TARGET/health" >/dev/null 2>&1; then
  echo "[tunnel] aplikacja odpowiada na $TARGET"
else
  echo "[tunnel] UWAGA: aplikacja nie odpowiada na $TARGET" >&2
fi

if docker logs --tail 200 "$NAME" 2>&1 | grep -q 'Registered tunnel connection'; then
  echo "[tunnel] połączony z Cloudflare:"
  docker logs --tail 200 "$NAME" 2>&1 | grep 'Registered tunnel connection' | tail -n 1 \
    | sed -E 's/.*(connIndex=[0-9]).*(location=[a-z0-9]+).*/\1 \2/'
else
  echo "[tunnel] brak połączenia w logach — sprawdź: docker logs --tail 50 $NAME" >&2
  exit 1
fi

echo "[tunnel] hostname ideis.mati-it.pl musi być w ingress po stronie Cloudflare"
