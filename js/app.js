/**
 * 主应用程序逻辑
 * 使用AppState进行状态管理，DOMCache进行DOM元素缓存
 */

// Basic AppState Implementation
const AppState = (function() {
    const state = new Map();
    return {
        set: function(key, value) {
            state.set(key, value);
        },
        get: function(key) {
            return state.get(key);
        },
        // Method to initialize multiple values
        initialize: function(initialData = {}) {
            for (const key in initialData) {
                if (initialData.hasOwnProperty(key)) {
                    state.set(key, initialData[key]);
                }
            }
        }
    };
})();

// Basic DOMCache Implementation
const DOMCache = (function() {
    const cache = new Map();
    return {
        set: function(key, element) {
            if (element) {
                cache.set(key, element);
            }
        },
        get: function(key) {
            return cache.get(key);
        },
        // Initialize multiple elements
        init: function(elementsToCache) {
            for (const key in elementsToCache) {
                if (elementsToCache.hasOwnProperty(key)) {
                    const element = document.getElementById(elementsToCache[key]);
                    if (element) {
                        cache.set(key, element);
                    }
                }
            }
        }
    };
})();

// STUB 实现 - 处理缺失的函数定义
/**
 * 显示详情
 * @param {HTMLElement} element - 包含数据属性的元素
 */
function showDetails(element) {
    const id = element.dataset.id;
    const sourceCode = element.dataset.source;
    // const name = element.querySelector('.result-title').textContent; // 获取名称的示例
    // const customApiUrl = element.dataset.customApi;
    console.log(`STUB: showDetails called for element with ID: ${id}, Source: ${sourceCode}`);
    // 潜在地使用这些数据属性获取并显示详情
}

/**
 * 文本净化函数
 * 重要：这是一个基本的存根。真实实现需要强大的XSS保护。
 * @param {string} text - 需要净化的文本
 * @returns {string} - 净化后的文本
 */
function sanitizeText(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * 播放视频
 * @param {string} url - 视频URL
 * @param {string} title - 视频标题
 * @param {number} episodeIndex - 集数索引
 * @param {string} sourceName - 来源名称
 * @param {string} sourceCode - 来源代码
 */
function playVideo(url, title, episodeIndex, sourceName = '', sourceCode = '') {
    if (!url) {
        showToast('无效的视频链接', 'error');
        return;
    }
    
    // 更新相关状态
    AppState.set('currentEpisodeIndex', episodeIndex);
    AppState.set('currentVideoTitle', title);
    
    // 如果sourceName或sourceCode未提供，尝试从AppState获取
    if (!sourceName && AppState.get('currentSourceName')) {
        sourceName = AppState.get('currentSourceName');
    }
    if (!sourceCode && AppState.get('currentSourceCode')) {
        sourceCode = AppState.get('currentSourceCode');
    }
    
    // 保存到观看历史 - 构建单一videoInfo对象
    if (typeof addToViewingHistory === 'function') {
        const videoInfoForHistory = { 
            url: url, 
            title: title, 
            episodeIndex: episodeIndex, 
            sourceName: sourceName, 
            sourceCode: sourceCode, 
            episodes: AppState.get('currentEpisodes') || [] 
            // 可以添加其他相关字段，如duration, playbackPosition等
        };
        addToViewingHistory(videoInfoForHistory);
    }
    
    // 构建播放页面URL
    const playerUrl = new URL('player.html', window.location.origin);
    playerUrl.searchParams.set('url', url);
    playerUrl.searchParams.set('title', title);
    playerUrl.searchParams.set('ep', episodeIndex.toString());
    if (sourceName) playerUrl.searchParams.set('source', sourceName);
    if (sourceCode) playerUrl.searchParams.set('source_code', sourceCode);
    
    // 跳转到播放页面
    window.location.href = playerUrl.toString();
}

/**
 * 播放上一集
 */
function playPreviousEpisode() {
    const currentIndex = AppState.get('currentEpisodeIndex');
    const episodes = AppState.get('currentEpisodes');
    if (currentIndex > 0 && episodes && episodes.length > 0) {
        const prevIndex = currentIndex - 1;
        AppState.set('currentEpisodeIndex', prevIndex);
        localStorage.setItem('currentEpisodeIndex', prevIndex.toString());
        
        const title = AppState.get('currentVideoTitle');
        playVideo(episodes[prevIndex], title, prevIndex);
    } else {
        showToast('已经是第一集了', 'info');
    }
}

/**
 * 播放下一集
 */
function playNextEpisode() {
    const currentIndex = AppState.get('currentEpisodeIndex');
    const episodes = AppState.get('currentEpisodes');
    if (episodes && currentIndex < episodes.length - 1) {
        const nextIndex = currentIndex + 1;
        AppState.set('currentEpisodeIndex', nextIndex);
        localStorage.setItem('currentEpisodeIndex', nextIndex.toString());
        
        const title = AppState.get('currentVideoTitle');
        playVideo(episodes[nextIndex], title, nextIndex);
    } else {
        showToast('已经是最后一集了', 'info');
    }
}

/**
 * Plays video from history (called by ui.js)
 * @param {string} url - Video URL
 * @param {string} title - Video title
 * @param {number} episodeIndex - Episode index
 * @param {number} playbackPosition - Playback position in seconds
 * @param {string} sourceName - Source name (optional)
 * @param {string} sourceCode - Source code (optional)
 */
function playFromHistory(url, title, episodeIndex, playbackPosition = 0, sourceName = '', sourceCode = '') {
    console.log(`Playing from history: ${title}, Episode ${episodeIndex + 1}`);
    
    // Update state
    AppState.set('currentEpisodeIndex', episodeIndex);
    AppState.set('currentVideoTitle', title);
    
    // Build player URL with position parameter
    const playerUrl = new URL('player.html', window.location.origin);
    playerUrl.searchParams.set('url', url);
    playerUrl.searchParams.set('title', title);
    playerUrl.searchParams.set('ep', episodeIndex.toString());
    if (sourceName) playerUrl.searchParams.set('source', sourceName);
    if (sourceCode) playerUrl.searchParams.set('source_code', sourceCode);
    if (playbackPosition > 0) playerUrl.searchParams.set('position', playbackPosition.toString());
    
    // Navigate to player page
    window.location.href = playerUrl.toString();
}

// Make playFromHistory globally accessible for ui.js
window.playFromHistory = playFromHistory;

/**
 * 从localStorage获取布尔配置
 * @param {string} key - 配置键
 * @param {boolean} defaultValue - 默认值
 * @returns {boolean} - 配置值
 */
function getBoolConfig(key, defaultValue) {
    const value = localStorage.getItem(key);
    if (value === null) return defaultValue;
    return value === 'true';
}

// 应用程序初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始化应用状态
    initializeAppState();
    
    // 初始化DOM缓存
    initializeDOMCache();
    
    // 初始化API源管理器
    APISourceManager.init();
    
    // 初始化事件监听器
    initializeEventListeners();
    
    // 加载搜索历史
    renderSearchHistory();
});

/**
 * 初始化应用状态
 * 从localStorage加载初始状态并设置到AppState
 */
function initializeAppState() {
    // 使用AppState.initialize方法初始化状态
    AppState.initialize({
        'selectedAPIs': JSON.parse(localStorage.getItem('selectedAPIs') || '["heimuer", "wolong", "tyyszy"]'),
        'customAPIs': JSON.parse(localStorage.getItem('customAPIs') || '[]'),
        'currentEpisodeIndex': 0,
        'currentEpisodes': [],
        'currentVideoTitle': '',
        'episodesReversed': false
    });
}

/**
 * 初始化DOM缓存
 * 缓存频繁访问的DOM元素
 */
function initializeDOMCache() {
    // 缓存搜索相关元素
    DOMCache.set('searchInput', document.getElementById('searchInput'));
    DOMCache.set('searchResults', document.getElementById('searchResults'));
    DOMCache.set('searchForm', document.getElementById('searchForm'));
    DOMCache.set('searchHistoryContainer', document.getElementById('searchHistory'));
    
    // 缓存API相关元素
    DOMCache.set('apiCheckboxes', document.getElementById('apiCheckboxes'));
    DOMCache.set('customApisList', document.getElementById('customApisList'));
    DOMCache.set('selectedApiCount', document.getElementById('selectedApiCount'));
    DOMCache.set('addCustomApiForm', document.getElementById('addCustomApiForm'));
    DOMCache.set('customApiName', document.getElementById('customApiName'));
    DOMCache.set('customApiUrl', document.getElementById('customApiUrl'));
    DOMCache.set('customApiIsAdult', document.getElementById('customApiIsAdult'));
    
    // 缓存过滤器相关元素
    DOMCache.set('yellowFilterToggle', document.getElementById('yellowFilterToggle'));
    DOMCache.set('adFilteringToggle', document.getElementById('adFilteringToggle'));
    
    // 缓存预加载相关元素
    DOMCache.set('preloadingToggle', document.getElementById('preloadingToggle'));
    DOMCache.set('preloadCountInput', document.getElementById('preloadCount'));
}

/**
 * 初始化事件监听器
 */
function initializeEventListeners() {
    // 搜索表单提交事件
    const searchForm = DOMCache.get('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            search();
        });
    }
    
    // 搜索输入框事件
    const searchInput = DOMCache.get('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            // 可以添加实时搜索建议等功能
        });
    }
    
    // 广告过滤开关事件
    const adFilteringToggle = DOMCache.get('adFilteringToggle');
    if (adFilteringToggle) {
        adFilteringToggle.addEventListener('change', function(e) {
            const enabled = e.target.checked;
            localStorage.setItem(PLAYER_CONFIG.adFilteringStorage, enabled.toString());
            showToast(enabled ? '已启用广告过滤' : '已禁用广告过滤', 'info');
        });
        
        // 初始化开关状态 - 使用getBoolConfig
        adFilteringToggle.checked = getBoolConfig(PLAYER_CONFIG.adFilteringStorage, true);
    }
    
    // 黄色内容过滤开关事件
    const yellowFilterToggle = DOMCache.get('yellowFilterToggle');
    if (yellowFilterToggle) {
        yellowFilterToggle.addEventListener('change', function(e) {
            const enabled = e.target.checked;
            localStorage.setItem('yellowFilterEnabled', enabled.toString());
            showToast(enabled ? '已启用黄色内容过滤' : '已禁用黄色内容过滤', 'info');
        });
        
        // 初始化开关状态 - 使用getBoolConfig
        yellowFilterToggle.checked = getBoolConfig('yellowFilterEnabled', true);
    }
    
    // 预加载开关事件
    const preloadingToggle = DOMCache.get('preloadingToggle');
    if (preloadingToggle) {
        preloadingToggle.addEventListener('change', function(e) {
            const enabled = e.target.checked;
            localStorage.setItem('preloadingEnabled', enabled.toString());
            
            // 注意：这里直接修改PLAYER_CONFIG。更健壮的解决方案可能涉及在config.js模块中使用setter
            PLAYER_CONFIG.enablePreloading = enabled;
            
            showToast(enabled ? '已启用预加载' : '已禁用预加载', 'info');
            
            // 更新预加载数量输入框的可用性
            const preloadCountInput = DOMCache.get('preloadCountInput');
            if (preloadCountInput) {
                preloadCountInput.disabled = !enabled;
            }
        });
        
        // 初始化开关状态 - 使用getBoolConfig
        const preloadingEnabled = getBoolConfig('preloadingEnabled', true);
        preloadingToggle.checked = preloadingEnabled;
        
        // 注意：这里直接修改PLAYER_CONFIG。更健壮的解决方案可能涉及在config.js模块中使用setter
        PLAYER_CONFIG.enablePreloading = preloadingEnabled;
        
        // 更新预加载数量输入框的可用性
        const preloadCountInput = DOMCache.get('preloadCountInput');
        if (preloadCountInput) {
            preloadCountInput.disabled = !preloadingEnabled;
        }
    }
    
    // 预加载数量输入事件
    const preloadCountInput = DOMCache.get('preloadCountInput');
    if (preloadCountInput) {
        preloadCountInput.addEventListener('change', function(e) {
            let count = parseInt(e.target.value);
            if (isNaN(count) || count < 1) {
                count = 1;
                e.target.value = '1';
            } else if (count > 10) {
                count = 10;
                e.target.value = '10';
            }
            
            localStorage.setItem('preloadCount', count.toString());
            
            // 注意：这里直接修改PLAYER_CONFIG。更健壮的解决方案可能涉及在config.js模块中使用setter
            PLAYER_CONFIG.preloadCount = count;
            
            showToast(`预加载数量已设置为 ${count}`, 'info');
        });
        
        // 初始化预加载数量
        const savedCount = localStorage.getItem('preloadCount');
        const preloadCount = savedCount ? parseInt(savedCount) : 3;
        preloadCountInput.value = preloadCount;
        
        // 注意：这里直接修改PLAYER_CONFIG。更健壮的解决方案可能涉及在config.js模块中使用setter
        PLAYER_CONFIG.preloadCount = preloadCount;
    }
}

/**
 * 初始化UI组件
 */
function initializeUIComponents() {
    // 初始化任何需要的UI组件
}

/**
 * 执行搜索
 */
function search() {
    const searchInput = DOMCache.get('searchInput');
    const searchResults = DOMCache.get('searchResults');
    
    if (!searchInput || !searchResults) return;
    
    const query = searchInput.value.trim();
    if (!query) {
        showToast('请输入搜索内容', 'warning');
        return;
    }
    
    // 保存搜索历史
    saveSearchHistory(query);
    
    // 显示加载状态
    searchResults.innerHTML = '<div class="text-center py-4"><div class="spinner"></div><p class="mt-2 text-gray-400">正在搜索，请稍候...</p></div>';
    
    // 获取选中的API
    const selectedAPIs = AppState.get('selectedAPIs');
    if (!selectedAPIs || selectedAPIs.length === 0) {
        searchResults.innerHTML = '<div class="text-center py-4 text-gray-400">请至少选择一个API源</div>';
        return;
    }
    
    // 执行搜索请求
    performSearch(query, selectedAPIs)
        .then(renderSearchResults)
        .catch(error => {
            searchResults.innerHTML = `<div class="text-center py-4 text-red-400">搜索出错: ${error.message}</div>`;
        });
}

/**
 * 执行搜索请求
 * @param {string} query - 搜索查询
 * @param {Array} selectedAPIs - 选中的API列表
 * @returns {Promise} - 搜索结果Promise
 */
async function performSearch(query, selectedAPIs) {
    // 创建搜索请求数组
    const searchPromises = selectedAPIs.map(apiId => {
        if (apiId.startsWith('custom_')) {
            // 自定义API搜索
            const customIndex = parseInt(apiId.replace('custom_', ''));
            const customApi = APISourceManager.getCustomApiInfo(customIndex);
            if (customApi) {
                return fetch(`/api/search?wd=${encodeURIComponent(query)}&source=custom&customApi=${encodeURIComponent(customApi.url)}`)
                    .then(response => response.json())
                    .then(data => ({
                        ...data,
                        apiId: apiId,
                        apiName: customApi.name
                    }))
                    .catch(error => ({
                        code: 400,
                        msg: `自定义API(${customApi.name})搜索失败: ${error.message}`,
                        list: [],
                        apiId: apiId
                    }));
            }
        } else {
            // 内置API搜索
            return fetch(`/api/search?wd=${encodeURIComponent(query)}&source=${apiId}`)
                .then(response => response.json())
                .then(data => ({
                    ...data,
                    apiId: apiId,
                    apiName: API_SITES[apiId]?.name || apiId
                }))
                .catch(error => ({
                    code: 400,
                    msg: `API(${API_SITES[apiId]?.name || apiId})搜索失败: ${error.message}`,
                    list: [],
                    apiId: apiId
                }));
        }
    }).filter(Boolean);
    
    // 等待所有搜索完成
    return Promise.all(searchPromises);
}

/**
 * 渲染搜索结果
 * @param {Array} results - 搜索结果数组
 */
function renderSearchResults(results) {
    const searchResults = DOMCache.get('searchResults');
    if (!searchResults) return;
    
    // 合并所有结果
    let allResults = [];
    let errors = [];
    
    results.forEach(result => {
        if (result.code === 200 && Array.isArray(result.list)) {
            // 为每个结果添加来源信息
            const resultsWithSource = result.list.map(item => ({
                ...item,
                source_name: result.apiName || API_SITES[result.apiId]?.name || '未知来源',
                source_code: result.apiId.startsWith('custom_') ? 'custom' : result.apiId,
                api_url: result.apiId.startsWith('custom_') ? 
                    APISourceManager.getCustomApiInfo(parseInt(result.apiId.replace('custom_', '')))?.url : ''
            }));
            allResults = allResults.concat(resultsWithSource);
        } else if (result.msg) {
            errors.push(result.msg);
        }
    });
    
    // 过滤结果（如果启用了黄色内容过滤）
    const yellowFilterEnabled = getBoolConfig('yellowFilterEnabled', true);
    if (yellowFilterEnabled) {
        allResults = allResults.filter(item => {
            const title = item.vod_name || '';
            const type = item.type_name || '';
            return !/(伦理|写真|福利|成人|情色|色情|三级|美女|性感|倮|AV|av|福利|诱惑|裸|情趣|情色|成人|性爱|性感|美女|女优)/.test(title + type);
        });
    }
    
    // 如果没有结果
    if (allResults.length === 0) {
        let message = '没有找到相关内容';
        if (errors.length > 0) {
            message += `<div class="mt-2 text-xs text-red-400">${errors.join('<br>')}</div>`;
        }
        searchResults.innerHTML = `<div class="text-center py-4 text-gray-400">${message}</div>`;
        return;
    }
    
    // 渲染结果
    let html = '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">';
    
    // 使用createResultItem函数生成每个结果项的HTML
    allResults.forEach(item => {
        html += createResultItem(item);
    });
    
    html += '</div>';
    
    // 显示错误信息（如果有）
    if (errors.length > 0) {
        html += `<div class="mt-4 p-2 bg-[#333] rounded text-xs text-red-400">${errors.join('<br>')}</div>`;
    }
    
    searchResults.innerHTML = html;
}

/**
 * 执行搜索
 */
function search() {
    const searchInput = DOMCache.get('searchInput');
    const searchResults = DOMCache.get('searchResults');
    
    if (!searchInput || !searchResults) return;
    
    const query = searchInput.value.trim();
    if (!query) {
        showToast('请输入搜索内容', 'warning');
        return;
    }
    
    // 保存搜索历史
    saveSearchHistory(query);
    
    // 显示加载状态
    searchResults.innerHTML = '<div class="text-center py-4"><div class="spinner"></div><p class="mt-2 text-gray-400">正在搜索，请稍候...</p></div>';
    
    // 获取选中的API
    const selectedAPIs = AppState.get('selectedAPIs');
    if (!selectedAPIs || selectedAPIs.length === 0) {
        searchResults.innerHTML = '<div class="text-center py-4 text-gray-400">请至少选择一个API源</div>';
        return;
    }
    
    // 执行搜索请求
    performSearch(query, selectedAPIs)
        .then(renderSearchResults)
        .catch(error => {
            searchResults.innerHTML = `<div class="text-center py-4 text-red-400">搜索出错: ${error.message}</div>`;
        });
}

/**
 * 执行搜索请求
 * @param {string} query - 搜索查询
 * @param {Array} selectedAPIs - 选中的API列表
 * @returns {Promise} - 搜索结果Promise
 */
async function performSearch(query, selectedAPIs) {
    // 创建搜索请求数组
    const searchPromises = selectedAPIs.map(apiId => {
        if (apiId.startsWith('custom_')) {
            // 自定义API搜索
            const customIndex = parseInt(apiId.replace('custom_', ''));
            const customApi = APISourceManager.getCustomApiInfo(customIndex);
            if (customApi) {
                return fetch(`/api/search?wd=${encodeURIComponent(query)}&source=custom&customApi=${encodeURIComponent(customApi.url)}`)
                    .then(response => response.json())
                    .then(data => ({
                        ...data,
                        apiId: apiId,
                        apiName: customApi.name
                    }))
                    .catch(error => ({
                        code: 400,
                        msg: `自定义API(${customApi.name})搜索失败: ${error.message}`,
                        list: [],
                        apiId: apiId
                    }));
            }
        } else {
            // 内置API搜索
            return fetch(`/api/search?wd=${encodeURIComponent(query)}&source=${apiId}`)
                .then(response => response.json())
                .then(data => ({
                    ...data,
                    apiId: apiId,
                    apiName: API_SITES[apiId]?.name || apiId
                }))
                .catch(error => ({
                    code: 400,
                    msg: `API(${API_SITES[apiId]?.name || apiId})搜索失败: ${error.message}`,
                    list: [],
                    apiId: apiId
                }));
        }
    }).filter(Boolean);
    
    // 等待所有搜索完成
    return Promise.all(searchPromises);
}

/**
 * 渲染搜索结果
 * @param {Array} results - 搜索结果数组
 */
function renderSearchResults(results) {
    const searchResults = DOMCache.get('searchResults');
    if (!searchResults) return;
    
    // 合并所有结果
    let allResults = [];
    let errors = [];
    
    results.forEach(result => {
        if (result.code === 200 && Array.isArray(result.list)) {
            // 为每个结果添加来源信息
            const resultsWithSource = result.list.map(item => ({
                ...item,
                source_name: result.apiName || API_SITES[result.apiId]?.name || '未知来源',
                source_code: result.apiId.startsWith('custom_') ? 'custom' : result.apiId,
                api_url: result.apiId.startsWith('custom_') ? 
                    APISourceManager.getCustomApiInfo(parseInt(result.apiId.replace('custom_', '')))?.url : ''
            }));
            allResults = allResults.concat(resultsWithSource);
        } else if (result.msg) {
            errors.push(result.msg);
        }
    });
    
    // 过滤结果（如果启用了黄色内容过滤）
    const yellowFilterEnabled = getBoolConfig('yellowFilterEnabled', true);
    if (yellowFilterEnabled) {
        allResults = allResults.filter(item => {
            const title = item.vod_name || '';
            const type = item.type_name || '';
            return !/(伦理|写真|福利|成人|情色|色情|三级|美女|性感|倮|AV|av|福利|诱惑|裸|情趣|情色|成人|性爱|性感|美女|女优)/.test(title + type);
        });
    }
    
    // 如果没有结果
    if (allResults.length === 0) {
        let message = '没有找到相关内容';
        if (errors.length > 0) {
            message += `<div class="mt-2 text-xs text-red-400">${errors.join('<br>')}</div>`;
        }
        searchResults.innerHTML = `<div class="text-center py-4 text-gray-400">${message}</div>`;
        return;
    }
    
    // 渲染结果
    let html = '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">';
    
    // 使用createResultItem函数生成每个结果项的HTML
    allResults.forEach(item => {
        html += createResultItem(item);
    });
    
    html += '</div>';
    
    // 显示错误信息（如果有）
    if (errors.length > 0) {
        html += `<div class="mt-4 p-2 bg-[#333] rounded text-xs text-red-400">${errors.join('<br>')}</div>`;
    }
    
    searchResults.innerHTML = html;
}

/**
 * 获取视频详情
 * @param {string} id - 视频ID
 * @param {string} sourceCode - 来源代码
 * @param {string} apiUrl - API URL（对于自定义API）
 */
async function getVideoDetail(id, sourceCode, apiUrl = '') {
    if (!id || !sourceCode) {
        showToast('无效的视频信息', 'error');
        return;
    }
    
    const searchResults = DOMCache.get('searchResults');
    if (searchResults) {
        searchResults.innerHTML = '<div class="text-center py-4"><div class="spinner"></div><p class="mt-2 text-gray-400">正在获取视频信息，请稍候...</p></div>';
    }
    
    try {
        let url = `/api/detail?id=${id}&source=${sourceCode}`;
        
        // 对于自定义API，添加customApi参数
        if (sourceCode === 'custom' && apiUrl) {
            url += `&customApi=${encodeURIComponent(apiUrl)}&useDetail=true`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code !== 200 || !Array.isArray(data.episodes) || data.episodes.length === 0) {
            throw new Error(data.msg || '获取视频详情失败');
        }
        
        // 保存视频信息到状态
        AppState.set('currentEpisodes', data.episodes);
        AppState.set('currentVideoTitle', data.videoInfo?.title || '未知视频');
        AppState.set('currentEpisodeIndex', 0);
        
        // 保存到localStorage（用于播放器页面）
        localStorage.setItem('currentEpisodes', JSON.stringify(data.episodes));
        localStorage.setItem('currentVideoTitle', data.videoInfo?.title || '未知视频');
        localStorage.setItem('currentEpisodeIndex', '0');
        
        // 添加到观看历史
        if (data.videoInfo && typeof addToViewingHistory === 'function') {
            addToViewingHistory(data.videoInfo);
        }
        
        // 使用playVideo函数播放第一集
        const firstEpisode = data.episodes[0];
        playVideo(
            firstEpisode, 
            data.videoInfo?.title || '未知视频', 
            0, 
            data.videoInfo?.source_name || '', 
            sourceCode
        );
    } catch (error) {
        if (searchResults) {
            searchResults.innerHTML = `<div class="text-center py-4 text-red-400">获取视频详情失败: ${error.message}</div>`;
        }
        showToast('获取视频详情失败: ' + error.message, 'error');
    }
}

/**
 * 重置到首页
 */
function resetToHome() {
    const searchInput = DOMCache.get('searchInput');
    const searchResults = DOMCache.get('searchResults');
    
    if (searchInput) searchInput.value = '';
    if (searchResults) searchResults.innerHTML = '';
    
    // 显示搜索历史
    renderSearchHistory();
}

// 导出需要在全局访问的函数
window.search = search;
window.getVideoDetail = getVideoDetail;
window.resetToHome = resetToHome;
window.playVideo = playVideo;
window.playPreviousEpisode = playPreviousEpisode;
window.playNextEpisode = playNextEpisode;
window.showDetails = showDetails;

