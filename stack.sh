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
  db studio             Browse and edit the data in Prisma Studio
  db status             Show migrations and table sizes
  db migrate <name>     Turn changes to backend/prisma/schema.prisma into a migration and apply it
  db url                Show how to connect your own database app
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

# A setting as Compose sees it: from the shell first, then .env, then the default.
setting() {
  local value=${!1:-}
  [ -n "$value" ] || value=$(sed -nE "s/^$1=(.*)$/\1/p" .env | tr -d '\r' | tail -1)
  echo "${value:-$2}"
}

db_studio() {
  compose --profile tools up -d --build studio
  echo "Open http://localhost:$(setting STUDIO_PORT 5555). Stop it with: ./stack.sh down"
}

db_status() {
  compose exec -T backend ./node_modules/.bin/prisma migrate status 2>&1 | grep -v '^Loaded Prisma config'
  # Exact row counts for every table, without listing the tables here.
  db_exec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT table_name AS table,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I', table_name), false, true, '')))[1]::text::bigint AS rows,
       pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name NOT LIKE '\_prisma%'
ORDER BY table_name;
SQL
}

# Compares schema.prisma with the database, writes the difference as a new migration in
# backend/prisma/migrations and applies it. The backend is then rebuilt to use it.
db_migrate() {
  if [ $# -ne 1 ]; then
    echo "Usage: ./stack.sh db migrate <name>, after editing backend/prisma/schema.prisma" >&2
    exit 1
  fi
  local tty=-T
  [ -t 0 ] && tty=
  db_backup "before-migrate-$(date +%Y%m%d-%H%M%S)"
  # shellcheck disable=SC2086 # empty when interactive
  compose run --rm --no-deps $tty -v "$(pwd -W 2>/dev/null || pwd)/backend/prisma:/app/prisma" backend ./node_modules/.bin/prisma migrate dev --name "$1"
  compose up -d --build --wait backend
}

db_url() {
  local port db user
  port=$(setting POSTGRES_PORT 5432)
  db=$(setting POSTGRES_DB veylith)
  user=$(setting POSTGRES_USER veylith)
  echo "Connect from this machine only:"
  echo "  postgresql://$user:<password>@localhost:$port/$db"
  echo "  Host: localhost  Port: $port  Database: $db  User: $user"
  echo "  The password is POSTGRES_PASSWORD in .env"
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
    studio) db_studio ;;
    status) db_status ;;
    migrate) db_migrate "$@" ;;
    url) db_url ;;
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
