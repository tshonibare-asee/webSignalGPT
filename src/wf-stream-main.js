//const WS_URL = "ws://localhost:8765/";   // your bridge URL/port

const WS_URL = "http://localhost:8765/wf/latest.png";   // your bridge URL/port

const canvas = document.getElementById('wf-canvas');
const dpr = Math.max(1, window.devicePixelRatio || 1);
const cssW = canvas.clientWidth  || canvas.width;
const cssH = canvas.clientHeight || canvas.height;
canvas.width  = Math.round(cssW * dpr);
canvas.height = Math.round(cssH * dpr);

const off = canvas.transferControlToOffscreen();
const worker = new Worker('/js/wf-stream-worker.js', { type: 'module' });
worker.postMessage({ canvas: off, url: WS_URL, dpr }, [off]);

document.addEventListener('visibilitychange', () => {
  worker.postMessage({ command: document.hidden ? 'pause' : 'resume' });
});
