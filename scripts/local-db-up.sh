#!/usr/bin/env bash
# Starts the local test database (Docker containers) if it is stopped, and waits until it answers.
# Safe to run anywhere: it does nothing where there is no Docker or no such containers.
# Container names: TEST_DB_CONTAINERS (default "ohdb ohrest", the database and its API).
set -u
containers="${TEST_DB_CONTAINERS:-ohdb ohrest}"
command -v docker >/dev/null 2>&1 || exit 0

# A cloud workspace can pause and come back without its Docker service: start it (Linux, as root only).
if ! docker info >/dev/null 2>&1; then
  if [ "$(uname)" = "Linux" ] && [ "$(id -u)" = "0" ] && command -v dockerd >/dev/null 2>&1; then
    (nohup dockerd >/tmp/dockerd.log 2>&1 &)
    for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
  fi
  docker info >/dev/null 2>&1 || exit 0
fi

started=no
for c in $containers; do
  docker container inspect "$c" >/dev/null 2>&1 || continue
  if [ "$(docker container inspect -f '{{.State.Running}}' "$c")" != "true" ]; then
    docker start "$c" >/dev/null && started=yes
  fi
done
[ "$started" = "yes" ] || exit 0

# Wait for the database to report healthy (up to 40 seconds).
for _ in $(seq 1 40); do
  docker ps --format '{{.Status}}' | grep -q healthy && break
  sleep 1
done
echo "Local test database started."
