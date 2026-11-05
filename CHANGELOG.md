# Changelog

Notable changes to Veylith, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Add new changes under `Unreleased` in the same PR as the change. Nothing has been released yet, so earlier entries are grouped by date. From the first release on, each release gets a version number and a date.

## [Unreleased]

### Action needed

- The database is now reachable from this machine on port 5432, for your own database app. Run `./stack.sh db url` for the details. If something else on this machine already uses that port, set `POSTGRES_PORT` in `.env`.

### Added

- Prisma manages the database: the structure is in `backend/prisma/schema.prisma`, and the backend uses Prisma Client for every query.
- `./stack.sh db migrate <name>` turns schema changes into a migration, takes a backup and applies it.
- `./stack.sh db studio` opens Prisma Studio to browse and edit the data.
- `./stack.sh db url` shows how to connect your own database app.

### Changed

- Migrations now live in `backend/prisma/migrations`. Existing databases and older backups are picked up automatically, with no change to the data.
- `./stack.sh db status` shows exact row counts.

### Removed

- `./stack.sh db ui` and the Adminer container, in favour of Prisma Studio or your own database app.
- `./stack.sh db new`, replaced by `db migrate`.

## 2026-11-02

### Action needed

- Run the stack from Ubuntu in WSL with Docker Desktop closed. `./stack.sh` creates `.env` with generated secrets on first run. Keep that file safe, because it's the only copy of the database password.
- Create an account in the same browser you've been using. Data already on the device uploads on first sign-in.
- Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env` to turn on Google sign-in.

### Added

- Accounts with email and password sign-in.
- Google sign-in, with existing accounts joined by email where it's safe to do so.
- Name and profile picture on each account, editable in Settings. Google accounts get both automatically.
- Sync between devices. Data is stored in your account, and each device keeps a copy so the app works offline and catches up afterwards.
- PostgreSQL database in its own container, holding all data including photos.
- Node.js API in its own container, for sign-in, sync and files.
- `./stack.sh db` commands: `shell`, `ui`, `status`, `new`, `backup`, `restore` and `reset`.
- Numbered SQL migrations in `backend/migrations`, applied when the backend starts.
- Warning on Home and in Settings when changes haven't reached the server.
- "Show all" button for workout history on Progress.
- Mermaid diagrams throughout the docs, plus new [Backend](docs/backend.md) and [Database](docs/database.md) docs.

### Changed

- Home greets you by first name, and your picture replaces the settings gear on Home and Progress.
- Numbers, dates and durations are easier to read: `158,400 lb`, `55 min`, `Today`, `Sun, Nov 1`.
- Upcoming sets in the workout logger are easier to read.
- Larger calendar arrows, and visible focus outlines for keyboard users.
- The "Any" badge no longer appears on days not pinned to a weekday.
- Weekly check-in no longer asks people with history to "log a few workouts".

### Fixed

- The phone or browser back button now goes back a screen instead of leaving the app.

### Removed

- PocketBase and its dashboard. It was added and replaced the same day, because it can't use a separate database. `./stack.sh db ui` opens a database browser instead.

### Security

- Each account can only reach its own data.
- Passwords are hashed with scrypt.
- Sign-in and sign-up are limited to 10 tries a minute from one address.
- Google sign-in uses a state check and PKCE.
- The database has no published port, so only other containers can reach it.

## 2026-11-01

### Added

- Month view on the Home calendar, moving through any past or future date.
- Plan a program day for any date from today on. A workout planned for today becomes the one on the Today card.
- Day sheet showing what was logged or planned on any calendar day.
- Decimal commas in number fields, such as `22,5`.

### Changed

- Progress activity cells are larger and open with one tap.
- Backups now include photos, imported programs, the active program and planned days.

### Fixed

- Home calendar days with no workout couldn't be tapped.
- Only one workout could be opened on a day with several.
- Pop-up sheets opened from a card were trapped inside it.
- Week streak collapsed after the clocks changed.
- Deleted workouts left their personal records behind.
- "Today" showed for last night's workout, and body stat chart dates could show a day early.
- The 1-rep row in the 1RM table was about 3% too low.
- Imported rest times like `90` were read as minutes.
- Number fields rejected decimals in several places, and clearing one left a stuck 0.
- Log Set could skip ahead or end the workout after deleting the selected set.
- Tapping a progression rule's description switched it to Off.
- A cancelled photo delete could leave the next photo one tap from deletion.
- Check-in Start did nothing on rest days.
- Swapping an exercise broke its superset.
- Rest alarm opened a new audio connection for every beep.
- Smaller fixes to "Saved to plan", Create Exercise, set effort ratings, custom bar weights, the weight trend arrow, removing the last set and body stat entries.

## 2026-10-31

### Added

- Frontend container, with `compose.yaml` and `stack.sh` to manage the stack (#2).
- Weekly check-in on Home.
- Curated programs: import a program spreadsheet and follow it week by week. Essentials 3x, Fundamentals 5x, Reddit PPL 6x and Minimize Maximize 4x are built in.
- Progress photos, with a before and after slider.
- Home week navigation, today's muscle map, a choice of workout and a body-weight card.

### Changed

- Project moved into `frontend/` and `docs/` folders (#2).
- Redesigned the workout-complete screen.
- Refreshed Discover and program pages, with art cards and a program switcher.
- Exercise library moved to Discover.
- Tabs renamed, and Instant is now Quickstart.

## 2026-10-24

### Added

- Veylith workout tracker as an offline-first web app.
- Automatic progression, plate maths, warm-up sets, per-set effort and a muscle recovery model.
- Home today card, activity heatmap, weight goal, set steppers and swipe between exercises.
- Exercise illustrations from Everkinetic.
