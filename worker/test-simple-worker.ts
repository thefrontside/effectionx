
console.error('[worker] Starting');

// Test basic message handling without effection
self.onmessage = (e) => {
  console.error('[worker] onmessage got:', e.data);
  if (e.data.type === 'test') {
    self.postMessage({ type: 'echo', data: e.data.data });
  }
};

console.error('[worker] Posting ready');
self.postMessage({ type: 'ready' });
