/**
 * Android's photo picker zeroes GPS EXIF values without re-encoding the image.
 * Reproduce that copy when matching a camera-folder original to a saved hash.
 * Never use metadata similarity as proof: the caller still checks SHA-256.
 */
export function withoutGpsExif(bytes: ArrayBuffer): ArrayBuffer | null {
  const data = new Uint8Array(bytes);
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  const view = new DataView(bytes);
  try {
    // Walk JPEG segments; don't mistake image/video payload for an EXIF header.
    for (let pos = 2; pos + 4 <= data.length;) {
      if (data[pos] !== 0xff) return null;
      const marker = data[pos + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = view.getUint16(pos + 2);
      const end = pos + 2 + length;
      if (length < 2 || end > data.length) return null;
      if (marker !== 0xe1 || length < 16 ||
          data[pos + 4] !== 0x45 || data[pos + 5] !== 0x78 ||
          data[pos + 6] !== 0x69 || data[pos + 7] !== 0x66 ||
          data[pos + 8] !== 0 || data[pos + 9] !== 0) {
        pos = end;
        continue;
      }
      const base = pos + 10;
      const little = data[base] === 0x49 && data[base + 1] === 0x49;
      if (!little && !(data[base] === 0x4d && data[base + 1] === 0x4d)) return null;
      const check = (offset: number, size: number) => {
        if (offset < base || size < 0 || offset + size > end) throw new Error('Invalid EXIF range');
      };
      const u16 = (offset: number) => { check(offset, 2); return view.getUint16(offset, little); };
      const u32 = (offset: number) => { check(offset, 4); return view.getUint32(offset, little); };
      if (u16(base + 2) !== 42) return null;
      const ifd = base + u32(base + 4);
      const entries = u16(ifd);
      check(ifd + 2, entries * 12);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + 12 * i;
        if (u16(entry) !== 0x8825) continue;
        const gps = base + u32(entry + 8);
        const count = u16(gps);
        check(gps + 2, count * 12);
        const sizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
        const copy = bytes.slice(0);
        const out = new Uint8Array(copy);
        let changed = false;
        for (let j = 0; j < count; j++) {
          const e = gps + 2 + 12 * j;
          const tag = u16(e);
          const size = (sizes[u16(e + 2)] ?? 0) * u32(e + 4);
          if (tag > 30 || !size) continue;
          const offset = size <= 4 ? e + 8 : base + u32(e + 8);
          check(offset, size);
          out.fill(0, offset, offset + size);
          changed = true;
        }
        return changed ? copy : null;
      }
      return null;
    }
  } catch {
    // Malformed or unsupported metadata is an unmatched file, not a restore failure.
  }
  return null;
}
