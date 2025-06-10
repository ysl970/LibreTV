// 豆瓣热门电影电视剧推荐功能

// 使用config.js中定义的PROXY_URL常量
// const PROXY_URL = '/proxy/';

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

// 添加内容加载状态跟踪
const doubanLoadStatus = {
    initialized: false,
    priorityLoaded: false,
    secondaryLoaded: false,
    finalLoaded: false
};

// 内存缓存对象
const doubanCache = {};
// 缓存过期时间（24小时）
const CACHE_EXPIRY = 24 * 60 * 60 * 1000;

// 初始化豆瓣功能
function initDouban() {
    // 设置豆瓣开关的初始状态
    const doubanToggle = document.getElementById('doubanToggle');
    if (doubanToggle) {
        doubanToggle.checked = localStorage.getItem('doubanEnabled') !== 'false';
    }

    // 立即更新豆瓣区域显示状态
    updateDoubanVisibility();

    // 设置豆瓣开关事件监听
    if (doubanToggle) {
        doubanToggle.addEventListener('change', function() {
            localStorage.setItem('doubanEnabled', this.checked);
            updateDoubanVisibility();
        });
    }

    // 设置"更多"按钮事件
    setupMoreButtons();

    // 初始化懒加载
    initializeLazyLoading();
    
    // 如果豆瓣功能已启用，加载所有分类内容
    if (localStorage.getItem('doubanEnabled') !== 'false') {
        loadAllCategoryContent();
    }
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
        
        // 检查是否需要初始化内容
        if (!doubanLoadStatus.initialized) {
            // 使用 requestAnimationFrame 确保在下一帧渲染时加载内容
            requestAnimationFrame(() => {
                loadAllCategoryContent();
                doubanLoadStatus.initialized = true;
            });
        } else {
            // 检查豆瓣内容是否需要刷新
            const containers = document.querySelectorAll('[class^="douban-"]');
            let isEmpty = true;
            
            containers.forEach(container => {
                if (container.children.length > 0) {
                    isEmpty = false;
                }
            });
            
            if (isEmpty) {
                // 如果所有容器都是空的，重新加载内容
                loadAllCategoryContent();
            } else {
                // 重新初始化懒加载，确保图片正确加载
                reinitializeLazyLoading();
            }
        }
    } else {
        doubanArea.classList.add('hidden');
    }
}

// 重新初始化所有容器中的懒加载图片
function reinitializeLazyLoading() {
    const containers = document.querySelectorAll('[class^="douban-"]');
    containers.forEach(container => {
        initLazyLoading(container);
    });
}

// 加载所有分类内容
function loadAllCategoryContent() {
    // 优先加载的内容（首屏可见内容）
    const priorityLoad = () => {
        // 1. 热门电影（最受关注）
        fetchCategoryContent('movie', 'hot', '热门');
        
        // 2. 热门电视剧
        fetchCategoryContent('tv', 'hot', '热门');
        
        doubanLoadStatus.priorityLoaded = true;
    };
    
    // 第二批加载（稍后加载）
    const secondaryLoad = () => {
        // 3. 热门综艺
        fetchCategoryContent('variety', 'hot', '热门');
        
        // 4. 热门动画
        fetchCategoryContent('movie', 'animation', '动画');
        
        // 5. 新片榜单
        fetchCategoryContent('movie', 'new', '最新');
        
        doubanLoadStatus.secondaryLoaded = true;
    };
    
    // 最后加载（用户可能需要滚动才能看到的内容）
    const finalLoad = () => {
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
        
        doubanLoadStatus.finalLoaded = true;
    };

    // 使用 requestAnimationFrame 确保在下一帧渲染时加载内容
    requestAnimationFrame(() => {
        // 立即加载首屏内容（如果尚未加载）
        if (!doubanLoadStatus.priorityLoaded) {
            priorityLoad();
        }
        
        // 第二批内容（如果尚未加载）
        if (!doubanLoadStatus.secondaryLoaded) {
            setTimeout(secondaryLoad, 100);
        }
        
        // 最后加载的内容（如果尚未加载）
        if (!doubanLoadStatus.finalLoaded) {
            setTimeout(finalLoad, 200);
        }
    });
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
            fetchMoreCategoryContent(type, category);
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

// 获取更多特定分类的内容
async function fetchMoreCategoryContent(type, category) {
    try {
        // 构建API请求URL
        let apiUrl = '';
        let categoryName = getCategoryTitle(type, category);
        
        // 根据不同的分类使用不同的API或参数
        if (type === 'movie') {
            if (category === 'top250') {
                // Top250使用特殊API
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=豆瓣高分&sort=recommend&page_limit=50&page_start=0`;
            } else if (category === 'new') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=最新&sort=time&page_limit=50&page_start=0`;
            } else if (category === 'animation') {
                // 热门动画需要同时获取电影动画和电视动画
                // 这里先获取电影动画，后面会合并电视动画
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=动画&sort=recommend&page_limit=50&page_start=0`;
            } else if (category === 'hot') {
                // 热门电影
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=热门&sort=recommend&page_limit=50&page_start=0`;
            } else {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=${encodeURIComponent(categoryName)}&sort=recommend&page_limit=50&page_start=0`;
            }
        } else if (type === 'tv') {
            if (category === 'us') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=美剧&genres=美国&sort=recommend&page_limit=50&page_start=0`;
            } else if (category === 'hk') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=港剧&genres=香港&sort=recommend&page_limit=50&page_start=0`;
            } else if (category === 'kr') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=韩剧&genres=韩国&sort=recommend&page_limit=50&page_start=0`;
            } else if (category === 'jp') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=日剧&genres=日本&sort=recommend&page_limit=50&page_start=0`;
            } else if (category === 'hot') {
                // 热门电视剧
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=热门&sort=recommend&page_limit=50&page_start=0`;
            } else {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=${encodeURIComponent(categoryName)}&sort=recommend&page_limit=50&page_start=0`;
            }
        } else if (type === 'variety') {
            // 修改综艺API请求，确保能获取到综艺内容
            apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=综艺&sort=recommend&page_limit=50&page_start=0`;
        }
        
        // 获取数据
        const data = await fetchDoubanData(apiUrl);
        
        // 如果是动画分类，还需要获取电视动画并合并数据
        if (type === 'movie' && category === 'animation') {
            try {
                // 获取电视动画数据
                const tvAnimationUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=动画&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
                const tvAnimationData = await fetchDoubanData(tvAnimationUrl);
                
                // 合并电影动画和电视动画数据
                if (tvAnimationData && tvAnimationData.subjects && tvAnimationData.subjects.length > 0) {
                    // 确保data.subjects存在
                    if (!data.subjects) {
                        data.subjects = [];
                    }
                    
                    // 合并两组数据
                    const allSubjects = [...data.subjects, ...tvAnimationData.subjects];
                    
                    // 根据评分排序（高分在前）
                    allSubjects.sort((a, b) => {
                        const rateA = parseFloat(a.rate) || 0;
                        const rateB = parseFloat(b.rate) || 0;
                        return rateB - rateA;
                    });
                    
                    // 限制数量为原来的大小
                    data.subjects = allSubjects.slice(0, doubanPageSize);
                }
            } catch (error) {
                console.error('获取电视动画数据失败:', error);
            }
        }
        
        // 显示模态框
        if (data && data.subjects && data.subjects.length > 0) {
            showCategoryModal(data.subjects, categoryName, type, category);
        } else {
            showToast('没有更多内容', 'info');
        }
        
        hideLoading();
    } catch (error) {
        console.error(`获取更多${type}-${category}内容失败:`, error);
        showToast('加载失败，请稍后再试', 'error');
        hideLoading();
    }
}

// 显示分类模态框
function showCategoryModal(items, title, type, category) {
    // 创建模态框
    let modal = document.getElementById('categoryModal');
    if (modal) {
        document.body.removeChild(modal);
    }
    
    // 创建新的模态框
    modal = document.createElement('div');
    modal.id = 'categoryModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4';
    
    // 模态框内容
    modal.innerHTML = `
        <div class="bg-[#111] rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div class="flex justify-between items-center p-4 border-b border-[#333]">
                <h3 class="text-xl font-bold text-white">${title}</h3>
                <button id="closeModal" class="text-gray-400 hover:text-white transition-colors">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div id="modalItemsContainer" class="flex-1 overflow-y-auto p-4">
                <div id="modalItems" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    <!-- 项目将在这里渲染 -->
                </div>
                <div id="loadingMore" class="text-center py-4 hidden">
                    <div class="inline-block w-6 h-6 border-2 border-gray-400 border-t-pink-500 rounded-full animate-spin"></div>
                    <span class="ml-2 text-gray-400">加载更多...</span>
                </div>
                <div id="noMoreItems" class="text-center py-4 text-gray-500 hidden">
                    没有更多内容
                </div>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(modal);
    
    // 关闭按钮事件
    document.getElementById('closeModal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // 渲染项目
    renderModalItems(items);
    
    // 设置无限滚动
    setupInfiniteScroll(type, category);
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

// 渲染模态框中的项目
function renderModalItems(items) {
    if (!items || items.length === 0) {
        return '<div class="col-span-full text-center py-8 text-gray-500">暂无内容</div>';
    }
    
    const container = document.getElementById('modalItems');
    if (!container) return;
    
    // 清空容器
    container.innerHTML = '';
    
    // 创建文档片段
    const fragment = document.createDocumentFragment();
    
    // 渲染每个项目
    items.forEach(item => {
        // 创建卡片元素
        const card = document.createElement('div');
        card.className = 'bg-[#111] hover:bg-[#222] transition-all duration-300 rounded-lg overflow-hidden flex flex-col transform hover:scale-105 shadow-md hover:shadow-lg';
        
        // 安全处理标题，防止XSS
        const safeTitle = item.title
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        
        // 评分处理
        let ratingHtml = '';
        if (item.rate && parseFloat(item.rate) > 0) {
            const rating = parseFloat(item.rate);
            const ratingClass = rating >= 8 ? 'text-green-500' : (rating >= 6 ? 'text-yellow-500' : 'text-red-500');
            ratingHtml = `
                <div class="absolute top-2 right-2 bg-black/70 ${ratingClass} text-xs px-2 py-1 rounded-sm">
                    ${rating}分
                </div>
            `;
        }
        
        // 处理图片URL
        const originalCoverUrl = item.cover;
        const proxiedCoverUrl = PROXY_URL + encodeURIComponent(originalCoverUrl);
        
        // 构建卡片HTML
        card.innerHTML = `
            <div class="relative w-full aspect-[2/3] overflow-hidden cursor-pointer" onclick="fillAndSearchWithDouban('${safeTitle}')">
                <img src="${originalCoverUrl}" 
                    alt="${safeTitle}" 
                    class="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                    onerror="this.onerror=null; this.src='${proxiedCoverUrl}'; this.classList.add('object-contain');"
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
                <button onclick="fillAndSearchWithDouban('${safeTitle}')" 
                        class="text-sm font-medium text-white truncate w-full hover:text-pink-400 transition"
                        title="${safeTitle}">
                    ${safeTitle}
                </button>
            </div>
        `;
        
        // 添加到文档片段
        fragment.appendChild(card);
    });
    
    // 一次性添加所有元素到DOM
    container.appendChild(fragment);
}

// 存储滚动事件处理器，用于清除
let modalScrollHandler;

// 设置无限滚动
function setupInfiniteScroll(type, category) {
    const modalContent = document.getElementById('modalItemsContainer');
    const loadingMore = document.getElementById('loadingMore');
    const noMoreContent = document.getElementById('noMoreItems');
    const container = document.getElementById('modalItems');
    const modal = document.getElementById('categoryModal');
    
    // 清除旧的事件监听器，防止重复绑定
    if (modalScrollHandler) {
        modalContent.removeEventListener('scroll', modalScrollHandler);
    }
    
    // 当前页码
    let currentPage = 0;
    // 是否正在加载
    let isLoading = false;
    // 是否已加载所有内容
    let allLoaded = false;
    
    // 滚动处理函数
    modalScrollHandler = debounce(function() {
        // 如果已经加载完所有内容或者正在加载，则不处理
        if (allLoaded || isLoading) return;
        
        // 计算是否滚动到底部附近
        const scrollPosition = modalContent.scrollTop + modalContent.clientHeight;
        const scrollHeight = modalContent.scrollHeight;
        
        // 当滚动到距离底部100px时，加载更多
        if (scrollPosition >= scrollHeight - 100) {
            // 设置加载状态
            isLoading = true;
            loadingMore.classList.remove('hidden');
            
            // 加载下一页
            currentPage++;
            
            loadMoreItems(type, category, currentPage)
                .then(data => {
                    if (!data || !data.subjects || data.subjects.length === 0) {
                        // 没有更多内容
                        allLoaded = true;
                        noMoreContent.classList.remove('hidden');
                        return;
                    }
                    
                    // 渲染新内容
                    renderModalItems(data.subjects);
                })
                .catch(error => {
                    console.error('加载更多内容失败:', error);
                    showToast('加载更多内容失败，请稍后再试', 'error');
                })
                .finally(() => {
                    // 重置加载状态
                    isLoading = false;
                    loadingMore.classList.add('hidden');
                });
        }
    }, 200);
    
    // 添加滚动事件监听
    modalContent.addEventListener('scroll', modalScrollHandler);
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

// 加载更多项目（用于无限滚动）
async function loadMoreItems(type, category, page) {
    try {
        // 构建API请求URL
        let apiUrl = '';
        let categoryName = getCategoryTitle(type, category);
        
        // 根据不同的分类使用不同的API或参数
        if (type === 'movie') {
            if (category === 'top250') {
                // Top250使用特殊API
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=豆瓣高分&sort=recommend&page_limit=20&page_start=${page * 20}`;
            } else if (category === 'new') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=最新&sort=time&page_limit=20&page_start=${page * 20}`;
            } else if (category === 'animation') {
                // 热门动画需要同时获取电影动画和电视动画
                // 这里先获取电影动画，后面会合并电视动画
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=动画&sort=recommend&page_limit=20&page_start=${page * 20}`;
            } else if (category === 'hot') {
                // 热门电影
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=热门&sort=recommend&page_limit=20&page_start=${page * 20}`;
            } else {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=${encodeURIComponent(categoryName)}&sort=recommend&page_limit=20&page_start=${page * 20}`;
            }
        } else if (type === 'tv') {
            if (category === 'us') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=美剧&genres=美国&sort=recommend&page_limit=20&page_start=${page * 20}`;
            } else if (category === 'hk') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=港剧&genres=香港&sort=recommend&page_limit=20&page_start=${page * 20}`;
            } else if (category === 'kr') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=韩剧&genres=韩国&sort=recommend&page_limit=20&page_start=${page * 20}`;
            } else if (category === 'jp') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=日剧&genres=日本&sort=recommend&page_limit=20&page_start=${page * 20}`;
            } else if (category === 'hot') {
                // 热门电视剧
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=热门&sort=recommend&page_limit=20&page_start=${page * 20}`;
            } else {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=${encodeURIComponent(categoryName)}&sort=recommend&page_limit=20&page_start=${page * 20}`;
            }
        } else if (type === 'variety') {
            // 修改综艺API请求，确保能获取到综艺内容
            apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=综艺&sort=recommend&page_limit=20&page_start=${page * 20}`;
        }
        
        // 获取数据
        const data = await fetchDoubanData(apiUrl);
        
        // 如果是动画分类，还需要获取电视动画并合并数据
        if (type === 'movie' && category === 'animation') {
            try {
                // 获取电视动画数据
                const tvAnimationUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=动画&sort=recommend&page_limit=20&page_start=${page * 20}`;
                const tvAnimationData = await fetchDoubanData(tvAnimationUrl);
                
                // 合并电影动画和电视动画数据
                if (tvAnimationData && tvAnimationData.subjects && tvAnimationData.subjects.length > 0) {
                    // 确保data.subjects存在
                    if (!data.subjects) {
                        data.subjects = [];
                    }
                    
                    // 合并两组数据
                    const allSubjects = [...data.subjects, ...tvAnimationData.subjects];
                    
                    // 根据评分排序（高分在前）
                    allSubjects.sort((a, b) => {
                        const rateA = parseFloat(a.rate) || 0;
                        const rateB = parseFloat(b.rate) || 0;
                        return rateB - rateA;
                    });
                    
                    // 限制数量为原来的大小
                    data.subjects = allSubjects.slice(0, 20);
                }
            } catch (error) {
                console.error('获取电视动画数据失败:', error);
            }
        }
        
        return data;
    } catch (error) {
        console.error(`加载更多${type}-${category}内容失败:`, error);
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
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=豆瓣高分&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
            } else if (category === 'new') {
                // 新片榜单使用时间排序确保是最新的
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=最新&sort=time&page_limit=${doubanPageSize}&page_start=0`;
            } else if (category === 'animation') {
                // 热门动画需要同时获取电影动画和电视动画
                // 这里先获取电影动画，后面会合并电视动画
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=动画&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
            } else if (category === 'hot') {
                // 热门电影
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=热门&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
            } else {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=${encodeURIComponent(categoryName)}&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
            }
        } else if (type === 'tv') {
            if (category === 'us') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=美剧&genres=美国&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
            } else if (category === 'hk') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=港剧&genres=香港&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
            } else if (category === 'kr') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=韩剧&genres=韩国&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
            } else if (category === 'jp') {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=日剧&genres=日本&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
            } else if (category === 'hot') {
                // 热门电视剧
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=热门&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
            } else {
                apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=${encodeURIComponent(categoryName)}&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
            }
        } else if (type === 'variety') {
            // 综艺节目使用正确的标签
            apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=综艺&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
        }
        
        console.log(`加载分类 ${type}-${category}: ${apiUrl}`);
        
        // 获取数据
        const data = await fetchDoubanData(apiUrl);
        
        // 如果是动画分类，还需要获取电视动画并合并数据
        if (type === 'movie' && category === 'animation') {
            try {
                // 获取电视动画数据
                const tvAnimationUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=动画&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
                const tvAnimationData = await fetchDoubanData(tvAnimationUrl);
                
                // 合并电影动画和电视动画数据
                if (tvAnimationData && tvAnimationData.subjects && tvAnimationData.subjects.length > 0) {
                    // 确保data.subjects存在
                    if (!data.subjects) {
                        data.subjects = [];
                    }
                    
                    // 合并两组数据
                    const allSubjects = [...data.subjects, ...tvAnimationData.subjects];
                    
                    // 根据评分排序（高分在前）
                    allSubjects.sort((a, b) => {
                        const rateA = parseFloat(a.rate) || 0;
                        const rateB = parseFloat(b.rate) || 0;
                        return rateB - rateA;
                    });
                    
                    // 限制数量为原来的大小
                    data.subjects = allSubjects.slice(0, doubanPageSize);
                }
            } catch (error) {
                console.error('获取电视动画数据失败:', error);
            }
        }
        
        // 渲染内容
        renderCategoryContent(data, container);
    } catch (error) {
        console.error(`获取${type}-${category}内容失败:`, error);
        container.innerHTML = `<div class="col-span-full text-center py-8 text-red-500">加载失败，请稍后再试</div>`;
    }
}

// 渲染分类内容
function renderCategoryContent(data, container) {
    // 清空容器
    container.innerHTML = '';
    
    if (!data || !data.subjects || data.subjects.length === 0) {
        container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">暂无内容</div>';
        return;
    }
    
    // 创建一个文档片段，减少DOM操作次数
    const fragment = document.createDocumentFragment();
    
    data.subjects.forEach(item => {
        // 创建卡片元素
        const card = document.createElement('div');
        card.className = 'bg-[#111] hover:bg-[#222] transition-all duration-300 rounded-lg overflow-hidden flex flex-col transform hover:scale-105 shadow-md hover:shadow-lg';
        
        // 安全处理标题，防止XSS
        const safeTitle = item.title
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        
        // 评分处理
        let ratingHtml = '';
        if (item.rate && parseFloat(item.rate) > 0) {
            const rating = parseFloat(item.rate);
            const ratingClass = rating >= 8 ? 'text-green-500' : (rating >= 6 ? 'text-yellow-500' : 'text-red-500');
            ratingHtml = `
                <div class="absolute top-2 right-2 bg-black/70 ${ratingClass} text-xs px-2 py-1 rounded-sm">
                    ${rating}分
                </div>
            `;
        }
        
        // 使用data-src代替src，实现懒加载
        const thumbnailPlaceholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"%3E%3Crect width="300" height="450" fill="%23333"%3E%3C/rect%3E%3C/svg%3E';
        
        // 处理图片URL - 添加LibreTV的逻辑
        // 1. 直接使用豆瓣图片URL (添加no-referrer属性)
        const originalCoverUrl = item.cover;
        
        // 2. 也准备代理URL作为备选
        const proxiedCoverUrl = PROXY_URL + encodeURIComponent(originalCoverUrl);
        
        // 构建卡片HTML
        card.innerHTML = `
            <div class="relative w-full aspect-[2/3] overflow-hidden cursor-pointer" onclick="fillAndSearchWithDouban('${safeTitle}')">
                <img src="${thumbnailPlaceholder}" 
                    data-src="${originalCoverUrl}" 
                    alt="${safeTitle}" 
                    class="w-full h-full object-cover transition-transform duration-500 hover:scale-110 lazy-image"
                    onerror="this.onerror=null; this.src='${proxiedCoverUrl}'; this.classList.add('object-contain');"
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
        
        // 添加到文档片段
        fragment.appendChild(card);
    });
    
    // 一次性添加所有元素到DOM
    container.appendChild(fragment);
    
    // 检查子元素数量，根据屏幕宽度决定何时添加scrollable类
    const isMobile = window.innerWidth <= 767;
    const threshold = isMobile ? 3 : 7;
    
    if (container.children.length >= (isMobile ? 4 : 8)) {
        container.classList.add('scrollable');
    } else {
        container.classList.remove('scrollable');
    }
    
    // 初始化懒加载
    initLazyLoading(container);
}

// 初始化图片懒加载
function initLazyLoading(container) {
    if ('IntersectionObserver' in window) {
        const lazyImageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const lazyImage = entry.target;
                    lazyImage.src = lazyImage.dataset.src;
                    lazyImage.classList.remove('lazy-image');
                    lazyImageObserver.unobserve(lazyImage);
                    
                    // 预加载下一个图片（如果有）
                    const nextImage = lazyImage.parentElement.parentElement.nextElementSibling;
                    if (nextImage) {
                        const img = nextImage.querySelector('img.lazy-image');
                        if (img && img.dataset.src) {
                            setTimeout(() => {
                                const preloadImg = new Image();
                                preloadImg.src = img.dataset.src;
                            }, 100);
                        }
                    }
                }
            });
        });
        
        const lazyImages = container.querySelectorAll('img.lazy-image');
        lazyImages.forEach(lazyImage => {
            lazyImageObserver.observe(lazyImage);
        });
    } else {
        // 不支持IntersectionObserver的浏览器回退到立即加载
        const lazyImages = container.querySelectorAll('img.lazy-image');
        lazyImages.forEach(img => {
            img.src = img.dataset.src;
            img.classList.remove('lazy-image');
        });
    }
}

// 从豆瓣API获取数据
async function fetchDoubanData(url) {
    // 检查内存缓存
    const now = Date.now();
    if (doubanCache[url] && doubanCache[url].expiry > now) {
        return doubanCache[url].data;
    }
    
    // 检查localStorage缓存
    const cacheKey = `douban_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        try {
            const parsedData = JSON.parse(cachedData);
            // 更新内存缓存
            doubanCache[url] = {
                data: parsedData,
                expiry: now + CACHE_EXPIRY
            };
            return parsedData;
        } catch (e) {
            console.error("解析缓存数据失败:", e);
        }
    }
    
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
        // 尝试通过代理访问
        const response = await fetch(PROXY_URL + encodeURIComponent(url), fetchOptions);
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 保存到localStorage作为备用缓存
        try {
            localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (e) {
            console.error("保存到localStorage失败:", e);
        }
        
        // 同时保存到内存缓存
        doubanCache[url] = {
            data: data,
            expiry: now + CACHE_EXPIRY
        };
        
        return data;
    } catch (err) {
        console.error("豆瓣 API 请求失败（直接代理）：", err);
        
        // 如果是超时错误，尝试从localStorage获取
        const cacheKey = `douban_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const cachedData = localStorage.getItem(cacheKey);
        
        if (cachedData) {
            try {
                console.log("从localStorage恢复豆瓣数据:", url);
                const parsedData = JSON.parse(cachedData);
                return parsedData;
            } catch (e) {
                console.error("解析缓存数据失败:", e);
            }
        }
        
        // 失败后尝试备用方法：使用allorigins作为备选
        const fallbackUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        
        try {
            const fallbackResponse = await fetch(fallbackUrl);
            
            if (!fallbackResponse.ok) {
                throw new Error(`备用API请求失败! 状态: ${fallbackResponse.status}`);
            }
            
            const data = await fallbackResponse.json();
            
            // 解析原始内容
            if (data && data.contents) {
                const parsedData = JSON.parse(data.contents);
                
                // 保存到localStorage作为备用缓存
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(parsedData));
                } catch (e) {
                    console.error("保存到localStorage失败:", e);
                }
                
                // 同时保存到内存缓存
                doubanCache[url] = {
                    data: parsedData,
                    expiry: now + CACHE_EXPIRY
                };
                
                return parsedData;
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
    const modal = document.getElementById('categoryModal');
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
                const countEl = document.getElementById('selectedApiCount');
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
        
        // 检查search函数是否存在
        if (typeof search === 'function') {
            await search(); // 使用已有的search函数执行搜索
        } else {
            // 如果search函数不存在，尝试自己实现基本的搜索功能
            showToast('搜索功能不可用', 'error');
            return;
        }
        
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
    
    // 恢复搜索区域的样式
    const searchArea = document.getElementById('searchArea');
    if (searchArea) {
        searchArea.classList.add('flex-1');
        searchArea.classList.remove('mb-8');
    }
    
    // 更新豆瓣区域可见性，但不重新加载内容
    const doubanArea = document.getElementById('doubanArea');
    if (doubanArea) {
        const isEnabled = localStorage.getItem('doubanEnabled') !== 'false';
        if (isEnabled) {
            doubanArea.classList.remove('hidden');
            // 重新初始化懒加载，确保图片正确加载
            reinitializeLazyLoading();
        } else {
            doubanArea.classList.add('hidden');
        }
    }
    
    // 更新URL，移除搜索参数
    try {
        window.history.pushState({}, 'YTPPTV', '/');
        document.title = 'YTPPTV';
    } catch (e) {
        console.error('更新浏览器历史失败:', e);
    }
}

// 加载豆瓣首页内容
document.addEventListener('DOMContentLoaded', () => {
    // 确保在页面完全加载后初始化豆瓣功能
    if (document.readyState === 'complete') {
        initDouban();
    } else {
        window.addEventListener('load', initDouban);
    }
});

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

// 初始化所有容器的懒加载
function initializeLazyLoading() {
    // 获取所有豆瓣内容容器
    const containers = document.querySelectorAll('[class^="douban-"]');
    
    // 为每个容器初始化懒加载
    containers.forEach(container => {
        initLazyLoading(container);
    });
    
    // 设置滚动监听，在滚动时检查是否需要加载更多内容
    window.addEventListener('scroll', debounce(() => {
        containers.forEach(container => {
            // 检查容器是否在视口内
            const rect = container.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                // 容器在视口内，确保图片加载
                const lazyImages = container.querySelectorAll('img.lazy-image');
                if (lazyImages.length > 0) {
                    initLazyLoading(container);
                }
            }
        });
    }, 200));
}
