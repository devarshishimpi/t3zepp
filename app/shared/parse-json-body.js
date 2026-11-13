function bytesToText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder("utf-8").decode(u8);
    } catch {
      // Fall through
    }
  }
  if (typeof Buffer !== "undefined") {
    try {
      return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString("utf8");
    } catch {
      // Fall through
    }
  }
  const chars = [];
  function continuation() {
    const byte = u8[index++];
    if (byte === undefined || (byte & 0xc0) !== 0x80) throw new Error("Invalid UTF-8 response body.");
    return byte & 0x3f;
  }
  let index = 0;
  while (index < u8.length) {
    const first = u8[index++];
    if (first < 0x80) {
      chars.push(first);
      continue;
    }
    if (first >= 0xc2 && first <= 0xdf) {
      chars.push(((first & 0x1f) << 6) | continuation());
      continue;
    }
    if (first >= 0xe0 && first <= 0xef) {
      const second = continuation();
      if ((first === 0xe0 && second < 0x20) || (first === 0xed && second >= 0x20)) {
        throw new Error("Invalid UTF-8 response body.");
      }
      chars.push(((first & 0x0f) << 12) | (second << 6) | continuation());
      continue;
    }
    if (first < 0xf0 || first > 0xf4) throw new Error("Invalid UTF-8 response body.");
    const second = continuation();
    if ((first === 0xf0 && second < 0x10) || (first === 0xf4 && second > 0x0f)) {
      throw new Error("Invalid UTF-8 response body.");
    }
    const point = ((first & 0x07) << 18) | (second << 12) | (continuation() << 6) | continuation();
    const scalar = point - 0x10000;
    chars.push(0xd800 | (scalar >> 10), 0xdc00 | (scalar & 0x3ff));
  }
  let text = "";
  const CHUNK_SIZE = 64;
  for (let i = 0; i < chars.length; i += CHUNK_SIZE) {
    text += String.fromCharCode(...chars.slice(i, i + CHUNK_SIZE));
  }
  return text;
}

function bodyText(body) {
  if (typeof body === "string") return body;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }
  if (body instanceof ArrayBuffer) return bytesToText(new Uint8Array(body));
  if (ArrayBuffer.isView(body)) {
    return bytesToText(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  }
  if (body?.type === "Buffer") {
    if (Array.isArray(body.data)) return bytesToText(body.data);
    if (ArrayBuffer.isView(body.data)) {
      return bytesToText(new Uint8Array(body.data.buffer, body.data.byteOffset, body.data.byteLength));
    }
  }
  if (body && typeof body === "object" && body.data !== undefined) {
    return bodyText(body.data);
  }
  return null;
}

function parseText(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    if (trimmed.length % 2 !== 0 || !/^[\da-fA-F]+$/.test(trimmed)) throw error;
    if (typeof Buffer !== "undefined") {
      try {
        const decoded = Buffer.from(trimmed, "hex").toString("utf8");
        const trimmedDecoded = decoded.trimStart();
        if (trimmedDecoded && (trimmedDecoded.charCodeAt(0) === 0x7b || trimmedDecoded.charCodeAt(0) === 0x5b)) {
          return JSON.parse(trimmedDecoded);
        }
      } catch {
        // Fall back to bytesToText
      }
    }
    const bytes = new Uint8Array(trimmed.length / 2);
    const digit = (code) => (code >= 48 && code <= 57 ? code - 48 : (code | 32) - 87);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (digit(trimmed.charCodeAt(index * 2)) << 4) | digit(trimmed.charCodeAt(index * 2 + 1));
    }
    const decodedFallback = bytesToText(bytes).trimStart();
    return JSON.parse(decodedFallback);
  }
}

export function parseJsonBody(body) {
  if (body === undefined || body === null) {
    throw new Error("Empty response body.");
  }
  if (body && typeof body === "object" && (body.version === 2 || body.ranges || body.error)) {
    return body;
  }
  if (body && typeof body === "object" && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body) && body.type !== "Buffer" && body.data !== undefined) {
    return parseJsonBody(body.data);
  }
  const text = bodyText(body);
  if (text === null) {
    if (typeof body === "object") return body;
    throw new Error(`Unparseable body type: ${typeof body}`);
  }
  return parseText(text);
}
