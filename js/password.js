/**
 * Password Protection Module
 * 用于管理全局的密码访问保护逻辑。
 */
const PASSWORD_CONFIG = {
    localStorageKey: "__ACCESS_STATUS__", // 存储验证状态的 localStorage 键名
    defaultExpirationMs: 24 * 60 * 60 * 1000, // 密码验证有效期：24小时
    encryptionKey: "__SECRET_KEY__", // 盐和加密密钥（前端只是弱保护，实际更需后端验证）
};

// 密码验证相关
let cachedPasswordHash = null;

/**
 * 判断当前页面是否开启了密码保护功能。
 * 通过检测 window.__ENV__.PASSWORD 的值来决定。
 */
function isPasswordProtected() {
    return !!window.__ENV__.PASSWORD; // 环境变量注入的密码
}

/**
 * 校验用户是否已经通过密码验证。
 * 检查 localStorage 中缓存的状态，并验证有效性。
 */
function isPasswordVerified() {
    try {
        const storedData = localStorage.getItem(PASSWORD_CONFIG.localStorageKey);
        if (!storedData) return false;

        const decryptedData = JSON.parse(AES.decrypt(storedData, PASSWORD_CONFIG.encryptionKey)); // 解密数据
        const { verified, timestamp, passwordHash } = decryptedData;

        // 验证时间是否过期
        if (!verified || Date.now() - timestamp > PASSWORD_CONFIG.defaultExpirationMs) {
            localStorage.removeItem(PASSWORD_CONFIG.localStorageKey); // 过期移除
            return false;
        }

        // 如果页面注入的密码发生变化，重新要求用户验证
        if (passwordHash !== cachedPasswordHash && window.__ENV__.PASSWORD) {
            localStorage.removeItem(PASSWORD_CONFIG.localStorageKey); // 清除旧验证
            return false;
        }

        return true;
    } catch (e) {
        console.error("密码验证检查失败:", e);
        return false;
    }
}

/**
 * 验证用户输入的密码是否合法。
 * 成功后存储验证状态到 localStorage。
 * @param {string} inputPassword 用户输入的密码
 */
async function verifyPassword(inputPassword) {
    // 动画渲染用于用户体验
    const errorElement = document.getElementById("passwordError");

    try {
        const hashedPassword = await _jsSha256(inputPassword);
        const envPasswordHash = await _jsSha256(window.__ENV__.PASSWORD);

        if (hashedPassword === envPasswordHash) {
            console.log("密码验证成功");

            // 缓存密码哈希以检测后续变化
            cachedPasswordHash = envPasswordHash;

            // 将验证结果写入 localStorage，使用加密存储
            const dataToSave = {
                verified: true,
                timestamp: Date.now(),
                passwordHash: envPasswordHash,
            };

            const encryptedData = AES.encrypt(JSON.stringify(dataToSave), PASSWORD_CONFIG.encryptionKey); // 加密写入
            localStorage.setItem(PASSWORD_CONFIG.localStorageKey, encryptedData);

            // 隐藏验证窗口
            hidePasswordModal();

            // 触发页面能继续访问的事件
            document.dispatchEvent(new Event("passwordVerified"));
        } else {
            console.warn("密码错误");
            errorElement.style.display = "block";
            errorElement.textContent = "密码错误，请重试";

            // 添加错误动画效果
            const modal = document.getElementById("passwordModal");
            modal.classList.add("shake");
            setTimeout(() => modal.classList.remove("shake"), 500);
        }
    } catch (e) {
        console.error("密码验证失败:", e);
        errorElement.style.display = "block";
        errorElement.textContent = "无法验证密码，请稍后重试";
    }
}

/**
 * 处理密码提交事件。
 */
async function handlePasswordSubmit() {
    const passwordInput = document.getElementById("passwordInput");
    const inputPassword = passwordInput.value.trim();

    if (!inputPassword) return;

    await verifyPassword(inputPassword);
}

/**
 * 隐藏密码验证窗口。
 */
function hidePasswordModal() {
    const passwordModal = document.getElementById("passwordModal");
    if (passwordModal) {
        passwordModal.style.display = "none";
    }
}

/**
 * 显示密码验证窗口。
 */
function showPasswordModal() {
    const passwordModal = document.getElementById("passwordModal");
    if (passwordModal) {
        passwordModal.style.display = "flex";

        // 重置输入状态
        const passwordInput = document.getElementById("passwordInput");
        const errorMessage = document.getElementById("passwordError");
        passwordInput.value = ""; // 清除输入框内容
        errorMessage.style.display = "none"; // 隐藏错误消息
    }
}

/**
 * AES 加密模块（简单示例，实际部署中应结合后端验证）。
 */
const AES = {
    encrypt: function (text, key) {
        // 基于文本和密钥简单生成加密数据
        const encodedText = btoa(
            text
                .split("")
                .map((char, i) => String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length)))
                .join("")
        );
        return encodedText;
    },
    decrypt: function (encodedText, key) {
        // 解密文本
        const decoded = atob(encodedText) // atob解码
            .split("")
            .map((char, i) => String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length)))
            .join("");
        return decoded;
    },
};

/**
 * 页面加载后初始化密码逻辑。
 */
document.addEventListener("DOMContentLoaded", () => {
    if (!isPasswordProtected()) return;

    // 如果用户未验证，显示密码验证窗口
    if (!isPasswordVerified()) {
        showPasswordModal();
    }

    // 表单绑定提交事件
    const passwordForm = document.getElementById("passwordForm");
    if (passwordForm) {
        passwordForm.addEventListener("submit", (e) => {
            e.preventDefault();
            handlePasswordSubmit();
        });
    }
});
