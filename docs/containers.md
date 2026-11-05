# Containers

Every container is defined in `compose.yaml` at the repo root and managed with `stack.sh`. Docker must be running.

On Windows, run it from Ubuntu in WSL with Docker Desktop closed, so it uses the Docker engine installed in Ubuntu. Stick to one engine: Docker Desktop is a separate engine, so running the script from both starts two copies of a service on the same port, and `localhost` can keep showing the older one. While Docker Desktop is open with WSL integration on, `docker` in Ubuntu reaches Docker Desktop instead of Ubuntu's engine. Run `docker info --format '{{.Name}}'` to see which one you're on.

```mermaid
flowchart LR
    ubuntu["docker in Ubuntu"]
    windows["docker in Git Bash<br/>or PowerShell"]
    engine["Ubuntu's engine<br/>use this one"]
    desktop["Docker Desktop's engine"]
    localhost["localhost:8088"]

    ubuntu -- "Docker Desktop closed" --> engine
    ubuntu -. "Docker Desktop open" .-> desktop
    windows --> desktop
    engine -- "wins the port if both run" --> localhost
    desktop -.-> localhost
```

## The stack

```mermaid
flowchart LR
    browser["Browser"]
    stack["stack.sh"]

    subgraph compose["compose.yaml"]
        frontend["frontend<br/>nginx, port 8088"]
        backend["backend<br/>API, port 8090"]
        database["database<br/>PostgreSQL, port 5432<br/>this machine only"]
        volume[("database_data")]
    end

    stack -- manages --> compose
    browser --> frontend
    frontend -- "forwards /api" --> backend
    backend --> database
    database --> volume
```

## Running

| Command | What it does |
| --- | --- |
| `./stack.sh start [services]` | Start, building only if an image is missing |
| `./stack.sh stop [services]` | Stop containers but keep them |
| `./stack.sh restart [services]` | Restart without rebuilding |
| `./stack.sh down [services]` | Stop and remove containers (volumes are kept) |

```mermaid
stateDiagram-v2
    [*] --> Running: start
    Running --> Running: restart
    Running --> Stopped: stop
    Stopped --> Running: start
    Running --> Removed: down
    Stopped --> Removed: down
    Removed --> Running: start
```

## Building

| Command | What it does |
| --- | --- |
| `./stack.sh rebuild [services]` | Rebuild images and restart with the changes |
| `./stack.sh clean-build [services]` | Rebuild from scratch, ignoring the build cache |

Use `rebuild` after changing code. `start` and `restart` keep running the existing image.

```mermaid
flowchart TD
    changed{"What changed?"}
    changed -- "App code or Dockerfile" --> rebuild["rebuild"]
    changed -- "schema.prisma" --> migrate["db migrate &lt;name&gt;<br/>rebuilds the backend"]
    changed -- "Port or other .env setting" --> start["start"]
    rebuild -- "Build fails on stale layers" --> clean["clean-build"]
```

None of these touch the data in a volume. Only `./stack.sh db reset` and `./stack.sh db restore` do.

## Monitoring

| Command | What it does |
| --- | --- |
| `./stack.sh status` | Show health, URLs, CPU and memory |
| `./stack.sh urls` | Show the URL of each service |
| `./stack.sh logs [services]` | Follow logs, for one service or all of them |
| `./stack.sh save-logs [services]` | Write each service's logs to `logs/<service>.log` |

`save-logs` overwrites the previous file for that service. The `logs/` folder is ignored by git.

`urls` also runs after `start`, `rebuild` and `clean-build`. `URL` is the address on your machine, and `-` means the service has no published port. `INTERNAL` is the address other containers use. Every port is shown as `http://`, so a database appears that way too even though it doesn't speak HTTP.

## Other

| Command | What it does |
| --- | --- |
| `./stack.sh shell <service>` | Open a shell inside a container |
| `./stack.sh services` | List services in `compose.yaml` |

With no services given, a command applies to the whole stack.

## Database

| Command | What it does |
| --- | --- |
| `./stack.sh db shell` | Open a SQL prompt |
| `./stack.sh db studio` | Browse and edit the data in Prisma Studio |
| `./stack.sh db status` | Show migrations and table sizes |
| `./stack.sh db migrate <name>` | Turn changes to `backend/prisma/schema.prisma` into a migration and apply it |
| `./stack.sh db url` | Show how to connect your own database app |
| `./stack.sh db backup [name]` | Save the database to `backups/` |
| `./stack.sh db restore [file]` | Replace the database with a backup, or list backups |
| `./stack.sh db reset` | Erase the database, keeping a backup first |

See [Database](database.md).

## Adding a container

1. Create a top-level folder for it, such as `worker/`, with its code and a `Dockerfile`.
2. Add a service to `compose.yaml` with `build: ./worker`.
3. Run `./stack.sh start worker`.

```mermaid
flowchart LR
    folder["Create worker/<br/>with a Dockerfile"]
    service["Add a service<br/>to compose.yaml"]
    start["./stack.sh start worker"]
    managed["All stack.sh commands<br/>now work for it"]

    folder --> service --> start --> managed
```

The script reads services from `compose.yaml`, so it needs no changes. Services reach each other by service name.

## Configuration

`stack.sh` creates `.env` at the repo root from `.env.example` on first use and generates the secrets. It's ignored by git, so keep it safe: `POSTGRES_PASSWORD` in it must match the database. `FRONTEND_PORT` sets the host port for the frontend (default 8088). Other settings are listed in [Backend](backend.md#changing-the-setup) and [Database](database.md#changing-things-later).
