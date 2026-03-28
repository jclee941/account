#!/bin/bash
# 1Password Service Account Setup for Gmail Automation
# This allows non-interactive secret retrieval

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.1password"

echo "═══════════════════════════════════════════════════════════"
echo "  1Password Service Account Setup"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "This script configures 1Password for non-interactive use."
echo ""

# Check if 1Password CLI is installed
if ! command -v op >/dev/null 2>&1; then
	echo "❌ 1Password CLI not found. Installing..."

	# Install based on OS
	if [[ "$OSTYPE" == "linux-gnu"* ]]; then
		# Linux
		curl -sS https://downloads.1password.com/linux/keys/1password.asc |
			sudo gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg
		echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/$(dpkg --print-architecture) stable main" |
			sudo tee /etc/apt/sources.list.d/1password.list
		sudo apt update && sudo apt install 1password-cli
	elif [[ "$OSTYPE" == "darwin"* ]]; then
		# macOS
		brew install 1password-cli
	fi

	echo "✅ 1Password CLI installed"
	echo ""
fi

echo "To use 1Password in automation, you need a Service Account."
echo ""
echo "Setup steps:"
echo "1. Go to https://my.1password.com/developer-tools/infrastructure-secrets"
echo "2. Create a Service Account"
echo "3. Grant it access to the 'homelab' vault"
echo "4. Copy the Service Account token (starts with 'ops_')"
echo ""

if [ -f "$ENV_FILE" ]; then
	echo "⚠️  Service account already configured."
	read -p "Reconfigure? (y/N): " -n 1 -r
	echo
	if [[ ! $REPLY =~ ^[Yy]$ ]]; then
		echo "Cancelled."
		exit 0
	fi
fi

echo -n "Enter 1Password Service Account Token (ops_xxxxx...): "
read -s OP_SERVICE_ACCOUNT_TOKEN
echo

if [ -z "$OP_SERVICE_ACCOUNT_TOKEN" ]; then
	echo "❌ Error: Service account token is required"
	exit 1
fi

if [[ ! $OP_SERVICE_ACCOUNT_TOKEN =~ ^ops_ ]]; then
	echo "❌ Error: Token should start with 'ops_'"
	exit 1
fi

# Test the token
echo ""
echo "Testing token..."
export OP_SERVICE_ACCOUNT_TOKEN

if ! op vault list >/dev/null 2>&1; then
	echo "❌ Error: Invalid token or no vault access"
	exit 1
fi

echo "✅ Token valid!"
echo ""

# Check if homelab vault exists
if op vault list | grep -q "homelab"; then
	echo "✅ 'homelab' vault found"

	# Check if 5sim API key exists
	if op item list --vault homelab | grep -qi "5sim"; then
		echo "✅ 5sim API Key found in homelab vault"
	else
		echo "⚠️  5sim API Key not found in homelab vault"
		echo "   Expected at: op://homelab/5sim API Key/credential"
	fi
else
	echo "⚠️  'homelab' vault not found"
	echo "   Available vaults:"
	op vault list
fi

# Save token
cat >"$ENV_FILE" <<EOF
# 1Password Service Account Configuration
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

OP_SERVICE_ACCOUNT_TOKEN="$OP_SERVICE_ACCOUNT_TOKEN"
EOF

chmod 600 "$ENV_FILE"

echo ""
echo "✅ Service account saved to: $ENV_FILE"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Usage:"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "1. Source the configuration:"
echo "   source $ENV_FILE"
echo ""
echo "2. Run with 1Password:"
echo "   op run --env-file=.env.5sim -- node account/create-accounts.mjs --dry-run"
echo ""
echo "   Where .env.5sim contains:"
echo "   FIVESIM_API_KEY=op://homelab/5sim API Key/credential"
echo ""
