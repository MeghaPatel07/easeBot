#!/bin/bash
# Deploys ONLY the WeddingEase 'api' function.
# All other existing Firebase functions are left completely untouched.

set -e

echo "Building TypeScript..."
npm run build

echo "Deploying api function only..."
npx firebase-tools deploy --only functions:api

echo "Done."
