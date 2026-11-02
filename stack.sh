#!/usr/bin/env bash
# Manages every container in compose.yaml. Services are never listed here, so
# new ones work as soon as they are added to that file. Only the `pb` commands
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

Backend (PocketBase)
  pb admin <email>      Create a dashboard admin, or change its password
  pb backup [name]      Save the database to backups/
  pb restore [file]     Replace the database with a backup (lists them if no file)
  pb reset              Erase the database, keeping a backup first
  pb migrate <args>     Run PocketBase migrations (create <name>, up, down [n])
  pb version            Show the PocketBase version

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

pb_exec() {
  if [ -t 0 ]; then
    compose exec backend /pb/pocketbase "$@"
  else
    compose exec -T backend /pb/pocketbase "$@"
  fi
}

# Run a shell command against the data volume in a throwaway backend container.
pb_data() {
  compose run --rm --no-deps -T --entrypoint sh backend -c "$1"
}

# SQLite must not be written to while its files are copied. The backend comes
# back on exit, even if the command fails partway.
pb_pause() {
  compose stop backend
  trap 'compose up -d --wait backend' EXIT
}

pb_confirm() {
  local answer
  read -r -p "$1 Type yes to continue: " answer
  if [ "$answer" != yes ]; then
    echo "Cancelled." >&2
    exit 1
  fi
}

pb_admin() {
  if [ $# -ne 1 ]; then
    echo "Usage: ./stack.sh pb admin <email>" >&2
    exit 1
  fi
  local password
  read -r -s -p "Password (at least 10 characters): " password
  echo
  pb_exec superuser upsert "$1" "$password"
  echo "Sign in at http://localhost:${BACKEND_PORT:-8090}/_/"
}

pb_backup() {
  local file="backups/${1:-backend-$(date +%Y%m%d-%H%M%S)}.tar.gz"
  mkdir -p backups
  pb_pause
  pb_data 'tar czf - -C /pb pb_data' >"$file.part"
  mv "$file.part" "$file"
  echo "$file"
}

pb_restore() {
  if [ $# -eq 0 ]; then
    ls -1 backups/*.tar.gz 2>/dev/null || echo "No backups yet."
    return
  fi
  if ! gzip -dc <"$1" | tar tf - | grep '^pb_data/data\.db$' >/dev/null; then
    echo "$1 is not a backend backup." >&2
    exit 1
  fi
  pb_confirm "This replaces the database with $1."
  pb_backup "before-restore-$(date +%Y%m%d-%H%M%S)"
  pb_data 'find /pb/pb_data -mindepth 1 -delete && tar xzf - -C /pb' <"$1"
}

pb_reset() {
  pb_confirm "This erases the database, including all accounts."
  pb_backup "before-reset-$(date +%Y%m%d-%H%M%S)"
  pb_data 'find /pb/pb_data -mindepth 1 -delete'
}

pb() {
  local action=${1:-}
  [ $# -gt 0 ] && shift
  case $action in
    admin) pb_admin "$@" ;;
    backup) pb_backup "$@" ;;
    restore) pb_restore "$@" ;;
    reset) pb_reset ;;
    migrate) pb_exec migrate "$@" ;;
    version) pb_exec --version ;;
    *)
      echo "Unknown pb command: ${action:-none}" >&2
      echo >&2
      usage >&2
      exit 1
      ;;
  esac
}

command=${1:-help}
[ $# -gt 0 ] && shift

case $command in
  help | -h | --help)
    usage
    exit 0
    ;;
  start | stop | restart | down | rebuild | clean-build | status | urls | logs | save-logs | shell | services | pb) ;;
  *)
    echo "Unknown command: $command" >&2
    echo >&2
    usage >&2
    exit 1
    ;;
esac

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
  pb) pb "$@" ;;
esac
