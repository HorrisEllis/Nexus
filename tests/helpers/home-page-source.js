'use strict';
/**
 * tests/helpers/home-page-source.js — v0.39.228
 * ui/home/index.html no longer holds the page's JS/CSS inline: it links one
 * JS + one CSS file per area (ui/home/areas/), core modules (ui/home/core/),
 * and the shared ui/home/home.css. Tests that assert "the home page contains X"
 * read this: index.html followed by every /ui/home/** file it links, in link
 * order. Throws if a linked file is missing — a dangling link is a failure,
 * not an empty string.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const INDEX = path.join(ROOT, 'ui/home/index.html');

function homeLinks(html) {
  const re = /<(?:script[^>]*\ssrc|link[^>]*\shref)="(\/ui\/home\/[^"]+)"/g;
  return [...html.matchAll(re)].map(m => m[1]);
}

function homePageSource() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const parts = [html];
  for (const url of homeLinks(html)) {
    const file = path.join(ROOT, url.replace(/^\//, ''));
    if (!fs.existsSync(file)) throw new Error(`ui/home/index.html links ${url}, which does not exist`);
    parts.push(fs.readFileSync(file, 'utf8'));
  }
  return parts.join('\n');
}

module.exports = { homePageSource, homeLinks, ROOT, INDEX };
