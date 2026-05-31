#!/bin/bash
export SKIP_ENV_VALIDATION="true"
export DATABASE_URL="postgresql://test:test@localhost:5432/test"
export NEXTAUTH_URL="http://localhost:3000"
export AUTH_SECRET="secretsecretsecretsecretsecretsecretsecretsecret"

docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=test postgres:14-alpine || true
docker run -d -p 6379:6379 redis:alpine || true
sleep 5
npx prisma db push --skip-generate || true

npm run dev &
DEV_PID=$!

echo "Waiting for http://localhost:3000/api/ready"
timeout 60 bash -c 'until curl -s http://localhost:3000/api/ready > /dev/null; do sleep 1; done'

PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000 npx playwright test e2e/grouping.spec.ts --project=chromium --config=playwright.config.ts

kill $DEV_PID
