// 豆瓣热门电影电视剧推荐功能

// 定义不同类型的内容分类
const contentCategories = {
    movie: {
        comedy: '喜剧',
        action: '动作',
        scifi: '科幻',
        romance: '爱情',
        drama: '剧情'
    },
    tv: {
        hot: '热门',
        cn: '国产剧',
        kr: '韩剧',
        jp: '日剧',
        us: '美剧'
    },
    variety: {
        hot: '热门',
        cn: '中国',
        kr: '韩国',
        jp: '日本'
    }
};

// 保留原有的标签系统，用于兼容性
let defaultMovieTags = ['热门', '最新', '华语', '欧美', '韩国', '日本'];
let defaultTvTags = ['热门', '国产', '美剧', '韩剧', '日剧', '综艺'];
let movieTags = [];
let tvTags = [];
let doubanMovieTvCurrentSwitch = 'movie';
let doubanCurrentTag = '热门';
let doubanPageStart = 0;
const doubanPageSize = 6; // 每个分类显示的数量

// 初始化豆瓣功能
function initDouban() {
    // 设置豆瓣开关的初始状态
    const doubanToggle = document.getElementById('doubanToggle');
    if (doubanToggle) {
        const isEnabled = localStorage.getItem('doubanEnabled') === 'true';
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

        // 滚动到页面顶部
        window.scrollTo(0, 0);
    }

    // 加载用户标签（兼容旧版）
    loadUserTags();
    
    // 初始加载各分类内容
    if (localStorage.getItem('doubanEnabled') === 'true') {
        loadAllCategoryContent();
    }
    
    // 设置"更多"按钮点击事件
    setupMoreButtons();
}

// 加载用户标签（兼容旧版）
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

// 根据设置更新豆瓣区域的显示状态
function updateDoubanVisibility() {
    const doubanArea = document.getElementById('doubanArea');
    if (!doubanArea) return;
    
    const isEnabled = localStorage.getItem('doubanEnabled') === 'true';
    const isSearching = document.getElementById('resultsArea') && 
        !document.getElementById('resultsArea').classList.contains('hidden');
    
    // 只有在启用且没有搜索结果显示时才显示豆瓣区域
    if (isEnabled && !isSearching) {
        doubanArea.classList.remove('hidden');
        // 如果豆瓣结果为空，重新加载
        loadAllCategoryContent();
    } else {
        doubanArea.classList.add('hidden');
    }
}

// 加载所有分类内容
function loadAllCategoryContent() {
    // 加载电影分类
    for (const [key, value] of Object.entries(contentCategories.movie)) {
        fetchCategoryContent('movie', key, value);
    }
    
    // 加载电视剧分类
    fetchCategoryContent('tv', 'hot', '热门');
    
    // 加载综艺分类
    fetchCategoryContent('variety', 'hot', '热门');
}

// 设置"更多"按钮点击事件
function setupMoreButtons() {
    // 获取所有"更多"按钮
    const moreButtons = document.querySelectorAll('#doubanArea a[href="#"]');
    
    // 为每个按钮添加点击事件
    moreButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            
            // 获取分类名称
            const categoryTitle = this.closest('div').querySelector('h2').textContent;
            
            // 根据分类名称设置搜索内容
            let searchTerm = '';
            if (categoryTitle.includes('喜剧')) {
                searchTerm = '喜剧电影';
            } else if (categoryTitle.includes('动作')) {
                searchTerm = '动作电影';
            } else if (categoryTitle.includes('科幻')) {
                searchTerm = '科幻电影';
            } else if (categoryTitle.includes('爱情')) {
                searchTerm = '爱情电影';
            } else if (categoryTitle.includes('电视剧')) {
                searchTerm = '热门电视剧';
            } else if (categoryTitle.includes('综艺')) {
                searchTerm = '热门综艺';
            }
            
            // 填充搜索框并执行搜索
            if (searchTerm) {
                fillAndSearch(searchTerm);
            }
        });
    });
}

// 获取特定分类的内容
async function fetchCategoryContent(type, category, categoryName) {
    const containerClass = `douban-${type}-${category}`;
    const container = document.querySelector(`.${containerClass}`);
    if (!container) return;
    
    try {
        // 显示加载中状态
        container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">加载中...</div>';
        
        // 构建API请求URL
        let apiUrl = '';
        if (type === 'movie') {
            apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=${encodeURIComponent(categoryName)}&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
        } else if (type === 'tv') {
            apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=${encodeURIComponent(categoryName)}&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
        } else if (type === 'variety') {
            apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=${encodeURIComponent('综艺,'+categoryName)}&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
        }
        
        // 获取数据
        const data = await fetchDoubanData(apiUrl);
        
        // 渲染内容
        renderCategoryContent(data, container);
    } catch (error) {
        console.error(`获取${type}-${category}内容失败:`, error);
        container.innerHTML = `<div class="col-span-full text-center py-8 text-red-500">加载失败，请稍后再试</div>`;
    }
}

// 渲染分类内容
function renderCategoryContent(data, container) {
    if (!data || !data.subjects || data.subjects.length === 0) {
        container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">暂无内容</div>';
        return;
    }
    
    // 清空容器
    container.innerHTML = '';
    
    // 渲染每个项目
    data.subjects.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-[#111] hover:bg-[#222] transition-all duration-300 rounded-lg overflow-hidden flex flex-col transform hover:scale-105 shadow-md hover:shadow-lg';
        
        // 评分显示
        let ratingHtml = '';
        if (item.rate) {
            const rating = parseFloat(item.rate);
            ratingHtml = `
                <div class="absolute bottom-2 left-2 bg-black/70 text-yellow-400 px-2 py-1 text-xs font-bold rounded-sm flex items-center">
                    <span class="text-yellow-400">★</span> ${rating}
                </div>
            `;
        }
        
        // 安全处理标题，防止XSS
        const safeTitle = item.title
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        
        // 构建卡片HTML
        card.innerHTML = `
            <div class="relative w-full aspect-[2/3] overflow-hidden cursor-pointer" onclick="fillSearchInput('${safeTitle}')">
                <img src="${item.cover}" alt="${safeTitle}" 
                    class="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                    onerror="this.onerror=null; this.src='${PROXY_URL + encodeURIComponent(item.cover)}'; this.classList.add('object-contain');"
                    loading="lazy" referrerpolicy="no-referrer">
                <div class="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-60"></div>
                ${ratingHtml}
                <div class="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm hover:bg-[#333] transition-colors">
                    <a href="${item.url}" target="_blank" rel="noopener noreferrer" title="在豆瓣查看" onclick="event.stopPropagation();">
                        🔗
                    </a>
                </div>
            </div>
            <div class="p-2 text-center bg-[#111]">
                <button onclick="fillSearchInput('${safeTitle}')" 
                        class="text-sm font-medium text-white truncate w-full hover:text-pink-400 transition"
                        title="${safeTitle}">
                    ${safeTitle}
                </button>
            </div>
        `;
        
        // 添加到容器
        container.appendChild(card);
    });
}

// 从豆瓣API获取数据
async function fetchDoubanData(url) {
    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
    
    // 设置请求选项，包括信号和头部
    const fetchOptions = {
        signal: controller.signal,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Referer': 'https://movie.douban.com/',
            'Accept': 'application/json, text/plain, */*',
        }
    };

    try {
        // 尝试直接访问（豆瓣API可能允许部分CORS请求）
        const response = await fetch(PROXY_URL + encodeURIComponent(url), fetchOptions);
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        return await response.json();
    } catch (err) {
        console.error("豆瓣 API 请求失败（直接代理）：", err);
        
        // 失败后尝试备用方法：作为备选
        const fallbackUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        
        try {
            const fallbackResponse = await fetch(fallbackUrl);
            
            if (!fallbackResponse.ok) {
                throw new Error(`备用API请求失败! 状态: ${fallbackResponse.status}`);
            }
            
            const data = await fallbackResponse.json();
            
            // 解析原始内容
            if (data && data.contents) {
                return JSON.parse(data.contents);
            } else {
                throw new Error("无法获取有效数据");
            }
        } catch (fallbackErr) {
            console.error("豆瓣 API 备用请求也失败：", fallbackErr);
            throw fallbackErr; // 向上抛出错误，让调用者处理
        }
    }
}

// 只填充搜索框，不执行搜索，让用户自主决定搜索时机
function fillSearchInput(title) {
    if (!title) return;
    
    // 安全处理标题，防止XSS
    const safeTitle = title
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = safeTitle;
        
        // 聚焦搜索框，便于用户立即使用键盘操作
        input.focus();
        
        // 显示一个提示，告知用户点击搜索按钮进行搜索
        showToast('已填充搜索内容，点击搜索按钮开始搜索', 'info');
    }
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
                `/s=${encodedQuery}`
            );
            // 更新页面标题
            document.title = `搜索: ${safeTitle} - YTPPTV`;
        } catch (e) {
            console.error('更新浏览器历史失败:', e);
        }
    }
}

// 填充搜索框，确保豆瓣资源API被选中，然后执行搜索
async function fillAndSearchWithDouban(title) {
    if (!title) return;
    
    // 安全处理标题，防止XSS
    const safeTitle = title
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    
    // 确保豆瓣资源API被选中
    if (typeof selectedAPIs !== 'undefined' && !selectedAPIs.includes('dbzy')) {
        // 在设置中勾选豆瓣资源API复选框
        const doubanCheckbox = document.querySelector('input[id="api_dbzy"]');
        if (doubanCheckbox) {
            doubanCheckbox.checked = true;
            
            // 触发updateSelectedAPIs函数以更新状态
            if (typeof updateSelectedAPIs === 'function') {
                updateSelectedAPIs();
            } else {
                // 如果函数不可用，则手动添加到selectedAPIs
                selectedAPIs.push('dbzy');
                localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
                
                // 更新选中API计数（如果有这个元素）
                const countEl = document.getElementById('selectedAPICount');
                if (countEl) {
                    countEl.textContent = selectedAPIs.length;
                }
            }
            
            showToast('已自动选择豆瓣资源API', 'info');
        }
    }
    
    // 填充搜索框并执行搜索
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = safeTitle;
        await search(); // 使用已有的search函数执行搜索
        
        // 更新浏览器URL，使其反映当前的搜索状态
        try {
            // 使用URI编码确保特殊字符能够正确显示
            const encodedQuery = encodeURIComponent(safeTitle);
            // 使用HTML5 History API更新URL，不刷新页面
            window.history.pushState(
                { search: safeTitle }, 
                `搜索: ${safeTitle} - YTPPTV`, 
                `/s=${encodedQuery}`
            );
            // 更新页面标题
            document.title = `搜索: ${safeTitle} - YTPPTV`;
        } catch (e) {
            console.error('更新浏览器历史失败:', e);
        }

        if (window.innerWidth <= 768) {
          window.scrollTo({
              top: 0,
              behavior: 'smooth'
          });
        }
    }
}

// 重置到首页
function resetToHome() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    
    const resultsArea = document.getElementById('resultsArea');
    if (resultsArea) resultsArea.classList.add('hidden');
    
    updateDoubanVisibility();
    
    // 更新URL，移除搜索参数
    try {
        window.history.pushState({}, 'YTPPTV', '/');
        document.title = 'YTPPTV';
    } catch (e) {
        console.error('更新浏览器历史失败:', e);
    }
}

// 加载豆瓣首页内容
document.addEventListener('DOMContentLoaded', initDouban);
