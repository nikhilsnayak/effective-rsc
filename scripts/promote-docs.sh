#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: bun run release:promote-docs <version>" >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "Documentation promotion must run from main; currently on $branch." >&2
  exit 1
fi

git fetch origin main --tags

tag="v$version"
if ! git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
  echo "Release tag $tag does not exist. Publish and push the release tag first." >&2
  exit 1
fi

if ! git merge-base --is-ancestor "$tag^{}" HEAD; then
  echo "Local main does not contain release tag $tag." >&2
  exit 1
fi

if ! git merge-base --is-ancestor origin/main HEAD; then
  echo "Local main must contain origin/main before promoting documentation." >&2
  echo "Rebase the promotion commit onto origin/main, then rerun: bun run release:promote-docs $version" >&2
  exit 1
fi

committed_promotion_paths=""
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  ahead_count="$(git rev-list --count origin/main..HEAD)"
  head_subject="$(git log -1 --format=%s)"
  if [[ "$ahead_count" != "1" || "$head_subject" != "docs: publish $version documentation" ]]; then
    echo "Local main has unpushed commits unrelated to documentation promotion." >&2
    exit 1
  fi
  committed_promotion_paths="$(git diff --name-only origin/main..HEAD)"
fi

changed_paths="$({
  printf '%s\n' "$committed_promotion_paths"
  git diff --name-only
  git diff --cached --name-only
  git ls-files --others --exclude-standard
} | sort -u)"
while IFS= read -r changed_path; do
  if [[ -z "$changed_path" ]]; then
    continue
  fi
  if [[ "$changed_path" != "bun.lock" && "$changed_path" != "site/package.json" ]]; then
    echo "Documentation promotion cannot continue with unrelated change: $changed_path" >&2
    exit 1
  fi
done <<< "$changed_paths"

promotion_failed() {
  status=$?
  trap - ERR
  echo "Documentation promotion did not finish." >&2
  echo "Resolve any reported conflict, then resume with: bun run release:promote-docs $version" >&2
  exit "$status"
}
trap promotion_failed ERR

echo "Promoting the documentation site to effective-rsc $version."
docs_tarball="https://registry.npmjs.org/effective-rsc/-/effective-rsc-$version.tgz"
bun add --cwd site --dev "effective-rsc-docs@$docs_tarball"
bun run build --filter=@ersc/site

git add site/package.json bun.lock
if ! git diff --cached --quiet; then
  git commit --message "docs: publish $version documentation"
fi

git push origin main
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "Documentation promotion did not reach origin/main." >&2
  false
fi

trap - ERR
echo "Documentation now targets effective-rsc $version on origin/main."
