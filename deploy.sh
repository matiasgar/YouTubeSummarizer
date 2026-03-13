#!/bin/bash
set -e

# Deploy to production by merging dev into master and pushing.
# Run from the project root: ./deploy.sh

BRANCH=$(git branch --show-current)

if [ "$BRANCH" != "dev" ]; then
  echo "Error: You must be on the 'dev' branch to deploy."
  echo "Currently on: $BRANCH"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: You have uncommitted changes. Commit or stash them first."
  exit 1
fi

echo "Deploying dev -> master..."

git checkout master
git merge dev --no-edit
git push origin master
git checkout dev

echo ""
echo "Done! Master is updated."
echo "You are back on the dev branch."
