'use strict';
const { JSDOM, VirtualConsole } = require('jsdom');
const { buildPage } = require('../tool/build.js');

const STORAGE_KEY = 'moxiePortalTool.config';

// Builds the page in memory and loads it in jsdom. `errors` collects window error events.
async function openTool(opts) {
  const options = opts || {};
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => errors.push(e));
  const { html } = buildPage();
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://tool.test/',
    virtualConsole,
    beforeParse(window) {
      window.addEventListener('error', (e) => errors.push(e.error || e));
      if (options.storage && typeof options.storage === 'object') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(options.storage));
      }
      if (options.beforeParse) options.beforeParse(window);
    }
  });
  const { window } = dom;
  const { document } = window;
  return {
    window,
    document,
    errors,
    $: (sel) => document.querySelector(sel),
    $$: (sel) => Array.from(document.querySelectorAll(sel)),
    tick: (ms) => new Promise((resolve) => setTimeout(resolve, ms || 0))
  };
}

module.exports = { openTool, STORAGE_KEY };
