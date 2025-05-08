// =================== 全局常量、工具 =====================

// 搜索与历史相关常量
window.MAX_HISTORY_ITEMS = window.MAX_HISTORY_ITEMS || 30;
window.SEARCH_HISTORY_KEY = window.SEARCH_HISTORY_KEY || 'searchHistory';

// UI样式类型
const TOAST_BG_COLORS = {
    'error': 'bg-red-500',
    'success': 'bg-green-500',
    'info': 'bg-blue-500',
    'warning': 'bg-yellow-500'
};
const HISTORY_MAX_ITEMS = 50;           // 观看历史最大数量

// DOM元素缓存
const domCache = new Map();

/**
 * 获取DOM元素（带缓存）
 * @param {string} id 元素ID
 * @returns {HTMLElement|null} DOM元素
 */
function getElement(id) {
    if (!domCache.has(id)) {
        const element = document.getElementById(id);
        if (element) domCache.set(id, element);
        return element;
    }
    return domCache.get(id);
}

/**
 * 检查密码保护
 * @returns {boolean} 是否通过密码验证
 */
function checkPasswordProtection() {
    if (window.isPasswordProtected && window.isPasswordVerified) {
        if (window.isPasswordProtected() && !window.isPasswordVerified()) {
            if (typeof showPasswordModal === 'function') showPasswordModal();
            return false;
        }
    }
    return true;
}

/**
 * 集中管理面板切换逻辑
 * @param {string} panelIdToShow 要显示的面板ID
 * @param {string} panelIdToHide 要隐藏的面板ID（可选）
 * @param {Function} onShowCallback 面板显示后的回调函数（可选）
 * @returns {boolean} 是否成功切换面板
 */
function togglePanel(panelIdToShow, panelIdToHide, onShowCallback) {
    if (!checkPasswordProtection()) return false;
    
    const panelToShow = getElement(panelIdToShow);
    if (!panelToShow) return false;
    
    // 切换目标面板
    const isShowing = panelToShow.classList.toggle('show');
    panelToShow.setAttribute('aria-hidden', !isShowing);
    
    // 如果指定了要隐藏的面板，确保它被关闭
    if (panelIdToHide) {
        const panelToHide = getElement(panelIdToHide);
        if (panelToHide && panelToHide.classList.contains('show')) {
            panelToHide.classList.remove('show');
            panelToHide.setAttribute('aria-hidden', 'true');
        }
    }
    
    // 如果面板被显示且有回调，执行回调
    if (isShowing && typeof onShowCallback === 'function') {
        onShowCallback();
    }
    
    return true;
}

// =============== UI相关函数 =============================

/**
 * 设置面板开关
 * @param {Event} e 事件对象
 */
function toggleSettings(e) {
    e?.stopPropagation();
    togglePanel('settingsPanel', 'historyPanel');
}

/**
 * 历史面板开关
 * @param {Event} e 事件对象
 */
function toggleHistory(e) {
    if (e) e.stopPropagation();
    togglePanel('historyPanel', 'settingsPanel', loadViewingHistory);
}

// ------------- Toast功能（支持队列） -------------
const toastQueue = [];
let isShowingToast = false;

/** 
 * 显示消息Toast（支持消息队列，背景色可变更）
 * @param {string} message 消息内容
 * @param {string} type 消息类型 (error|success|info|warning)
 */
function showToast(message, type = 'error') {
    toastQueue.push({ message, type });
    if (!isShowingToast) showNextToast();
}

/**
 * 显示下一条Toast消息
 */
function showNextToast() {
    if (!toastQueue.length) return isShowingToast = false;
    isShowingToast = true;
    const { message, type } = toastQueue.shift();
    const toast = getElement('toast');
    const toastMessage = getElement('toastMessage');
    if (!toast || !toastMessage) return;

    // 设置样式
    const bg = TOAST_BG_COLORS[type] || TOAST_BG_COLORS.error;
    toast.className = `fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 ${bg} text-white`;
    toastMessage.textContent = message;

    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-100%)';
        setTimeout(showNextToast, 300);
    }, 3000);
}

// ----------- Loading区域 --------------
let loadingTimeoutId = null;

/** 
 * 显示Loading
 * @param {string} message 加载提示文本
 */
function showLoading(message = '加载中...') {
    if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
    const loading = getElement('loading');
    if (!loading) return;
    const p = loading.querySelector('p');
    if (p) p.textContent = message;
    loading.style.display = 'flex';
    loadingTimeoutId = setTimeout(() => {
        hideLoading();
        showToast('操作超时，请稍后重试', 'warning');
    }, 30000);
}

/** 
 * 隐藏Loading
 */
function hideLoading() {
    if (loadingTimeoutId) { clearTimeout(loadingTimeoutId); loadingTimeoutId = null; }
    const loading = getElement('loading');
    if (loading) loading.style.display = 'none';
}

// ----------- 模态框管理 --------------
let lastFocusedElement = null;

/** 
 * 显示模态框
 * @param {string} content 模态框内容
 * @param {string} title 模态框标题（可选）
 */
function showModal(content, title = '') {
    const modal = getElement('modal');
    const modalContent = getElement('modalContent');
    const modalTitle = getElement('modalTitle');
    
    if (!modal || !modalContent) return;
    
    // 保存当前焦点元素，以便关闭时恢复
    lastFocusedElement = document.activeElement;
    
    // 设置内容
    modalContent.innerHTML = content;
    if (modalTitle && title) modalTitle.textContent = title;
    
    // 显示模态框
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    
    // 设置焦点陷阱
    setupFocusTrap(modal);
    
    // 将焦点移至模态框内的第一个可聚焦元素
    const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusableElements.length) {
        focusableElements[0].focus();
    } else {
        modal.focus();
    }
}

/**
 * 设置焦点陷阱
 * @param {HTMLElement} container 需要设置焦点陷阱的容器
 */
function setupFocusTrap(container) {
    container.addEventListener('keydown', function(e) {
        // 如果按下的不是Tab键，不处理
        if (e.key !== 'Tab') return;
        
        const focusableElements = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusableElements.length) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        // Shift+Tab 从第一个元素循环到最后一个
        if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
        }
        // Tab 从最后一个元素循环到第一个
        else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
        }
    });
}

/** 
 * 关闭详情弹窗
 */
function closeModal() {
    const modal = getElement('modal');
    const modalContent = getElement('modalContent');
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
    if (modalContent) modalContent.innerHTML = '';
    
    // 恢复焦点
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
    }
}

// ========== 搜索历史相关 ================

/** 
 * 获取历史（兼容老新格式）
 * @returns {Array} 搜索历史数组
 */
function getSearchHistory() {
    try {
        const data = localStorage.getItem(SEARCH_HISTORY_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(item => typeof item === 'string' ? { text: item, timestamp: 0 } : item)
            .filter(item => item && item.text);
    } catch (e) {
        console.error('获取搜索历史出错:', e);
        return [];
    }
}

/** 
 * 保存搜索历史，记录时间戳，去重，控量，防止XSS
 * @param {string} query 搜索关键词
 */
function saveSearchHistory(query) {
    if (!query || !query.trim()) return;
    query = query.trim().slice(0, 50).replace(/[<>"]/g, c => ({
        '<': '&lt;', '>': '&gt;', '"': '&quot;'
    })[c]);
    let history = getSearchHistory();
    const now = Date.now();
    // 2个月有效、去重
    history = history.filter(item =>
        typeof item === 'object' && item.timestamp && (now - item.timestamp < 5184000000) &&
        item.text !== query
    );
    // 新项在最前
    history.unshift({ text: query, timestamp: now });
    if (history.length > MAX_HISTORY_ITEMS) history = history.slice(0, MAX_HISTORY_ITEMS);
    try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        // 空间不足时清理
        localStorage.removeItem(SEARCH_HISTORY_KEY);
        try {
            localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, 3)));
        } catch (e2) {
            // 两次都失败则放弃
        }
    }
    renderSearchHistory();
}

/**
 * 处理搜索标签点击事件
 * @param {Event} e 事件对象
 */
function handleSearchTagClick(e) {
    const tag = e.target.closest('.search-tag');
    if (!tag) return;
    
    const searchInput = getElement('searchInput');
    if (searchInput) {
        searchInput.value = tag.textContent;
        if (typeof search === 'function') search();
    }
}

/**
 * 渲染搜索历史标签
 */
function renderSearchHistory() {
    const historyContainer = getElement('recentSearches');
    if (!historyContainer) return;
    const history = getSearchHistory();
    if (!history.length) { historyContainer.innerHTML = ''; return; }

    const frag = document.createDocumentFragment();

    // 标题与清空按钮
    const header = document.createElement('div');
    header.className = "flex justify-between items-center w-full mb-2";
    
    const titleDiv = document.createElement('div');
    titleDiv.className = "text-gray-500";
    titleDiv.textContent = "最近搜索:";
    
    const clearBtn = document.createElement('button');
    clearBtn.id = "clearHistoryBtn";
    clearBtn.className = "text-gray-500 hover:text-white transition-colors";
    clearBtn.setAttribute('aria-label', "清除搜索历史");
    clearBtn.textContent = "清除搜索历史";
    
    header.appendChild(titleDiv);
    header.appendChild(clearBtn);
    frag.appendChild(header);

    // 添加标签
    history.forEach(item => {
        const tag = document.createElement('button');
        tag.className = 'search-tag';
        tag.textContent = item.text;
        if (item.timestamp) tag.title = `搜索于: ${new Date(item.timestamp).toLocaleString()}`;
        frag.appendChild(tag);
    });
    
    historyContainer.innerHTML = '';
    historyContainer.appendChild(frag);
    
    // 移除旧事件监听器（如果有）并添加新的事件委托
    historyContainer.removeEventListener('click', handleSearchTagClick);
    historyContainer.addEventListener('click', handleSearchTagClick);
    
    // 为清空按钮添加事件
    const clearHistoryBtn = getElement('clearHistoryBtn');
    if (clearHistoryBtn) {
        clearHistoryBtn.removeEventListener('click', clearSearchHistory);
        clearHistoryBtn.addEventListener('click', clearSearchHistory);
    }
}

/**
 * 清除搜索历史
 */
function clearSearchHistory() {
    if (!checkPasswordProtection()) return;
    
    try {
        localStorage.removeItem(SEARCH_HISTORY_KEY);
        renderSearchHistory();
        showToast('搜索历史已清除', 'success');
    } catch (e) {
        console.error('清除搜索历史失败:', e);
        showToast('清除搜索历史失败', 'error');
    }
}

// ========== 观看历史相关 ================

/** 
 * 时间戳人性化显示
 * @param {number} timestamp 时间戳
 * @returns {string} 格式化后的时间字符串
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp), now = new Date();
    const diff = now - date;
    if (diff < 3600000) return `${Math.max(0, Math.floor(diff / 60000)) || '刚刚'}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}
        ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * 获取观看历史
 * @returns {Array} 观看历史数组
 */
function getViewingHistory() {
    try {
        const data = localStorage.getItem('viewingHistory');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('获取观看历史失败:', e);
        return [];
    }
}

/**
 * 处理历史列表点击事件
 * @param {Event} e 事件对象
 */
function handleHistoryListClick(e) {
    // 处理删除按钮点击
    const deleteButton = e.target.closest('.history-item-delete-btn');
    if (deleteButton) {
        e.stopPropagation();
        const historyItem = deleteButton.closest('.history-item');
        if (historyItem && historyItem.dataset.url) {
            deleteHistoryItem(encodeURIComponent(historyItem.dataset.url));
        }
        return;
    }
    
    // 处理历史项点击
    const historyItem = e.target.closest('.history-item');
    if (historyItem) {
        const url = historyItem.dataset.url;
        const title = historyItem.dataset.title;
        const episodeIndex = parseInt(historyItem.dataset.episodeIndex, 10);
        const playbackPosition = parseInt(historyItem.dataset.playbackPosition, 10);
        playFromHistory(url, title, episodeIndex, playbackPosition);
    }
}

/** 
 * mm:ss时间格式
 * @param {number} seconds 秒数
 * @returns {string} 格式化后的时间字符串
 */
function formatPlaybackTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 渲染历史面板
 */
function loadViewingHistory() {
    const historyList = getElement('historyList');
    if (!historyList) return;
    const history = getViewingHistory();
    if (!history.length) {
        historyList.innerHTML = `<div class="text-center text-gray-500 py-8">暂无观看记录</div>`;
        return;
    }
    
    const frag = document.createDocumentFragment();
    
    history.forEach(item => {
        // 防XSS
        const safeTitle = (item.title || '').replace(/[<>"']/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
        const safeSource = (item.sourceName || '未知来源').replace(/[<>"']/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
        const episodeText = item.episodeIndex !== undefined ? `第${item.episodeIndex + 1}集` : '';
        
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item cursor-pointer relative group';
        historyItem.dataset.url = item.url;
        historyItem.dataset.title = safeTitle;
        historyItem.dataset.episodeIndex = item.episodeIndex || 0;
        historyItem.dataset.playbackPosition = item.playbackPosition || 0;
        
        // 构建历史项内容
        const historyInfo = document.createElement('div');
        historyInfo.className = 'history-info';
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'history-title';
        titleDiv.innerHTML = safeTitle;
        
        const metaDiv = document.createElement('div');
        metaDiv.className = 'history-meta';
        
        if (episodeText) {
            const episodeSpan = document.createElement('span');
            episodeSpan.className = 'history-episode';
            episodeSpan.innerHTML = episodeText;
            metaDiv.appendChild(episodeSpan);
            
            const separatorSpan = document.createElement('span');
            separatorSpan.className = 'history-separator mx-1';
            separatorSpan.innerHTML = '·';
            metaDiv.appendChild(separatorSpan);
        }
        
        const sourceSpan = document.createElement('span');
        sourceSpan.className = 'history-source';
        sourceSpan.innerHTML = safeSource;
        metaDiv.appendChild(sourceSpan);
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'history-time';
        timeDiv.textContent = formatTimestamp(item.timestamp);
        
        historyInfo.appendChild(titleDiv);
        historyInfo.appendChild(metaDiv);
        
        // 进度条
        if (item.playbackPosition && item.duration && item.playbackPosition > 10 && item.playbackPosition < item.duration * 0.95) {
            const progressDiv = document.createElement('div');
            progressDiv.className = 'history-progress';
            
            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            
            const progressFilled = document.createElement('div');
            progressFilled.className = 'progress-filled';
            progressFilled.style.width = `${Math.round(item.playbackPosition / item.duration * 100)}%`;
            
            const progressText = document.createElement('div');
            progressText.className = 'progress-text';
            progressText.textContent = `${formatPlaybackTime(item.playbackPosition)} / ${formatPlaybackTime(item.duration)}`;
            
            progressBar.appendChild(progressFilled);
            progressDiv.appendChild(progressBar);
            progressDiv.appendChild(progressText);
            historyInfo.appendChild(progressDiv);
        }
        
        historyInfo.appendChild(timeDiv);
        historyItem.appendChild(historyInfo);
        
        // 删除按钮
        const deleteButton = document.createElement('button');
        deleteButton.className = 'history-item-delete-btn absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-red-400 p-1 rounded-full hover:bg-gray-800 z-10';
        deleteButton.title = '删除记录';
        deleteButton.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>`;
        
        historyItem.appendChild(deleteButton);
        frag.appendChild(historyItem);
    });
    
    historyList.innerHTML = '';
    historyList.appendChild(frag);
    if (history.length > 5) historyList.classList.add('pb-4');
    
    // 移除旧事件监听器（如果有）并添加新的事件委托
    historyList.removeEventListener('click', handleHistoryListClick);
    historyList.addEventListener('click', handleHistoryListClick);
}

/**
 * 删除历史
 * @param {string} encodedUrl 编码后的URL
 */
function deleteHistoryItem(encodedUrl) {
    try {
        const url = decodeURIComponent(encodedUrl), history = getViewingHistory();
        const newHistory = history.filter(item => item.url !== url);
        localStorage.setItem('viewingHistory', JSON.stringify(newHistory));
        loadViewingHistory();
        showToast('已删除该记录', 'success');
    } catch (e) {
        console.error('删除历史记录项失败:', e);
        showToast('删除记录失败', 'error');
    }
}

/**
 * 从观看历史记录打开播放页面（在当前标签页）
 * @param {string} url 视频URL
 * @param {string} title 视频标题
 * @param {number} episodeIndex 集数索引
 * @param {number} playbackPosition 播放位置（秒）
 */
function playFromHistory(url, title, episodeIndex, playbackPosition = 0) {
    try {
        let episodesList = [];
        const historyRaw = localStorage.getItem('viewingHistory');
        if (historyRaw) {
            try {
                const history = JSON.parse(historyRaw);
                const historyItem = history.find(item => item.title === title);
                if (historyItem && Array.isArray(historyItem.episodes)) {
                    episodesList = historyItem.episodes;
                }
            } catch (parseError) {
                console.error("解析 viewingHistory 出错:", parseError);
            }
        }
        if (!episodesList.length) {
            try {
                const stored = JSON.parse(localStorage.getItem('currentEpisodes') || '[]');
                if (Array.isArray(stored) && stored.length) {
                    episodesList = stored;
                }
            } catch (e) {
                console.error("解析 currentEpisodes 失败:", e);
            }
        }
        if (episodesList.length) {
            localStorage.setItem('currentEpisodes', JSON.stringify(episodesList));
        }
        
        if (url.includes('?')) {
            const playUrl = new URL(url);
            if (!playUrl.searchParams.has('index') && episodeIndex > 0) {
                playUrl.searchParams.set('index', episodeIndex);
            }
            if (playbackPosition > 10 && !playUrl.searchParams.has('position')) {
                playUrl.searchParams.set('position', Math.floor(playbackPosition));
            }
            window.location.href = playUrl.toString();
        } else {
            const positionParam = playbackPosition > 10 ? `&position=${Math.floor(playbackPosition)}` : '';
            const playerUrl = `player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&index=${episodeIndex}${positionParam}`;
            window.location.href = playerUrl;
        }
    } catch (e) {
        console.error('从历史记录播放失败:', e);
        const fallbackUrl = `player.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&index=${episodeIndex}`;
        window.location.href = fallbackUrl;
    }
}

/** 
 * 增加/更新历史（同标题合并，每标题仅一条记录）
 * @param {Object} videoInfo 视频信息对象
 */
function addToViewingHistory(videoInfo) {
    if (!checkPasswordProtection()) return;
    
    try {
        const history = getViewingHistory();
        const idx = history.findIndex(item => item.title === videoInfo.title);
        if (idx !== -1) {
            const item = history[idx];
            item.episodeIndex = videoInfo.episodeIndex;
            item.timestamp = Date.now();
            if (videoInfo.sourceName && !item.sourceName) item.sourceName = videoInfo.sourceName;
            if (videoInfo.playbackPosition && videoInfo.playbackPosition > 10) {
                item.playbackPosition = videoInfo.playbackPosition;
                item.duration = videoInfo.duration || item.duration;
            }
            item.url = videoInfo.url;
            if (videoInfo.episodes && Array.isArray(videoInfo.episodes) && videoInfo.episodes.length) {
                if (!item.episodes || item.episodes.length !== videoInfo.episodes.length) {
                    item.episodes = [...videoInfo.episodes];
                }
            }
            // 放到最前
            history.splice(idx, 1);
            history.unshift(item);
        } else {
            const newItem = { ...videoInfo, timestamp: Date.now(), episodes: Array.isArray(videoInfo.episodes) ? [...videoInfo.episodes] : [] };
            history.unshift(newItem);
        }
        if (history.length > HISTORY_MAX_ITEMS) history.splice(HISTORY_MAX_ITEMS);
        localStorage.setItem('viewingHistory', JSON.stringify(history));
    } catch (e) { console.error('保存观看历史失败:', e); }
}

/**
 * 清除观看历史
 */
function clearViewingHistory() {
    if (!checkPasswordProtection()) return;
    
    try {
        localStorage.removeItem('viewingHistory');
        loadViewingHistory();
        showToast('观看历史已清空', 'success');
    } catch (e) {
        console.error('清除观看历史失败:', e);
        showToast('清除观看历史失败', 'error');
    }
}

// ============= 初始化与事件监听 =================

// 初始化UI事件监听
document.addEventListener('DOMContentLoaded', function () {
    // 点击页面空白时自动关闭历史侧边栏
    document.addEventListener('click', function (e) {
        const historyPanel = getElement('historyPanel');
        const historyButton = document.querySelector('[data-toggle="history"], #historyButton, button[onclick="toggleHistory(event)"]');
        if (historyPanel && historyButton &&
            !historyPanel.contains(e.target) && !historyButton.contains(e.target) &&
            historyPanel.classList.contains('show')) {
            historyPanel.classList.remove('show');
            historyPanel.setAttribute('aria-hidden', 'true');
        }
    });
    
    // 绑定所有UI事件
    attachEventListeners();
});

/** 
 * 绑定所有UI元素事件监听器
 */
function attachEventListeners() {
    // 历史面板切换
    const historyButton = getElement('historyButton');
    if (historyButton) {
        historyButton.addEventListener('click', toggleHistory);
    }
    const closeHistoryButton = getElement('closeHistoryPanelButton');
    if (closeHistoryButton) {
        closeHistoryButton.addEventListener('click', toggleHistory);
    }

    // 使用事件委托优化事件监听器注册
    const eventBindings = [
        { id: 'settingsButton', event: 'click', handler: toggleSettings },
        { id: 'closeSettingsPanelButton', event: 'click', handler: toggleSettings },
        { id: 'clearViewingHistoryButton', event: 'click', handler: clearViewingHistory },
        { id: 'closeModalButton', event: 'click', handler: closeModal }
    ];
    
    // 批量注册事件监听器
    eventBindings.forEach(binding => {
        const element = getElement(binding.id);
        if (element) {
            element.addEventListener(binding.event, binding.handler);
        }
    });
    
    // 初始化其他可能的事件监听器
    initializeAdditionalListeners();
}

/**
 * 初始化其他可能的事件监听器
 */
function initializeAdditionalListeners() {
    // API选择按钮 - 使用事件委托优化
    const apiSelectButtons = document.querySelectorAll('[data-action="selectAllAPIs"]');
    if (apiSelectButtons.length > 0) {
        const apiSelectHandler = function() {
            const selectAll = this.dataset.value === 'true';
            if (typeof window.selectAllAPIs === 'function') {
                window.selectAllAPIs(selectAll);
            }
        };
        
        apiSelectButtons.forEach(button => {
            button.addEventListener('click', apiSelectHandler);
        });
    }
    
    // 自定义API管理 - 使用可选链简化代码
    const addCustomApiButton = document.querySelector('[data-action="showAddCustomApiForm"]');
    if (addCustomApiButton && typeof window.showAddCustomApiForm === 'function') {
        addCustomApiButton.addEventListener('click', window.showAddCustomApiForm);
    }
}

// 导出公共函数
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.closeModal = closeModal;
window.toggleSettings = toggleSettings;
window.toggleHistory = toggleHistory;
window.addToViewingHistory = addToViewingHistory;
window.clearViewingHistory = clearViewingHistory;
window.playFromHistory = playFromHistory;
window.saveSearchHistory = saveSearchHistory;
window.clearSearchHistory = clearSearchHistory;