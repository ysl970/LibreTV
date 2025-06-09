// 执行搜索
async function performSearch(keyword, apis) {
    if (!keyword || !apis || apis.length === 0) return;
    
    const searchResults = [];
    const searchPromises = apis.map(async (apiCode) => {
        try {
            const results = await searchResourceByApiAndTitle(apiCode, keyword);
            if (results && results.length > 0) {
                return results.map(item => ({
                    ...item,
                    source_code: apiCode,
                    source_name: API_SITES[apiCode]?.name || '未知来源'
                }));
            }
        } catch (error) {
            console.error(`搜索API ${apiCode} 失败:`, error);
        }
        return [];
    });
    
    // 等待所有搜索完成
    const results = await Promise.all(searchPromises);
    
    // 合并所有结果
    results.forEach(apiResults => {
        searchResults.push(...apiResults);
    });
    
    // 渲染搜索结果
    renderSearchResults(searchResults);
}

// 渲染搜索结果
function renderSearchResults(results) {
    const container = document.getElementById('searchResults');
    if (!container) return;
    
    if (results.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-8">未找到相关结果</div>';
        return;
    }
    
    container.innerHTML = results.map(item => `
        <div class="search-result-item" onclick="playFirstEpisode('${item.source_code}', '${item.vod_id}', '${item.vod_name}')">
            <div class="search-card-img-container">
                <img src="${item.vod_pic}" alt="${item.vod_name}" loading="lazy">
            </div>
            <div class="flex-grow p-4">
                <h3 class="line-clamp-2">${item.vod_name}</h3>
                <div class="text-gray-400 text-sm mt-2">
                    <span class="bg-[#222]">${item.source_name}</span>
                    ${item.vod_remarks ? `<span class="bg-[#222]">${item.vod_remarks}</span>` : ''}
                </div>
                <div class="text-gray-400 text-sm mt-2 line-clamp-2">${item.vod_content || ''}</div>
            </div>
        </div>
    `).join('');
}

// 播放第一集
async function playFirstEpisode(sourceCode, vodId, title) {
    try {
        // 获取视频详情
        const detail = await getVideoDetail(sourceCode, vodId);
        if (!detail || !detail.vod_play_url) {
            showToast('获取视频信息失败');
            return;
        }

        // 解析播放地址
        const playUrls = detail.vod_play_url.split('#');
        if (!playUrls || playUrls.length === 0) {
            showToast('无法获取播放地址');
            return;
        }

        // 构建播放URL（默认播放第一集）
        const playUrl = new URL('player.html', window.location.href);
        playUrl.searchParams.set('source_code', sourceCode);
        playUrl.searchParams.set('vod_id', vodId);
        playUrl.searchParams.set('title', title);
        playUrl.searchParams.set('index', '0'); // 设置播放第一集

        // 跳转到播放页面
        window.location.href = playUrl.toString();
    } catch (error) {
        console.error('播放失败:', error);
        showToast('播放失败，请稍后重试');
    }
}

// 获取视频详情
async function getVideoDetail(sourceCode, vodId) {
    try {
        const response = await fetch(`/api/detail?source=${sourceCode}&id=${vodId}`);
        if (!response.ok) throw new Error('获取视频详情失败');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('获取视频详情失败:', error);
        throw error;
    }
}

// 初始化搜索
function initSearch() {
    const urlParams = new URLSearchParams(window.location.search);
    const keyword = urlParams.get('keyword');
    const apis = urlParams.get('apis')?.split(',') || [];
    
    if (keyword && apis.length > 0) {
        performSearch(keyword, apis);
    }
}

// 页面加载完成后初始化搜索
window.addEventListener('DOMContentLoaded', initSearch); 
