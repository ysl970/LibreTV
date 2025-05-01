// 支持在 Cloudflare Workers/Functions (非浏览器) 下的 SHA-256
export async function sha256(str) {
  const encoder = new (globalThis.TextEncoder || require('util').TextEncoder)();
  const data = encoder.encode(str);
  // crypto.subtle 仅在一些 workers 支持，如果没有请报错
  if (globalThis.crypto?.subtle?.digest) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  } else if (typeof require === 'function') {
    // Node.js Fallback
    const { createHash } = require('crypto');
    return createHash('sha256').update(str).digest('hex');
  } else {
    throw new Error('No SHA-256 implementation available in this environment.');
  }
}
