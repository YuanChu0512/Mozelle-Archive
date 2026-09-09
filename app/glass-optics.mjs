export function createGlassField(width, height, radius) {
  const padding = 10;
  const extentWidth = width + padding * 2, extentHeight = height + padding * 2;
  const resolution = Math.min(1, 768 / extentWidth, 128 / extentHeight, Math.sqrt(65536 / (extentWidth * extentHeight)));
  const mapWidth = Math.max(2, Math.round(extentWidth * resolution));
  const mapHeight = Math.max(2, Math.round(extentHeight * resolution));
  const data = new Uint8ClampedArray(mapWidth * mapHeight * 4);
  const corner = Math.max(1, Math.min(radius, width / 2, height / 2));
  const bevel = Math.min(16, height * .32, Math.max(8, corner * .7));
  const maxOffset = Math.min(7, Math.min(width, height) * .12);
  for (let y = 0; y < mapHeight; y++) for (let x = 0; x < mapWidth; x++) {
    const px = (x + .5) / mapWidth * extentWidth - padding - width / 2;
    const py = (y + .5) / mapHeight * extentHeight - padding - height / 2;
    const qx = Math.abs(px) - width / 2 + corner;
    const qy = Math.abs(py) - height / 2 + corner;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    const distance = Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - corner;
    let dx = 0, dy = 0;
    if (distance <= 0 && distance > -bevel) {
      const strength = Math.sin(Math.PI * -distance / bevel);
      const normalLength = Math.hypot(ox, oy);
      const nx = normalLength ? ox / normalLength : qx > qy ? 1 : 0;
      const ny = normalLength ? oy / normalLength : qx > qy ? 0 : 1;
      dx = -Math.sign(px) * nx * strength;
      dy = -Math.sign(py) * ny * strength;
    }
    const index = (y * mapWidth + x) * 4;
    data[index] = Math.round(127.5 + dx * 127.5);
    data[index + 1] = Math.round(127.5 + dy * 127.5);
    data[index + 2] = 128;
    data[index + 3] = 255;
  }
  return { data, mapWidth, mapHeight, width: extentWidth, height: extentHeight, padding, scale: maxOffset * 2 };
}
