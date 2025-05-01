// 密码保护模块
class PasswordProtector {
    constructor() {
        this.config = {
            maxAttempts: 5,
            lockoutTime: 300, // 5分钟
            saltRounds: 10,
            sessionExpiry: 86400 // 24小时
        };
        
        this.attempts = 0;
        this.lockoutTimer = null;
        this.isInitialized = false;
        
        this.init();
    }

    // 初始化方法
    async init() {
        try {
            // 检查是否已初始化
            if (this.isInitialized) return;
            
            // 获取配置
            const storedConfig = localStorage.getItem('authConfig');
            if (storedConfig) {
                this.config = { ...this.config, ...JSON.parse(storedConfig) };
            }
            
            // 检查密码是否已设置
            const hasPassword = await this.checkIfPasswordSet();
            if (!hasPassword) {
                this.showSetupModal();
            }
            
            this.isInitialized = true;
            this.setupEventListeners();
        } catch (error) {
            console.error('初始化密码保护失败:', error);
            this.showInitError();
        }
    }

    // 设置事件监听器
    setupEventListeners() {
        // 密码输入框回车事件
        const passwordInput = document.getElementById('passwordInput');
        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handlePasswordSubmit();
                }
            });
        }
        
        // 密码确认按钮点击事件
        const submitButton = document.getElementById('passwordSubmit');
        if (submitButton) {
            submitButton.addEventListener('click', () => this.handlePasswordSubmit());
        }
        
        // 密码重置按钮点击事件
        const resetButton = document.getElementById('resetPasswordBtn');
        if (resetButton) {
            resetButton.addEventListener('click', () => this.showResetModal());
        }
    }

    // 显示密码设置模态框
    showSetupModal() {
        const modal = document.getElementById('passwordSetupModal');
        if (modal) {
            modal.classList.remove('hidden');
            this.resetSetupForm();
        }
    }

    // 重置设置表单
    resetSetupForm() {
        const form = document.getElementById('passwordSetupForm');
        if (form) form.reset();
        
        const confirmPasswordInput = document.getElementById('confirmPassword');
        if (confirmPasswordInput) confirmPasswordInput.classList.remove('border-red-500');
        
        const errorText = document.getElementById('setupErrorText');
        if (errorText) errorText.textContent = '';
    }

    // 处理密码设置
    async handleSetupSubmit(event) {
        event.preventDefault();
        
        const newPassword = document.getElementById('newPassword').value.trim();
        const confirmPassword = document.getElementById('confirmPassword').value.trim();
        const errorText = document.getElementById('setupErrorText');
        
        // 输入验证
        if (!newPassword || !confirmPassword) {
            errorText.textContent = '请输入并确认密码';
            return;
        }
        
        if (newPassword !== confirmPassword) {
            errorText.textContent = '两次输入的密码不一致';
            document.getElementById('confirmPassword').classList.add('border-red-500');
            return;
        }
        
        try {
            // 哈希密码
            const hashedPassword = await this.hashPassword(newPassword);
            
            // 存储密码哈希
            localStorage.setItem('authHash', hashedPassword);
            
            // 隐藏设置模态框
            const modal = document.getElementById('passwordSetupModal');
            if (modal) modal.classList.add('hidden');
            
            // 通知用户设置成功
            this.showSuccessToast('密码设置成功');
        } catch (error) {
            console.error('密码设置失败:', error);
            errorText.textContent = '密码设置失败，请重试';
        }
    }

    // 显示密码验证模态框
    showAuthModal() {
        const modal = document.getElementById('passwordAuthModal');
        if (modal) {
            modal.classList.remove('hidden');
            this.resetAuthForm();
            
            // 如果被锁定，显示锁定信息
            if (this.isLocked()) {
                this.showLockoutMessage();
            }
        }
    }

    // 重置验证表单
    resetAuthForm() {
        const passwordInput = document.getElementById('passwordInput');
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
        }
        
        const errorText = document.getElementById('authErrorText');
        if (errorText) errorText.textContent = '';
    }

    // 处理密码验证
    async handlePasswordSubmit() {
        // 检查是否被锁定
        if (this.isLocked()) {
            this.showLockoutMessage();
            return;
        }
        
        const passwordInput = document.getElementById('passwordInput');
        const errorText = document.getElementById('authErrorText');
        const password = passwordInput ? passwordInput.value.trim() : '';
        
        if (!password) {
            errorText.textContent = '请输入密码';
            return;
        }
        
        try {
            // 验证密码
            const isValid = await this.verifyPassword(password);
            
            if (isValid) {
                // 重置尝试次数
                this.resetAttempts();
                
                // 设置会话
                this.setSession();
                
                // 隐藏模态框
                const modal = document.getElementById('passwordAuthModal');
                if (modal) modal.classList.add('hidden');
                
                // 通知用户验证成功
                this.showSuccessToast('密码验证成功');
                
                // 触发验证成功事件
                this.dispatchEvent('authSuccess');
            } else {
                // 增加尝试次数
                this.incrementAttempt();
                
                // 显示错误信息
                errorText.textContent = '密码错误';
                passwordInput.value = '';
                passwordInput.focus();
                
                // 如果达到最大尝试次数，锁定账户
                if (this.attempts >= this.config.maxAttempts) {
                    this.lockAccount();
                    this.showLockoutMessage();
                }
            }
        } catch (error) {
            console.error('密码验证失败:', error);
            errorText.textContent = '验证失败，请重试';
        }
    }

    // 检查密码是否已设置
    async checkIfPasswordSet() {
        const hash = localStorage.getItem('authHash');
        return !!hash;
    }

    // 哈希密码
    async hashPassword(password) {
        // 在客户端使用简单的哈希（实际应使用服务端进行更安全的处理）
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // 验证密码
    async verifyPassword(password) {
        const storedHash = localStorage.getItem('authHash');
        if (!storedHash) return false;
        
        const inputHash = await this.hashPassword(password);
        return inputHash === storedHash;
    }

    // 设置会话
    setSession() {
        const expiry = Date.now() + this.config.sessionExpiry * 1000;
        localStorage.setItem('authSession', 'active');
        localStorage.setItem('authExpiry', expiry.toString());
        
        // 设置定时器清除会话
        setTimeout(() => this.clearSession(), this.config.sessionExpiry * 1000);
    }

    // 清除会话
    clearSession() {
        localStorage.removeItem('authSession');
        localStorage.removeItem('authExpiry');
        this.dispatchEvent('authExpired');
    }

    // 检查会话是否有效
    isSessionValid() {
        const session = localStorage.getItem('authSession');
        const expiry = localStorage.getItem('authExpiry');
        
        return session === 'active' && expiry && Date.now() < parseInt(expiry);
    }

    // 显示锁定信息
    showLockoutMessage() {
        const modal = document.getElementById('passwordAuthModal');
        const errorText = document.getElementById('authErrorText');
        
        if (errorText) {
            errorText.textContent = `尝试次数过多，请${this.formatTime(this.config.lockoutTime)}后再试`;
        }
        
        if (modal) {
            const submitButton = modal.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;
        }
        
        // 启动倒计时
        this.startCountdown();
    }

    // 开始倒计时
    startCountdown() {
        const modal = document.getElementById('passwordAuthModal');
        const countdownElement = document.getElementById('countdown');
        
        if (!countdownElement) return;
        
        let remaining = this.config.lockoutTime;
        countdownElement.textContent = this.formatTime(remaining);
        
        const interval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(interval);
                countdownElement.textContent = '';
                
                if (modal) {
                    const submitButton = modal.querySelector('button[type="submit"]');
                    if (submitButton) submitButton.disabled = false;
                }
            } else {
                countdownElement.textContent = this.formatTime(remaining);
            }
        }, 1000);
    }

    // 格式化时间（秒转分钟:秒）
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    // 增加尝试次数
    incrementAttempt() {
        this.attempts++;
        localStorage.setItem('authAttempts', this.attempts.toString());
    }

    // 重置尝试次数
    resetAttempts() {
        this.attempts = 0;
        localStorage.removeItem('authAttempts');
    }

    // 锁定账户
    lockAccount() {
        this.resetAttempts();
        localStorage.setItem('authLockedUntil', (Date.now() + this.config.lockoutTime * 1000).toString());
    }

    // 检查是否被锁定
    isLocked() {
        const lockedUntil = localStorage.getItem('authLockedUntil');
        if (!lockedUntil) return false;
        
        const now = Date.now();
        return now < parseInt(lockedUntil);
    }

    // 显示初始化错误
    showInitError() {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
        errorDiv.textContent = '密码保护初始化失败，请刷新页面重试';
        
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => errorDiv.remove(), 300);
        }, 5000);
    }

    // 显示成功提示
    showSuccessToast(message) {
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in-up';
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // 分发自定义事件
    dispatchEvent(eventName) {
        const event = new CustomEvent(eventName, { detail: { source: 'PasswordProtector' } });
        window.dispatchEvent(event);
    }

    // 显示重置密码模态框
    showResetModal() {
        const modal = document.getElementById('passwordResetModal');
        if (modal) {
            modal.classList.remove('hidden');
            this.resetResetForm();
        }
    }

    // 重置重置表单
    resetResetForm() {
        const form = document.getElementById('passwordResetForm');
        if (form) form.reset();
        
        const errorText = document.getElementById('resetErrorText');
        if (errorText) errorText.textContent = '';
    }

    // 处理密码重置
    async handleResetSubmit(event) {
        event.preventDefault();
        
        const oldPassword = document.getElementById('oldPassword').value.trim();
        const newPassword = document.getElementById('newResetPassword').value.trim();
        const confirmPassword = document.getElementById('confirmResetPassword').value.trim();
        const errorText = document.getElementById('resetErrorText');
        
        // 输入验证
        if (!oldPassword || !newPassword || !confirmPassword) {
            errorText.textContent = '请输入所有字段';
            return;
        }
        
        if (newPassword !== confirmPassword) {
            errorText.textContent = '两次输入的新密码不一致';
            return;
        }
        
        try {
            // 验证旧密码
            const isValid = await this.verifyPassword(oldPassword);
            if (!isValid) {
                errorText.textContent = '旧密码错误';
                return;
            }
            
            // 哈希新密码
            const hashedPassword = await this.hashPassword(newPassword);
            
            // 更新存储的密码哈希
            localStorage.setItem('authHash', hashedPassword);
            
            // 重置尝试次数
            this.resetAttempts();
            
            // 隐藏模态框
            const modal = document.getElementById('passwordResetModal');
            if (modal) modal.classList.add('hidden');
            
            // 通知用户重置成功
            this.showSuccessToast('密码重置成功');
        } catch (error) {
            console.error('密码重置失败:', error);
            errorText.textContent = '密码重置失败，请重试';
        }
    }

    // 检查密码保护状态
    isPasswordProtected() {
        return this.checkIfPasswordSet();
    }

    // 检查密码是否已验证
    isPasswordVerified() {
        return this.isSessionValid();
    }
}

// 创建密码保护实例
const passwordProtector = new PasswordProtector();

// 导出接口
window.PasswordProtector = PasswordProtector;
window.passwordProtector = passwordProtector;
