// Self-contained Pure JavaScript SVG QR Code Generator (Zero dependencies)
const QRCodeGen = (function () {
  // QR Code Reed-Solomon Galois Field & Generator
  const GF256_EXP = new Uint8Array(512);
  const GF256_LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF256_EXP[i] = x;
      GF256_EXP[i + 255] = x;
      GF256_LOG[x] = i;
      x = (x << 1) ^ (x & 128 ? 0x11d : 0);
    }
    GF256_LOG[0] = 0;
  })();

  function gfMul(x, y) {
    if (x === 0 || y === 0) return 0;
    return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
  }

  function rsGenPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Uint8Array(poly.length + 1);
      const root = GF256_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= gfMul(poly[j], root);
        next[j + 1] ^= poly[j];
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecCount) {
    const gen = rsGenPoly(ecCount);
    const res = new Uint8Array(ecCount);
    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ res[0];
      for (let j = 0; j < ecCount - 1; j++) {
        res[j] = res[j + 1] ^ gfMul(gen[ecCount - 1 - j], factor);
      }
      res[ecCount - 1] = gfMul(gen[0], factor);
    }
    return res;
  }

  // Choose appropriate QR Version (1 to 10) for byte payload
  // Capacity table for Byte mode (ECC Low):
  const CAPACITIES = [0, 19, 34, 55, 80, 108, 136, 156, 194, 232, 274];
  const EC_CODEWORDS = [0, 7, 10, 15, 20, 26, 36, 40, 48, 60, 72];

  function getVersion(len) {
    for (let v = 1; v < CAPACITIES.length; v++) {
      if (len <= CAPACITIES[v]) return v;
    }
    return 10;
  }

  function createMatrix(version) {
    const size = 17 + 4 * version;
    const matrix = [];
    const isReserved = [];
    for (let y = 0; y < size; y++) {
      matrix.push(new Uint8Array(size));
      isReserved.push(new Uint8Array(size));
    }

    function setModule(r, c, val) {
      matrix[r][c] = val ? 1 : 0;
      isReserved[r][c] = 1;
    }

    // 1. Finder patterns (top-left, top-right, bottom-left)
    function addFinder(startR, startC) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const row = startR + r;
          const col = startC + c;
          if (row < 0 || row >= size || col < 0 || col >= size) continue;
          const isOuter = (r === 0 || r === 6 || c === 0 || c === 6);
          const isInner = (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          const val = (isOuter || isInner) ? 1 : 0;
          setModule(row, col, val);
        }
      }
    }
    addFinder(0, 0);
    addFinder(0, size - 7);
    addFinder(size - 7, 0);

    // 2. Timing patterns
    for (let i = 8; i < size - 8; i++) {
      if (!isReserved[6][i]) setModule(6, i, i % 2 === 0);
      if (!isReserved[i][6]) setModule(i, 6, i % 2 === 0);
    }

    // 3. Dark module
    setModule(4 * version + 9, 8, 1);

    // 4. Reserve format information areas
    for (let i = 0; i < 9; i++) {
      if (i !== 6) {
        isReserved[8][i] = 1;
        isReserved[i][8] = 1;
      }
    }
    for (let i = 0; i < 8; i++) {
      isReserved[8][size - 1 - i] = 1;
      isReserved[size - 1 - i][8] = 1;
    }

    return { matrix, isReserved, size };
  }

  function encodeData(text, version) {
    const bytes = new TextEncoder().encode(text);
    const capacity = CAPACITIES[version];
    const ecCount = EC_CODEWORDS[version];

    // Build data bitstream: [Mode: 4 bits (0100)] + [Count: 8 or 16 bits] + [Data]
    const bits = [];
    function pushBits(val, len) {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((val >> i) & 1);
      }
    }

    pushBits(0b0100, 4); // Byte mode
    pushBits(bytes.length, version < 10 ? 8 : 16);
    for (const b of bytes) {
      pushBits(b, 8);
    }

    // Terminator
    const totalBits = capacity * 8;
    const padLen = Math.min(4, totalBits - bits.length);
    pushBits(0, padLen);

    // Byte boundary padding
    while (bits.length % 8 !== 0) bits.push(0);

    // Pad bytes 0xEC, 0x11
    let padByte = 0xec;
    while (bits.length < totalBits) {
      pushBits(padByte, 8);
      padByte = padByte === 0xec ? 0x11 : 0xec;
    }

    const dataBytes = new Uint8Array(capacity);
    for (let i = 0; i < capacity; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | bits[i * 8 + j];
      }
      dataBytes[i] = b;
    }

    const ecBytes = rsEncode(dataBytes, ecCount);

    const allBytes = new Uint8Array(dataBytes.length + ecBytes.length);
    allBytes.set(dataBytes, 0);
    allBytes.set(ecBytes, dataBytes.length);

    return allBytes;
  }

  function populateData(mObj, allBytes) {
    const { matrix, isReserved, size } = mObj;
    let byteIdx = 0;
    let bitIdx = 7;
    let upward = true;

    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // Skip vertical timing pattern
      const rows = [];
      if (upward) {
        for (let r = size - 1; r >= 0; r--) rows.push(r);
      } else {
        for (let r = 0; r < size; r++) rows.push(r);
      }
      upward = !upward;

      for (const row of rows) {
        for (let c = 0; c < 2; c++) {
          const cCol = col - c;
          if (isReserved[row][cCol]) continue;
          let bit = 0;
          if (byteIdx < allBytes.length) {
            bit = (allBytes[byteIdx] >> bitIdx) & 1;
            bitIdx--;
            if (bitIdx < 0) {
              bitIdx = 7;
              byteIdx++;
            }
          }
          // Standard Mask pattern 0: (row + cCol) % 2 == 0
          const mask = (row + cCol) % 2 === 0;
          matrix[row][cCol] = bit ^ (mask ? 1 : 0);
        }
      }
    }

    // Format bits for Mask 0 and ECC Low: 0x77c4 (15 bits)
    const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
    const coords1 = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
      [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
    ];
    for (let i = 0; i < 15; i++) {
      const [r, c] = coords1[i];
      matrix[r][c] = formatBits[i];
    }
    const coords2 = [
      [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
      [size - 5, 8], [size - 6, 8], [size - 7, 8],
      [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5],
      [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
    ];
    for (let i = 0; i < 15; i++) {
      const [r, c] = coords2[i];
      matrix[r][c] = formatBits[i];
    }
  }

  function generateSVG(text, options = {}) {
    const sizePx = options.size || 180;
    const margin = options.margin !== undefined ? options.margin : 2;
    const fg = options.fg || '#1a73e8';
    const bg = options.bg || '#ffffff';

    const version = getVersion(new TextEncoder().encode(text).length);
    const mObj = createMatrix(version);
    const dataBytes = encodeData(text, version);
    populateData(mObj, dataBytes);

    const { matrix, size } = mObj;
    const totalModules = size + margin * 2;
    const moduleSize = sizePx / totalModules;

    let paths = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c]) {
          const x = (c + margin) * moduleSize;
          const y = (r + margin) * moduleSize;
          paths += `M${x.toFixed(2)},${y.toFixed(2)}h${moduleSize.toFixed(2)}v${moduleSize.toFixed(2)}h-${moduleSize.toFixed(2)}z `;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sizePx} ${sizePx}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">
      <rect width="100%" height="100%" fill="${bg}" rx="12" />
      <path d="${paths}" fill="${fg}" />
    </svg>`;
  }

  return {
    generateSVG
  };
})();
