// API配置
const API_CONFIG = {
    search: {
        path: '?ac=videolist&wd=',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        }
    },
    detail: {
        path: '?ac=videolist&ids=',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        }
    }
};

// 执行搜索
async function performSearch(keyword, apis) {
    if (!keyword || !apis || apis.length === 0) {
        showToast('请输入搜索关键词并选择至少一个数据源');
        return;
    }

    try {
        const results = [];
        const searchPromises = apis.map(async (apiKey) => {
            try {
                const api = API_SITES[apiKey];
                if (!api) return null;

                const url = api.api + API_CONFIG.search.path + encodeURIComponent(keyword);
                const response = await fetch('/proxy/' + encodeURIComponent(url), {
                    headers: API_CONFIG.search.headers
                });
                
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                
                if (data && data.list && Array.isArray(data.list)) {
                    return data.list.map(item => ({
                        ...item,
                        source_name: api.name,
                        source_code: apiKey
                    }));
                }
                return null;
            } catch (error) {
                console.error(`搜索API ${apiKey} 失败:`, error);
                return null;
            }
        });

        const searchResults = await Promise.all(searchPromises);
        searchResults.forEach(result => {
            if (result) results.push(...result);
        });

        // 去重（根据vod_id和source_code组合）
        const uniqueResults = [];
        const seen = new Set();
        
        results.forEach(item => {
            const key = `${item.source_code}_${item.vod_id}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueResults.push(item);
            }
        });

        renderSearchResults(uniqueResults);
    } catch (error) {
        console.error('搜索失败:', error);
        showToast('搜索失败，请稍后重试');
    }
}

// 渲染搜索结果
function renderSearchResults(results) {
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) return;

    if (!results || results.length === 0) {
        resultsContainer.innerHTML = '<div class="text-center text-gray-400 py-8">未找到相关结果</div>';
        return;
    }

    resultsContainer.innerHTML = results.map(item => {
        const safeId = item.vod_id ? item.vod_id.toString().replace(/[^\w-]/g, '') : '';
        const safeName = (item.vod_name || item.name || '未知资源').toString()
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        
        return `
            <div class="search-result-item" onclick="playFirstEpisode('${item.source_code}', '${safeId}', '${safeName}')">
                <div class="relative">
                    <img src="${item.vod_pic || 'image/default.jpg'}" alt="${safeName}" class="w-full h-48 object-cover rounded-lg">
                    <div class="absolute top-2 right-2 bg-black bg-opacity-50 px-2 py-1 rounded text-white text-sm">
                        ${item.vod_remarks || ''}
                    </div>
                </div>
                <div class="p-4">
                    <h3 class="text-lg font-semibold line-clamp-1">${safeName}</h3>
                    <div class="text-gray-400 text-sm mt-2">
                        <span class="bg-[#222]">${item.source_name}</span>
                        ${item.vod_remarks ? `<span class="bg-[#222]">${item.vod_remarks}</span>` : ''}
                        ${item.type_name ? `<span class="bg-[#222]">${item.type_name}</span>` : ''}
                    </div>
                    <div class="text-gray-400 text-sm mt-2 line-clamp-2">${item.vod_content || ''}</div>
                </div>
            </div>
        `;
    }).join('');
}

// 播放第一集
async function playFirstEpisode(sourceCode, vodId, title) {
    try {
        // 获取视频详情
        const api = API_SITES[sourceCode];
        if (!api) {
            showToast('无效的数据源');
            return;
        }

        const url = api.api + API_CONFIG.detail.path + vodId;
        const response = await fetch('/proxy/' + encodeURIComponent(url), {
            headers: API_CONFIG.detail.headers
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        if (!data || !data.list || !data.list[0] || !data.list[0].vod_play_url) {
            showToast('获取视频信息失败');
            return;
        }

        const detail = data.list[0];
        const playUrls = detail.vod_play_url.split('#');
        if (!playUrls || playUrls.length === 0) {
            showToast('无法获取播放地址');
            return;
        }

        // 获取第一集的播放地址
        const firstEpisodeUrl = playUrls[0].split('$')[1];
        if (!firstEpisodeUrl) {
            showToast('无法获取播放地址');
            return;
        }

        // 构建播放URL
        const playUrl = new URL('player.html', window.location.href);
        playUrl.searchParams.set('url', firstEpisodeUrl);
        playUrl.searchParams.set('title', title);
        playUrl.searchParams.set('source_code', sourceCode);
        playUrl.searchParams.set('vod_id', vodId);
        playUrl.searchParams.set('index', '0');
        playUrl.searchParams.set('returnUrl', encodeURIComponent(window.location.href));

        // 跳转到播放页面
        window.location.href = playUrl.toString();
    } catch (error) {
        console.error('播放失败:', error);
        showToast('播放失败，请稍后重试');
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
document.addEventListener('DOMContentLoaded', initSearch); 
