#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const requestedDirectory = process.argv[2];
if (!requestedDirectory) {
  console.error('Usage: release-artifact-digest.js <directory>');
  process.exit(2);
}

const root = path.resolve(requestedDirectory);
if (!fs.statSync(root).isDirectory()) {
  console.error(`Release artifact is not a directory: ${root}`);
  process.exit(2);
}

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return filesBelow(absolutePath);
      if (!entry.isFile()) {
        throw new Error(`Unsupported release artifact entry: ${absolutePath}`);
      }
      return [absolutePath];
    });
}

const digest = crypto.createHash('sha256');
for (const absolutePath of filesBelow(root)) {
  const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
  digest.update(relativePath);
  digest.update('\0');
  digest.update(fs.readFileSync(absolutePath));
  digest.update('\0');
}

process.stdout.write(`${digest.digest('hex')}\n`);
