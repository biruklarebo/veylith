#!/usr/bin/env bash
# Manages every container in compose.yaml. Services are never listed here, so
# new ones work as soon as they are added to that file. Only the `db` commands
# know about a specific service.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# Git Bash would otherwise rewrite container paths like /pb into Windows paths.
export MSYS_NO_PATHCONV=1

usage() {
  cat <<'EOF'
Usage: ./stack.sh <command> [services...]

Running
  start [services]      Start, building only if an image is missing
  stop [services]       Stop containers but keep them
  restart [services]    Restart without rebuilding
  down [services]       Stop and remove containers (volumes are kept)

Building
  rebuild [services]    Rebuild images and restart with the changes
  clean-build [services]  Rebuild from scratch, ignoring the build cache

Monitoring
  status                Show health, URLs, CPU and memory
  urls                  Show the URL of each service
  logs [services]       Follow logs, for one service or all of them
  save-logs [services]  Write each service's logs to logs/<service>.log

Other
  shell <service>       Open a shell inside a container
  services              List services in compose.yaml

Database
  db shell              Open a SQL prompt
  db ui                 Browse the database in a web page
  db status             Show applied migrations and table sizes
  db new <name>         Create a migration file to edit
  db backup [name]      Save the database to backups/
  db restore [file]     Replace the database with a backup (lists them if no file)
  db reset              Erase the database, keeping a backup first

With no services given, a command applies to the whole stack.
EOF
}

compose() {
  docker compose "$@"
}

list_services() {
  compose config --services | tr -d '\r'
}

require_docker() {
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running. Start it and try again." >&2
    exit 1
  fi
}

# Host URL for published ports; INTERNAL is the address other containers use.
urls() {
  local service ports host target url
  printf '%-16s %-26s %s\n' SERVICE URL INTERNAL
  for service in $(list_services); do
    ports=$(compose ps --format '{{.Ports}}' "$service" | tr -d '\r' | tr ',' '\n' |
      sed -nE -e 's/.*:([0-9]+)->([0-9]+)\/tcp.*/\1 \2/p' -e 's/^ *([0-9]+)\/tcp *$/- \1/p' | sort -u)
    if [ -z "$ports" ]; then
      printf '%-16s %s\n' "$service" 'not running'
      continue
    fi
    while read -r host target; do
      url=http://localhost:$host
      [ "$host" = - ] && url=-
      printf '%-16s %-26s %s\n' "$service" "$url" "http://$service:$target"
    done <<<"$ports"
  done
}

summary() {
  compose ps
  echo
  urls
}

status() {
  compose ps -a
  echo
  urls
  local running
  running=$(compose ps -q | tr -d '\r')
  if [ -n "$running" ]; then
    echo
    # shellcheck disable=SC2086 # one container id per word
    docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' $running
  fi
}

save_logs() {
  mkdir -p logs
  local service
  for service in ${@:-$(list_services)}; do
    compose logs --no-color --no-log-prefix --timestamps "$service" >"logs/$service.log"
    echo "logs/$service.log"
  done
}

open_shell() {
  if [ $# -eq 0 ]; then
    echo "Usage: ./stack.sh shell <service>" >&2
    exit 1
  fi
  if [ -t 0 ]; then
    compose exec "$1" sh
  else
    compose exec -T "$1" sh
  fi
}

# Runs inside the database container, signed in with its own settings.
db_exec() {
  compose exec -T database sh -c "$1"
}

db_confirm() {
  local answer
  read -r -p "$1 Type yes to continue: " answer
  if [ "$answer" != yes ]; then
    echo "Cancelled." >&2
    exit 1
  fi
}

# The backend comes back on exit, even if the command fails partway.
db_pause() {
  compose stop backend
  trap 'compose up -d --wait backend' EXIT
}

db_shell() {
  if [ -t 0 ]; then
    compose exec database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  else
    db_exec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  fi
}

db_ui() {
  compose --profile tools up -d adminer
  # shellcheck disable=SC1091 # created by ensure_env
  . ./.env
  echo "Open http://localhost:${ADMINER_PORT:-8091}"
  echo "System: PostgreSQL, Server: database, Username: ${POSTGRES_USER:-veylith}, Database: ${POSTGRES_DB:-veylith}"
  echo "The password is POSTGRES_PASSWORD in .env"
}

db_status() {
  db_exec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT name, applied_at FROM schema_migrations ORDER BY name" -c "SELECT relname AS table, n_live_tup AS rows, pg_size_pretty(pg_total_relation_size(relid)) AS size FROM pg_stat_user_tables ORDER BY relname"'
}

db_new() {
  if [ $# -ne 1 ]; then
    echo "Usage: ./stack.sh db new <name>" >&2
    exit 1
  fi
  local last next file
  last=$(ls backend/migrations | sed -nE 's/^([0-9]+)_.*/\1/p' | sort -n | tail -1)
  next=$(printf '%03d' $((10#${last:-0} + 1)))
  file="backend/migrations/${next}_$1.sql"
  echo "-- $1" >"$file"
  echo "$file"
  echo "Edit it, then run: ./stack.sh db backup && ./stack.sh restart backend"
}

db_backup() {
  local file="backups/${1:-database-$(date +%Y%m%d-%H%M%S)}.dump"
  mkdir -p backups
  db_exec 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$file.part"
  mv "$file.part" "$file"
  echo "$file"
}

db_restore() {
  if [ $# -eq 0 ]; then
    ls -1 backups/*.dump 2>/dev/null || echo "No backups yet."
    return
  fi
  if ! compose exec -T database pg_restore -l <"$1" >/dev/null 2>&1; then
    echo "$1 is not a database backup." >&2
    exit 1
  fi
  db_confirm "This replaces the database with $1."
  db_backup "before-restore-$(date +%Y%m%d-%H%M%S)"
  db_pause
  db_exec 'psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
  db_exec 'pg_restore --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <"$1"
}

db_reset() {
  db_confirm "This erases the database, including all accounts."
  db_backup "before-reset-$(date +%Y%m%d-%H%M%S)"
  db_pause
  db_exec 'psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
}

db() {
  local action=${1:-}
  [ $# -gt 0 ] && shift
  case $action in
    shell) db_shell ;;
    ui) db_ui ;;
    status) db_status ;;
    new) db_new "$@" ;;
    backup) db_backup "$@" ;;
    restore) db_restore "$@" ;;
    reset) db_reset ;;
    *)
      echo "Unknown db command: ${action:-none}" >&2
      echo >&2
      usage >&2
      exit 1
      ;;
  esac
}

# Fills in any empty secret. Compose refuses to start without them.
ensure_env() {
  [ -f .env ] || cp .env.example .env
  local key value
  for key in POSTGRES_PASSWORD JWT_SECRET; do
    grep -Eq "^$key=.+" .env && continue
    value=$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')
    if grep -q "^$key=" .env; then
      sed -i "s/^$key=.*/$key=$value/" .env
    else
      printf '%s=%s\n' "$key" "$value" >>.env
    fi
  done
}

command=${1:-help}
[ $# -gt 0 ] && shift

case $command in
  help | -h | --help)
    usage
    exit 0
    ;;
  start | stop | restart | down | rebuild | clean-build | status | urls | logs | save-logs | shell | services | db) ;;
  *)
    echo "Unknown command: $command" >&2
    echo >&2
    usage >&2
    exit 1
    ;;
esac

ensure_env
require_docker

case $command in
  start) compose up -d --wait "$@" && summary ;;
  stop) compose stop "$@" ;;
  restart) compose restart "$@" ;;
  down) compose down "$@" ;;
  rebuild) compose up -d --build --wait "$@" && summary ;;
  clean-build) compose build --no-cache "$@" && compose up -d --wait "$@" && summary ;;
  status) status ;;
  urls) urls ;;
  logs) compose logs -f --tail 100 "$@" ;;
  save-logs) save_logs "$@" ;;
  shell) open_shell "$@" ;;
  services) list_services ;;
  db) db "$@" ;;
esac
