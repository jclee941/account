#!/bin/bash
# Quick launcher for Gmail account creation with credentials
# Supports: .env.gmail file OR environment variables

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.gmail"

# Load from .env.gmail if it exists, otherwise rely on environment
if [ -f "$ENV_FILE" ]; then
	echo "📁 Loading credentials from: $ENV_FILE"
	set -a
	source "$ENV_FILE"
	set +a
elif [ -n "$FIVESIM_API_KEY" ] || [ -n "$PVAPINS_API_KEY" ] || [ -n "$SMS_ACTIVATE_API_KEY" ]; then
	echo "🔑 Using credentials from environment variables"
else
	echo "❌ Credentials not found."
	echo ""
	echo "Options to provide credentials:"
	echo "  1. Run: ./setup-credentials.sh (creates .env.gmail)"
	echo "  2. Export env var: export FIVESIM_API_KEY='your-key'"
	echo "  3. Use 1Password: source .env.1password && op run --env-file=.env.5sim -- $0"
	echo ""
	exit 1
fi

# Default values
START=${START:-1}
END=${END:-1}
REGION=${REGION:-russia}
CDP_MODE="--cdp"

# Parse arguments
DRY_RUN=""
CLI_PROXY_URL=""

while [[ $# -gt 0 ]]; do
	case $1 in
	--dry-run)
		DRY_RUN="--dry-run"
		shift
		;;
	--start)
		START="$2"
		shift 2
		;;
	--end)
		END="$2"
		shift 2
		;;
	--region)
		REGION="$2"
		shift 2
		;;
	--no-cdp)
		CDP_MODE=""
		shift
		;;
	--proxy)
		CLI_PROXY_URL="$2"
		shift 2
		;;
	*)
		shift
		;;
	esac
done

echo "═══════════════════════════════════════════════════════════"
echo "  Gmail Account Creator — Quick Launch"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Range:    qws943$(printf "%02d" $START) ~ qws943$(printf "%02d" $END)"
echo "  Region:   $REGION"
echo "  Mode:     ${CDP_MODE:+CDP }${DRY_RUN:+Dry-Run }"
echo "  Proxy:    ${CLI_PROXY_URL:-${PROXY_SERVER:+Enabled}}"
echo ""
echo "═══════════════════════════════════════════════════════════"

# Build command as array (safe with special characters in credentials)
CMD=(xvfb-run node account/create-accounts.mjs)

[ -n "$CDP_MODE" ] && CMD+=("$CDP_MODE")
[ -n "$DRY_RUN" ] && CMD+=("$DRY_RUN")
CMD+=(--start "$START" --end "$END" --region "$REGION")

if [ -n "$CLI_PROXY_URL" ]; then
	CMD+=(--proxy "$CLI_PROXY_URL")
elif [ -n "$PROXY_SERVER" ] && [ -n "$PROXY_USER" ] && [ -n "$PROXY_PASS" ]; then
	CMD+=(--proxy "$PROXY_SERVER" --proxy-user "$PROXY_USER" --proxy-pass "$PROXY_PASS")
fi

echo "Running: ${CMD[*]}"
echo ""

# Execute
cd "$SCRIPT_DIR"
"${CMD[@]}"
