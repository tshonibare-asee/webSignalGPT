let offscreen, ctx, dpr = 1;
let ws = null, paused = false;
let bins = 0;

let W = 0, H = 0;          // canvas pixel size
let writeY = 0;            // current top row position (we’ll scroll)
let rowBuf = null;         // Uint8ClampedArray for one row → RGBA

self.onmessage = (e) => {
  if (e.data.canvas) {
    offscreen = e.data.canvas;
    dpr = e.data.dpr || 1;
    ctx = offscreen.getContext('2d', { alpha: false, desynchronized: true });
    ctx.imageSmoothingEnabled = false;
    W = offscreen.width;
    H = offscreen.height;
    connect(e.data.url);
  } else if (e.data.command === 'pause') {
    paused = true; if (ws) { ws.close(); ws = null; }
  } else if (e.data.command === 'resume') {
    paused = false; if (!ws) connect(e.data.url);
  }
};

function connect(url) {
  if (paused) return;
  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'meta') {
        bins = msg.bins|0;
        // Pre-alloc 1px-high RGBA row
        rowBuf = new Uint8ClampedArray(bins * 4);
        // Clear canvas
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, W, H);
        writeY = 0;
      }
      return;
    }
    if (!bins) return;
    const u8 = new Uint8Array(ev.data); // length == bins, 0..255

    // Build RGBA row (grayscale; swap in a LUT for Kiwi colormap if you want)
    for (let i = 0, j = 0; i < u8.length; i++, j += 4) {
      const v = u8[i];
      rowBuf[j] = v; rowBuf[j+1] = v; rowBuf[j+2] = v; rowBuf[j+3] = 255;
    }

    // Scroll everything down by 1 device pixel and draw new row at y=0
    // 1) move existing image down 1px
    ctx.drawImage(offscreen, 0, 0, W, H-1, 0, 1, W, H-1);
    // 2) put new row at top (scaled horizontally to canvas width)
    const img = new ImageData(rowBuf, bins, 1);
    // draw to an intermediate 1×bins raster -> scale to W×1
    // fastest path: setTransform to scale X only
    ctx.save();
    ctx.setTransform(W / bins, 0, 0, 1, 0, 0);
    ctx.putImageData(img, 0, 0);
    ctx.restore();
  };

  ws.onclose = () => { if (!paused) setTimeout(() => connect(url), 500); };
  ws.onerror = () => ws.close();
}
