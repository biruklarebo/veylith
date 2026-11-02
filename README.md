# Veylith

A workout planner and tracker built as an offline-first React PWA (Vite + React + TypeScript, Zustand, IndexedDB).

## Structure

```
frontend/      React app and its container
docs/          Documentation
compose.yaml   All containers
stack.sh       Manages the containers
```

Each new container gets its own top-level folder, such as `backend/`.

## Run

In containers, at http://localhost:8088:

```bash
./stack.sh start     # start everything
./stack.sh rebuild   # rebuild and restart after code changes
./stack.sh status    # health, URLs, CPU and memory
./stack.sh urls      # service URLs
./stack.sh logs      # follow logs
./stack.sh down      # stop and remove everything
./stack.sh help      # list all commands
```

On Windows, run it from Ubuntu in WSL with Docker Desktop closed (see [Containers](docs/containers.md)).

For frontend development, at http://localhost:5173:

```bash
cd frontend
npm install
npm run dev
npm run build
```

## Docs

- [Features](docs/features.md)
- [Containers](docs/containers.md)
