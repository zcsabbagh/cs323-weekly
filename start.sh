#!/bin/sh
mkdir -p /app/data/submissions
chmod -R 777 /app/data
exec node server.js
