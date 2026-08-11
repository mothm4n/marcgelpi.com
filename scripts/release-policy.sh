#!/usr/bin/env bash

# Canonical visitor-facing routes that make up the complete V1 release.
release_public_paths=(
  /
  /work/
  /work/adevinta/
  /work/protected-autonomy/
  /work/preparing-to-scale/
  /about/
  /writing/
  /writing/life-isnt-always-a-river/
  /contact/
  /404.html
)

# Routes intentionally kept out of the focused V1 until they have approved content.
release_hidden_paths=(
  /resources/
  /authors/
  /categories/
  /series/
  /tags/
)

# Keep this expression portable between grep -E and JavaScript RegExp.
release_forbidden_artifact_pattern='data-publication-review-banner|analytics|gtag|googletagmanager|posthog|hubspot|calendly|disqus|<form([ >])|<iframe([ >])|data-site-search|data-language-selector|cookie consent|newsletter|comments'

release_path_to_artifact() {
  local public_path=$1

  case "$public_path" in
    /)
      printf '%s\n' 'index.html'
      ;;
    *.html)
      printf '%s\n' "${public_path#/}"
      ;;
    *)
      local route_directory=${public_path#/}
      printf '%s/index.html\n' "${route_directory%/}"
      ;;
  esac
}
