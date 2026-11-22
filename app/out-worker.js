// Mothlight No.01 video out: raw frames become JPEG here, away from the thread that draws. Two of these share the work.
'use strict';
let canvas, ctx;
onmessage = async e => {
  const { w, h, buf, n } = e.data, row = w * 4, raw = new Uint8ClampedArray(buf), image = new ImageData(w, h);
  if (!canvas || canvas.width !== w || canvas.height !== h) { canvas = new OffscreenCanvas(w, h); ctx = canvas.getContext('2d', { alpha: false }); }
  // the graphics chip reads bottom row first
  for (let y = 0; y < h; y++) image.data.set(raw.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  ctx.putImageData(image, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  const url = new FileReaderSync().readAsDataURL(blob);
  postMessage({ n, buf, jpeg: url.slice(url.indexOf(',') + 1) }, [buf]);
};
