// public/shadow-worker.js — Web Worker for shadow computation
import { createShadowWorkerHandler } from './shadow-worker-core.js';

self.onmessage = createShadowWorkerHandler({
  postMessage: (message) => self.postMessage(message),
});
