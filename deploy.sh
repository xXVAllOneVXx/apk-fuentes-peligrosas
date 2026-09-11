#!/bin/bash
echo "Building the project..."
npm run build
echo "Deploying to Hostinger..."
rsync -avP ./dist/ hostinger:domains/contentmindsalliance.com/public_html/tools/alerta-sismos/
echo "Done!"
