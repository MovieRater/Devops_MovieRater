#!/usr/bin/env bash
# Fault-injection tests run on Linux with Bash, coreutils and util-linux (flock).
# Only Docker and HTTP are mocked; script state, permissions, locks and traps are real.
set -Eeuo pipefail
umask 077
repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
suite="$(mktemp -d)"
trap 'rm -rf -- "$suite"' EXIT
mkdir "$suite/bin"
export TEST_IMAGE_A="ghcr.io/movierater/devops_movierater@sha256:$(printf 'a%.0s' {1..64})"
export TEST_IMAGE_B="ghcr.io/movierater/devops_movierater@sha256:$(printf 'b%.0s' {1..64})"
export TEST_IMAGE_C="ghcr.io/movierater/devops_movierater@sha256:$(printf 'c%.0s' {1..64})"
export TEST_REV_A="$(printf '1%.0s' {1..40})"
export TEST_REV_B="$(printf '2%.0s' {1..40})"
export TEST_REV_C="$(printf '3%.0s' {1..40})"
export PATH="$suite/bin:$PATH"

cat > "$suite/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s | image=%s\n' "$*" "${MOVIERATER_IMAGE:-}" >> "$MOCK_ROOT/trace"
fault() { [[ -f "$MOCK_ROOT/$1" && "$(< "$MOCK_ROOT/$1")" == "$2" ]]; }
revision() {
  case "$1" in
    "$TEST_IMAGE_A") printf '%s' "$TEST_REV_A" ;;
    "$TEST_IMAGE_B") printf '%s' "$TEST_REV_B" ;;
    "$TEST_IMAGE_C") printf '%s' "$TEST_REV_C" ;;
    *) exit 1 ;;
  esac
}
if [[ "$1" == compose ]]; then
  command=''
  for value in "$@"; do
    case "$value" in config|pull|up|ps|stop|rm) command="$value" ;; esac
  done
  case "$command" in
    config) [[ ! -f "$MOCK_ROOT/fail_config" ]] ;;
    pull) if fault fail_pull "$MOVIERATER_IMAGE"; then exit 1; fi ;;
    up)
      printf '%s' "$MOVIERATER_IMAGE" > "$MOCK_ROOT/running"
      if fault terminate_up "$MOVIERATER_IMAGE"; then kill -TERM "$PPID"; sleep 0.2; fi
      if fault fail_up "$MOVIERATER_IMAGE"; then exit 1; fi
      ;;
    ps) if [[ -s "$MOCK_ROOT/running" ]]; then printf 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\n'; fi ;;
    stop) : ;;
    rm) rm -f "$MOCK_ROOT/running" ;;
    *) exit 1 ;;
  esac
elif [[ "$1" == image && "$2" == inspect ]]; then
  image="$3"; format="${@: -1}"
  case "$format" in
    '{{.Id}}') printf 'sha256:%s\n' "${image##*:}" ;;
    *org.opencontainers.image.revision*)
      if fault fail_revision "$image"; then printf '%s\n' "$TEST_REV_C"; else revision "$image"; fi ;;
    *RepoDigests*) if ! fault fail_digest "$image"; then printf '%s\n' "$image"; fi ;;
    *) exit 1 ;;
  esac
elif [[ "$1" == inspect ]]; then
  image="$(< "$MOCK_ROOT/running")"
  case "${@: -1}" in
    '{{.Image}}')
      if fault fail_identity "$image"; then printf 'sha256:%064d\n' 0; else printf 'sha256:%s\n' "${image##*:}"; fi ;;
    '{{.Config.Image}}') printf '%s\n' "$image" ;;
    *State.Running*) if fault fail_health "$image"; then printf 'true unhealthy\n'; else printf 'true healthy\n'; fi ;;
    *) exit 1 ;;
  esac
elif [[ "$1" == exec ]]; then
  if [[ "${@: -1}" == */health ]]; then printf 'OK\n';
  else
    image="$(< "$MOCK_ROOT/running")"
    printf '<html><div id="root" data-image="%s"></div><script src="/assets/app.js"></script><link href="/assets/app.css"></html>\n' "$image"
  fi
else exit 1; fi
MOCK

cat > "$suite/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
output=''; headers=''; url="${@: -1}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) output="$2"; shift ;;
    --dump-header) headers="$2"; shift ;;
  esac
  shift
done
printf 'curl %s\n' "$url" >> "$MOCK_ROOT/trace"
image="$(< "$MOCK_ROOT/running")"
fault() { [[ -f "$MOCK_ROOT/$1" && "$(< "$MOCK_ROOT/$1")" == "$image" ]]; }
mime='text/html'
case "$url" in
  */health) printf 'OK\n' > "$output"; mime='text/plain' ;;
  */assets/*.js)
    if fault fail_asset; then exit 22; fi
    printf 'console.log("movie");\n' > "$output"; mime='application/javascript' ;;
  */assets/*.css) printf 'body{color:black}\n' > "$output"; mime='text/css' ;;
  */)
    if fault stale_html; then image="$TEST_IMAGE_A"; fi
    printf '<html><div id="root" data-image="%s"></div><script src="/assets/app.js"></script><link href="/assets/app.css"></html>\n' "$image" > "$output" ;;
  *) exit 22 ;;
esac
if fault fail_mime; then mime='text/plain'; fi
printf 'HTTP/1.1 200 OK\r\nContent-Type: %s\r\n\r\n' "$mime" > "$headers"
printf '200'
MOCK

cat > "$suite/bin/mv" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ -f "$MOCK_ROOT/fail_commit" && "${@: -1}" == "$MOCK_ROOT/.deploy-state/release.env" ]]; then exit 1; fi
exec /bin/mv "$@"
MOCK
chmod +x "$suite/bin/"*

new_case() {
  case_root="$(mktemp -d "$suite/case.XXXXXX")"
  export MOCK_ROOT="$case_root" MOVIERATER_ROOT="$case_root"
  : > "$case_root/trace"
  mkdir -p "$case_root/.deploy-state"
  chmod 700 "$case_root/.deploy-state"
  for revision in "$TEST_REV_A" "$TEST_REV_B" "$TEST_REV_C"; do
    mkdir -p "$case_root/releases/$revision"
    cp "$repo/docker-compose.prod.yml" "$repo/docker-compose.https.yml" "$repo/Caddyfile" "$case_root/releases/$revision/"
  done
  printf 'HTTP_PORT=8080\nMOVIERATER_HTTPS=false\nDEPLOY_TIMEOUT=30\n' > "$case_root/.env.server"
  chmod 600 "$case_root/.env.server"
}

state() {
  printf 'CURRENT_IMAGE=%s\nCURRENT_REVISION=%s\nPREVIOUS_IMAGE=%s\nPREVIOUS_REVISION=%s\n' "$1" "$2" "${3:-}" "${4:-}" > "$case_root/.deploy-state/release.env"
  chmod 600 "$case_root/.deploy-state/release.env"
  printf '%s' "$1" > "$case_root/running"
}
expect_state() {
  local image="$1" previous="${2:-}"
  grep -Fxq "CURRENT_IMAGE=$image" "$case_root/.deploy-state/release.env"
  grep -Fxq "PREVIOUS_IMAGE=$previous" "$case_root/.deploy-state/release.env"
  [[ "$(< "$case_root/running")" == "$image" ]]
  [[ "$(stat -c %a "$case_root/.deploy-state/release.env")" == 600 ]]
}
run() {
  local expected="$1"; shift
  local status=0
  bash "$repo/scripts/deploy.sh" "$@" > "$case_root/output" 2>&1 || status=$?
  if [[ "$expected" == fail ]]; then [[ $status != 0 ]];
  else [[ $status == "$expected" ]]; fi || {
    cat "$case_root/output" >&2
    printf 'Unexpected status: %s, expected %s\n' "$status" "$expected" >&2
    exit 1
  }
}
pass() { printf 'PASS: %s\n' "$1"; }

new_case
run 0 deploy "$TEST_IMAGE_A" "$TEST_REV_A"
expect_state "$TEST_IMAGE_A"
grep -q 'JavaScript, CSS' "$case_root/output"
pass 'fresh deployment commits only a fully verified immutable image'

new_case; state "$TEST_IMAGE_A" "$TEST_REV_A"
run 0 deploy "$TEST_IMAGE_B" "$TEST_REV_B"
expect_state "$TEST_IMAGE_B" "$TEST_IMAGE_A"
run 0 rollback "$TEST_IMAGE_A" "$TEST_REV_A"
expect_state "$TEST_IMAGE_A" "$TEST_IMAGE_B"
pass 'successful deployment and guarded rollback update image and configuration revision'

for fault in fail_up fail_asset fail_identity stale_html fail_mime; do
  new_case; state "$TEST_IMAGE_A" "$TEST_REV_A"
  cp "$case_root/.deploy-state/release.env" "$case_root/before"
  printf '%s' "$TEST_IMAGE_B" > "$case_root/$fault"
  run fail deploy "$TEST_IMAGE_B" "$TEST_REV_B"
  expect_state "$TEST_IMAGE_A"
  cmp -s "$case_root/before" "$case_root/.deploy-state/release.env"
  grep -q 'Rollback health and image checks passed' "$case_root/output"
  pass "$fault triggers recovery and preserves previous verified state"
done

new_case; state "$TEST_IMAGE_A" "$TEST_REV_A"
cp "$case_root/.deploy-state/release.env" "$case_root/before"
touch "$case_root/fail_commit"
run fail deploy "$TEST_IMAGE_B" "$TEST_REV_B"
expect_state "$TEST_IMAGE_A"
cmp -s "$case_root/before" "$case_root/.deploy-state/release.env"
pass 'atomic state commit failure rolls back without replacing known state'

for fault in fail_pull fail_digest fail_revision; do
  new_case; state "$TEST_IMAGE_A" "$TEST_REV_A"
  printf '%s' "$TEST_IMAGE_B" > "$case_root/$fault"
  run fail deploy "$TEST_IMAGE_B" "$TEST_REV_B"
  expect_state "$TEST_IMAGE_A"
  ! grep -E ' up .*image=.*sha256:b{64}' "$case_root/trace"
  pass "$fault rejects unverified publication before frontend replacement"
done

new_case
printf '%s' "$TEST_IMAGE_B" > "$case_root/fail_asset"
run fail deploy "$TEST_IMAGE_B" "$TEST_REV_B"
[[ ! -e "$case_root/running" && ! -e "$case_root/.deploy-state/release.env" ]]
! grep -q ' down ' "$case_root/trace"
pass 'failed first deployment removes frontend without deleting certificate volumes'

new_case; state "$TEST_IMAGE_A" "$TEST_REV_A"
printf '%s' "$TEST_IMAGE_A" > "$case_root/fail_identity"
run fail deploy "$TEST_IMAGE_B" "$TEST_REV_B"
expect_state "$TEST_IMAGE_A"
! grep -q ' up ' "$case_root/trace"
pass 'invalid current identity cannot silently become a rollback base'

new_case; state "$TEST_IMAGE_B" "$TEST_REV_B" "$TEST_IMAGE_A" "$TEST_REV_A"
printf '%s' "$TEST_IMAGE_B" > "$case_root/fail_health"
run 0 rollback "$TEST_IMAGE_A" "$TEST_REV_A"
expect_state "$TEST_IMAGE_A"
pass 'manual rollback works when the current release is unhealthy'

new_case; state "$TEST_IMAGE_B" "$TEST_REV_B" "$TEST_IMAGE_A" "$TEST_REV_A"
run fail rollback "$TEST_IMAGE_C" "$TEST_REV_C"
expect_state "$TEST_IMAGE_B" "$TEST_IMAGE_A"
! grep -q ' up ' "$case_root/trace"
pass 'rollback guard rejects a changed previous-release pointer'

new_case; state "$TEST_IMAGE_B" "$TEST_REV_B" "$TEST_IMAGE_A" "$TEST_REV_A"
run 0 reject "$TEST_IMAGE_B" "$TEST_REV_B"
expect_state "$TEST_IMAGE_A"
pass 'external rejection restores the previous release and forgets the rejected version'

new_case; state "$TEST_IMAGE_C" "$TEST_REV_C" "$TEST_IMAGE_B" "$TEST_REV_B"
run fail reject "$TEST_IMAGE_B" "$TEST_REV_B"
expect_state "$TEST_IMAGE_C" "$TEST_IMAGE_B"
[[ ! -s "$case_root/trace" ]]
pass 'external rejection cannot revert a newer concurrent release'

new_case; state "$TEST_IMAGE_A" "$TEST_REV_A"
run 0 reject "$TEST_IMAGE_A" "$TEST_REV_A"
[[ ! -e "$case_root/running" && ! -e "$case_root/.deploy-state/release.env" ]]
! grep -q ' down ' "$case_root/trace"
pass 'external rejection of first release removes failed app and preserves proxy'

new_case
exec 8> "$case_root/.deploy-state/deploy.lock"
flock --exclusive 8
run 75 deploy "$TEST_IMAGE_A" "$TEST_REV_A"
flock --unlock 8
exec 8>&-
[[ ! -e "$case_root/running" ]]
pass 'real flock prevents concurrent deployments'

new_case; rm "$case_root/.env.server"
run fail deploy "$TEST_IMAGE_A" "$TEST_REV_A"
[[ ! -s "$case_root/trace" ]]
pass 'missing server environment stops before contacting Docker'

new_case; chmod 644 "$case_root/.env.server"
run fail deploy "$TEST_IMAGE_A" "$TEST_REV_A"
[[ ! -s "$case_root/trace" ]]
pass 'unsafe environment-file permissions are rejected'

new_case
printf 'HTTP_PORT=$(touch %s/pwned)\nMOVIERATER_HTTPS=false\n' "$case_root" > "$case_root/.env.server"
run fail deploy "$TEST_IMAGE_A" "$TEST_REV_A"
[[ ! -e "$case_root/pwned" && ! -s "$case_root/trace" ]]
pass 'dotenv values are validated without shell evaluation'

new_case
printf 'MOVIERATER_HTTPS=false\nSUPABASE_SERVICE_ROLE_KEY=DO_NOT_PRINT_PRIVATE_VALUE\n' > "$case_root/.env.server"
run fail deploy "$TEST_IMAGE_A" "$TEST_REV_A"
! grep -q 'DO_NOT_PRINT_PRIVATE_VALUE' "$case_root/output"
[[ ! -s "$case_root/trace" ]]
pass 'backend secrets are rejected without exposing their values'

new_case
run fail deploy 'ghcr.io/attacker/app@sha256:abc' "$TEST_REV_A"
[[ ! -s "$case_root/trace" ]]
run fail deploy "ghcr.io/ozan0062/devops_movierater@sha256:${TEST_IMAGE_A##*@sha256:}" "$TEST_REV_A"
[[ ! -s "$case_root/trace" ]]
run fail deploy "$TEST_IMAGE_A;touch pwned" "$TEST_REV_A"
[[ ! -e "$case_root/pwned" ]]
pass 'repository, digest and command-injection input validation'

new_case
printf 'MOVIERATER_HTTPS=true\n' > "$case_root/.env.server"
run fail deploy "$TEST_IMAGE_A" "$TEST_REV_A"
[[ ! -s "$case_root/trace" ]]
printf 'MOVIERATER_HTTPS=true\nMOVIERATER_DOMAIN=movies.example.com\nACME_EMAIL=admin@example.com\n' > "$case_root/.env.server"
run 0 deploy "$TEST_IMAGE_A" "$TEST_REV_A"
grep -q 'curl https://movies.example.com/health' "$case_root/trace"
grep -q 'curl https://movies.example.com/assets/app.js' "$case_root/trace"
pass 'HTTPS requires domain/email and verifies external health, HTML and assets'

new_case; state "$TEST_IMAGE_A" "$TEST_REV_A"
printf '%s' "$TEST_IMAGE_B" > "$case_root/terminate_up"
run 143 deploy "$TEST_IMAGE_B" "$TEST_REV_B"
expect_state "$TEST_IMAGE_A"
pass 'termination trap restores the last verified release'

new_case; state "$TEST_IMAGE_B" "$TEST_REV_B" "$TEST_IMAGE_A" "$TEST_REV_A"
run 0 status
grep -Fq "\"CURRENT_IMAGE\":\"$TEST_IMAGE_B\"" "$case_root/output"
grep -Fq "\"PREVIOUS_REVISION\":\"$TEST_REV_A\"" "$case_root/output"
[[ ! -s "$case_root/trace" ]]
pass 'machine-readable status exposes only validated immutable release identities'

printf 'Deployment fault-injection suite passed.\n'
