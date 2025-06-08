// 豆瓣热门电影电视剧推荐功能

// 定义不同类型的内容分类
const contentCategories = {
    movie: {
        hot: '热门',
        coming: '即将上映',
        new: '新片',
        top250: 'top250'
    },
    tv: {
        hot: '热门',
        animation: '动漫',
        us: '美剧',
        hk: '港澳剧',
        kr: '韩剧',
        jp: '日剧'
    },
    variety: {
        hot: '热门'
    }
};

// 默认每个分类显示的数量，固定为7个
const doubanPageSize = 7;

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
    
    // 初始加载各分类内容
    if (localStorage.getItem('doubanEnabled') === 'true') {
        loadAllCategoryContent();
    }
    
    // 设置"更多"按钮点击事件
    setupMoreButtons();
    
    // 添加豆瓣设置到设置面板
    addDoubanSettings();
}

// 添加豆瓣设置到设置面板
function addDoubanSettings() {
    // 不再需要添加豆瓣设置，因为我们固定显示7个
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
    // 1. 热门电视剧
    fetchCategoryContent('tv', 'hot', '热门');
    
    // 2. 热门综艺
    fetchCategoryContent('variety', 'hot', '热门');
    
    // 3. 热门电影
    fetchCategoryContent('movie', 'hot', '热门');
    
    // 4. 热门动画
    fetchCategoryContent('movie', 'animation', '动画');
    
    // 5. 新片榜单
    fetchCategoryContent('movie', 'new', '最新');
    
    // 6. 热门美剧
    fetchCategoryContent('tv', 'us', '美剧');
    
    // 7. 热门港剧
    fetchCategoryContent('tv', 'hk', '港剧');
    
    // 8. 热门韩剧
    fetchCategoryContent('tv', 'kr', '韩剧');
    
    // 9. 热门日剧
    fetchCategoryContent('tv', 'jp', '日剧');
    
    // 10. Top250电影
    fetchCategoryContent('movie', 'top250', '豆瓣高分');
}

// 设置"更多"按钮点击事件
function setupMoreButtons() {
    // 获取所有"更多"按钮
    const moreButtons = document.querySelectorAll('#doubanArea a[href="#"]');
    
    // 为每个按钮添加点击事件
    moreButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            
            // 获取分类和类型属性
            const category = this.dataset.category;
            const type = this.dataset.type;
            
            // 显示加载中状态
            showLoading();
            
            // 获取更多该分类内容
            fetchMoreCategoryContent(type, category)
                .then(data => {
                    if (!data || !data.subjects || data.subjects.length === 0) {
                        showToast('没有更多内容', 'info');
                        hideLoading();
                        return;
                    }
                    
                    // 显示模态框并填充内容
                    showCategoryModal(data.subjects, getCategoryTitle(type, category));
                })
                .catch(error => {
                    console.error('获取更多内容失败:', error);
                    showToast('获取更多内容失败，请稍后再试', 'error');
                })
                .finally(() => {
                    hideLoading();
                });
        });
    });
}

// 获取分类标题
function getCategoryTitle(type, category) {
    if (type === 'movie') {
        if (category === 'hot') return '热门电影';
        if (category === 'new') return '新片榜单';
        if (category === 'top250') return 'Top250电影';
        if (category === 'animation') return '热门动画';
        return '电影';
    } else if (type === 'tv') {
        if (category === 'hot') return '热门电视剧';
        if (category === 'us') return '热门美剧';
        if (category === 'hk') return '热门港剧';
        if (category === 'kr') return '热门韩剧';
        if (category === 'jp') return '热门日剧';
        return '电视剧';
    } else if (type === 'variety') {
        return '热门综艺';
    }
    return '影视内容';
}

// 获取更多分类内容
async function fetchMoreCategoryContent(type, category) {
    try {
        // 构建API请求URL，增加数量
        let apiUrl = '';
        
        // 根据不同的分类使用不同的API或参数
        if (type === 'movie') {
            if (category === 'top250') {
                // Top250使用特殊API
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=豆瓣高分&sort=rank&page_limit=18&page_start=0`;
            } else if (category === 'new') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=最新&sort=time&page_limit=18&page_start=0`;
            } else if (category === 'animation') {
                // 动画使用动画标签
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=动画&sort=time&page_limit=18&page_start=0`;
            } else if (category === 'hot') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=热门&sort=time&page_limit=18&page_start=0`;
            } else {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=热门&sort=time&page_limit=18&page_start=0`;
            }
        } else if (type === 'tv') {
            if (category === 'hot') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=热门&sort=time&page_limit=18&page_start=0`;
            } else if (category === 'us') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=美剧&sort=time&page_limit=18&page_start=0`;
            } else if (category === 'hk') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=港剧&sort=time&page_limit=18&page_start=0`;
            } else if (category === 'kr') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=韩剧&sort=time&page_limit=18&page_start=0`;
            } else if (category === 'jp') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=日剧&sort=time&page_limit=18&page_start=0`;
            } else {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=热门&sort=time&page_limit=18&page_start=0`;
            }
        } else if (type === 'variety') {
            apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=综艺&sort=time&page_limit=18&page_start=0`;
        }
        
        // 获取数据
        const data = await fetchDoubanData(apiUrl);
        return data;
    } catch (error) {
        console.error('获取更多内容失败:', error);
        throw error;
    }
}

// 显示分类模态框
function showCategoryModal(items, title) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');
    
    // 设置标题
    modalTitle.textContent = title || '影视内容';
    
    // 构建内容HTML
    let contentHTML = `
        <div id="infiniteScrollContainer" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            ${renderModalItems(items)}
        </div>
        <div id="loadingMore" class="text-center py-4 hidden">
            <div class="inline-block w-6 h-6 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
            <p class="text-gray-400 mt-2">加载更多内容...</p>
        </div>
        <div id="noMoreContent" class="text-center py-4 text-gray-500 hidden">
            没有更多内容了
        </div>
    `;
    
    modalContent.innerHTML = contentHTML;
    
    // 保存当前分类和类型到模态框数据属性
    modal.dataset.currentType = title.includes('电影') ? 'movie' : (title.includes('综艺') ? 'variety' : 'tv');
    modal.dataset.currentCategory = getCategoryFromTitle(title);
    modal.dataset.currentPage = 1; // 从第1页开始，第0页已经加载
    
    // 显示模态框
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // 设置滚动监听
    setupInfiniteScroll();
}

// 从标题获取分类
function getCategoryFromTitle(title) {
    if (title.includes('新片榜单')) return 'new';
    if (title.includes('Top250')) return 'top250';
    if (title.includes('动画')) return 'animation';
    if (title.includes('美剧')) return 'us';
    if (title.includes('港澳剧')) return 'hk';
    if (title.includes('韩剧')) return 'kr';
    if (title.includes('日剧')) return 'jp';
    return 'hot';
}

// 渲染模态框内的项目
function renderModalItems(items) {
    if (!items || items.length === 0) return '';
    
    let itemsHTML = '';
    
    // 渲染每个项目
    items.forEach(item => {
        // 评分显示
        let ratingHtml = '';
        if (item.rate && item.rate !== '0') {
            const rating = parseFloat(item.rate);
            ratingHtml = `
                <div class="absolute bottom-2 left-2 bg-black/70 text-yellow-400 px-2 py-1 text-xs font-bold rounded-sm flex items-center h-6">
                    <span class="text-yellow-400">★</span> ${rating}
                </div>
            `;
        } else {
            // 为没有评分的项目添加一个占位符，保持卡片高度一致
            ratingHtml = `
                <div class="absolute bottom-2 left-2 bg-transparent px-2 py-1 h-6"></div>
            `;
        }
        
        // 安全处理标题，防止XSS
        const safeTitle = item.title
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        
        // 构建卡片HTML
        itemsHTML += `
            <div class="bg-[#111] hover:bg-[#222] transition-all duration-300 rounded-lg overflow-hidden flex flex-col transform hover:scale-105 shadow-md hover:shadow-lg">
                <div class="relative w-full aspect-[2/3] overflow-hidden cursor-pointer" onclick="fillAndSearchWithDouban('${safeTitle}')">
                    <img src="${item.cover}" alt="${safeTitle}" 
                        class="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                        onerror="this.onerror=null; this.src='${PROXY_URL + encodeURIComponent(item.cover)}'; this.classList.add('object-contain');"
                        loading="lazy" referrerpolicy="no-referrer">
                    <div class="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-60"></div>
                    ${ratingHtml}
                    <div class="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm hover:bg-[#333] transition-colors h-6 flex items-center">
                        <a href="${item.url}" target="_blank" rel="noopener noreferrer" title="在豆瓣查看" onclick="event.stopPropagation();">
                            🔗
                        </a>
                    </div>
                </div>
                <div class="p-2 text-center bg-[#111]">
                    <button onclick="fillAndSearchWithDouban('${safeTitle}')" 
                            class="text-sm font-medium text-white truncate w-full hover:text-pink-400 transition"
                            title="${safeTitle}">
                        ${safeTitle}
                    </button>
                </div>
            </div>
        `;
    });
    
    return itemsHTML;
}

// 设置无限滚动
function setupInfiniteScroll() {
    const modalContent = document.getElementById('modalContent');
    const loadingMore = document.getElementById('loadingMore');
    const noMoreContent = document.getElementById('noMoreContent');
    const container = document.getElementById('infiniteScrollContainer');
    const modal = document.getElementById('modal');
    
    // 设置滚动事件监听
    modalContent.addEventListener('scroll', debounce(function() {
        // 检查是否已经滚动到底部
        if (modalContent.scrollHeight - modalContent.scrollTop - modalContent.clientHeight < 100) {
            // 如果正在加载或没有更多内容，则不执行
            if (loadingMore.classList.contains('flex') || noMoreContent.classList.contains('flex')) {
                return;
            }
            
            // 显示加载中
            loadingMore.classList.remove('hidden');
            loadingMore.classList.add('flex');
            
            // 获取当前页码并增加
            const currentPage = parseInt(modal.dataset.currentPage) || 1;
            const nextPage = currentPage + 1;
            modal.dataset.currentPage = nextPage;
            
            // 获取当前类型和分类
            const type = modal.dataset.currentType;
            const category = modal.dataset.currentCategory;
            
            // 加载更多内容
            loadMoreItems(type, category, nextPage)
                .then(items => {
                    // 隐藏加载中
                    loadingMore.classList.remove('flex');
                    loadingMore.classList.add('hidden');
                    
                    if (!items || items.length === 0) {
                        // 显示没有更多内容
                        noMoreContent.classList.remove('hidden');
                        noMoreContent.classList.add('flex');
                        return;
                    }
                    
                    // 追加新内容
                    container.innerHTML += renderModalItems(items);
                })
                .catch(error => {
                    console.error('加载更多内容失败:', error);
                    
                    // 隐藏加载中
                    loadingMore.classList.remove('flex');
                    loadingMore.classList.add('hidden');
                    
                    // 显示错误信息
                    showToast('加载更多内容失败，请稍后再试', 'error');
                });
        }
    }, 200));
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

// 加载更多内容
async function loadMoreItems(type, category, page) {
    try {
        // 构建API请求URL
        let apiUrl = '';
        
        // 根据不同的分类使用不同的API或参数
        if (type === 'movie') {
            if (category === 'top250') {
                // Top250使用特殊API
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=豆瓣高分&sort=rank&page_limit=18&page_start=${page * 18}`;
            } else if (category === 'new') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=最新&sort=time&page_limit=18&page_start=${page * 18}`;
            } else if (category === 'animation') {
                // 动画使用动画标签
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=动画&sort=time&page_limit=18&page_start=${page * 18}`;
            } else if (category === 'hot') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=热门&sort=time&page_limit=18&page_start=${page * 18}`;
            } else {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=热门&sort=time&page_limit=18&page_start=${page * 18}`;
            }
        } else if (type === 'tv') {
            if (category === 'hot') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=热门&sort=time&page_limit=18&page_start=${page * 18}`;
            } else if (category === 'us') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=美剧&sort=time&page_limit=18&page_start=${page * 18}`;
            } else if (category === 'hk') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=港剧&sort=time&page_limit=18&page_start=${page * 18}`;
            } else if (category === 'kr') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=韩剧&sort=time&page_limit=18&page_start=${page * 18}`;
            } else if (category === 'jp') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=日剧&sort=time&page_limit=18&page_start=${page * 18}`;
            } else {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=热门&sort=time&page_limit=18&page_start=${page * 18}`;
            }
        } else if (type === 'variety') {
            apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=综艺&sort=time&page_limit=18&page_start=${page * 18}`;
        }
        
        // 获取数据
        const data = await fetchDoubanData(apiUrl);
        return data.subjects || [];
    } catch (error) {
        console.error('加载更多内容失败:', error);
        throw error;
    }
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
        
        // 根据不同的分类使用不同的API或参数
        if (type === 'movie') {
            if (category === 'top250') {
                // Top250使用特殊API
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=豆瓣高分&sort=rank&page_limit=${doubanPageSize}&page_start=0`;
            } else if (category === 'new') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=最新&sort=time&page_limit=${doubanPageSize}&page_start=0`;
            } else if (category === 'animation') {
                // 动画使用动画标签
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=动画&sort=time&page_limit=${doubanPageSize}&page_start=0`;
            } else {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=${encodeURIComponent(categoryName)}&sort=time&page_limit=${doubanPageSize}&page_start=0`;
            }
        } else if (type === 'tv') {
            if (category === 'us') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=美剧&sort=time&page_limit=${doubanPageSize}&page_start=0`;
            } else if (category === 'hk') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=港剧&sort=time&page_limit=${doubanPageSize}&page_start=0`;
            } else if (category === 'kr') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=韩剧&sort=time&page_limit=${doubanPageSize}&page_start=0`;
            } else if (category === 'jp') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=日剧&sort=time&page_limit=${doubanPageSize}&page_start=0`;
            } else {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=热门&sort=time&page_limit=${doubanPageSize}&page_start=0`;
            }
        } else if (type === 'variety') {
            // 修改综艺API请求，确保能获取到综艺内容
            apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=综艺&sort=time&page_limit=${doubanPageSize}&page_start=0`;
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
        if (item.rate && item.rate !== '0') {
            const rating = parseFloat(item.rate);
            ratingHtml = `
                <div class="absolute bottom-2 left-2 bg-black/70 text-yellow-400 px-2 py-1 text-xs font-bold rounded-sm flex items-center h-6">
                    <span class="text-yellow-400">★</span> ${rating}
                </div>
            `;
        } else {
            // 为没有评分的项目添加一个占位符，保持卡片高度一致
            ratingHtml = `
                <div class="absolute bottom-2 left-2 bg-transparent px-2 py-1 h-6"></div>
            `;
        }
        
        // 安全处理标题，防止XSS
        const safeTitle = item.title
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        
        // 构建卡片HTML
        card.innerHTML = `
            <div class="relative w-full aspect-[2/3] overflow-hidden cursor-pointer" onclick="fillAndSearchWithDouban('${safeTitle}')">
                <img src="${item.cover}" alt="${safeTitle}" 
                    class="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                    onerror="this.onerror=null; this.src='${PROXY_URL + encodeURIComponent(item.cover)}'; this.classList.add('object-contain');"
                    loading="lazy" referrerpolicy="no-referrer">
                <div class="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-60"></div>
                ${ratingHtml}
                <div class="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm hover:bg-[#333] transition-colors h-6 flex items-center">
                    <a href="${item.url}" target="_blank" rel="noopener noreferrer" title="在豆瓣查看" onclick="event.stopPropagation();">
                        🔗
                    </a>
                </div>
            </div>
            <div class="p-2 text-center bg-[#111]">
                <button onclick="fillAndSearchWithDouban('${safeTitle}')" 
                        class="text-sm font-medium text-white truncate w-full hover:text-pink-400 transition"
                        title="${safeTitle}">
                    ${safeTitle}
                </button>
            </div>
        `;
        
        // 添加到容器
        container.appendChild(card);
    });
    
    // 检查子元素数量，根据屏幕宽度决定何时添加scrollable类
    const isMobile = window.innerWidth <= 767;
    const threshold = isMobile ? 3 : 7;
    
    if (container.children.length >= (isMobile ? 4 : 8)) {
        container.classList.add('scrollable');
    } else {
        container.classList.remove('scrollable');
    }
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

// 填充搜索框，确保豆瓣资源API被选中，然后执行搜索
async function fillAndSearchWithDouban(title) {
    if (!title) return;
    
    // 安全处理标题，防止XSS
    const safeTitle = title
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    
    // 关闭模态框
    const modal = document.getElementById('modal');
    if (modal && !modal.classList.contains('hidden')) {
        closeModal();
    }
    
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

// 监听窗口大小变化，动态调整滚动条显示
window.addEventListener('resize', function() {
    // 获取所有豆瓣内容容器
    const containers = document.querySelectorAll('[class^="douban-"]');
    containers.forEach(container => {
        const isMobile = window.innerWidth <= 767;
        const threshold = isMobile ? 3 : 7;
        
        if (container.children.length > threshold) {
            container.classList.add('scrollable');
        } else {
            container.classList.remove('scrollable');
        }
    });
});
