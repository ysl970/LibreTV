// 豆瓣热门电影电视剧推荐功能

// 豆瓣标签列表 - 修改为默认标签
let defaultMovieTags = ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '动作', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '治愈'];
let defaultTvTags = ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '港剧', '日本动画', '综艺', '纪录片'];

// 用户标签列表 - 存储用户实际使用的标签（包含保留的系统标签和用户添加的自定义标签）
let movieTags = [];
let tvTags = [];

// 内存缓存对象
const doubanCache = {};
// 缓存过期时间（24小时）
const CACHE_EXPIRY = 24 * 60 * 60 * 1000;

// 加载用户标签
function loadUserTags() {
    try {
        // 尝试从本地存储加载用户保存的标签
        const savedMovieTags = localStorage.getItem('userMovieTags');
        const savedTvTags = localStorage.getItem('userTvTags');
        
        // 如果本地存储中有标签数据，则使用它
        if (savedMovieTags) {
            movieTags = JSON.parse(savedMovieTags);
        } else {
            // 否则使用默认标签
            movieTags = [...defaultMovieTags];
        }
        
        if (savedTvTags) {
            tvTags = JSON.parse(savedTvTags);
        } else {
            // 否则使用默认标签
            tvTags = [...defaultTvTags];
        }
    } catch (e) {
        console.error('加载标签失败：', e);
        // 初始化为默认值，防止错误
        movieTags = [...defaultMovieTags];
        tvTags = [...defaultTvTags];
    }
}

// 保存用户标签
function saveUserTags() {
    try {
        localStorage.setItem('userMovieTags', JSON.stringify(movieTags));
        localStorage.setItem('userTvTags', JSON.stringify(tvTags));
    } catch (e) {
        console.error('保存标签失败：', e);
    }
}

let doubanMovieTvCurrentSwitch = 'movie';
let doubanCurrentTag = '热门';
let doubanPageStart = 0;
const doubanPageSize = 16; // 一次显示的项目数量

// 初始化豆瓣功能
function initDouban() {
    // 设置豆瓣开关的初始状态
    const doubanToggle = document.getElementById('doubanToggle');
    if (doubanToggle) {
        const isEnabled = localStorage.getItem('doubanEnabled') !== 'false';
        doubanToggle.checked = isEnabled;
        
        // 设置开关外观
        const toggleBg = doubanToggle.nextElementSibling;
        const toggleDot = toggleBg.nextElementSibling;
        if (isEnabled) {
            toggleBg.classList.add('bg-pink-600');
            toggleDot.classList.add('translate-x-6');
        }
        
        // 添加事件监听
        doubanToggle.addEventListener('change', function(e) {
            const isChecked = e.target.checked;
            localStorage.setItem('doubanEnabled', isChecked);
            
            // 更新开关外观
            if (isChecked) {
                toggleBg.classList.add('bg-pink-600');
                toggleDot.classList.add('translate-x-6');
            } else {
                toggleBg.classList.remove('bg-pink-600');
                toggleDot.classList.remove('translate-x-6');
            }
            
            // 更新显示状态
            updateDoubanVisibility();
        });
        
        // 初始更新显示状态
        updateDoubanVisibility();
    }

    // 加载用户标签
    loadUserTags();

    // 渲染电影/电视剧切换
    renderDoubanMovieTvSwitch();
    
    // 渲染豆瓣标签
    renderDoubanTags();
    
    // 换一批按钮事件监听
    setupDoubanRefreshBtn();
    
    // 初始加载热门内容
    if (localStorage.getItem('doubanEnabled') !== 'false') {
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }

    // 滚动到页面顶部
    window.scrollTo(0, 0);
}

// 根据设置更新豆瓣区域的显示状态
function updateDoubanVisibility() {
    const doubanArea = document.getElementById('doubanArea');
    if (!doubanArea) return;
    
    const isEnabled = localStorage.getItem('doubanEnabled') !== 'false';
    const isSearching = document.getElementById('resultsArea') && 
        !document.getElementById('resultsArea').classList.contains('hidden');
    
    // 只有在启用且没有搜索结果显示时才显示豆瓣区域
    if (isEnabled && !isSearching) {
        doubanArea.classList.remove('hidden');
        // 如果豆瓣结果为空，重新加载
        if (document.getElementById('douban-results').children.length === 0) {
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        }
    } else {
        doubanArea.classList.add('hidden');
    }
}

// 渲染电影/电视剧切换开关
function renderDoubanMovieTvSwitch() {
    const movieToggle = document.getElementById('douban-movie-toggle');
    const tvToggle = document.getElementById('douban-tv-toggle');
    
    if (!movieToggle || !tvToggle) return;
    
    // 设置初始状态
    if (doubanMovieTvCurrentSwitch === 'movie') {
        movieToggle.classList.add('bg-pink-600', 'text-white');
        tvToggle.classList.remove('bg-pink-600', 'text-white');
    } else {
        tvToggle.classList.add('bg-pink-600', 'text-white');
        movieToggle.classList.remove('bg-pink-600', 'text-white');
    }
    
    // 添加事件监听
    movieToggle.addEventListener('click', function() {
        if (doubanMovieTvCurrentSwitch !== 'movie') {
            doubanMovieTvCurrentSwitch = 'movie';
            doubanCurrentTag = movieTags[0] || '热门';
            doubanPageStart = 0; // 重置页码
            
            // 更新UI
            this.classList.add('bg-pink-600', 'text-white');
            tvToggle.classList.remove('bg-pink-600', 'text-white');
            tvToggle.classList.add('text-gray-300');
            
            // 重新渲染标签和内容
            renderDoubanTags();
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        }
    });
    
    tvToggle.addEventListener('click', function() {
        if (doubanMovieTvCurrentSwitch !== 'tv') {
            doubanMovieTvCurrentSwitch = 'tv';
            doubanCurrentTag = tvTags[0] || '热门';
            doubanPageStart = 0; // 重置页码
            
            // 更新UI
            this.classList.add('bg-pink-600', 'text-white');
            movieToggle.classList.remove('bg-pink-600', 'text-white');
            movieToggle.classList.add('text-gray-300');
            
            // 重新渲染标签和内容
            renderDoubanTags();
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        }
    });
}

// 渲染豆瓣标签
function renderDoubanTags() {
    const tagsContainer = document.getElementById('douban-tags');
    if (!tagsContainer) return;
    
    // 清空现有标签
    tagsContainer.innerHTML = '';
    
    // 获取当前类型的标签列表
    const currentTags = doubanMovieTvCurrentSwitch === 'movie' ? movieTags : tvTags;
    
    // 循环创建标签
    currentTags.forEach(tag => {
        const tagButton = document.createElement('button');
        tagButton.className = 'py-1 px-3 text-sm rounded-full transition-colors';
        
        // 如果是当前选中的标签，设置不同样式
        if (tag === doubanCurrentTag) {
            tagButton.classList.add('bg-pink-600', 'text-white');
        } else {
            tagButton.classList.add('bg-[#222]', 'text-gray-300', 'hover:text-white', 'hover:bg-[#333]');
        }
        
        tagButton.textContent = tag;
        
        // 添加点击事件
        tagButton.addEventListener('click', function() {
            if (doubanCurrentTag !== tag) {
                doubanCurrentTag = tag;
                doubanPageStart = 0; // 重置页码
                
                // 更新标签样式
                document.querySelectorAll('#douban-tags button').forEach(btn => {
                    btn.classList.remove('bg-pink-600', 'text-white');
                    btn.classList.add('bg-[#222]', 'text-gray-300', 'hover:text-white', 'hover:bg-[#333]');
                });
                
                this.classList.remove('bg-[#222]', 'text-gray-300', 'hover:text-white', 'hover:bg-[#333]');
                this.classList.add('bg-pink-600', 'text-white');
                
                // 重新渲染内容
                renderRecommend(tag, doubanPageSize, 0);
            }
        });
        
        tagsContainer.appendChild(tagButton);
    });
}

// 设置换一批按钮事件
function setupDoubanRefreshBtn() {
    const refreshBtn = document.getElementById('douban-refresh');
    if (!refreshBtn) return;
    
    refreshBtn.addEventListener('click', function() {
        // 增加页码，获取下一批内容
        doubanPageStart += doubanPageSize;
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        
        // 滚动到豆瓣区域顶部
        const doubanArea = document.getElementById('doubanArea');
        if (doubanArea) {
            doubanArea.scrollIntoView({ behavior: 'smooth' });
        }
    });
}

// 渲染推荐内容
function renderRecommend(tag, pageLimit, pageStart) {
    // 显示加载状态
    const resultsContainer = document.getElementById('douban-results');
    if (!resultsContainer) return;
    
    // 清空现有内容
    resultsContainer.innerHTML = '<div class="col-span-full text-center py-20"><div class="w-10 h-10 border-4 border-t-transparent border-white rounded-full animate-spin mx-auto mb-4"></div>加载中...</div>';
    
    // 构建API URL
    const apiURL = buildDoubanApiUrl(doubanMovieTvCurrentSwitch, tag, pageLimit, pageStart);
    
    // 获取数据
    fetchDoubanData(apiURL)
        .then(data => {
            if (data && data.subjects && data.subjects.length > 0) {
                // 渲染内容
                renderDoubanCards(data.subjects, resultsContainer);
            } else {
                resultsContainer.innerHTML = '<div class="col-span-full text-center py-20 text-gray-500">没有找到相关内容</div>';
            }
        })
        .catch(err => {
            console.error('获取豆瓣推荐数据失败:', err);
            resultsContainer.innerHTML = '<div class="col-span-full text-center py-20 text-red-500">获取数据失败，请稍后再试</div>';
        });
}

// 构建豆瓣API URL
function buildDoubanApiUrl(type, tag, pageSize = doubanPageSize, pageStart = 0) {
    // 基础URL
    const baseUrl = '/api/rss/movie';
    
    // 构建查询参数
    const params = new URLSearchParams();
    params.append('type', type);
    params.append('tag', tag);
    params.append('page_limit', pageSize);
    params.append('page_start', pageStart);
    
    // 返回完整URL
    return `${baseUrl}?${params.toString()}`;
}

// 从豆瓣API获取数据
async function fetchDoubanData(url) {
    // 检查缓存
    const cachedData = doubanCache[url];
    if (cachedData && cachedData.expiry > Date.now()) {
        return cachedData.data;
    }
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 缓存结果（1小时过期）
        doubanCache[url] = {
            data: data,
            expiry: Date.now() + 3600000  // 1小时的毫秒数
        };
        
        return data;
    } catch (error) {
        console.error('获取豆瓣数据失败:', error);
        throw error;
    }
}

// 渲染豆瓣卡片
function renderDoubanCards(items, container) {
    // 清空容器
    container.innerHTML = '';
    
    // 检查是否为空
    if (!items || items.length === 0) {
        container.innerHTML = '<div class="col-span-full text-center py-20 text-gray-500">没有找到相关内容</div>';
        return;
    }
    
    // 循环创建卡片
    items.forEach(item => {
        // 创建卡片元素
        const card = document.createElement('div');
        card.className = 'relative rounded-lg overflow-hidden bg-[#111] border border-[#222] hover:border-[#444] transition-all duration-300 flex flex-col';
        
        // 获取封面图
        let coverUrl = item.cover_url || item.cover || '';
        
        // 代理处理图片链接，防止跨域问题
        if (coverUrl && !coverUrl.startsWith('data:')) {
            coverUrl = `/api/proxy?url=${encodeURIComponent(coverUrl)}`;
        }
        
        // 构建卡片内容
        card.innerHTML = `
            <div class="aspect-[2/3] relative overflow-hidden bg-[#222]">
                <img src="${coverUrl}" alt="${item.title}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 hover:scale-110">
                ${item.rating ? `<div class="absolute top-0 right-0 bg-pink-600 text-white px-2 py-1 text-xs font-bold">${item.rating}</div>` : ''}
            </div>
            <div class="p-2 flex-1 flex flex-col">
                <h3 class="text-sm font-medium line-clamp-1 mb-1">${item.title}</h3>
                <p class="text-xs text-gray-400 line-clamp-1 flex-1">${item.year || ''}</p>
            </div>
        `;
        
        // 添加点击事件 - 填充搜索框并执行搜索
        card.addEventListener('click', () => fillAndSearch(item.title));
        
        // 添加到容器
        container.appendChild(card);
    });
}

// 填充搜索框并执行搜索
function fillAndSearch(title) {
    if (!title) return;
    
    // 安全处理标题，防止XSS
    const safeTitle = title
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = safeTitle;
        search(); // 使用已有的search函数执行搜索
        
        // 同时更新浏览器URL，使其反映当前的搜索状态
        try {
            // 使用URI编码确保特殊字符能够正确显示
            const encodedQuery = encodeURIComponent(safeTitle);
            // 使用HTML5 History API更新URL，不刷新页面
            window.history.pushState(
                { search: safeTitle }, 
                `搜索: ${safeTitle} - YTPPTV`, 
                `/?s=${encodedQuery}`
            );
            // 更新页面标题
            document.title = `搜索: ${safeTitle} - YTPPTV`;
        } catch (e) {
            console.error('更新浏览器历史失败:', e);
        }
    }
}

// 重置到首页
function resetToHome() {
    // 重置搜索输入
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    
    // 隐藏搜索结果
    const resultsArea = document.getElementById('resultsArea');
    if (resultsArea) {
        resultsArea.classList.add('hidden');
    }
    
    // 显示搜索区域
    const searchArea = document.getElementById('searchArea');
    if (searchArea) {
        searchArea.classList.remove('hidden');
    }
    
    // 根据豆瓣功能状态显示或隐藏豆瓣区域
    updateDoubanVisibility();
    
    // 重置页面标题
    document.title = 'YTPPTV';
    
    // 更新URL，不携带任何搜索参数
    try {
        window.history.pushState({}, 'YTPPTV', '/');
    } catch (e) {
        console.error('更新浏览器历史失败:', e);
    }
    
    // 滚动到页面顶部
    window.scrollTo(0, 0);
}

// 清除所有豆瓣缓存
function clearAllDoubanCache() {
    // 清空内存缓存
    for (let key in doubanCache) {
        delete doubanCache[key];
    }
}
