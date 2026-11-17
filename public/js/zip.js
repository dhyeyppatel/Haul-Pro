// Pure JavaScript Client-Side ZIP Generator (Zero Dependencies)
const ShelfieZip = (function () {
  // Precomputed CRC32 table
  const CRC_TABLE = new Uint32Array(256);
  (function initCRC() {
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      CRC_TABLE[i] = c;
    }
  })();

  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
  }

  function dosTime(date) {
    const d = date || new Date();
    const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
    const dt = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    return { time, date: dt };
  }

  async function createZip(files) {
    // files: Array of { name: string, data: ArrayBuffer | Uint8Array | Blob }
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;
    const now = dosTime(new Date());

    for (const f of files) {
      const nameBytes = new TextEncoder().encode(f.name);
      let dataBytes;
      if (f.data instanceof Blob) {
        dataBytes = new Uint8Array(await f.data.arrayBuffer());
      } else if (f.data instanceof ArrayBuffer) {
        dataBytes = new Uint8Array(f.data);
      } else if (f.data instanceof Uint8Array) {
        dataBytes = f.data;
      } else {
        dataBytes = new TextEncoder().encode(String(f.data || ''));
      }

      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      // 1. Local File Header (30 bytes + name + data)
      const localHdr = new Uint8Array(30 + nameBytes.length);
      const v = new DataView(localHdr.buffer);
      v.setUint32(0, 0x04034b50, true); // signature
      v.setUint16(4, 20, true);         // version needed
      v.setUint16(6, 0x0800, true);      // flags (UTF-8)
      v.setUint16(8, 0, true);           // method: 0 (Store)
      v.setUint16(10, now.time, true);
      v.setUint16(12, now.date, true);
      v.setUint32(14, crc, true);
      v.setUint32(18, size, true);       // compressed
      v.setUint32(22, size, true);       // uncompressed
      v.setUint16(26, nameBytes.length, true);
      v.setUint16(28, 0, true);          // extra length
      localHdr.set(nameBytes, 30);

      localHeaders.push(localHdr, dataBytes);

      // 2. Central Directory Header (46 bytes + name)
      const centralHdr = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHdr.buffer);
      cv.setUint32(0, 0x02014b50, true); // signature
      cv.setUint16(4, 20, true);         // version made by
      cv.setUint16(6, 20, true);         // version needed
      cv.setUint16(8, 0x0800, true);      // flags (UTF-8)
      cv.setUint16(10, 0, true);          // method: 0
      cv.setUint16(12, now.time, true);
      cv.setUint16(14, now.date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);         // extra
      cv.setUint16(32, 0, true);         // comment
      cv.setUint16(34, 0, true);         // disk
      cv.setUint16(36, 0, true);         // internal attrs
      cv.setUint32(38, 0, true);         // external attrs
      cv.setUint32(42, offset, true);    // local header offset
      centralHdr.set(nameBytes, 46);

      centralHeaders.push(centralHdr);
      offset += localHdr.length + dataBytes.length;
    }

    // 3. End of Central Directory (22 bytes)
    const centralSize = centralHeaders.reduce((acc, h) => acc + h.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true); // signature
    ev.setUint16(4, 0, true);          // disk number
    ev.setUint16(6, 0, true);          // start disk
    ev.setUint16(8, files.length, true); // entries on disk
    ev.setUint16(10, files.length, true); // total entries
    ev.setUint32(12, centralSize, true); // size of central dir
    ev.setUint32(16, offset, true);      // offset of central dir
    ev.setUint16(20, 0, true);          // comment length

    const allParts = [...localHeaders, ...centralHeaders, eocd];
    return new Blob(allParts, { type: 'application/zip' });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'download.zip';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  return {
    createZip,
    downloadBlob
  };
})();
