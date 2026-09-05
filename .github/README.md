# Pull requests and releases

Submit related changes as separate PRs. Stacked PRs target the branch below them; CI runs for
every PR base, not just `main`. Merge the approved stack bottom-up so each PR lands on `main`.

Use a conventional-commit PR title, `type(scope): description`, and a matching type label:

- `feat`: New Features
- `fix`: Bug Fixes
- `perf`: Performance
- `refactor`: Refactoring
- `docs`: Documentation
- `build`, `chore`, `ci`, `revert`, or `test`: Other Changes

For example, `fix(client): recover failed navigation` gets the `fix` label. For breaking changes,
use `!` in the title, such as `feat!: change the Page contract`, and add the `breaking` label
alongside the type label. Breaking Changes takes precedence over the type category.

GitHub groups entries by labels, not by parsing titles; keep both aligned. Uncategorized PRs appear
under Other Changes. The categories live in [release.yml](release.yml); no title parser or changelog
dependency is needed.

## Publishing

1. Merge the release's PRs into `main`, including the matching framework, scaffolder, and template
   version updates. Update local `main` to match GitHub.
2. Run `bun run release <version>`. The existing script verifies the repository, asks for
   confirmation, publishes both npm packages, and pushes the version tag.
3. The [release-notes workflow](workflows/release-notes.yml) creates a draft GitHub release with
   automatically generated PR entries, contributors, and a comparison link.
4. Review the draft and publish it on GitHub.

Pushing a branch or opening a PR does not create a release. The notes workflow does not publish
npm packages or create tags. It requires the tag to exist and does not overwrite an existing
release when rerun.
