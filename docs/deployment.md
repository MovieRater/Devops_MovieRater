# CI/CD og deployment

Den eksisterende Docker-opsætning bruges til både CI, publicering og deployment.
Produktionsserveren er endnu ikke tilsluttet. Lad `DEPLOY_ENABLED` være tom eller
`false`, indtil serveren og GitHub-indstillingerne er klar.

## Pipeline

- Pull requests og manuel kørsel af PR-workflowet kører installation fra
  lockfil, lint, typekontrol, app-tests med coverage, Node-tests,
  deployment-tests, Playwright i Chromium, produktionsbuild, Docker-build,
  containerkontrol og sikkerhedsscanning. Branches uden en PR har ingen separat
  push-kontrol; `main` og versionstags håndteres af publish-workflowet.
- Push/merge til `main` og versionstags bygger og tester et release-image og
  publicerer det til `ghcr.io/movierater/devops_movierater`.
- Det samme image testes før og efter publicering. Der bygges ikke et nyt image
  mellem testen og publiceringen.
- Efter en godkendt main-release kan deployment hente den præcise image-digest,
  starte den på serveren og kontrollere healthcheck og hjemmesiden.
- Ved fejl forsøges rollback til den tidligere verificerede release. Workflowet
  fejler stadig, selv hvis rollback lykkes.

Lint, typekontrol og alle tests er obligatoriske før publicering. Supabase-tests
bruger mocks og syntetiske værdier, så CI ikke behøver adgang til
produktionsdatabasen. Browser-testene bruger også syntetisk konfiguration,
adskilt fra produktionskonfigurationen. Begge workflows indeholder de samme testgrupper;
det indgående separate `ci.yml` er samlet med dem for at undgå parallelle
unit- og build-jobs for samme hændelse. Opdateringer af en åben PR udløser én
PR-kørsel, uden en ekstra kontrol fra branchens push.
Containerkontrollen tester også assets, SPA-fallback, cache, gzip og rettigheder.

Trivy scanner npm-dependencies, inklusive build- og testværktøjer, og runtime-imaget. Alle CRITICAL-fund og HIGH-fund
med en tilgængelig rettelse stopper pipelinen. HIGH-fund uden rettelse vises i
rapporten. Fejl i scanneren eller rapportvalideringen stopper også pipelinen.

Base-images er fastlåst med version og digest. Runtime-pakker opdateres med
`apk upgrade --no-cache` fra den valgte Alpine-versions repositories uden
fastlåsning af enkelte pakkeversioner. Docker kan genbruge et tidligere build-lag;
hent nye sikkerhedsrettelser med `docker compose build --no-cache` eller ved
opdatering af base-imagets digest, og kontrollér det nye image med Trivy.

## Versionsmærkning og release

Hvert image får `sha-<fuldt-commit-id>`. Main får også `main` og `latest`.
Semantiske Git-tags som `v1.2.3` får tilsvarende versionstags. Tidligere
publicerede commit-images genbruges frem for at blive overskrevet.

Deployment bruger altid en reference som:

```text
ghcr.io/movierater/devops_movierater@sha256:<64-hex-tegn>
```

Et flydende tag som `latest` bruges ikke til automatiseret deployment.
Release-artifaktet indeholder den verificerede reference og konfigurationen fra
samme commit. Det bruges også ved manuel deployment. Images bygges til
`linux/amd64`; brug en server med denne arkitektur.

## GitHub Variables og Secrets

### Repository variables

Under **Settings → Secrets and variables → Actions → Variables**:

| Navn | Værdi |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase-projektets URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Offentlig nøgle med præfikset `sb_publishable_`. |
| `DEPLOY_ENABLED` | `false` indtil opsætningen er færdig; derefter `true`. |

Supabase-værdierne indbygges ved build og kan læses i browseren. Private nøgler,
`service_role` og databasepasswords må aldrig gives til Vite. Ændringer af
buildvariabler kræver et nyt image og en ny commit-reference.

### Production Environment

Opret **Settings → Environments → production**. Begræns deployment til `main`.
Tilføj gerne required reviewers for manuel godkendelse før serveradgang.
Disse beskyttelser konfigureres på GitHub; workflowfilerne aktiverer dem ikke selv.

Tilføj environment variables:

| Navn | Eksempel |
| --- | --- |
| `DEPLOY_HOST` | Serverens IP eller hostname. |
| `DEPLOY_USER` | `movierater` |
| `DEPLOY_PORT` | `22` |
| `DEPLOY_PATH` | `/opt/movierater` |
| `DEPLOY_URL` | `https://movierater.example.com` med dit rigtige domæne. |

Tilføj environment secrets:

| Navn | Indhold |
| --- | --- |
| `DEPLOY_SSH_KEY` | Privat SSH-nøgle til deploymentbrugeren. |
| `DEPLOY_KNOWN_HOSTS` | Den verificerede server-hostkey i known_hosts-format. |

Brug en dedikeret SSH-nøgle uden passphrase til denne automatiske proces.
En krypteret nøgle kan ikke åbnes af det ikke-interaktive workflow.
Den offentlige del placeres i deploymentbrugerens
`authorized_keys`. Den private del gemmes kun som GitHub Secret.

Hent og kontrollér serverens hostkey via en betroet administrationskonsol.
Known_hosts-linjen skal matche `DEPLOY_HOST`; ved en anden port end 22 bruges
`[host]:port`. Workflowet bruger streng hostkey-kontrol og accepterer ikke en ny
hostkey automatisk. Secrets skrives ikke i repository eller release-artifakter.

GitHubs `GITHUB_TOKEN` bruges til publicering og læsning af release-oplysninger.
Du skal ikke selv oprette en repository secret med dette navn.

## Forbered serveren

Serveren skal have Docker Engine med Compose-plugin, Bash, SSH, curl og `flock`.
Compose skal være mindst 2.24.4. Serveren behøver ikke Node/npm, Git eller
MovieRaters source code.

Opret en dedikeret Linux-bruger og deployment-mappe. Eksempel:

```sh
sudo useradd --create-home --shell /bin/bash movierater
sudo usermod -aG docker movierater
sudo install -d -o movierater -g movierater -m 750 /opt/movierater
```

Brugeren skal logge ind igen efter ændring af grupper. Docker-gruppen giver
omfattende serveradgang, så beskyt deploymentnøglen og production-environmentet.

Kopiér `.env.server.example` til `/opt/movierater/.env.server`, og udfyld filen
som deploymentbrugeren:

```dotenv
HTTP_PORT=8080
MOVIERATER_HTTPS=true
MOVIERATER_DOMAIN=movierater.example.com
ACME_EMAIL=admin@example.com
DEPLOY_TIMEOUT=180
```

Brug dit rigtige domæne og din email. Filen bruger almindelig `NAVN=værdi` uden
anførselstegn. Indsæt ingen credentials eller `VITE_`-variabler. Beskyt filen:

```sh
chmod 600 /opt/movierater/.env.server
```

Workflowet overskriver ikke `.env.server`. Compose-filer, Caddyfile og script
placeres i `releases/<commit-id>/` for hver godkendt release. Tidligere snapshots
bevares, så rollback også bruger den tidligere konfiguration.

## GHCR-login på serveren

Offentlige images kræver ikke login. Hvis GHCR-pakken er privat, log ind som
deploymentbrugeren med en GitHub-bruger og et token med `read:packages` og adgang
til pakken:

```sh
docker login ghcr.io --username YOUR_GITHUB_USER
```

Indsæt tokenet i password-prompten. Gem det ikke i `.env.server` eller GitHub
Variables. Login-oplysningerne håndteres af brugerens Docker-konfiguration eller
credential helper. CI's midlertidige `GITHUB_TOKEN` er ikke serverens login.

## HTTPS

Peg domænets DNS A-record på serveren. Brug kun AAAA-record, hvis IPv6 virker.
Åbn TCP 80 og 443, og tillad udgående adgang til GHCR og certifikatmyndigheden.

Caddy håndterer certifikater og sender trafik til Nginx på det interne netværk.
MovieRaters port 8080 publiceres ikke i HTTPS-opsætningen. Certifikater bevares
i volumes; brug aldrig `down -v` ved almindelig opdatering eller rollback.

`DEPLOY_URL` skal pege på den samme installation og have et gyldigt offentligt
HTTPS-certifikat. Pipelinekontrollen slår ikke certifikatvalidering fra.

## Aktivér automatisk deployment

1. Merge pipelineændringerne gennem en PR, og kontrollér at CI består.
2. Sæt Supabase repository variables, og kontrollér at main-workflowet publicerer
   et image og et godkendt release-artifakt.
3. Forbered server, SSH-adgang, GHCR-login, `.env.server`, DNS og firewall.
4. Opret production Environment med de beskrevne variables, secrets og beskyttelser.
5. Sæt repository variable `DEPLOY_ENABLED=true`.
6. Start først en manuel deployment af en publiceret commit gennem deployment-
   workflowet. Godkend jobbet, hvis required reviewers er aktiveret.
7. Efter bestået første deployment vil efterfølgende godkendte main-releases
   bruge den samme proces automatisk.

Deployment starter kun efter godkendt publicering og de relevante environment-
regler. Manglende serverindstillinger giver en tydelig fejl før SSH-forbindelsen.
Workflow-concurrency og serverens `flock` beskytter mod samtidige deployments.

## Manuel deployment og rollback

Den anbefalede metode er GitHub **Actions → deployment-workflow → Run workflow**
på `main`. Vælg `deploy` og angiv det fulde commit-id fra en godkendt publicering.
Workflowet verificerer release-oplysningerne, før serveren ændres.
Ved rollback læses den tidligere release først via SSH; dette opslag ændrer
ikke serveren. Derefter verificeres den valgte release, før rollback udføres.

Vælg `rollback` for at gå tilbage til serverens tidligere verificerede release.
Der angives ikke et vilkårligt image til rollback. Den tidligere release skal
stadig være tilgængelig i GHCR.

GitHub gemmer godkendelsesartifakterne i 90 dage, eller kortere hvis organisationens
politik kræver det. Manuel deployment og rollback gennem Actions kræver et
bevaret artifakt. Efter udløb kan en betroet administrator stadig bruge serverens
tidligere verificerede snapshot og image-digest til direkte rollback. Bevar
disse snapshots og images, så rollback ikke kræver et rebuild.

Ved manuel kørsel direkte på serveren hentes det godkendte release-artifakt fra
GitHub Actions. Udpak konfigurationen i `/opt/movierater/releases/<commit-id>/`.
Brug image-digest fra artifaktets `release.json`:

```sh
MOVIERATER_ROOT=/opt/movierater bash /opt/movierater/releases/<commit-id>/scripts/deploy.sh deploy ghcr.io/movierater/devops_movierater@sha256:<digest> <commit-id>
MOVIERATER_ROOT=/opt/movierater bash /opt/movierater/releases/<commit-id>/scripts/deploy.sh rollback
```

Den direkte metode kræver en betroet administrator og en tidligere godkendt
release. GitHub-metoden udfører også den automatiske kontrol af godkendelsen.

## Status og fejlfinding

Se workflowets step-output, summary og rapport-artifakter. Serveren gemmer den
sidst fungerende og tidligere release i `.deploy-state/release.env`. Redigér
ikke state-filen manuelt, og bevar release-mapper og images til rollback.

Kontrollér fra en computer med adgang til hjemmesiden:

```sh
curl --fail https://movierater.example.com/health
curl --fail https://movierater.example.com/
```

På serveren bruges den aktive releases Compose-filer og image-reference til
`docker compose ps` og `docker compose logs --tail=100`. Brug begge Compose-filer
ved HTTPS. De valgte image-referencer og commit-id'er kan læses i
`.deploy-state/release.env`.

Eksempel for den beskrevne HTTPS-installation, som deploymentbrugeren:

```sh
MOVIERATER_IMAGE=$(sed -n 's/^CURRENT_IMAGE=//p' /opt/movierater/.deploy-state/release.env)
REVISION=$(sed -n 's/^CURRENT_REVISION=//p' /opt/movierater/.deploy-state/release.env)
export MOVIERATER_IMAGE
cd "/opt/movierater/releases/$REVISION"
docker compose -p movierater --env-file /opt/movierater/.env.server -f docker-compose.prod.yml -f docker-compose.https.yml ps
docker compose -p movierater --env-file /opt/movierater/.env.server -f docker-compose.prod.yml -f docker-compose.https.yml logs --tail=100
```

- Lint/typekontrol/tests fejler: ret fejlene før ny publicering.
- Scanning stopper release: gennemgå JSON-rapporten og opdatér berørte pakker.
- SSH fejler: kontrollér key, bruger, port, rettigheder og den betroede hostkey.
- GHCR pull fejler: kontrollér pakkens synlighed og serverbrugerens registry-login.
- Health/HTTPS fejler: kontrollér containerlogs, DNS, firewall og certifikat.
- Rollback fejler: workflowet forbliver rødt; undersøg serveren manuelt før ny kørsel.

En healthy container alene beviser ikke fungerende Supabase-dataadgang eller
authentication mod det rigtige projekt. De isolerede CI-tests kontrollerer ikke
produktionsprojektets tabeller, adgangsregler eller brugere.

## Implementerede filer

De eksisterende Dockerfiler, Compose-filer, Nginx og Caddy genbruges.

| Ændrede filer | Formål |
| --- | --- |
| `.github/workflows/docker-pr.yml` | Obligatoriske kvalitetskontroller, Playwright, Docker-test og scanning på PR eller ved manuel kørsel. |
| `.github/workflows/docker-publish.yml` | Testet image til GHCR, digestkontrol og godkendt release-artifakt. |
| `package.json`, `package-lock.json` | Låste lint/testværktøjer og scripts; sikkerhedsrettelse af `source-map-js`. |
| `src/App.tsx` | Korrekte React hook-afhængigheder og switch-blok; samme funktionalitet. |
| `src/models/supabase.ts`, `vite.config.ts` | Fælles validering af offentlig Supabase-konfiguration. |
| `tsconfig.json` | Typekontrol af app, tests og Vite/Vitest-konfigurationer. |
| `.dockerignore`, `.gitignore` | Udelukker lokal deployment-state og unødvendig dokumentation fra build. |
| `README.md` | Kort startvejledning med link til denne komplette deploymentvejledning. |

| Nye filer | Formål |
| --- | --- |
| `.github/workflows/deploy.yml` | Automatisk eller manuel deployment/rollback gennem production Environment. |
| `scripts/release.mjs` | Verificerer publish-job, release-artifakt, image-digest og konfigurationshashes. |
| `scripts/deploy-remote.mjs` | SSH-konfiguration, overførsel af godkendt snapshot og offentlig HTTPS-kontrol. |
| `scripts/deploy.sh` | Serverens låste deployment, healthcheck, atomiske state og rollback. |
| `scripts/check-vulnerabilities.mjs` | Validerer Trivy-rapporter og håndhæver sikkerhedspolitikken. |
| `scripts/run-integration-tests.mjs` | Finder og kører alle shell-integrationstests rekursivt i `tests/`. |
| `scripts/release.test.mjs`, `scripts/deploy-remote.test.mjs`, `scripts/check-vulnerabilities.test.mjs`, `scripts/pipeline-test-helpers.mjs` | Tests af godkendelse, afvisning, credentials, HTTP-fejl og scanning med isolerede fixtures. |
| `tests/deploy.test.sh` | Linux-tests af deploymentfejl, filrettigheder, låsning, state og rollback. |
| `eslint.config.mjs`, `vitest.config.ts` | Konfiguration af lint og app-tests. |
| `src/App.test.tsx`, `src/models/supabase.test.ts`, `src/models/supabaseConfig.test.ts`, `src/test/setup.ts` | App- og Supabase-tests uden rigtige netværkskald. |
| `playwright.config.ts`, `tests/e2e/smoke.spec.ts` | Chromium-test af den kørende MovieRater-app med isoleret server og Supabase-konfiguration. |
| `tests/unit/smoke.test.ts` | Collaboratorens grundlæggende Vitest-kontrol, som køres sammen med app-testene. |
| `src/models/supabaseConfig.ts` | Validering af nødvendige offentlige frontendvariabler. |
| `.env.server.example` | Serverindstillinger uden credentials. |
| `.gitattributes` | LF-linjeskift i scripts og workflows, også ved checkout på Windows. |
| `docs/deployment.md` | GitHub-, server-, HTTPS-, aktiverings- og rollbackvejledning. |

App-tests opdages automatisk som `.test` og `.spec` i `src/` og `tests/unit/`.
`npm run test:coverage` kører de samme app-tests med V8 coverage og rapporter i
`coverage/`. Testopsætningen er samlet i `vitest.config.ts` og `src/test/setup.ts`.
Node-tests opdages
rekursivt i `scripts/`, og shell-integrationstests som `.test.sh` og `.spec.sh`
rekursivt i `tests/`. Playwright finder browser-tests i `tests/e2e/` via
`playwright.config.ts`; disse tests køres separat fra Vitest. Collaboratorens
Vitest-opsætning er samlet med den eksisterende, så `tests/setup.ts` og et
ekstra `test`-afsnit i `vite.config.ts` ikke er nødvendige.

Begge PR- og publish-workflows kører `npm run test:ci` (app-tests med coverage
og Node-tests), `npm run test:integration` og `npm run test:e2e`; en fejl stopper
det pågældende workflow før publicering. CI installerer Chromium med
`npx playwright install --with-deps chromium`. Lokalt installeres browseren med
`npx playwright install chromium`, hvorefter `npm run test:e2e` starter
Vite-serveren og browser-testene. På Linux kan systembiblioteker også kræve
`--with-deps`.

Coverage-rapporter gemmes som artifakter i 14 dage for PR-/manuelle kørsler og 30
dage for publish-kørsler. HTML-rapport og testresultater fra fejlede browser-tests
gemmes i 7 dage. Testserveren overskriver Supabase-variablerne med syntetiske
frontendværdier, så lokal `.env` og produktionskonfiguration ikke bruges.
Nye testværktøjer skal tilføjes eksplicit til pipelinekonfigurationen.

## PR-reviewrettelser verificeret 22. oktober 2026

- Dockerfilens præcise Alpine-pakkeversioner er erstattet med `apk upgrade --no-cache`.
  Base-image-versioner og digests samt non-root-runtime er bevaret.
- PR-workflowet bruger kun `pull_request` og `workflow_dispatch`. Push til en åben
  PR giver derfor ingen separat push-kørsel. Publicering fra `main` og tags er uændret.
- Et nyt Docker-build med `--pull --no-cache` og containerkontrollen bestod:
  healthy, UID 101, read-only filesystem, HTTP, assets, SPA-fallback og headers.
- Trivy `0.69.3` fandt 0 HIGH/CRITICAL i runtime-imaget og de uændrede
  npm-afhængigheder inklusive udviklingspakker. Den uændrede policy-kontrol bestod.
- Workflow-syntaks og `git diff --check` bestod. Scanningsrapporterne er gemt
  lokalt i `.cache/security-20261022/`. Ændringerne er endnu ikke pushet til PR'en.

## Sikkerhedsrettelser verificeret 21. oktober 2026

- Vite er fastlåst til `6.4.4`. Dockerfilen opdaterer `libexpat` til `2.9.0-r0`,
  `libx11` til `1.8.14-r0` og `tiff` til `4.7.2-r0`; den eksisterende PCRE2-rettelse bevares.
- De fire HIGH-fund fra GitHub-kørsel `39609593385` er rettet. Trivy `0.69.3`
  med opdateret database fandt 0 HIGH/CRITICAL i både runtime-imaget og npm-lockfilen,
  inklusive udviklingsafhængigheder. Den eksisterende policy-kontrol bestod uændret.
- Workflows, releasekontrol, imagebegrænsninger, tests og dokumentation bruger
  `MovieRater/Devops_MovieRater` og `ghcr.io/movierater/devops_movierater`.
  Det gamle repository og image afvises eksplicit af regressionstestene.
- Lint, TypeScript-kontrol, 16 unit-tests, 20 pipeline-tests, Playwright-testen,
  produktionsbuild og Docker-build bestod. Alle 27 Linux-deployment-scenarier bestod.
- Det rettede Docker-image bestod containerkontrollen med healthy-status, UID 101,
  read-only filesystem, begrænsede capabilities, HTTP, assets, SPA-fallback og headers.
- Scanningsrapporter fra kontrollen gemmes lokalt i `.cache/security-20261021/`
  og er udelukket fra Git og Docker-build. Den opdaterede kode er endnu ikke kørt på GitHub;
  rigtig GHCR-publicering og serverdeployment er fortsat ikke verificeret.

## Samling med main verificeret 21. oktober 2026

- Ren installation fra lockfil med `npm ci --offline --no-audit --no-fund`,
  lint og TypeScript-kontrol bestod.
- `npm run test:ci` bestod: 16 unit-tests og 20 pipeline-tests. Coverage blev genereret.
- `npm run test:e2e` bestod: collaboratorens MovieRater-smoketest i Chromium.
- Produktionsbuild med syntetisk Supabase-konfiguration, Compose-konfiguration
  og workflow-syntaks bestod. Browserinstallationen bestod via Playwrights download-fallback.
- Docker Desktop kørte ikke, så Docker-build, containerstart og Linux-integrationstests
  blev ikke genkørt. Verifikationen nedenfor er historisk og gælder ikke som en ny Docker-test.
- GitHub OAuth-login er bevaret fra main, men ikke verificeret mod en rigtig provider;
  browser-smoketesten kontrollerer kun appens opstart.

## Lokalt verificeret 8. oktober 2026

| Kontrol | Resultat |
| --- | --- |
| `npm ci` | Bestået fra lockfil. |
| `npm run lint`, `npm run typecheck` | Bestået. |
| `npm run test:unit` | 15 beståede app-/Supabase-tests. |
| `npm run test:pipeline` | 20 beståede pipeline-tests på Windows og Linux. |
| `npm run lint && npm run typecheck && npm test` i Linux-buildcontainer | Bestået med Node 24.21.0 og alle 35 tests; netværk deaktiveret under kontrollerne. |
| `bash tests/deploy.test.sh` | 27 beståede Linux-scenarier med mocked Docker/HTTP og rigtig state, permissions, låsning og signalhåndtering. |
| `npm run build`, `docker compose build` | Bestået. |
| `docker compose config --quiet` | Lokal, development, production og HTTPS-konfiguration bestået. |
| `docker compose up -d --wait`, `docker compose ps` | Container running og healthy, 0 restarts, non-root UID 101, read-only filesystem. |
| `node scripts/docker-smoke.mjs movieraterfrontend-frontend:latest` | Health, HTML, assets, SPA-fallback, cache, gzip, headers og runtime-rettigheder bestået. |
| Docker development | HTTP og rigtig Vite WebSocket HMR bestået; midlertidig kildekodeændring fjernet igen. |
| Build uden `VITE_SUPABASE_URL` | Afvist med fejl, som nævner den manglende variabel. |
| Trivy image- og dependency-scanning med devDependencies | 0 HIGH/CRITICAL-fund; sikkerhedspolitik bestået. |
| `npm audit` | 0 kendte vulnerabilities efter dependencyrettelsen. |
| Workflow-syntaks og `git diff --check` | Bestået. Actionlint 1.7.12 kræver en snæver kompatibilitetsundtagelse for GitHubs nyere `concurrency.queue`. |
| Credentialkontrol | Ingen rigtige private credentials fundet; `.env` er ignoreret. Testfixtures bruger tydeligt syntetiske værdier. |

Vite viser en ikke-blokerende advarsel om en JavaScript-bundle over 500 kB.
Appens opdeling er ikke ændret i denne CI/CD-opgave.

GitHub-triggerne, rigtig GHCR-publicering, serverens registry-login, SSH,
production-godkendelser og offentlige HTTPS-certifikater er endnu ikke testet
mod de eksterne tjenester. Release- og rollback-logikken er testet med mocks;
det erstatter ikke et første rigtigt deployment til en konfigureret server.
Der er ikke pushet kode eller ændret et produktionsmiljø under arbejdet.
