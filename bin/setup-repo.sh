#!/usr/bin/env bash
#
# Applies the wp-plugin-tools repository settings to a GitHub repository.
#
#   bin/setup-repo.sh OWNER/REPO
#
# Needs Node.js and the GitHub CLI (`gh`), signed in as an admin of the repository.
# Safe to run again: settings are updated, not duplicated.
#
# The "Protect main" ruleset requires the checks that CI has reported on the
# latest commit of the default branch, so run this again after the first
# green CI run of a new plugin.
#
# It doesn't touch secrets. Add SVN_USERNAME and SVN_PASSWORD yourself for
# the deploy workflow.

set -euo pipefail

REPO="${1:-}"
if [[ -z "$REPO" || "$REPO" != */* ]]; then
	echo "Usage: $0 OWNER/REPO" >&2
	exit 1
fi

API="repos/$REPO"
step() { printf '\n➤ %s\n' "$1"; }

step "Merge settings: squash only, PR title as the commit subject, delete branches on merge"
gh api -X PATCH "$API" --silent \
	-F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
	-f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=BLANK \
	-F delete_branch_on_merge=true -F allow_update_branch=true \
	-F has_wiki=false -F has_projects=false

step "Security: secret scanning, push protection, Dependabot security updates"
gh api -X PATCH "$API" --silent --input - <<'EOF'
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}
EOF
gh api -X PUT "$API/vulnerability-alerts" --silent
gh api -X PUT "$API/automated-security-fixes" --silent

step "Private vulnerability reporting"
gh api -X PUT "$API/private-vulnerability-reporting" --silent

step "Code scanning (CodeQL default setup)"
gh api -X PATCH "$API/code-scanning/default-setup" --silent -f state=configured \
	|| echo "  Couldn't enable CodeQL default setup (it needs a supported language such as JavaScript); skipped."

# Upserts a ruleset by name.
upsert_ruleset() {
	local name="$1" body="$2" id
	id=$(gh api "$API/rulesets" --jq ".[] | select(.name == \"$name\") | .id")
	if [[ -n "$id" ]]; then
		gh api -X PUT "$API/rulesets/$id" --silent --input - <<<"$body"
		echo "  Updated ruleset \"$name\"."
	else
		gh api -X POST "$API/rulesets" --silent --input - <<<"$body"
		echo "  Created ruleset \"$name\"."
	fi
}

step "Ruleset: protect the default branch"
DEFAULT_BRANCH=$(gh api "$API" --jq .default_branch)
SHA=$(gh api "$API/commits/$DEFAULT_BRANCH" --jq .sha)
# Required checks: every check CI (GitHub Actions) reported on the latest commit,
# except the Playground preview and CodeQL's own checks.
CHECKS=$(gh api "$API/commits/$SHA/check-runs?per_page=100" --jq '
	[ .check_runs[]
		| select(.app.slug == "github-actions")
		| select(.name | test("Playground|preview|CodeQL|Analyze|Read test matrix|Deploy"; "i") | not)
		| { context: .name, integration_id: .app.id } ]
	| unique_by(.context)')
if [[ "$CHECKS" == "[]" ]]; then
	echo "  No CI checks found on $DEFAULT_BRANCH yet; the ruleset requires none. Run this again after the first CI run."
else
	CHECKS="$CHECKS" node -e 'JSON.parse(process.env.CHECKS).forEach((c) => console.log(`  Required: ${c.context}`))'
fi

MAIN_RULESET=$(CHECKS="$CHECKS" node -e '
const checks = JSON.parse(process.env.CHECKS);
const rules = [
	{ type: "deletion" },
	{ type: "non_fast_forward" },
	{ type: "required_linear_history" },
	{ type: "required_signatures" },
	{ type: "update", parameters: { update_allows_fetch_and_merge: false } },
	{ type: "pull_request", parameters: {
		required_approving_review_count: 1,
		dismiss_stale_reviews_on_push: true,
		require_code_owner_review: true,
		require_last_push_approval: false,
		required_review_thread_resolution: true,
		allowed_merge_methods: ["squash"],
	} },
];
if (checks.length) {
	rules.push({ type: "required_status_checks", parameters: {
		strict_required_status_checks_policy: true,
		do_not_enforce_on_create: false,
		required_status_checks: checks,
	} });
}
console.log(JSON.stringify({
	name: "Protect main",
	target: "branch",
	enforcement: "active",
	conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
	bypass_actors: [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "pull_request" }],
	rules,
}));
')
upsert_ruleset "Protect main" "$MAIN_RULESET"

step "Ruleset: protect release tags (v*)"
upsert_ruleset "Protect release tags" '{
	"name": "Protect release tags",
	"target": "tag",
	"enforcement": "active",
	"conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
	"bypass_actors": [],
	"rules": [ { "type": "deletion" }, { "type": "non_fast_forward" }, { "type": "update", "parameters": { "update_allows_fetch_and_merge": false } } ]
}'

step "Done"
missing=()
for secret in SVN_USERNAME SVN_PASSWORD; do
	gh secret list --repo "$REPO" --json name --jq '.[].name' | grep -qx "$secret" || missing+=("$secret")
done
if (( ${#missing[@]} )); then
	echo "  Reminder: add ${missing[*]} (Settings → Secrets and variables → Actions) before the first release."
	echo "  SVN_PASSWORD is the SVN password from your WordPress.org profile (Account & Security), not your login password."
fi
echo "  Admins bypass the ruleset for pull requests only, so direct pushes to $DEFAULT_BRANCH are blocked."
