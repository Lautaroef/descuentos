/// <reference lib="webworker" />
// Serwist service worker. Built by @serwist/next into /public/sw.js at build time.
//
// Strategy per build-plan.md 3e:
//   NetworkFirst for HTML pages — so users see fresh promos when online.
//   StaleWhileRevalidate for JS/CSS/images — snappy offline, updates in background.
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
