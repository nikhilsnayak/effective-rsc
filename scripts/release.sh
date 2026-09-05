#!/usr/bin/env bash

set -euo pipefail

repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: bun run release <version>" >&2
  exit 1
fi

tag="v$version"
branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  if [[ ! "$branch" =~ ^([0-9]+\.[0-9]+)\.x$ ]]; then
    echo "Release must run from main or a maintenance branch such as 0.1.x; currently on $branch." >&2
    exit 1
  fi

  maintenance_version="${BASH_REMATCH[1]}"
  if [[ "$version" != "$maintenance_version."* ]]; then
    echo "Release $version does not belong to maintenance branch $branch." >&2
    exit 1
  fi
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Release requires a clean worktree." >&2
  exit 1
fi

git fetch origin "$branch" --tags

if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$branch")" ]]; then
  echo "Local $branch must exactly match origin/$branch." >&2
  exit 1
fi

if git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
  echo "Tag $tag already exists." >&2
  exit 1
fi

effective_rsc_version="$(bun -e 'console.log(require("./packages/effective-rsc/package.json").version)')"
create_ersc_app_version="$(bun -e 'console.log(require("./packages/create-ersc-app/package.json").version)')"
template_framework_version="$(bun -e 'console.log(require("./packages/create-ersc-app/template/package.json").dependencies["effective-rsc"])')"

if [[ "$effective_rsc_version" != "$version" ]]; then
  echo "effective-rsc is $effective_rsc_version, expected $version." >&2
  exit 1
fi

if [[ "$create_ersc_app_version" != "$version" ]]; then
  echo "create-ersc-app is $create_ersc_app_version, expected $version." >&2
  exit 1
fi

if [[ "$template_framework_version" != "$version" ]]; then
  echo "The create-ersc-app template uses effective-rsc $template_framework_version, expected $version." >&2
  exit 1
fi

bun run check
bun run build
bun run test

bun publish --cwd packages/effective-rsc --dry-run
bun publish --cwd packages/create-ersc-app --dry-run

read -r -p "Publish effective-rsc and create-ersc-app $version, then push $tag? Type release: " confirmation
if [[ "$confirmation" != "release" ]]; then
  echo "Release canceled." >&2
  exit 1
fi

bun publish --cwd packages/effective-rsc
bun publish --cwd packages/create-ersc-app

git tag --annotate "$tag" --message "Release $version"
git push origin "$tag"

echo "GitHub Actions will generate a draft release for $tag. Review and publish it at https://github.com/nikhilsnayak/effective-rsc/releases"
