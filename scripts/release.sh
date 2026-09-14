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

packages=(effective-rsc vercel create-ersc-app)
for package in "${packages[@]}"; do
  package_version="$(bun -e 'console.log(require(process.argv[1]).version)' "./packages/$package/package.json")"
  if [[ "$package_version" != "$version" ]]; then
    echo "packages/$package is $package_version, expected $version." >&2
    exit 1
  fi
done

template_framework_version="$(bun -e 'console.log(require("./packages/create-ersc-app/template/package.json").dependencies["effective-rsc"])')"
if [[ "$template_framework_version" != "$version" ]]; then
  echo "The create-ersc-app template uses effective-rsc $template_framework_version, expected $version." >&2
  exit 1
fi

bun run check
bun run build
bun run test

for package in "${packages[@]}"; do
  bun publish --cwd "packages/$package" --dry-run
done

release_actions="publish effective-rsc, @ersc/vercel, and create-ersc-app $version, then push $tag"
if [[ "$branch" == "main" ]]; then
  release_actions+=", promote the documentation pin, and push main"
fi
read -r -p "$release_actions? Type release: " confirmation
if [[ "$confirmation" != "release" ]]; then
  echo "Release canceled." >&2
  exit 1
fi

for package in "${packages[@]}"; do
  bun publish --cwd "packages/$package"
done

git tag --annotate "$tag" --message "Release $version"
git push origin "$tag"

if [[ "$branch" == "main" ]]; then
  echo "Promoting the documentation site to effective-rsc $version."
  docs_tarball="https://registry.npmjs.org/effective-rsc/-/effective-rsc-$version.tgz"
  bun add --cwd site --dev "effective-rsc-docs@$docs_tarball"
  bun run build --filter=@ersc/site
  git add site/package.json bun.lock
  git commit --message "docs: publish $version documentation"
  git push origin main
else
  echo "The documentation pin was not updated because $branch does not deploy the site." >&2
  echo "After merging the release to main, promote effective-rsc-docs to effective-rsc $version." >&2
fi

echo "GitHub Actions will generate a draft release for $tag. Review and publish it at https://github.com/nikhilsnayak/effective-rsc/releases"
