/**
 * 主应用程序逻辑
 * 使用AppState进行状态管理，DOMCache进行DOM元素缓存
 */

// Basic AppState Implementation
const AppState = (function () {
    const state = new Map();
    return {
        set: function (key, value) {
            state.set(key, value);
        },
        get: function (key) {
            return state.get(key);
        },
        // Method to initialize multiple values
        initialize: function (initialData = {}) {
            for (const key in initialData) {
                if (initialData.hasOwnProperty(key)) {
                    state.set(key, initialData[key]);
                }
            }
        }
    };
})();

// Basic DOMCache Implementation
const DOMCache = (function () {
    const cache = new Map();
    return {
        set: function (key, element) {
            if (element) {
                cache.set(key, element);
            }
        },
        get: function (key) {
            return cache.get(key);
        },
        // Initialize multiple elements
        init: function (elementsToCache) {
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

    playerUrl.searchParams.set('index', episodeIndex.toString()); // 统一用 index

    // 追加完整剧集列表，player.html 拿不到 localStorage 时也能渲染
    const eps = AppState.get('currentEpisodes');
    if (Array.isArray(eps) && eps.length) {
        playerUrl.searchParams.set(
            'episodes',
            encodeURIComponent(JSON.stringify(eps))
        );
    }

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
    playerUrl.searchParams.set('index', episodeIndex.toString()); // Changed from 'ep' to 'index' to match player.html expectations
    if (sourceName) playerUrl.searchParams.set('source', sourceName);
    if (sourceCode) playerUrl.searchParams.set('source_code', sourceCode);
    if (playbackPosition > 0) playerUrl.searchParams.set('position', playbackPosition.toString());

    // Navigate to player page
    window.location.href = playerUrl.toString();
}

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
document.addEventListener('DOMContentLoaded', function () {
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
    DOMCache.set('adFilteringToggle', document.getElementById('adFilterToggle'));

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
        searchForm.addEventListener('submit', function (e) {
            e.preventDefault();
            search();
        });
    }

    // 搜索输入框事件
    const searchInput = DOMCache.get('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            // 可以添加实时搜索建议等功能
        });
    }

    // 广告过滤开关事件
    const adFilteringToggle = DOMCache.get('adFilteringToggle');
    if (adFilteringToggle) {
        adFilteringToggle.addEventListener('change', function (e) {
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
        yellowFilterToggle.addEventListener('change', function (e) {
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
        preloadingToggle.addEventListener('change', function (e) {
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
        preloadCountInput.addEventListener('change', function (e) {
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

// 在 new3.txt/js/app.js

/**
 * 执行搜索
 * @param {object} options - 搜索选项，可以包含 doubanQuery 和 onComplete 回调
 */
function search(options = {}) {
    const searchInput = DOMCache.get('searchInput');
    const searchResultsContainer = DOMCache.get('searchResults'); // 改名为 searchResultsContainer 更清晰

    if (!searchInput || !searchResultsContainer) {
        if (typeof options.onComplete === 'function') options.onComplete(); // 确保回调执行
        return;
    }

    const query = options.doubanQuery || searchInput.value.trim();
    const originalSearchTerm = searchInput.value.trim();

    if (!query) {
        if (typeof showToast === 'function') showToast('请输入搜索内容', 'warning');
        if (typeof options.onComplete === 'function') options.onComplete(); // 确保回调执行
        return;
    }

    // 保存搜索历史逻辑 (保留或按需调整)
    if (!options.doubanQuery || (options.doubanQuery && originalSearchTerm === query)) {
        if (typeof saveSearchHistory === 'function') saveSearchHistory(query);
    }

    // 不再在这里设置 "正在搜索，请稍候..."，由全局 showLoading() 处理
    // searchResultsContainer.innerHTML = '<div class="text-center py-4">...</div>';

    const selectedAPIs = AppState.get('selectedAPIs');
    if (!selectedAPIs || selectedAPIs.length === 0) {
        if (searchResultsContainer) searchResultsContainer.innerHTML = '<div class="text-center py-4 text-gray-400">请至少选择一个API源</div>';
        if (typeof options.onComplete === 'function') options.onComplete(); // 确保回调执行
        return;
    }

    performSearch(query, selectedAPIs)
        .then(resultsData => {
            // 将豆瓣查询标题传递给 renderSearchResults
            renderSearchResults(resultsData, options.doubanQuery ? query : null);
        })
        .catch(error => {
            if (searchResultsContainer) searchResultsContainer.innerHTML = `<div class="text-center py-4 text-red-400">搜索出错: ${error.message}</div>`;
        })
        .finally(() => {
            // <--- 关键步骤2：在搜索的最后（无论成功失败）调用回调
            if (typeof options.onComplete === 'function') {
                options.onComplete();
            }
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


function renderSearchResults(results, doubanSearchedTitle = null) {
    const searchResultsContainer = DOMCache.get('searchResults');
    if (!searchResultsContainer) return;

    // ... (合并结果和错误信息的逻辑保持不变 - Source 850-855) ...
    let allResults = [];
    let errors = [];

    results.forEach(result => {
        if (result.code === 200 && Array.isArray(result.list)) {
            const resultsWithSource = result.list.map(item => ({
                ...item,
                source_name: result.apiName || (typeof API_SITES !== 'undefined' && API_SITES[result.apiId]?.name) || '未知来源',
                source_code: result.apiId.startsWith('custom_') ? 'custom' : result.apiId,
                api_url: result.apiId.startsWith('custom_') && typeof APISourceManager !== 'undefined' ?
                    APISourceManager.getCustomApiInfo(parseInt(result.apiId.replace('custom_', '')))?.url : ''
            }));
            allResults = allResults.concat(resultsWithSource);
        } else if (result.msg) {
            errors.push(result.msg);
        }
    });

    const yellowFilterEnabled = getBoolConfig('yellowFilterEnabled', true);
    if (yellowFilterEnabled) {
        allResults = allResults.filter(item => {
            const title = item.vod_name || '';
            const type = item.type_name || '';
            // 更宽松的过滤词，避免误杀
            return !/(伦理片|福利片|写真)/.test(type) && !/(伦理|写真|福利|成人|情色|AV)/i.test(title);
        });
    }

    // 更新结果区域的可见性和数量显示 (Source 856-861)
    const resultsArea = getElement('resultsArea');
    if (resultsArea) {
        // 只要有错误、有结果，或者明确是豆瓣搜索（即使无结果也需要显示提示），就显示结果区
        if (errors.length > 0 || allResults.length > 0 || doubanSearchedTitle) {
            resultsArea.classList.remove('hidden');
        } else {
            resultsArea.classList.add('hidden');
        }
    }
    const searchResultsCount = getElement('searchResultsCount');
    if (searchResultsCount) {
        searchResultsCount.textContent = allResults.length.toString();
    }

    searchResultsContainer.innerHTML = ''; // 清空

    if (allResults.length === 0) {
        let message;
        if (doubanSearchedTitle) {
            message = `您点击的豆瓣影视剧 <strong class="text-pink-400">《${sanitizeText(doubanSearchedTitle)}》</strong> 在当前已选的数据源中未找到。`;
        } else {
            message = '没有找到相关内容。';
        }

        if (errors.length > 0) {
            const errorMessages = errors.map(err => sanitizeText(err)).join('<br>');
            message += `<div class="mt-3 text-xs text-red-300">${errorMessages}</div>`;
        }
        searchResultsContainer.innerHTML = `<div class="text-center py-8 px-4 text-gray-400">${message}</div>`;
        // 调整搜索区布局
        const searchArea = getElement('searchArea');
        if (searchArea) {
            searchArea.classList.add('flex-1'); // 重新撑满
            searchArea.classList.remove('mb-8'); // 移除边距
        }
        return;
    }

    // ... (渲染实际结果的逻辑 - Source 864-876) ...
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 justify-center';
    const fragment = document.createDocumentFragment();
    allResults.forEach(item => {
        try {
            fragment.appendChild(createResultItemUsingTemplate(item));
        } catch (error) {
            console.error('Error creating result item from template:', error, item);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'card-hover bg-[#222] rounded-lg overflow-hidden p-2';
            errorDiv.innerHTML = `<h3 class="text-red-400">加载错误</h3><p class="text-xs text-gray-400">无法显示此项目</p>`;
            fragment.appendChild(errorDiv);
        }
    });
    gridContainer.appendChild(fragment);
    searchResultsContainer.appendChild(gridContainer);

    if (errors.length > 0) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'mt-4 p-2 bg-[#333] rounded text-xs text-red-400';
        errorDiv.innerHTML = errors.map(err => sanitizeText(err)).join('<br>');
        searchResultsContainer.appendChild(errorDiv);
    }

    // 调整搜索区布局 (确保在有结果时 searchArea 不是 flex-1)
    const searchArea = getElement('searchArea');
    if (searchArea) {
        searchArea.classList.remove('flex-1');
        searchArea.classList.add('mb-8'); // 在有结果时添加底部边距
        searchArea.classList.remove('hidden');
    }
    getElement('doubanArea')?.classList.add('hidden'); // 隐藏豆瓣区
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
    const resultsArea = getElement('resultsArea');
    const doubanArea = getElement('doubanArea');
    const searchArea = getElement('searchArea');

    if (searchInput) searchInput.value = '';
    if (searchResults) searchResults.innerHTML = '';

    // 回到「初始版面」
    /* ---- 恢复搜索区默认样式 ---- */
    if (searchArea) {
        searchArea.classList.add('flex-1');   // 重新撑满页面
        searchArea.classList.remove('mb-8');  // 移除搜索结果页加的外边距
        searchArea.classList.remove('hidden');
    }

    /* ---- 隐藏结果区 ---- */
    resultsArea?.classList.add('hidden');

    /* ---- 视用户设置决定是否显示豆瓣区 ---- */
    if (doubanArea) {
        // 如果用户关闭了豆瓣推荐开关则保持隐藏
        const showDouban = getBoolConfig('doubanToggle', true);
        doubanArea.classList.toggle('hidden', !showDouban);
    }

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
window.playFromHistory = playFromHistory;


function createResultItemUsingTemplate(item) {
    const template = document.getElementById('search-result-template');
    if (!template) {
        console.error("搜索结果模板未找到！");
        return document.createDocumentFragment();
    }

    const clone = template.content.cloneNode(true);
    const cardElement = clone.querySelector('.card-hover');

    // 添加检查，确保cardElement存在
    if (!cardElement) {
        console.error("卡片元素 (.card-hover) 在模板克隆中未找到，项目:", item);
        // 返回一个空的错误占位元素
        const errorDiv = document.createElement('div');
        errorDiv.className = 'card-hover bg-[#222] rounded-lg overflow-hidden p-2';
        errorDiv.innerHTML = `<h3 class="text-red-400">加载错误</h3><p class="text-xs text-gray-400">无法显示此项目</p>`;
        return errorDiv;
    }

    // 填充数据
    const imgElement = clone.querySelector('.result-img');
    if (imgElement) {
        imgElement.src = item.vod_pic || 'img/default-poster.jpg';
        imgElement.alt = item.vod_name || '未知标题';
    }

    const titleElement = clone.querySelector('.result-title');
    if (titleElement) {
        titleElement.textContent = item.vod_name || '未知标题';
    }

    const typeElement = clone.querySelector('.result-type');
    if (typeElement) {
        typeElement.textContent = item.type_name || '未知类型';
    }

    const yearElement = clone.querySelector('.result-year');
    if (yearElement) {
        yearElement.textContent = item.vod_year || '未知年份';
    }

    const sourceElement = clone.querySelector('.result-source');
    if (sourceElement) {
        sourceElement.textContent = item.source_name || '未知来源';
    }

    // 设置数据属性和点击事件
    cardElement.dataset.id = item.vod_id || '';
    cardElement.dataset.name = item.vod_name || '';
    cardElement.dataset.sourceCode = item.source_code || '';
    if (item.api_url) {
        cardElement.dataset.apiUrl = item.api_url;
    }
    cardElement.onclick = handleResultClick;

    return clone;
}

// Add the handler function (if not already present) 
function handleResultClick(event) {
    const card = event.currentTarget;
    const id = card.dataset.id;
    const name = card.dataset.name;
    const sourceCode = card.dataset.sourceCode;
    const apiUrl = card.dataset.apiUrl || '';

    if (typeof showVideoEpisodesModal === 'function') {
        showVideoEpisodesModal(id, name, sourceCode, apiUrl);
    } else {
        console.error('showVideoEpisodesModal function not found!');
    }
}
// Make handler globally accessible if needed (though better to delegate if possible) 
// window.handleResultClick = handleResultClick; 

/**
 * 显示视频剧集模态框
 * @param {string} id - 视频ID
 * @param {string} title - 视频标题
 * @param {string} sourceCode - 来源代码
 */
// 在 app.js 中

async function showVideoEpisodesModal(id, title, sourceCode) {
    showLoading('加载剧集信息...');

    const selectedApi = APISourceManager.getSelectedApi(sourceCode);

    if (!selectedApi) {
        hideLoading();
        showToast('未找到有效的数据源 (selectedApi is null)', 'error');
        return;
    }

    try {
        // 构建详情页的 API URL
        let detailApiUrl = `/api/detail?id=${encodeURIComponent(id)}&source=${encodeURIComponent(sourceCode)}`;
        if (selectedApi.isCustom && selectedApi.url) {

        }

        const response = await fetch(detailApiUrl); // 直接 fetch
        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }
        const data = await response.json();

        hideLoading();

        if (data.code !== 200 || !data.episodes || data.episodes.length === 0) {
            // 尝试从 videoInfo 中获取更详细的错误信息
            let errorMessage = '未找到剧集信息';
            if (data.msg) {
                errorMessage = data.msg;
            } else if (data.videoInfo && data.videoInfo.msg) {
                errorMessage = data.videoInfo.msg;
            } else if (data.list && data.list.length > 0 && data.list[0] && data.list[0].msg) {
                errorMessage = data.list[0].msg;
            }
            showToast(errorMessage, 'warning');
            console.warn('获取剧集详情数据问题:', data);
            return;
        }

        AppState.set('currentEpisodes', data.episodes);
        AppState.set('currentVideoTitle', title); // 确保使用传入的 title
        AppState.set('currentSourceName', selectedApi.name);
        AppState.set('currentSourceCode', sourceCode);

        const episodeButtonsHtml = renderEpisodeButtons(data.episodes, title, sourceCode);
        showModal(episodeButtonsHtml, title);

    } catch (error) {
        hideLoading();
        console.error('获取剧集信息失败 (catch block):', error);
        showToast(`获取剧集信息失败: ${error.message}`, 'error');
    }
}

/**
 * 渲染剧集按钮HTML
 * @param {Array} episodes - 剧集列表
 * @param {string} title - 视频标题
 * @param {string} sourceCode - 来源代码
 * @returns {string} - 剧集按钮HTML
 */
function renderEpisodeButtons(episodes, title, sourceCode) {
    if (!episodes || episodes.length === 0) return '<p class="text-center text-gray-500">暂无剧集信息</p>';

    // 排序控制UI
    let html = `
    <div class="mb-4 flex justify-between items-center">
        <div class="text-sm text-gray-400">共 ${episodes.length} 集</div>
        <button id="toggleEpisodeOrderBtn" onclick="toggleEpisodeOrderUI()" class="text-sm px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center gap-1">
            <span id="orderText">正序</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
        </button>
    </div>
    <div id="episodeButtonsContainer" class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">`;

    // 生成剧集按钮
    episodes.forEach((episode, index) => {
        html += `
        <button 
            onclick="playVideo('${episode}', '${title}', ${index}, '${AppState.get('currentSourceName')}', '${sourceCode}')" 
            class="episode-btn px-2 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors"
            data-index="${index}"
        >
            ${index + 1}
        </button>`;
    });

    html += '</div>';
    return html;
}

/**
 * 切换剧集排序UI
 */
function toggleEpisodeOrderUI() {
    const container = document.getElementById('episodeButtonsContainer');
    const orderText = document.getElementById('orderText');
    if (!container || !orderText) return;

    // 获取所有剧集按钮并转换为数组
    const buttons = Array.from(container.querySelectorAll('.episode-btn'));
    if (buttons.length === 0) return;

    // 判断当前排序方式
    const isAscending = orderText.textContent === '正序';

    // 更新排序文本
    orderText.textContent = isAscending ? '倒序' : '正序';

    // 反转按钮顺序
    buttons.reverse().forEach(button => {
        container.appendChild(button);
    });
}

// 将函数暴露给全局作用域
window.showVideoEpisodesModal = showVideoEpisodesModal;
window.toggleEpisodeOrderUI = toggleEpisodeOrderUI;