# Veylith

A workout planner and tracker: a React PWA (Vite + React + TypeScript, Zustand) with a Node.js API and a PostgreSQL database. Data lives in the database, and each device keeps a copy in IndexedDB so workouts carry on without a connection.

```mermaid
flowchart LR
    browser["Browser or phone"]
    idb[("IndexedDB<br/>device copy")]
    frontend["frontend container<br/>nginx, port 8088"]
    backend["backend container<br/>API, port 8090"]
    database["database container<br/>PostgreSQL"]
    volume[("database_data volume<br/>source of truth")]

    browser <-- "app and /api" --> frontend
    browser <--> idb
    frontend -- "forwards /api" --> backend
    backend <--> database
    database <--> volume
```

## Structure

```
frontend/      React app and its container
backend/       API container and database migrations
database/      PostgreSQL container
docs/          Documentation
compose.yaml   All containers
stack.sh       Manages the containers
```

Each new container gets its own top-level folder.

## Run

In containers, with the app at http://localhost:8088:

```bash
./stack.sh start     # start everything
./stack.sh rebuild   # rebuild and restart after code changes
./stack.sh status    # health, URLs, CPU and memory
./stack.sh urls      # service URLs
./stack.sh logs      # follow logs
./stack.sh down      # stop and remove everything (data is kept)
./stack.sh help      # list all commands
```

The first run creates `.env` with generated secrets. To look after the database:

```bash
./stack.sh db status   # migrations and table sizes
./stack.sh db ui       # browse it in a web page
./stack.sh db backup   # save it to backups/
```

On Windows, run it from Ubuntu in WSL with Docker Desktop closed (see [Containers](docs/containers.md)).

For frontend development, at http://localhost:5173, with the backend container running:

```bash
cd frontend
npm install
npm run dev
npm run build
```

## Docs

- [Features](docs/features.md)
- [Containers](docs/containers.md)
- [Backend](docs/backend.md)
- [Database](docs/database.md)
