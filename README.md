# MovieRater

React/Vite-app med ekstern Supabase.

## Forudsætninger

- Docker Desktop med Linux-containere, eller Docker på en Linux-server.
- Docker Compose 2.24.4 eller nyere.

Start Docker, og kør lokale kommandoer fra projektmappen.

## Supabase

Hvis du ikke allerede har en `.env`, kopiér eksempel-filen:

```sh
cp .env.example .env
```

Udfyld `.env` med dit Supabase-projekts oplysninger:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_WITH_YOUR_PUBLIC_KEY
```

Commit ikke `.env`. Brug kun en offentlig publishable key; værdier med
`VITE_` kan læses i browseren. Brug aldrig secret keys eller databasepasswords.

Supabase er ekstern, og der startes ingen databasecontainer. Ændrer du disse
variabler, skal produktionsimaget bygges igen.

## Start lokalt

```sh
docker compose up --build -d
```

Åbn [http://localhost:8080](http://localhost:8080).

| Handling | Kommando |
| --- | --- |
| Status | `docker compose ps` |
| Healthcheck | `curl http://localhost:8080/health` |
| Logs | `docker compose logs -f` |
| Stop | `docker compose down` |

Containeren skal vise `healthy`, og healthcheck skal svare `OK`.
Brug `curl.exe` i Windows PowerShell. Kør startkommandoen igen efter kodeændringer.

## Development

Start Vite med hot reload:

```sh
docker compose -p movierater-dev -f docker-compose.dev.yml up --build -d
```

Åbn [http://localhost:5173](http://localhost:5173). Ændringer i `src/` vises
automatisk. Genkør med `--build` efter ændringer af dependencies.

Efter ændringer af `.env`:

```sh
docker compose -p movierater-dev -f docker-compose.dev.yml up -d --force-recreate
```

Stop development:

```sh
docker compose -p movierater-dev -f docker-compose.dev.yml down
```

## CI/CD

Opret disse repository variables på GitHub under
**Settings → Secrets and variables → Actions → Variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `DEPLOY_ENABLED=false`, indtil produktionsserveren er klar.

Pull requests og push til andre branches end `main` kører lint, typekontrol,
app-tests med coverage, Node-tests, deployment-tests, Playwright i Chromium,
app-build, Docker-build, containerkontrol og sikkerhedsscanning. Fejl stopper
pipelinen. Et push til en branch med en åben PR udløser både push- og PR-kontrollen.

Efter push/merge til `main` eller versionstags publiceres det testede image til
`ghcr.io/movierater/devops_movierater`. Commit-tags og versionsmærker gør det muligt
at finde en bestemt version; deployment bruger den præcise image-digest.

Trivy stopper release ved alle CRITICAL-fund og HIGH-fund med en rettelse.
Rapporter gemmes i GitHub Actions. Publicering bruger `GITHUB_TOKEN`.

## Deployment og HTTPS

Automatisk deployment er forberedt, men forsøger ingen serverforbindelse, før
`DEPLOY_ENABLED=true`. Production Environment kræver serverindstillinger,
SSH-nøgle og en verificeret hostkey. Der kan kræves manuel godkendelse på GitHub.

Serveren henter det godkendte image og starter det med Compose. Caddy håndterer
HTTPS på port 80/443 og sender trafik til Nginx på det interne Docker-netværk.
Healthcheck, hjemmeside og assets kontrolleres efter deployment.

Følg [serveropsætning og aktivering](docs/deployment.md) for GitHub Secrets,
Variables, GHCR-login, domæne, HTTPS og første deployment.

## Opdatering og rollback

Godkendte main-releases deployes automatisk, når deployment er aktiveret.
Ved fejl forsøges rollback til den tidligere verificerede release.

Manuel deployment og rollback køres gennem deployment-workflowets
**Run workflow** på `main`. Tidligere image-digests og konfigurationer bevares;
der kræves intet rebuild. Se [den trinvise vejledning](docs/deployment.md).

## Lokale kvalitetskontroller

Med Node og npm installeret samt en udfyldt `.env`:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

App- og deployment-tests bruger mocks og kontakter ikke produktionsdatabasen.

`npm test` kører alle app-tests i `src/` og `tests/unit/` samt Node-tests i
`scripts/`, også i undermapper. Brug `.test` eller `.spec` i filnavnet.
`npm run test:coverage` kører app-testene med en coverage-rapport i `coverage/`.
På Linux med Bash køres
shell-integrationstests i `tests/` med `npm run test:integration`.
Playwright tester den kørende MovieRater-app. Installer Chromium én gang og kør:

```sh
npx playwright install chromium
npm run test:e2e
```

Browser-testene findes i `tests/e2e/`. De bruger syntetiske Supabase-værdier.
Playwright starter selv en isoleret Vite-server.
Begge pipelines kører `npm run test:ci` (app-tests med coverage og Node-tests),
`npm run test:integration` og `npm run test:e2e`. Coverage gemmes som et
workflow-artifakt; ved browserfejl gemmes også HTML-rapport og testresultater.

## Vedligeholdelse

Opdatér base-image-versioner og digests via en PR. Hold Node-versionen ens i
Dockerfilerne og `.nvmrc`, og gennemgå CI-kontrollerne og Trivy-rapporten.
De midlertidige Alpine-pins i Dockerfile kan fjernes, når det fastlåste
base-image indeholder de samme sikkerhedsrettelser.
