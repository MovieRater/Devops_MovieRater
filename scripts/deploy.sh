#!/usr/bin/env bash
# Run only on the prepared Linux production server; never sources a dotenv file.
set -Eeuo pipefail
umask 077

readonly project_name='movierater'
deploy_root="${MOVIERATER_ROOT:-/opt/movierater}"
action="${1:-}"
shift || true
changed=false
current_verified=false
current_image=''
current_revision=''
previous_image=''
previous_revision=''
target_image=''
target_revision=''
work_dir=''
state_temp=''

error() { printf 'ERROR: %s\n' "$*" >&2; }
die() { error "$*"; exit 1; }
valid_image() { [[ "$1" =~ ^ghcr\.io/movierater/devops_movierater@sha256:[a-f0-9]{64}$ ]]; }
valid_revision() { [[ "$1" =~ ^[a-f0-9]{40}$ ]]; }

private_file() {
  local file="$1" mode owner
  [[ -f "$file" && ! -L "$file" ]] || return 1
  owner="$(stat -c '%u' -- "$file")" || return 1
  mode="$(stat -c '%a' -- "$file")" || return 1
  [[ "$owner" == "$(id -u)" && "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$mode & 077) == 0 ))
}

trusted_config() {
  local file="$1" mode owner
  [[ -f "$file" && ! -L "$file" ]] || return 1
  owner="$(stat -c '%u' -- "$file")" || return 1
  mode="$(stat -c '%a' -- "$file")" || return 1
  [[ "$owner" == "$(id -u)" && "$mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$mode & 022) == 0 ))
}

release_directory() {
  local revision="$1" expected resolved
  valid_revision "$revision" || return 1
  expected="$deploy_root/releases/$revision"
  resolved="$(realpath -e -- "$expected")" || return 1
  [[ "$resolved" == "$expected" ]] || return 1
  [[ "$(stat -c '%u' -- "$resolved")" == "$(id -u)" ]] || return 1
  local mode
  mode="$(stat -c '%a' -- "$resolved")" || return 1
  (( (8#$mode & 022) == 0 )) || return 1
  trusted_config "$resolved/docker-compose.prod.yml" || return 1
  if [[ "$https_enabled" == true ]]; then
    trusted_config "$resolved/docker-compose.https.yml" || return 1
    trusted_config "$resolved/Caddyfile" || return 1
  fi
  printf '%s\n' "$resolved"
}

compose() {
  local image="$1" revision="$2" release
  shift 2
  release="$(release_directory "$revision")" || return 1
  local -a args=(compose --project-name "$project_name" --project-directory "$release"
    --env-file "$deploy_root/.env.server" -f "$release/docker-compose.prod.yml")
  if [[ "$https_enabled" == true ]]; then args+=(-f "$release/docker-compose.https.yml"); fi
  MOVIERATER_IMAGE="$image" docker "${args[@]}" "$@"
}

fetch() {
  local base="$1" route="$2" file="$3" mime="$4" status
  status="$(curl --silent --show-error --connect-timeout 10 --max-time 20 \
    --retry 4 --retry-delay 3 --retry-all-errors \
    --output "$file" --dump-header "$file.headers" --write-out '%{http_code}' \
    "$base$route" 2>/dev/null)" || { error 'HTTP request failed.'; return 1; }
  [[ "$status" == 200 && -s "$file" ]] || { error 'HTTP response was not a nonempty 200 response.'; return 1; }
  grep -Eiq "^content-type:[[:space:]]*$mime([;[:space:]]|$)" "$file.headers" || {
    error 'HTTP content type is incorrect.'; return 1;
  }
}

validate_running() {
  local image="$1" revision="$2" container expected_id actual_id actual_ref health image_revision digests base asset
  container="$(compose "$image" "$revision" ps -q frontend 2>/dev/null)" || return 1
  [[ "$container" =~ ^[a-f0-9]{12,64}$ ]] || { error 'Exactly one frontend container is required.'; return 1; }
  expected_id="$(docker image inspect "$image" --format '{{.Id}}' 2>/dev/null)" || return 1
  actual_id="$(docker inspect "$container" --format '{{.Image}}' 2>/dev/null)" || return 1
  actual_ref="$(docker inspect "$container" --format '{{.Config.Image}}' 2>/dev/null)" || return 1
  health="$(docker inspect "$container" --format '{{.State.Running}} {{.State.Health.Status}}' 2>/dev/null)" || return 1
  image_revision="$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null)" || return 1
  digests="$(docker image inspect "$image" --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null)" || return 1
  [[ "$expected_id" =~ ^sha256:[a-f0-9]{64}$ && "$actual_id" == "$expected_id"
    && "$actual_ref" == "$image" && "$health" == 'true healthy' && "$image_revision" == "$revision" ]] || {
    error 'Running image identity, revision or health does not match the approved release.'; return 1;
  }
  grep -Fxq "$image" <<< "$digests" || { error 'Registry digest does not match the approved release.'; return 1; }
  # Write files on the host, not into the read-only frontend container.
  docker exec "$container" wget -q -O - http://127.0.0.1:8080/health > "$work_dir/local-health" 2>/dev/null || return 1
  [[ "$(< "$work_dir/local-health")" == OK ]] || { error 'Container health endpoint failed.'; return 1; }
  docker exec "$container" wget -q -O - http://127.0.0.1:8080/ > "$work_dir/local.html" 2>/dev/null || return 1
  if [[ "$https_enabled" == true ]]; then base="https://$MOVIERATER_DOMAIN"; else base="http://127.0.0.1:$HTTP_PORT"; fi
  fetch "$base" /health "$work_dir/health" 'text/plain' || return 1
  [[ "$(< "$work_dir/health")" == OK ]] || return 1
  fetch "$base" / "$work_dir/index.html" 'text/html' || return 1
  cmp -s "$work_dir/local.html" "$work_dir/index.html" || { error 'Public HTML does not match this container.'; return 1; }
  grep -Eq "id=['\"]root['\"]" "$work_dir/index.html" || { error 'Frontend root element is missing.'; return 1; }
  grep -Eo '/assets/[A-Za-z0-9._/-]+\.(js|css)' "$work_dir/index.html" | sort -u > "$work_dir/assets" || return 1
  grep -q '\.js$' "$work_dir/assets" && grep -q '\.css$' "$work_dir/assets" || {
    error 'Built JavaScript and CSS references are required.'; return 1;
  }
  while IFS= read -r asset; do
    [[ "$asset" != *'..'* ]] || return 1
    if [[ "$asset" == *.js ]]; then
      fetch "$base" "$asset" "$work_dir/asset" '(application|text)/javascript' || return 1
    else
      fetch "$base" "$asset" "$work_dir/asset" 'text/css' || return 1
    fi
  done < "$work_dir/assets"
}

activate() {
  local image="$1" revision="$2"
  compose "$image" "$revision" config --quiet >/dev/null 2>&1 || { error 'Compose configuration validation failed.'; return 1; }
  compose "$image" "$revision" pull frontend >/dev/null 2>&1 || { error 'Approved image could not be pulled.'; return 1; }
  local image_revision digests
  image_revision="$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null)" || return 1
  digests="$(docker image inspect "$image" --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null)" || return 1
  [[ "$image_revision" == "$revision" ]] && grep -Fxq "$image" <<< "$digests" || {
    error 'Pulled image revision or digest is incorrect.'; return 1;
  }
  changed=true
  local -a services=(frontend)
  if [[ "$https_enabled" == true ]]; then services+=(proxy); fi
  compose "$image" "$revision" up --detach --wait --wait-timeout "$deploy_timeout" "${services[@]}" >/dev/null 2>&1 || {
    error 'Compose startup or healthcheck failed.'; return 1;
  }
  validate_running "$image" "$revision"
}

cleanup() {
  if [[ -n "$state_temp" && -f "$state_temp" ]]; then rm -f -- "$state_temp"; fi
  if [[ -n "$work_dir" && -d "$work_dir" ]]; then rm -rf -- "$work_dir"; fi
}

abort_deployment() {
  local status="${1:-1}"
  trap - ERR INT TERM
  set +e
  if [[ "$changed" == true ]]; then
    if [[ -n "$current_image" && "$current_verified" == true ]]; then
      printf 'Deployment failed; restoring the last verified release.\n' >&2
      if activate "$current_image" "$current_revision"; then
        printf 'Rollback health and image checks passed; release state was not changed.\n' >&2
      else
        error 'AUTOMATIC ROLLBACK FAILED. Manual recovery is required; known release state is preserved.'
      fi
    else
      compose "$target_image" "$target_revision" stop frontend >/dev/null 2>&1
      compose "$target_image" "$target_revision" rm --force frontend >/dev/null 2>&1
      error 'First deployment failed; failed frontend removed. Proxy certificates and volumes are preserved.'
    fi
  fi
  error 'Deployment did not succeed.'
  (( status != 0 )) || status=1
  exit "$status"
}
trap cleanup EXIT
trap 'abort_deployment "$?"' ERR
trap 'abort_deployment 130' INT
trap 'abort_deployment 143' TERM

[[ "$action" == deploy || "$action" == rollback || "$action" == reject || "$action" == status ]] || die 'Usage: deploy.sh deploy IMAGE REVISION | rollback [EXPECTED_IMAGE EXPECTED_REVISION] | reject CURRENT_IMAGE CURRENT_REVISION | status'
if [[ "$action" == deploy || "$action" == reject ]]; then
  [[ $# == 2 ]] || die 'Deploy requires an immutable image reference and a 40-character commit revision.'
  valid_image "$1" && valid_revision "$2" || die 'Invalid release reference or revision.'
  target_image="$1"; target_revision="$2"
elif [[ "$action" == rollback ]]; then
  [[ $# == 0 || $# == 2 ]] || die 'Rollback takes no arguments or the expected previous image and revision.'
  if [[ $# == 2 ]]; then valid_image "$1" && valid_revision "$2" || die 'Invalid rollback guard.'; fi
else
  [[ $# == 0 ]] || die 'Status takes no arguments.'
fi
[[ "$deploy_root" == /* && ! -L "$deploy_root" ]] || die 'MOVIERATER_ROOT must be an existing absolute server directory.'
deploy_root="$(cd -- "$deploy_root" && pwd -P)" || die 'Server directory is unavailable.'
[[ "$(stat -c '%u' -- "$deploy_root")" == "$(id -u)" ]] || die 'Server directory must be owned by the deployment user.'
root_mode="$(stat -c '%a' -- "$deploy_root")"
(( (8#$root_mode & 022) == 0 )) || die 'Server directory must not be writable by other users.'
for tool in docker curl flock realpath stat cmp grep sort mktemp; do command -v "$tool" >/dev/null || die "Required server tool is missing: $tool"; done
private_file "$deploy_root/.env.server" || die '.env.server is missing, not owned by the deployment user, or has unsafe permissions. Use chmod 600.'

HTTP_PORT=8080
https_enabled=false
MOVIERATER_DOMAIN=''
ACME_EMAIL=''
deploy_timeout=180
declare -A env_seen=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]] || die '.env.server must use plain KEY=value lines.'
  key="${BASH_REMATCH[1]}"; value="${BASH_REMATCH[2]}"
  [[ ! -v "env_seen[$key]" ]] || die "Duplicate server setting: $key"
  env_seen[$key]=1
  case "$key" in
    HTTP_PORT) HTTP_PORT="$value" ;;
    MOVIERATER_HTTPS) https_enabled="$value" ;;
    MOVIERATER_DOMAIN) MOVIERATER_DOMAIN="$value" ;;
    ACME_EMAIL) ACME_EMAIL="$value" ;;
    DEPLOY_TIMEOUT) deploy_timeout="$value" ;;
    *) die "Unsupported server setting: $key. Build-time VITE values and backend secrets do not belong here." ;;
  esac
done < "$deploy_root/.env.server"
[[ -v env_seen[MOVIERATER_HTTPS] ]] || die 'MOVIERATER_HTTPS is required in .env.server.'
[[ "$HTTP_PORT" =~ ^[1-9][0-9]{0,4}$ ]] && (( 10#$HTTP_PORT <= 65535 )) || die 'HTTP_PORT must be a valid TCP port.'
[[ "$deploy_timeout" =~ ^[1-9][0-9]{1,2}$ ]] && (( 10#$deploy_timeout <= 900 )) || die 'DEPLOY_TIMEOUT must be 10–900 seconds.'
[[ "$https_enabled" == true || "$https_enabled" == false ]] || die 'MOVIERATER_HTTPS must be true or false.'
if [[ "$https_enabled" == true ]]; then
  [[ "$MOVIERATER_DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ && ${#MOVIERATER_DOMAIN} -le 253 ]] || die 'MOVIERATER_DOMAIN must be a hostname without scheme, port or path.'
  [[ "$ACME_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die 'ACME_EMAIL is required for HTTPS.'
fi
export HTTP_PORT MOVIERATER_DOMAIN ACME_EMAIL

state_dir="$deploy_root/.deploy-state"
[[ ! -L "$state_dir" ]] || die 'State directory must not be a symlink.'
mkdir -p -- "$state_dir"
[[ "$(stat -c '%u' -- "$state_dir")" == "$(id -u)" ]] || die 'State directory has the wrong owner.'
chmod 700 -- "$state_dir"
[[ ! -L "$state_dir/deploy.lock" ]] || die 'Deployment lock must not be a symlink.'
exec 9> "$state_dir/deploy.lock"
flock --exclusive --nonblock 9 || { error 'Another deployment holds the server lock.'; exit 75; }
state_file="$state_dir/release.env"
if [[ -e "$state_file" || -L "$state_file" ]]; then
  private_file "$state_file" || die 'Release state has unsafe permissions or ownership.'
  declare -A state_seen=()
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^(CURRENT_IMAGE|CURRENT_REVISION|PREVIOUS_IMAGE|PREVIOUS_REVISION)=(.*)$ ]] || die 'Release state is malformed.'
    key="${BASH_REMATCH[1]}"; value="${BASH_REMATCH[2]}"
    [[ ! -v "state_seen[$key]" ]] || die 'Release state contains duplicate fields.'
    state_seen[$key]=1
    case "$key" in
      CURRENT_IMAGE) current_image="$value" ;;
      CURRENT_REVISION) current_revision="$value" ;;
      PREVIOUS_IMAGE) previous_image="$value" ;;
      PREVIOUS_REVISION) previous_revision="$value" ;;
    esac
  done < "$state_file"
  [[ ${#state_seen[@]} == 4 ]] && valid_image "$current_image" && valid_revision "$current_revision" || die 'Current release state is invalid.'
  if [[ -n "$previous_image" || -n "$previous_revision" ]]; then
    valid_image "$previous_image" && valid_revision "$previous_revision" || die 'Previous release state is invalid.'
  fi
fi
if [[ "$action" == status ]]; then
  printf '{"CURRENT_IMAGE":"%s","CURRENT_REVISION":"%s","PREVIOUS_IMAGE":"%s","PREVIOUS_REVISION":"%s"}\n' \
    "$current_image" "$current_revision" "$previous_image" "$previous_revision"
  exit 0
fi
if [[ "$action" == reject ]]; then
  [[ "$target_image" == "$current_image" && "$target_revision" == "$current_revision" ]] || die 'Rejected release no longer matches the locked current release; refusing to change a newer deployment.'
  if [[ -z "$previous_image" ]]; then
    compose "$current_image" "$current_revision" stop frontend >/dev/null 2>&1 || die 'Unable to stop the rejected frontend.'
    compose "$current_image" "$current_revision" rm --force frontend >/dev/null 2>&1 || die 'Unable to remove the rejected frontend.'
    rm -f -- "$state_file"
    printf 'Rejected first release removed; certificates and proxy volumes preserved.\n'
    exit 0
  fi
  target_image="$previous_image"; target_revision="$previous_revision"
elif [[ "$action" == rollback ]]; then
  [[ -n "$previous_image" ]] || die 'No previously verified release is available.'
  if [[ $# == 2 ]]; then
    [[ "$1" == "$previous_image" && "$2" == "$previous_revision" ]] || die 'Rollback guard does not match the locked previous release.'
  fi
  target_image="$previous_image"; target_revision="$previous_revision"
fi
release_directory "$target_revision" >/dev/null || die 'Target release files are incomplete or not in the expected immutable release directory.'
work_dir="$(mktemp -d "$state_dir/check.XXXXXX")"
compose "$target_image" "$target_revision" config --quiet >/dev/null 2>&1 || die 'Target Compose configuration is invalid.'
if [[ -n "$current_image" ]]; then
  release_directory "$current_revision" >/dev/null || die 'Last verified release configuration is missing.'
  if [[ "$action" == deploy ]]; then
    validate_running "$current_image" "$current_revision" || die 'Current release is not healthy or its identity differs. Resolve this before replacing the rollback base.'
    current_verified=true
  elif [[ "$action" == rollback ]]; then
    # Recovery must remain possible when the currently deployed version is broken.
    if validate_running "$current_image" "$current_revision"; then current_verified=true; fi
  fi
else
  existing="$(compose "$target_image" "$target_revision" ps -q frontend 2>/dev/null)" || die 'Unable to inspect the existing frontend.'
  [[ -z "$existing" ]] || die 'An unmanaged frontend already exists; refusing to overwrite it without verified state.'
fi
if [[ "$target_image" == "$current_image" && "$target_revision" == "$current_revision" ]]; then
  printf 'Release is already deployed and verified.\n'
  exit 0
fi
if ! activate "$target_image" "$target_revision"; then abort_deployment 1; fi
state_temp="$(mktemp "$state_dir/.release.env.XXXXXX")"
next_previous_image="$current_image"
next_previous_revision="$current_revision"
if [[ "$action" == reject || "$current_verified" != true ]]; then
  next_previous_image=''; next_previous_revision=''
fi
printf 'CURRENT_IMAGE=%s\nCURRENT_REVISION=%s\nPREVIOUS_IMAGE=%s\nPREVIOUS_REVISION=%s\n' \
  "$target_image" "$target_revision" "$next_previous_image" "$next_previous_revision" > "$state_temp"
chmod 600 -- "$state_temp"
mv -T -- "$state_temp" "$state_file"
state_temp=''
changed=false
printf 'PASS: deployed immutable release; health, HTML, JavaScript, CSS and image identity verified.\n'
