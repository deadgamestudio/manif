#!/bin/sh
# Empties Cloudflare's copies of the files that keep their name across deploys
# (#90): the sounds, the voices (#137), the models, the link preview image and the icons. The
# hashed bundles under /assets are left alone: a new deploy never reuses their
# names, and a tab opened before the deploy still finds its old chunks there.
# The pages are not cached at Cloudflare, so there is nothing to empty.
#
# Run after each deploy, either by Coolify (post-deployment command
# `cf-purge` in the `client` container, see README "Deploy") or by hand:
#   CF_ZONE_ID=... CF_API_TOKEN=... sh scripts/cf-purge.sh
#
#   CF_ZONE_ID     the zone id of the domain (Cloudflare dashboard, Overview).
#   CF_API_TOKEN   a token allowed only "Zone > Cache Purge" on that zone.
#                  A secret: never commit it, it is never printed.
#   CF_PURGE_HOST  the site's host name, manif.bazlab.si by default.
#
# Without CF_ZONE_ID or CF_API_TOKEN it only says so and exits 0, so a deploy
# or a local run never fails because of it. A refused purge exits 1.
# Plain sh with curl or wget: the client image (caddy:2-alpine) only has
# busybox's wget.

host="${CF_PURGE_HOST:-manif.bazlab.si}"

if [ -z "$CF_ZONE_ID" ] || [ -z "$CF_API_TOKEN" ]; then
	echo "cf-purge: CF_ZONE_ID or CF_API_TOKEN is not set, nothing purged."
	exit 0
fi

url="https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache"
# A prefix also matches the file itself (favicon.svg), and every query string.
body="{\"prefixes\":[\"$host/sounds/\",\"$host/voices/\",\"$host/models/\",\"$host/og/\",\"$host/favicon.svg\",\"$host/apple-touch-icon.png\"]}"

if command -v curl >/dev/null 2>&1; then
	answer=$(curl -sS -X POST "$url" \
		-H "Authorization: Bearer $CF_API_TOKEN" \
		-H "Content-Type: application/json" \
		--data "$body" 2>&1)
else
	answer=$(wget -q -O - \
		--header "Authorization: Bearer $CF_API_TOKEN" \
		--header "Content-Type: application/json" \
		--post-data "$body" "$url" 2>&1)
fi

case "$answer" in
	*'"success":true'* | *'"success": true'*)
		echo "cf-purge: emptied Cloudflare's copies of /sounds, /voices, /models, /og and the icons on $host."
		;;
	*)
		# Cloudflare's answer names the error; it never echoes the token.
		echo "cf-purge: Cloudflare refused the purge: $answer" >&2
		exit 1
		;;
esac
