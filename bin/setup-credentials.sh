#!/bin/bash
# Gmail Account Creation — Credential Setup Script
# Run this to set up credentials for automated Gmail account creation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.gmail"

echo "═══════════════════════════════════════════════════════════"
echo "  Gmail Account Creator — Credential Setup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if already configured
if [ -f "$ENV_FILE" ]; then
	echo "⚠️  Credentials already exist at: $ENV_FILE"
	read -p "Overwrite? (y/N): " -n 1 -r
	echo
	if [[ ! $REPLY =~ ^[Yy]$ ]]; then
		echo "Cancelled."
		exit 0
	fi
fi

echo "Enter your credentials (input will be hidden):"
echo ""

# Get 5sim API Key
echo -n "5sim API Key: "
read -s FIVESIM_API_KEY
echo

if [ -z "$FIVESIM_API_KEY" ]; then
	echo "❌ Error: 5sim API Key is required"
	exit 1
fi

# Get IPRoyal credentials (optional)
echo -n "IPRoyal Proxy URL [http://geo.iproyal.com:12321]: "
read PROXY_SERVER
PROXY_SERVER=${PROXY_SERVER:-"http://geo.iproyal.com:12321"}

echo -n "IPRoyal Username (optional): "
read PROXY_USER

echo -n "IPRoyal Password (optional): "
read -s PROXY_PASS
echo

# Write to env file
cat >"$ENV_FILE" <<EOF
# Gmail Account Creator Credentials
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# This file should have restricted permissions (chmod 600)

FIVESIM_API_KEY="$FIVESIM_API_KEY"
SMS_API_KEY="$FIVESIM_API_KEY"
PROXY_SERVER="$PROXY_SERVER"
EOF

if [ -n "$PROXY_USER" ]; then
	echo "PROXY_USER=\"$PROXY_USER\"" >>"$ENV_FILE"
fi

if [ -n "$PROXY_PASS" ]; then
	echo "PROXY_PASS=\"$PROXY_PASS\"" >>"$ENV_FILE"
fi

# Secure the file
chmod 600 "$ENV_FILE"

echo ""
echo "✅ Credentials saved to: $ENV_FILE"
echo "   Permissions: $(ls -la "$ENV_FILE" | awk '{print $1}')"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Next Steps:"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "1. Test dry-run (no API calls):"
echo "   source $ENV_FILE"
echo "   xvfb-run node account/create-accounts.mjs --cdp --dry-run --start 1 --end 1 --region russia"
echo ""
echo "2. Create single account:"
echo "   source $ENV_FILE"
echo "   xvfb-run node account/create-accounts.mjs --cdp --start 1 --end 1 --region russia"
echo ""
echo "3. Create multiple accounts with proxy:"
echo "   source $ENV_FILE"
echo "   xvfb-run node account/create-accounts.mjs --cdp --start 1 --end 5 --region russia \\"
echo "     --proxy \"\$PROXY_SERVER\" --proxy-user \"\$PROXY_USER\" --proxy-pass \"\$PROXY_PASS\""
echo ""
