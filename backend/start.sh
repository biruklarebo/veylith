#!/bin/sh
# Applies new migrations, then starts the server.
set -e
prisma=./node_modules/.bin/prisma

if ! out=$($prisma migrate deploy 2>&1); then
  echo "$out"
  case $out in
    # A database from before Prisma already has the starting structure, so it is recorded as
    # applied (a "baseline") and the rest of the migrations run as usual.
    *P3005*)
      echo "Recording 0_init as applied for a database created before Prisma"
      $prisma migrate resolve --applied 0_init
      $prisma migrate deploy
      ;;
    *) exit 1 ;;
  esac
else
  echo "$out"
fi

exec node src/server.js
