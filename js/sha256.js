/**
 * 返回字符串的SHA-256哈希（十六进制小写）
 * @param {string} message
 * @returns {Promise<string>}
 */
export async function sha256(message) {
    if (window.crypto?.subtle?.digest) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('当前环境不支持SHA-256加密');
}
