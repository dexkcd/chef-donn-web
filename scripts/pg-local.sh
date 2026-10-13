#!/usr/bin/env bash
# Local Postgres 16 for dev and tests — no Docker needed.
#   bash scripts/pg-local.sh start   → initdb (first time) + start on 127.0.0.1:54329
#   bash scripts/pg-local.sh stop
# Creates databases `chefdonn` (dev) and `chefdonn_test` (tests), trust auth, user `postgres`.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA_DIR="${PGLOCAL_DIR:-/tmp/chef-donn-pg}"
PGPORT="${PGLOCAL_PORT:-54329}"

# Postgres refuses to run as root; drop to the `postgres` system user when we are root.
as_pg() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

start() {
  if [ ! -f "$PGDATA_DIR/PG_VERSION" ]; then
    mkdir -p "$PGDATA_DIR"
    [ "$(id -u)" = "0" ] && chown postgres:postgres "$PGDATA_DIR"
    as_pg "$PGBIN/initdb" -D "$PGDATA_DIR" -U postgres --auth=trust -E UTF8 >/dev/null
  fi
  if as_pg "$PGBIN/pg_ctl" -D "$PGDATA_DIR" status >/dev/null 2>&1; then
    echo "postgres already running on 127.0.0.1:$PGPORT"
  else
    as_pg "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -l "$PGDATA_DIR/server.log" \
      -o "-p $PGPORT -k $PGDATA_DIR -c listen_addresses=127.0.0.1 -c fsync=off" -w start >/dev/null
    echo "postgres started on 127.0.0.1:$PGPORT"
  fi
  for db in chefdonn chefdonn_test; do
    if ! psql -h 127.0.0.1 -p "$PGPORT" -U postgres -tAc "select 1 from pg_database where datname='$db'" | grep -q 1; then
      psql -h 127.0.0.1 -p "$PGPORT" -U postgres -c "create database $db" >/dev/null
    fi
  done
}

stop() {
  as_pg "$PGBIN/pg_ctl" -D "$PGDATA_DIR" -m fast stop >/dev/null && echo "postgres stopped"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
