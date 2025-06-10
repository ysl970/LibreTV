// 豆瓣热门电影电视剧推荐功能

// 使用config.js中定义的PROXY_URL常量
// const PROXY_URL = '/proxy/';

// 定义不同类型的内容分类和对应的API参数
const doubanCategories = {
    movie: {
        hot: {
            title: '热播电影',
            params: {
                type: 'movie',
                tag: '热门',
                sort: 'time',
                genres: '',
                countries: ''
            }
        },
        animation: {
            title: '热播动画',
            params: {
                type: 'movie',
                tag: '动画',
                sort: 'time', // 按时间排序，确保最新的在前面
                genres: '动画',
                countries: ''
                // 不限制年份，显示所有最新的内容
            }
        },
        top250: {
            title: 'Top250电影',
            params: {
                type: 'movie',
                tag: '豆瓣高分',
                sort: 'recommend',
                genres: '',
                countries: ''
            }
        }
    },
    tv: {
        hot: {
            title: '热播电视剧',
            params: {
                type: 'tv',
                tag: '热门',
                sort: 'time',
                genres: '',
                countries: ''
            }
        },
        us: {
            title: '热播美剧',
            params: {
                type: 'tv',
                tag: '美剧',
                sort: 'time',
                genres: '',
                countries: '美国'
            }
        },
        hk: {
            title: '热播港剧',
            params: {
                type: 'tv',
                tag: '港剧',
                sort: 'time',
                genres: '',
                countries: '香港'
            }
        },
        kr: {
            title: '热播韩剧',
            params: {
                type: 'tv',
                tag: '韩剧',
                sort: 'time',
                genres: '',
                countries: '韩国'
            }
        },
        jp: {
            title: '热播日剧',
            params: {
                type: 'tv',
                tag: '日剧',
                sort: 'time',
                genres: '',
                countries: '日本'
            }
        },
        animation: {
            title: '电视动画',
            params: {
                type: 'tv',
                tag: '动画',
                sort: 'time', // 按时间排序，确保最新的在前面
                genres: '动画',
                countries: ''
                // 不限制年份，显示所有最新的内容
            }
        }
    },
    variety: {
        hot: {
            title: '热播综艺',
            params: {
                type: 'tv',
                tag: '综艺',
                sort: 'time', // 按时间排序，确保最新的在前面
                genres: '综艺',
                countries: ''
                // 不限制年份，显示所有最新的内容
            }
        }
    }
};

// 默认每个分类显示的数量
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
// 缓存过期时间（修改为2小时，确保获取更频繁的更新）
const CACHE_EXPIRY = 2 * 60 * 60 * 1000;
// 添加最大缓存存活时间（6小时）
const MAX_CACHE_LIFETIME = 6 * 60 * 60 * 1000;
// 缓存刷新阈值时间（1小时检查一次）
const CACHE_REFRESH_THRESHOLD = 60 * 60 * 1000;

// 最后缓存刷新时间戳
let lastCacheRefreshTime = 0;

// 初始化豆瓣功能
function initDouban() {
    // 设置豆瓣开关的初始状态
    const doubanToggle = document.getElementById('doubanToggle');
    if (doubanToggle) {
        doubanToggle.checked = localStorage.getItem('doubanEnabled') !== 'false';
    }

    // 检查缓存状态，每次页面加载时刷新部分缓存以确保内容更新
    checkAndRefreshCache();
    
    // 立即更新豆瓣区域显示状态
    updateDoubanVisibility();

    // 设置豆瓣开关事件监听
    if (doubanToggle) {
        doubanToggle.addEventListener('change', function() {
            localStorage.setItem('doubanEnabled', this.checked);
            updateDoubanVisibility();
            
            // 切换时清除缓存并强制刷新
            if (this.checked) {
                checkAndRefreshCache(true);
                loadAllCategoryContent(true);  // 传入true参数表示强制刷新
            }
        });
    }

    // 设置"换一批"按钮事件
    setupMoreButtons();

    // 初始化懒加载
    initializeLazyLoading();
    
    // 如果豆瓣功能已启用，加载所有分类内容
    if (localStorage.getItem('doubanEnabled') !== 'false') {
        loadAllCategoryContent(true);  // 强制刷新内容
    }
}

// 新增：检查和刷新缓存的函数
function checkAndRefreshCache(forceRefresh = false) {
    const now = Date.now();
    
    // 检查是否需要进行缓存刷新（距离上次刷新已经超过阈值时间或强制刷新）
    if (forceRefresh || now - lastCacheRefreshTime > CACHE_REFRESH_THRESHOLD) {
        console.log('执行缓存刷新检查...');
        lastCacheRefreshTime = now;
        
        // 清除过期缓存
        clearExpiredCache();
        
        // 优先刷新热门内容类别的缓存，这些内容更新频率更高
        const priorityCategories = [
            { type: 'movie', category: 'hot' },
            { type: 'tv', category: 'hot' },
            { type: 'variety', category: 'hot' },
            { type: 'movie', category: 'animation' }
        ];
        
        // 随机选择1-2个优先类别进行刷新
        const refreshCount = forceRefresh ? priorityCategories.length : Math.floor(Math.random() * 2) + 1;
        const shuffled = [...priorityCategories].sort(() => 0.5 - Math.random());
        const selectedCategories = shuffled.slice(0, refreshCount);
        
        console.log(`选择了 ${refreshCount} 个类别进行刷新:`, selectedCategories);
        
        // 刷新选定的类别缓存
        selectedCategories.forEach(item => {
            clearCategoryCache(item.type, item.category);
        });
    }
}

// 清除过期缓存
function clearExpiredCache() {
    const now = Date.now();
    
    // 清除内存缓存中的过期项
    for (let url in doubanCache) {
        if (doubanCache[url].expiry < now) {
            delete doubanCache[url];
        }
    }
    
    // 检查是否存在缓存刷新时间记录
    const lastFullCacheCheck = parseInt(localStorage.getItem('douban_last_cache_check') || '0');
    const needsFullCheck = now - lastFullCacheCheck > CACHE_REFRESH_THRESHOLD;
    
    // 如果需要进行完整检查，则更新时间戳
    if (needsFullCheck) {
        localStorage.setItem('douban_last_cache_check', now.toString());
    }
    
    // 清除localStorage中的过期缓存
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('douban_')) {
            try {
                const cachedData = localStorage.getItem(key);
                if (cachedData) {
                    // 检查缓存是否包含时间戳
                    if (cachedData.includes('"timestamp":')) {
                        const data = JSON.parse(cachedData);
                        // 如果缓存超过有效期，或者存在超过最大生命周期，则清除
                        if (data.timestamp && ((now - data.timestamp > CACHE_EXPIRY) || 
                           (needsFullCheck && now - data.timestamp > MAX_CACHE_LIFETIME))) {
                            localStorage.removeItem(key);
                            console.log(`缓存已过期，删除: ${key}`);
                        }
                    } else {
                        // 如果没有时间戳，添加一个
                        try {
                            const data = JSON.parse(cachedData);
                            data.timestamp = now;
                            localStorage.setItem(key, JSON.stringify(data));
                        } catch (e) {
                            // 如果解析失败，直接移除
                            localStorage.removeItem(key);
                        }
                    }
                }
            } catch (e) {
                console.error("处理缓存数据失败:", e);
                // 如果处理失败，移除该项
                localStorage.removeItem(key);
            }
        }
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
                loadAllCategoryContent(true);  // 强制刷新，确保最新内容
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
            
            // 如果容器为空，则重新加载内容
            if (isEmpty) {
                requestAnimationFrame(() => {
                    loadAllCategoryContent(true);  // 强制刷新，确保最新内容
                });
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
function loadAllCategoryContent(refresh = false) {
    // 优先加载的内容（首屏可见内容）
    const priorityLoad = () => {
        // 1. 热门电影（最受关注）
        fetchCategoryContent('movie', 'hot', doubanCategories.movie.hot.title, refresh);
        
        // 2. 热门电视剧
        fetchCategoryContent('tv', 'hot', doubanCategories.tv.hot.title, refresh);
        
        doubanLoadStatus.priorityLoaded = true;
    };
    
    // 第二批加载（稍后加载）
    const secondaryLoad = () => {
        // 3. 热门综艺
        fetchCategoryContent('variety', 'hot', doubanCategories.variety.hot.title, refresh);
        
        // 4. 热门动画
        fetchCategoryContent('movie', 'animation', doubanCategories.movie.animation.title, refresh);
        
        doubanLoadStatus.secondaryLoaded = true;
    };
    
    // 最后加载（用户可能需要滚动才能看到的内容）
    const finalLoad = () => {
        // 6. 热门美剧
        fetchCategoryContent('tv', 'us', doubanCategories.tv.us.title, refresh);
        
        // 7. 热门港剧
        fetchCategoryContent('tv', 'hk', doubanCategories.tv.hk.title, refresh);
        
        // 8. 热门韩剧
        fetchCategoryContent('tv', 'kr', doubanCategories.tv.kr.title, refresh);
        
        // 9. 热门日剧
        fetchCategoryContent('tv', 'jp', doubanCategories.tv.jp.title, refresh);
        
        // 10. Top250电影
        fetchCategoryContent('movie', 'top250', doubanCategories.movie.top250.title, refresh);
        
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

// 设置"换一批"按钮点击事件
function setupMoreButtons() {
    // 获取所有"换一批"按钮
    const moreButtons = document.querySelectorAll('#doubanArea a[href="#"]');
    
    // 为每个按钮添加点击事件
    moreButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            
            // 获取分类和类型属性
            const category = this.dataset.category;
            const type = this.dataset.type;
            
            // 显示加载中状态
            const containerClass = `douban-${type}-${category}`;
            const container = document.querySelector(`.${containerClass}`);
            if (container) {
                container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">加载中...</div>';
            }
            
            // 获取该分类的标题
            const categoryName = getCategoryTitle(type, category);
            
            // 为了确保刷新内容，我们需要清除该分类的缓存
            clearCategoryCache(type, category);
            
            // 使用fetchMoreCategoryContent函数获取新的内容批次
            fetchMoreCategoryContent(type, category);
        });
    });
}

// 添加清除特定分类缓存的函数
function clearCategoryCache(type, category) {
    // 构建可能的API URL模式
    const patterns = [
        `type=${type}&tag=`,
        `type=${type}&tag=${encodeURIComponent(getCategoryTitle(type, category))}`,
        `type=${type}&tag=${category}`
    ];
    
    // 遍历doubanCache对象，删除匹配的缓存
    for (let url in doubanCache) {
        if (patterns.some(pattern => url.includes(pattern))) {
            console.log(`清除缓存: ${url}`);
            delete doubanCache[url];
            
            // 同时清除localStorage中的缓存
            const cacheKey = `douban_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
            localStorage.removeItem(cacheKey);
        }
    }
}

// 获取分类标题
function getCategoryTitle(type, category) {
    if (doubanCategories[type] && doubanCategories[type][category]) {
        return doubanCategories[type][category].title;
    }
    
    // 兼容旧代码的返回值
    if (type === 'movie') {
        if (category === 'hot') return '热播电影';
        if (category === 'top250') return 'Top250电影';
        if (category === 'animation') return '热播动画';
        return '电影';
    } else if (type === 'tv') {
        if (category === 'hot') return '热播电视剧';
        if (category === 'us') return '热播美剧';
        if (category === 'hk') return '热播港剧';
        if (category === 'kr') return '热播韩剧';
        if (category === 'jp') return '热播日剧';
        return '电视剧';
    } else if (type === 'variety') {
        return '热播综艺';
    }
    return '影视内容';
}

// 获取当前年份和月份，用于构建最新内容的year_range
function getCurrentYearRange() {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1; // 月份从0开始，所以+1
    
    // 如果是年初（1-3月），也包括上一年的内容
    const startYear = currentMonth <= 3 ? currentYear - 1 : currentYear;
    
    return `${startYear},${currentYear}`;
}

// 获取更精细化的年份月份范围，适用于需要实时更新的内容如综艺
function getCurrentYearMonthRange() {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1; // 月份从0开始，所以+1
    
    // 如果是月初（1-10号），也包括上个月的内容
    let startYear = currentYear;
    let startMonth = currentMonth;
    
    // 获取3个月的范围，确保能够获取到足够的内容
    if (currentMonth <= 3) {
        // 如果是1-3月，需要包含上一年的内容
        startYear = currentYear - 1;
        startMonth = 10 + currentMonth; // 10,11,12月
    } else {
        // 否则从当前月份往前推3个月
        startMonth = currentMonth - 2;
    }
    
    // 构造参数格式：yyyy-mm,yyyy-mm
    return `${startYear}-${startMonth.toString().padStart(2, '0')},${currentYear}-${currentMonth.toString().padStart(2, '0')}`;
}

function buildDoubanApiUrl(type, category, pageSize = doubanPageSize, pageStart = 0, refresh = false) {
    // 添加随机参数，确保在刷新时不使用缓存
    const randomParam = refresh ? `&_t=${Date.now()}` : '';
    
    // 获取分类参数
    let params = {};
    if (doubanCategories[type] && doubanCategories[type][category]) {
        params = { ...doubanCategories[type][category].params };
        
        // 对于热播综艺和热播动画，自动添加当前年份范围
        if (type === 'variety' && category === 'hot') {
            // 综艺使用更精细的月份范围，确保获取最新内容
            params.year_range = getCurrentYearMonthRange();
        } else if (category === 'animation' && (type === 'movie' || type === 'tv')) {
            // 动画也使用更精细的月份范围
            params.year_range = getCurrentYearMonthRange();
        }
    } else {
        // 兼容旧代码的参数构建
        params = {
            type: type,
            tag: getCategoryTitle(type, category),
            sort: 'recommend',
            genres: '',
            countries: ''
        };
        
        // 特殊处理某些分类
        if (category === 'animation' && type === 'movie') {
            params.genres = '动画';
            // 为动画添加最新的年月范围
            params.year_range = getCurrentYearMonthRange();
        } else if (type === 'tv') {
            if (category === 'us') params.countries = '美国';
            else if (category === 'hk') params.countries = '香港';
            else if (category === 'kr') params.countries = '韩国';
            else if (category === 'jp') params.countries = '日本';
        } else if (type === 'variety') {
            params.genres = '综艺';
            // 为综艺添加最新的年月范围
            params.year_range = getCurrentYearMonthRange();
        }
    }
    
    // 构建URL
    let url = `https://movie.douban.com/j/search_subjects?type=${params.type}&tag=${encodeURIComponent(params.tag)}&sort=${params.sort}&page_limit=${pageSize}&page_start=${pageStart}${randomParam}`;
    
    // 添加可选参数
    if (params.genres) {
        url += `&genres=${encodeURIComponent(params.genres)}`;
    }
    if (params.countries) {
        url += `&countries=${encodeURIComponent(params.countries)}`;
    }
    if (params.year_range) {
        url += `&year_range=${encodeURIComponent(params.year_range)}`;
    }
    
    console.log(`构建API URL: ${url}`);
    return url;
}

// 获取更多特定分类的内容
async function fetchMoreCategoryContent(type, category) {
    try {
        // 获取分类容器
        const containerClass = `douban-${type}-${category}`;
        const container = document.querySelector(`.${containerClass}`);
        if (!container) {
            console.error(`找不到容器: ${containerClass}`);
            return;
        }
        
        // 显示加载中状态
        container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">加载中...</div>';
        
        // 获取该分类的标题
        const categoryName = getCategoryTitle(type, category);
        
        // 生成随机的起始页码，确保每次获取不同的内容
        // 对于不同类型的内容，设置不同的最大范围
        let maxStart = 20; // 默认最大起始值
        
        if (type === 'movie') {
            if (category === 'top250') maxStart = 200;
            else if (category === 'hot') maxStart = 50;
            else if (category === 'new') maxStart = 30;
            else if (category === 'animation') maxStart = 40;
        } else if (type === 'tv') {
            if (category === 'hot') maxStart = 40;
            else maxStart = 30; // 区域性剧集
        } else if (type === 'variety') {
            maxStart = 30;
        }
        
        // 生成随机起始位置，确保每次"换一批"都能获取不同内容
        const randomStart = Math.floor(Math.random() * maxStart);
        
        // 构建API请求URL，添加随机起始位置和时间戳确保不使用缓存
        const apiUrl = buildDoubanApiUrl(type, category, doubanPageSize, randomStart, true);
        
        console.log(`加载更多 ${type}-${category} 内容: ${apiUrl}`);
        
        // 获取数据，强制刷新缓存
        const data = await fetchDoubanData(apiUrl, true);
        
        // 处理特殊分类
        let processedData = { ...data };
        
        // 如果是动画分类，还需要获取电视动画并合并数据
        if (type === 'movie' && category === 'animation') {
            try {
                // 获取电视动画数据，使用随机起始位置
                const tvRandomStart = Math.floor(Math.random() * 40);
                // 确保使用最新的年份范围
                const tvAnimationUrl = buildDoubanApiUrl('tv', 'animation', 50, tvRandomStart, true);
                const tvAnimationData = await fetchDoubanData(tvAnimationUrl, true);
                
                // 合并电影动画和电视动画数据
                if (tvAnimationData && tvAnimationData.subjects && tvAnimationData.subjects.length > 0) {
                    // 确保data.subjects存在
                    if (!processedData.subjects) {
                        processedData.subjects = [];
                    }
                    
                    // 合并两组数据
                    const allSubjects = [...processedData.subjects, ...tvAnimationData.subjects];
                    
                    // 过滤并处理动画内容
                    processedData.subjects = filterAndProcessAnimationContent(allSubjects);
                }
            } catch (error) {
                console.error('获取电视动画数据失败:', error);
            }
        } else {
            // 对所有分类的内容进行处理
            if (processedData.subjects && processedData.subjects.length > 0) {
                processedData.subjects = processContentByCategory(processedData.subjects, type, category);
            }
        }
        
        // 渲染内容
        renderCategoryContent(processedData, container);
    } catch (error) {
        console.error(`获取${type}-${category}更多内容失败:`, error);
        const containerClass = `douban-${type}-${category}`;
        const container = document.querySelector(`.${containerClass}`);
        if (container) {
            container.innerHTML = `<div class="col-span-full text-center py-8 text-red-500">加载失败，请稍后再试</div>`;
        }
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
        // 使用新的函数构建API URL
        const apiUrl = buildDoubanApiUrl(type, category, 20, page * 20);
        
        console.log(`加载更多 ${type}-${category} 页码 ${page}: ${apiUrl}`);
        
        // 获取数据
        const data = await fetchDoubanData(apiUrl);
        
        // 处理特殊分类
        let processedData = { ...data };
        
        // 如果是动画分类，还需要获取电视动画并合并数据
        if (type === 'movie' && category === 'animation') {
            try {
                // 获取电视动画数据
                const tvAnimationUrl = buildDoubanApiUrl('tv', 'animation', 20, page * 20);
                const tvAnimationData = await fetchDoubanData(tvAnimationUrl);
                
                // 合并电影动画和电视动画数据
                if (tvAnimationData && tvAnimationData.subjects && tvAnimationData.subjects.length > 0) {
                    // 确保data.subjects存在
                    if (!processedData.subjects) {
                        processedData.subjects = [];
                    }
                    
                    // 合并两组数据
                    const allSubjects = [...processedData.subjects, ...tvAnimationData.subjects];
                    
                    // 过滤并处理动画内容
                    processedData.subjects = filterAndProcessAnimationContent(allSubjects);
                }
            } catch (error) {
                console.error('获取更多电视动画数据失败:', error);
            }
        } else {
            // 对所有分类的内容进行处理
            if (processedData.subjects && processedData.subjects.length > 0) {
                processedData.subjects = processContentByCategory(processedData.subjects, type, category);
            }
        }
        
        return processedData;
    } catch (error) {
        console.error(`加载更多${type}-${category}内容失败:`, error);
        throw error;
    }
}

// 获取特定分类的内容
async function fetchCategoryContent(type, category, categoryName, refresh = false) {
    const containerClass = `douban-${type}-${category}`;
    const container = document.querySelector(`.${containerClass}`);
    if (!container) return;
    
    try {
        if (refresh) {
            container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">加载中...</div>';
        }
        
        // 使用新的函数构建API URL（包含最新的年份范围）
        const apiUrl = buildDoubanApiUrl(type, category, doubanPageSize, 0, refresh);
        
        console.log(`加载分类 ${type}-${category}: ${apiUrl}`);
        
        // 获取数据
        const data = await fetchDoubanData(apiUrl, refresh);
        
        // 处理特殊分类
        let processedData = { ...data };
        
        // 如果是动画分类，还需要获取电视动画并合并数据
        if (type === 'movie' && category === 'animation') {
            try {
                // 获取电视动画数据（确保使用最新的年份范围）
                const tvAnimationUrl = buildDoubanApiUrl('tv', 'animation', 50, 0, refresh);
                const tvAnimationData = await fetchDoubanData(tvAnimationUrl, refresh);
                
                // 合并电影动画和电视动画数据
                if (tvAnimationData && tvAnimationData.subjects && tvAnimationData.subjects.length > 0) {
                    // 确保data.subjects存在
                    if (!processedData.subjects) {
                        processedData.subjects = [];
                    }
                    
                    // 合并两组数据
                    const allSubjects = [...processedData.subjects, ...tvAnimationData.subjects];
                    
                    // 过滤并处理动画内容
                    processedData.subjects = filterAndProcessAnimationContent(allSubjects);
                }
            } catch (error) {
                console.error('获取电视动画数据失败:', error);
            }
        } else {
            // 对所有分类的内容进行处理
            if (processedData.subjects && processedData.subjects.length > 0) {
                processedData.subjects = processContentByCategory(processedData.subjects, type, category);
            }
        }
        
        // 渲染内容
        renderCategoryContent(processedData, container);
    } catch (error) {
        console.error(`获取${type}-${category}内容失败:`, error);
        container.innerHTML = `<div class="col-span-full text-center py-8 text-red-500">加载失败，请稍后再试</div>`;
    }
}

// 过滤并处理动画内容
function filterAndProcessAnimationContent(items) {
    console.log(`动画内容过滤前: ${items.length}个项目`);
    
    // 强化过滤逻辑，确保所有内容都是动画
    const filteredItems = items.filter(item => {
        // 通过标题和URL判断是否是动画
        const title = (item.title || '').toLowerCase();
        const url = (item.url || '').toLowerCase();
        
        // 排除明显的非动画内容
        if (title.includes('真人') || 
            title.includes('live action') || 
            title.includes('真人版') || 
            title.includes('真人电影')) {
            return false;
        }
        
        // 优先包含明确的动画作品（无论是电影还是电视剧类型）
        // 常见动画标志性作品，即使它们在豆瓣分类中是电影或电视剧
        if (title.includes('仙逆') || 
            title.includes('千与千寻') ||
            title.includes('宫崎骏') ||
            title.includes('龙珠') ||
            title.includes('柯南') ||
            title.includes('哆啦A梦') ||
            title.includes('多啦A梦') ||
            title.includes('鬼灭之刃') ||
            title.includes('名侦探柯南') ||
            title.includes('海贼王') ||
            title.includes('進撃の巨人') ||
            title.includes('进击的巨人') ||
            title.includes('间谍过家家')) {
            return true;
        }
        
        // 检查是否包含动画相关关键词
        const isAnime = 
            title.includes('动画') || 
            title.includes('anime') || 
            title.includes('漫') ||
            title.includes('卡通') ||
            url.includes('animation') ||
            url.includes('cartoon') ||
            url.includes('anime');
        
        // 额外检查是否有动画类型标记
        const hasAnimeTag = 
            (item.genres && Array.isArray(item.genres) && item.genres.some(genre => 
                (typeof genre === 'string' && (
                    genre.includes('动画') || 
                    genre.includes('anime') || 
                    genre.includes('动漫'))))) ||
            (item.tags && Array.isArray(item.tags) && item.tags.some(tag => 
                (typeof tag === 'string' && (
                    tag.includes('动画') || 
                    tag.includes('anime') || 
                    tag.includes('动漫')))));
        
        // 如果有类型信息但不是动画，则排除
        if (item.genres && Array.isArray(item.genres) && item.genres.length > 0) {
            // 如果类型中明确包含"真人秀"、"纪录片"、"脱口秀"等非动画类型，则排除
            if (item.genres.some(genre => 
                (typeof genre === 'string' && (
                    genre.includes('真人秀') || 
                    genre.includes('脱口秀') || 
                    genre.includes('纪录片'))))) {
                return false;
            }
            
            // 如果没有明确的动画标记，但是有其他类型标记，则进一步检查描述和详情
            if (!hasAnimeTag) {
                // 检查item是否有更多可以识别的动画特征
                const hasMoreAnimeEvidence = 
                    (item.directors && typeof item.directors === 'string' && 
                        (item.directors.includes('宫崎骏') || 
                         item.directors.includes('今敏'))) ||
                    (item.cover && typeof item.cover === 'string' && 
                        (item.cover.includes('anime') || 
                         item.cover.includes('animation'))) ||
                    (item.rate && parseFloat(item.rate) >= 8.0);  // 高分动画更可能是真正的动画
                
                // 如果没有足够证据表明这是动画，就排除
                if (!hasMoreAnimeEvidence && !isAnime) {
                    return false;
                }
            }
        }
        
        return isAnime || hasAnimeTag;
    });
    
    // 根据评分排序（高分在前）
    filteredItems.sort((a, b) => {
        const rateA = parseFloat(a.rate) || 0;
        const rateB = parseFloat(b.rate) || 0;
        return rateB - rateA;
    });
    
    console.log(`动画内容过滤后: ${filteredItems.length}个项目`);
    
    // 限制数量为原来的大小
    return filteredItems.slice(0, 50);
}

// 根据分类处理内容
function processContentByCategory(items, type, category) {
    // 确保items是数组
    if (!Array.isArray(items) || items.length === 0) {
        return items;
    }
    
    let processedItems = [...items];
    
    // 根据不同分类进行处理
    switch(type) {
        case 'movie':
            // 电影分类处理
            switch(category) {
                case 'top250':
                    // Top250按评分排序
                    processedItems.sort((a, b) => {
                        const rateA = parseFloat(a.rate) || 0;
                        const rateB = parseFloat(b.rate) || 0;
                        return rateB - rateA;
                    });
                    break;
                    
                case 'new':
                    // 新片按上映日期排序（如果有）
                    processedItems = processedItems.filter(item => {
                        // 过滤掉明显的非电影内容
                        const title = (item.title || '').toLowerCase();
                        return !title.includes('剧集') && !title.includes('综艺');
                    });
                    break;
                    
                case 'hot':
                    // 热门电影过滤掉剧集和综艺
                    processedItems = processedItems.filter(item => {
                        const title = (item.title || '').toLowerCase();
                        return !title.includes('剧集') && !title.includes('综艺');
                    });
                    break;
            }
            break;
            
        case 'tv':
            // 电视剧分类处理
            switch(category) {
                case 'us':
                case 'hk':
                case 'kr':
                case 'jp':
                    // 放宽区域性电视剧的过滤条件，使用API返回的结果
                    // 不再进行额外过滤，因为API已经按国家/地区进行了筛选
                    break;
                    
                case 'hot':
                    // 热门剧集过滤掉电影和综艺
                    processedItems = processedItems.filter(item => {
                        const title = (item.title || '').toLowerCase();
                        return !title.includes('电影') && !title.includes('综艺');
                    });
                    break;
            }
            break;
            
        case 'variety':
            // 综艺分类处理 - 放宽过滤条件
            // 不再进行额外过滤，因为API已经使用了综艺标签和类型
            break;
    }
    
    return processedItems;
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
async function fetchDoubanData(url, refresh = false) {
    // 调试模式 - 可以通过URL参数启用
    const isDebug = new URLSearchParams(window.location.search).get('debug') === 'true';
    
    // 如果是刷新请求，则跳过内存缓存检查
    if (!refresh) {
        // 检查内存缓存
        const now = Date.now();
        if (doubanCache[url] && doubanCache[url].expiry > now) {
            if (isDebug) console.log('从内存缓存获取数据:', url);
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
                if (isDebug) console.log('从localStorage缓存获取数据:', url);
                return parsedData;
            } catch (e) {
                console.error("解析缓存数据失败:", e);
            }
        }
    } else {
        console.log("刷新请求，跳过缓存检查:", url);
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
        if (isDebug) console.log('请求豆瓣数据:', url);
        // 尝试通过代理访问
        const response = await fetch(PROXY_URL + encodeURIComponent(url), fetchOptions);
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 调试模式 - 输出API响应
        if (isDebug) {
            console.log('豆瓣API响应:', url, data);
        }
        
        // 保存到localStorage作为备用缓存
        try {
            const cacheKey = `douban_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
            // 添加时间戳，用于缓存过期检查
            data.timestamp = Date.now();
            localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (e) {
            console.error("保存到localStorage失败:", e);
        }
        
        // 同时保存到内存缓存
        const now = Date.now();
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
            if (isDebug) console.log('尝试备用方法获取数据:', fallbackUrl);
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
                const now = Date.now();
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
    if (typeof selectedAPIs !== 'undefined') {
        // 检查是否已经选择了豆瓣资源API
        if (!selectedAPIs.includes('dbzy')) {
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
    }
    
    // 填充搜索框并执行搜索
    const input = document.getElementById('searchInput');
    if (input) {
        // 优化搜索关键词，提高搜索匹配度
        let searchKeyword = optimizeSearchKeyword(safeTitle);
        
        // 设置搜索框的值
        input.value = searchKeyword;
        
        // 检查search函数是否存在
        if (typeof search === 'function') {
            showLoading('正在搜索豆瓣内容...');
            await search(); // 使用已有的search函数执行搜索
            hideLoading();
        } else {
            // 如果search函数不存在，尝试自己实现基本的搜索功能
            showToast('搜索功能不可用', 'error');
            return;
        }
        
        // 更新浏览器URL，使其反映当前的搜索状态
        try {
            // 使用URI编码确保特殊字符能够正确显示
            const encodedQuery = encodeURIComponent(searchKeyword);
            // 使用HTML5 History API更新URL，不刷新页面
            window.history.pushState(
                { search: searchKeyword }, 
                `搜索: ${searchKeyword} - YTPPTV`, 
                `/s=${encodedQuery}`
            );
            // 更新页面标题
            document.title = `搜索: ${searchKeyword} - YTPPTV`;
        } catch (e) {
            console.error('更新浏览器历史失败:', e);
        }

        // 在移动设备上，搜索后自动滚动到顶部
        if (window.innerWidth <= 768) {
          window.scrollTo({
              top: 0,
              behavior: 'smooth'
          });
        }
    }
}

// 优化搜索关键词，提高匹配精度
function optimizeSearchKeyword(title) {
    if (!title) return '';
    
    // 去除括号内容和年份，提高搜索匹配度
    let searchKeyword = title
        .replace(/\([^)]*\)/g, '') // 去除英文括号内容
        .replace(/（[^）]*）/g, '') // 去除中文括号内容
        .replace(/\[[^\]]*\]/g, '') // 去除方括号内容
        .replace(/【[^】]*】/g, '') // 去除中文方括号内容
        .replace(/\d{4}(\.\d{1,2})?/g, '') // 去除年份
        .trim();
    
    // 去除常见的无关后缀
    const suffixesToRemove = [
        '高清', '超清', '蓝光', '完整版', '未删减版', '加长版', 
        '导演剪辑版', '终极版', 'HD', '1080P', '720P', '4K',
        '国语版', '粤语版', '中字版', '英语版', '日语版', '韩语版'
    ];
    
    for (const suffix of suffixesToRemove) {
        searchKeyword = searchKeyword.replace(new RegExp(suffix + '$', 'i'), '').trim();
    }
    
    // 去除常见的剧集标记
    searchKeyword = searchKeyword
        .replace(/第[一二三四五六七八九十\d]+[季部]?/g, '')
        .replace(/Season\s*\d+/gi, '')
        .replace(/S\d+/gi, '')
        .trim();
    
    // 如果处理后的关键词太短（少于2个字符），则使用原始标题
    if (searchKeyword.length < 2) {
        return title.trim();
    }
    
    return searchKeyword;
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

// 清除所有豆瓣缓存
function clearAllDoubanCache() {
    console.log('清除所有豆瓣缓存');
    
    // 清除内存中的缓存
    for (let key in doubanCache) {
        if (key.includes('douban') || key.includes('movie') || key.includes('tv')) {
            delete doubanCache[key];
        }
    }
    
    // 清除localStorage中的缓存
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('douban_') || key.includes('_movie_') || key.includes('_tv_'))) {
            localStorage.removeItem(key);
        }
    }
    
    // 设置一个标记表示缓存已被清除
    localStorage.setItem('douban_cache_cleared', Date.now().toString());
    
    // 重置加载状态
    doubanLoadStatus.initialized = false;
    doubanLoadStatus.priorityLoaded = false;
    doubanLoadStatus.secondaryLoaded = false;
    doubanLoadStatus.finalLoaded = false;
}

// 添加到全局作用域，方便调试
window.clearAllDoubanCache = clearAllDoubanCache;
