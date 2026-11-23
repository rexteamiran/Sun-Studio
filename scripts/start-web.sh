#!/usr/bin/env bash
# Sun Studio web server — binds to localhost only.
cd "$(dirname "$0")" || exit 1
export HOSTNAME="${HOST:-127.0.0.1}"
export PORT="${PORT:-3570}"
exec node server.js
