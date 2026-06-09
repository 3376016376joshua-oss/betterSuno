'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function resolvePath(value, cwd = process.cwd()) {
  return path.resolve(cwd, value);
}

function ensureFile(filePath, label = 'file') {
  const resolved = resolvePath(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} not found: ${resolved}`);
  }

  if (!fs.statSync(resolved).isFile()) {
    throw new Error(`${label} must be a file: ${resolved}`);
  }

  return resolved;
}

function ensureNonEmptyFile(filePath, label = 'file') {
  const resolved = ensureFile(filePath, label);
  const { size } = fs.statSync(resolved);

  if (size <= 0) {
    throw new Error(`${label} is empty: ${resolved}`);
  }

  return resolved;
}

function ensureDirectory(dirPath) {
  const resolved = resolvePath(dirPath);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function runCommand(command, args, options = {}) {
  if (!command || typeof command !== 'string') {
    throw new Error('Command must be a non-empty string.');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...(options.env || {}),
      },
      stdio: options.stdio || 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${options.label || command} failed with exit code ${code}`));
    });
  });
}

function runCommandCapture(command, args, options = {}) {
  if (!command || typeof command !== 'string') {
    throw new Error('Command must be a non-empty string.');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...(options.env || {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const chunks = {
      stdout: [],
      stderr: [],
    };

    child.stdout.on('data', (chunk) => chunks.stdout.push(chunk));
    child.stderr.on('data', (chunk) => chunks.stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const stdout = Buffer.concat(chunks.stdout).toString('utf8');
      const stderr = Buffer.concat(chunks.stderr).toString('utf8');

      if (code === 0) {
        resolve({
          stdout,
          stderr,
        });
        return;
      }

      const details = stderr.trim() || stdout.trim();
      reject(new Error(`${options.label || command} failed with exit code ${code}${details ? `: ${details}` : ''}`));
    });
  });
}

module.exports = {
  ensureDirectory,
  ensureFile,
  ensureNonEmptyFile,
  resolvePath,
  runCommand,
  runCommandCapture,
};
