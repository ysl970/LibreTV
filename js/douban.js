// 豆瓣热门电影电视剧推荐功能

// 使用config.js中定义的PROXY_URL常量
// 如果config.js未加载，提供备用值
const PROXY_URL = window.PROXY_URL || '/proxy/';

// 豆瓣标签列表 - 修改为默认标签，整合现有分类
let defaultMovieTags = ['热门', '热播电影', '热播动画', 'Top250电影', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '动作', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '治愈'];
let defaultTvTags = ['热门', '热播电视剧', '热播美剧', '热播港剧', '热播韩剧', '热播日剧', '电视动画', '热播综艺', '英剧', '国产剧', '日本动画', '纪录片'];

// 标签与分类的映射关系，用于将标签转换为对应的API请求参数
const tagToCategoryMap = {
    '热播电影': { type: 'movie', category: 'hot' },
    '热播动画': { type: 'movie', category: 'animation' },
    'Top250电影': { type: 'movie', category: 'top250' },
    '热播电视剧': { type: 'tv', category: 'hot' },
    '热播美剧': { type: 'tv', category: 'us' },
    '热播港剧': { type: 'tv', category: 'hk' },
    '热播韩剧': { type: 'tv', category: 'kr' },
    '热播日剧': { type: 'tv', category: 'jp' },
    '电视动画': { type: 'tv', category: 'animation' },
    '热播综艺': { type: 'variety', category: 'hot' }
};

// 用户标签列表 - 存储用户实际使用的标签（包含保留的系统标签和用户添加的自定义标签）
let movieTags = [];
let tvTags = [];

// 定义豆瓣电影/电视剧切换状态
let doubanMovieTvCurrentSwitch = 'movie';
let doubanCurrentTag = '热门';
let doubanPageStart = 0;
const doubanPageSize = 16; // 一次显示的项目数量

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
        showToast('保存标签失败', 'error');
    }
}

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
    console.log('初始化豆瓣功能开始');
    
    // 设置豆瓣开关的初始状态
    const doubanToggle = document.getElementById('doubanToggle');
    if (doubanToggle) {
        const isEnabled = localStorage.getItem('doubanEnabled') !== 'false';
        doubanToggle.checked = isEnabled;
        
        console.log('豆瓣功能是否启用:', isEnabled);
        
        // 设置开关外观
        const toggleBg = doubanToggle.nextElementSibling;
        const toggleDot = toggleBg ? toggleBg.nextElementSibling : null;
        if (isEnabled && toggleBg && toggleDot) {
            toggleBg.classList.add('bg-pink-600');
            toggleDot.classList.add('translate-x-6');
        }
        
        // 添加事件监听
        doubanToggle.addEventListener('change', function(e) {
            const isChecked = e.target.checked;
            localStorage.setItem('doubanEnabled', isChecked);
            
            // 更新开关外观
            if (toggleBg && toggleDot) {
                if (isChecked) {
                    toggleBg.classList.add('bg-pink-600');
                    toggleDot.classList.add('translate-x-6');
                } else {
                    toggleBg.classList.remove('bg-pink-600');
                    toggleDot.classList.remove('translate-x-6');
                }
            }
            
            // 更新显示状态
            updateDoubanVisibility();
        });
        
        // 初始更新显示状态
        updateDoubanVisibility();

        // 滚动到页面顶部
        window.scrollTo(0, 0);
    } else {
        console.error('找不到豆瓣开关元素');
    }

    // 加载用户标签
    loadUserTags();
    console.log('已加载用户标签, 电影标签:', movieTags.length, '条, 电视剧标签:', tvTags.length, '条');

    // 渲染电影/电视剧切换
    console.log('开始渲染电影/电视剧切换');
    renderDoubanMovieTvSwitch();
    
    // 渲染豆瓣标签
    console.log('开始渲染豆瓣标签');
    renderDoubanTags();
    
    // 设置新的"换一批"按钮事件（标签系统的按钮）
    console.log('设置换一批按钮事件');
    setupDoubanRefreshBtn();
    
    // 初始加载热门内容
    if (localStorage.getItem('doubanEnabled') !== 'false') {
        console.log('开始加载初始热门内容');
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }
    
    // 清除所有缓存，确保获取最新内容
    clearAllDoubanCache();
    
    console.log('豆瓣功能初始化完成');
}

// 隐藏原有分类内容，只显示标签系统内容
function hideOriginalCategories() {
    // 不再需要此函数，因为HTML中已经删除了原有分类内容
    console.log("hideOriginalCategories函数已弃用");
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
                        // 如果缓存超过24小时，则清除
                        if (data.timestamp && (now - data.timestamp > CACHE_EXPIRY)) {
                            localStorage.removeItem(key);
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
    console.log('更新豆瓣区域显示状态');
    
    const doubanArea = document.getElementById('doubanArea');
    if (!doubanArea) {
        console.error('找不到doubanArea元素');
        return;
    }
    
    const isEnabled = localStorage.getItem('doubanEnabled') !== 'false';
    const isSearching = document.getElementById('resultsArea') && 
        !document.getElementById('resultsArea').classList.contains('hidden');
    
    console.log('豆瓣功能状态:', {
        isEnabled: isEnabled,
        isSearching: isSearching
    });
    
    // 只有在启用且没有搜索结果显示时才显示豆瓣区域
    if (isEnabled && !isSearching) {
        console.log('显示豆瓣区域');
        doubanArea.classList.remove('hidden');
        
        // 如果豆瓣结果为空，重新加载
        const doubanResults = document.getElementById('douban-results');
        if (doubanResults && doubanResults.children.length === 0) {
            console.log('豆瓣结果为空，重新加载');
            
            // 检查当前标签是否是映射标签
            if (tagToCategoryMap[doubanCurrentTag]) {
                console.log('当前标签是映射标签:', doubanCurrentTag);
                const { type, category } = tagToCategoryMap[doubanCurrentTag];
                fetchCategoryContent(type, category, doubanCategories[type][category].title, true)
                    .then(data => {
                        if (data) {
                            renderDoubanCards(data, doubanResults);
                        }
                    })
                    .catch(error => {
                        console.error("获取分类内容失败：", error);
                        doubanResults.innerHTML = `
                            <div class="col-span-full text-center py-8">
                                <div class="text-red-400">❌ 获取豆瓣数据失败，请稍后重试</div>
                                <div class="text-gray-500 text-sm mt-2">提示：使用VPN可能有助于解决此问题</div>
                            </div>
                        `;
                    });
            } else {
                console.log('当前标签是普通标签:', doubanCurrentTag);
                renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
            }
        }
    } else {
        console.log('隐藏豆瓣区域');
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
    // 不再需要此函数，因为已经删除了原有分类内容
    console.log("loadAllCategoryContent函数已弃用");
}

// 设置"换一批"按钮点击事件
function setupDoubanRefreshBtn() {
    const refreshBtn = document.getElementById('doubanRefreshBtn');
    if (!refreshBtn) return;
    
    refreshBtn.addEventListener('click', function() {
        // 更新页码
        doubanPageStart += doubanPageSize;
        if (doubanPageStart > 9 * doubanPageSize) {
            doubanPageStart = 0;
        }
        
        // 检查当前标签是否是映射标签
        if (tagToCategoryMap[doubanCurrentTag]) {
            const { type, category } = tagToCategoryMap[doubanCurrentTag];
            
            // 显示加载中状态
            const container = document.getElementById('douban-results');
            if (container) {
                container.innerHTML = `
                    <div class="col-span-full flex justify-center items-center py-8">
                        <div class="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                        <span class="text-pink-500">加载中...</span>
                    </div>
                `;
            }
            
            // 使用fetchCategoryContent获取特定分类内容
            fetchCategoryContent(type, category, doubanCategories[type][category].title, true)
                .then(data => {
                    if (data) {
                        renderDoubanCards(data, document.getElementById('douban-results'));
                    }
                })
                .catch(error => {
                    console.error("获取分类内容失败：", error);
                    if (container) {
                        container.innerHTML = `
                            <div class="col-span-full text-center py-8">
                                <div class="text-red-400">❌ 获取豆瓣数据失败，请稍后重试</div>
                                <div class="text-gray-500 text-sm mt-2">提示：使用VPN可能有助于解决此问题</div>
                            </div>
                        `;
                    }
                });
        } else {
            // 如果是普通标签，使用renderRecommend加载内容
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        }
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
    
    // 模态框内容 - 使用与LibreTV-douban.js相似的样式
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
        
        // 处理图片URL
        // 1. 直接使用豆瓣图片URL (添加no-referrer属性)
        const originalCoverUrl = item.cover;
        
        // 2. 也准备代理URL作为备选
        const proxiedCoverUrl = PROXY_URL + encodeURIComponent(originalCoverUrl);
        
        // 构建卡片HTML - 使用与LibreTV-douban.js相同的样式
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
        
        // 构建卡片HTML - 使用与LibreTV-douban.js相同的样式
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
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 降低超时时间到5秒，提高响应速度
    
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
        
        // 首先尝试使用 JSONP 方式请求（通过动态创建script标签，绕过跨域限制）
        if (url.includes('douban.com/j/search_subjects')) {
            try {
                const jsonpData = await fetchWithJSONP(url);
                
                // 保存到缓存
                const cacheKey = `douban_${url.replace(/[^a-zA-Z0-9]/g, '_')}`;
                jsonpData.timestamp = Date.now();
                localStorage.setItem(cacheKey, JSON.stringify(jsonpData));
                
                // 同时保存到内存缓存
                const now = Date.now();
                doubanCache[url] = {
                    data: jsonpData,
                    expiry: now + CACHE_EXPIRY
                };
                
                return jsonpData;
            } catch (jsonpError) {
                console.warn('JSONP请求失败，尝试代理方式:', jsonpError);
                // 继续使用代理方式
            }
        }
        
        // 如果JSONP失败或不适用，使用代理方式
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
        console.error("豆瓣 API 请求失败:", err);
        clearTimeout(timeoutId);
        
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

// 使用JSONP方式获取数据（通过动态创建script标签，绕过跨域限制）
function fetchWithJSONP(url) {
    return new Promise((resolve, reject) => {
        // 创建一个唯一的回调函数名
        const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
        
        // 创建script标签
        const script = document.createElement('script');
        
        // 添加回调函数到window对象
        window[callbackName] = function(data) {
            // 清理：删除script标签和回调函数
            delete window[callbackName];
            document.body.removeChild(script);
            
            // 解析成功，返回数据
            resolve(data);
        };
        
        // 设置超时处理
        const timeout = setTimeout(() => {
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('JSONP请求超时'));
        }, 5000);
        
        // 添加错误处理
        script.onerror = function() {
            clearTimeout(timeout);
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('JSONP请求失败'));
        };
        
        // 构建带回调的URL
        const separator = url.includes('?') ? '&' : '?';
        script.src = `${url}${separator}callback=${callbackName}`;
        
        // 添加script标签到页面，开始请求
        document.body.appendChild(script);
    });
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
        
        // 显示加载提示
        if (typeof showLoading === 'function') {
            showLoading('正在搜索豆瓣内容...');
        }
        
        try {
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
        } catch (error) {
            console.error('搜索失败:', error);
            showToast('搜索失败，请稍后重试', 'error');
        } finally {
            // 隐藏加载提示
            if (typeof hideLoading === 'function') {
                hideLoading();
            }
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

// 检查DOM是否已经加载完成
function docReady(fn) {
    // 如果文档已经加载完成
    if (document.readyState === "complete" || document.readyState === "interactive") {
        // 延迟调用，确保所有DOM元素可用
        setTimeout(fn, 1);
    } else {
        // 否则等待DOMContentLoaded事件
        document.addEventListener("DOMContentLoaded", fn);
    }
}

// 使用docReady初始化豆瓣功能
docReady(function() {
    console.log('DOM加载完成，开始初始化豆瓣功能');
    
    // 检查关键DOM元素是否存在
    const doubanArea = document.getElementById('doubanArea');
    const doubanMovieTvSwitch = document.getElementById('doubanMovieTvSwitch');
    const doubanTags = document.getElementById('doubanTags');
    const doubanResults = document.getElementById('douban-results');
    
    console.log('检查DOM元素:', {
        doubanArea: !!doubanArea,
        doubanMovieTvSwitch: !!doubanMovieTvSwitch,
        doubanTags: !!doubanTags,
        doubanResults: !!doubanResults
    });
    
    if (!doubanArea || !doubanMovieTvSwitch || !doubanTags || !doubanResults) {
        console.error('豆瓣功能初始化失败：缺少必要的DOM元素');
        return;
    }
    
    // 加载用户标签
    loadUserTags();
    
    // 初始化豆瓣功能
    initDouban();
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

// 显示资源选择模态框 - 豆瓣版
function showDoubanResourceModal(title, resources) {
    // 过滤掉视频数为0的资源，除非是当前正在使用的资源
    const currentApi = document.getElementById('currentApiName')?.textContent || '';
    const filteredResources = resources.filter(resource => {
        // 如果是当前正在使用的API，即使视频数为0也要显示
        if (resource.api === currentApi) {
            return true;
        }
        // 否则只显示视频数大于0的资源
        return resource.count > 0;
    });
    
    // 如果过滤后没有资源，显示提示
    if (filteredResources.length === 0) {
        showToast('没有可用的资源', 'warning');
        return;
    }
    
    // 创建模态框
    let modal = document.getElementById('doubanResourceModal');
    if (modal) {
        document.body.removeChild(modal);
    }
    
    modal = document.createElement('div');
    modal.id = 'doubanResourceModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4';
    
    // 模态框内容
    modal.innerHTML = `
        <div class="bg-[#111] rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div class="flex justify-between items-center p-4 border-b border-[#333]">
                <h3 class="text-xl font-bold text-white">选择资源</h3>
                <button id="closeDoubanResourceModal" class="text-gray-400 hover:text-white transition-colors">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="flex-1 overflow-y-auto p-4">
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    ${filteredResources.map(resource => `
                        <button 
                            onclick="selectDoubanResource('${resource.api}', '${resource.url}')" 
                            class="bg-[#1a1a1a] hover:bg-[#333] text-white p-3 rounded-lg transition-colors flex flex-col items-center justify-center gap-1 border border-[#333] hover:border-white">
                            <span class="text-sm font-medium truncate w-full text-center">${resource.api}</span>
                            <span class="text-xs text-gray-400">${resource.count} 个视频</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(modal);
    
    // 关闭按钮事件
    document.getElementById('closeDoubanResourceModal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// 关闭模态框函数
function closeModal() {
    const modal = document.getElementById('categoryModal');
    if (modal) {
        document.body.removeChild(modal);
    }
}

// 选择资源函数 - 豆瓣版
function selectDoubanResource(api, url) {
    // 关闭资源模态框
    const modal = document.getElementById('doubanResourceModal');
    if (modal) {
        document.body.removeChild(modal);
    }
    
    // 更新当前API名称显示
    const apiNameEl = document.getElementById('currentApiName');
    if (apiNameEl) {
        apiNameEl.textContent = api;
    }
    
    // 如果有播放函数，调用它
    if (typeof playVideo === 'function') {
        playVideo(url);
    } else {
        // 否则直接跳转
        window.location.href = url;
    }
}

// 渲染热门推荐内容
function renderRecommend(tag, pageLimit, pageStart) {
    const container = document.getElementById("douban-results");
    if (!container) return;

    // 添加骨架屏加载效果，比全屏加载提示更友好
    const skeletonHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 animate-pulse">
            ${Array(pageLimit).fill().map(() => `
                <div class="bg-gray-800 rounded-lg overflow-hidden">
                    <div class="w-full aspect-[2/3] bg-gray-700"></div>
                    <div class="p-2">
                        <div class="h-4 bg-gray-700 rounded w-3/4 mx-auto"></div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    container.innerHTML = skeletonHTML;
    
    const target = `https://movie.douban.com/j/search_subjects?type=${doubanMovieTvCurrentSwitch}&tag=${tag}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`;
    
    // 使用通用请求函数
    fetchDoubanData(target)
        .then(data => {
            renderDoubanCards(data, container);
        })
        .catch(error => {
            console.error("获取豆瓣数据失败：", error);
            container.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <div class="text-red-400">❌ 获取豆瓣数据失败，请稍后重试</div>
                    <div class="text-gray-500 text-sm mt-2">提示：使用VPN可能有助于解决此问题</div>
                </div>
            `;
        });
}

// 渲染豆瓣卡片
function renderDoubanCards(data, container) {
    // 创建文档片段以提高性能
    const fragment = document.createDocumentFragment();
    
    // 如果没有数据
    if (!data.subjects || data.subjects.length === 0) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "col-span-full text-center py-8";
        emptyEl.innerHTML = `
            <div class="text-pink-500">❌ 暂无数据，请尝试其他分类或刷新</div>
        `;
        fragment.appendChild(emptyEl);
    } else {
        // 循环创建每个影视卡片
        data.subjects.forEach(item => {
            const card = document.createElement("div");
            card.className = "bg-[#111] hover:bg-[#222] transition-all duration-300 rounded-lg overflow-hidden flex flex-col transform hover:scale-105 shadow-md hover:shadow-lg";
            
            // 生成卡片内容，确保安全显示（防止XSS）
            const safeTitle = item.title
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
            
            const safeRate = (item.rate || "暂无")
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            
            // 处理图片URL
            // 1. 直接使用豆瓣图片URL (添加no-referrer属性)
            const originalCoverUrl = item.cover;
            
            // 2. 也准备代理URL作为备选
            const proxiedCoverUrl = PROXY_URL + encodeURIComponent(originalCoverUrl);
            
            // 为不同设备优化卡片布局
            card.innerHTML = `
                <div class="relative w-full aspect-[2/3] overflow-hidden cursor-pointer" onclick="fillAndSearchWithDouban('${safeTitle}')">
                    <img src="${originalCoverUrl}" alt="${safeTitle}" 
                        class="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                        onerror="this.onerror=null; this.src='${proxiedCoverUrl}'; this.classList.add('object-contain');"
                        loading="lazy" referrerpolicy="no-referrer">
                    <div class="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-60"></div>
                    <div class="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm">
                        <span class="text-yellow-400">★</span> ${safeRate}
                    </div>
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
            
            fragment.appendChild(card);
        });
    }
    
    // 清空并添加所有新元素
    container.innerHTML = "";
    container.appendChild(fragment);
}

// 渲染电影/电视剧切换UI
function renderDoubanMovieTvSwitch() {
    const container = document.getElementById('doubanMovieTvSwitch');
    if (!container) {
        console.error('找不到doubanMovieTvSwitch容器元素');
        return;
    }

    console.log('开始渲染电影/电视剧切换UI');

    // 创建切换UI
    container.innerHTML = `
        <div class="flex justify-center items-center space-x-2 mb-4">
            <button id="doubanMovieBtn" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors ${doubanMovieTvCurrentSwitch === 'movie' ? 'bg-pink-600 text-white' : 'bg-[#222] text-gray-300 hover:bg-[#333]'}">
                电影
            </button>
            <button id="doubanTvBtn" class="px-4 py-2 rounded-lg text-sm font-medium transition-colors ${doubanMovieTvCurrentSwitch === 'tv' ? 'bg-pink-600 text-white' : 'bg-[#222] text-gray-300 hover:bg-[#333]'}">
                剧集
            </button>
            <button id="tagManageBtn" class="ml-auto px-3 py-1.5 text-xs rounded-lg bg-[#222] text-gray-300 hover:bg-[#333] transition-colors flex items-center">
                <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                </svg>
                标签管理
            </button>
        </div>
    `;

    console.log('电影/电视剧切换UI已渲染');

    // 添加事件监听
    const movieBtn = document.getElementById('doubanMovieBtn');
    const tvBtn = document.getElementById('doubanTvBtn');
    const tagManageBtn = document.getElementById('tagManageBtn');
    
    if (!movieBtn || !tvBtn || !tagManageBtn) {
        console.error('找不到电影/电视剧切换按钮或标签管理按钮', {
            movieBtn: !!movieBtn,
            tvBtn: !!tvBtn,
            tagManageBtn: !!tagManageBtn
        });
        return;
    }
    
    console.log('找到所有按钮，添加事件监听');

    movieBtn.addEventListener('click', function() {
        console.log('点击了电影按钮');
        if (doubanMovieTvCurrentSwitch !== 'movie') {
            // 更新UI
            this.classList.add('bg-pink-600', 'text-white');
            this.classList.remove('bg-[#222]', 'text-gray-300', 'hover:bg-[#333]');
            
            tvBtn.classList.remove('bg-pink-600', 'text-white');
            tvBtn.classList.add('bg-[#222]', 'text-gray-300', 'hover:bg-[#333]');
            
            // 更新状态
            doubanMovieTvCurrentSwitch = 'movie';
            doubanCurrentTag = '热门';
            doubanPageStart = 0;
            
            // 渲染电影标签
            renderDoubanTags(movieTags);
            
            // 加载电影内容
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        }
    });

    tvBtn.addEventListener('click', function() {
        console.log('点击了剧集按钮');
        if (doubanMovieTvCurrentSwitch !== 'tv') {
            // 更新UI
            this.classList.add('bg-pink-600', 'text-white');
            this.classList.remove('bg-[#222]', 'text-gray-300', 'hover:bg-[#333]');
            
            movieBtn.classList.remove('bg-pink-600', 'text-white');
            movieBtn.classList.add('bg-[#222]', 'text-gray-300', 'hover:bg-[#333]');
            
            // 更新状态
            doubanMovieTvCurrentSwitch = 'tv';
            doubanCurrentTag = '热门';
            doubanPageStart = 0;
            
            // 渲染电视剧标签
            renderDoubanTags(tvTags);
            
            // 加载电视剧内容
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        }
    });

    // 标签管理按钮
    tagManageBtn.addEventListener('click', function() {
        console.log('点击了标签管理按钮');
        showTagManageModal();
    });
    
    console.log('电影/电视剧切换UI事件监听已添加');
}

// 渲染豆瓣标签
function renderDoubanTags(tags) {
    const container = document.getElementById('doubanTags');
    if (!container) {
        console.error('找不到doubanTags容器元素');
        return;
    }
    
    console.log('开始渲染豆瓣标签，容器存在:', container);
    
    // 如果没有传入标签，则根据当前选择使用对应标签
    if (!tags) {
        tags = doubanMovieTvCurrentSwitch === 'movie' ? movieTags : tvTags;
    }
    
    console.log('使用标签:', tags);
    
    // 确保至少有"热门"标签
    if (!tags || tags.length === 0) {
        tags = ['热门'];
        console.log('使用默认热门标签');
    }
    
    // 创建标签HTML
    const tagsHTML = tags.map(tag => `
        <button class="tag-btn px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap ${tag === doubanCurrentTag ? 'bg-pink-600 text-white' : 'bg-[#222] text-gray-300 hover:bg-[#333]'}" 
                data-tag="${tag}">
            ${tag}
        </button>
    `).join('');
    
    console.log('生成的标签HTML长度:', tagsHTML.length);
    
    // 渲染标签
    container.innerHTML = `
        <div class="flex overflow-x-auto pb-2 scrollbar-hide space-x-2">
            ${tagsHTML}
        </div>
    `;
    
    console.log('标签已渲染到DOM');
    
    // 添加标签点击事件
    const tagButtons = container.querySelectorAll('.tag-btn');
    console.log('找到标签按钮数量:', tagButtons.length);
    
    tagButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const tag = this.getAttribute('data-tag');
            console.log('标签被点击:', tag);
            
            // 更新UI
            tagButtons.forEach(b => {
                b.classList.remove('bg-pink-600', 'text-white');
                b.classList.add('bg-[#222]', 'text-gray-300', 'hover:bg-[#333]');
            });
            
            this.classList.add('bg-pink-600', 'text-white');
            this.classList.remove('bg-[#222]', 'text-gray-300', 'hover:bg-[#333]');
            
            // 更新状态
            doubanCurrentTag = tag;
            doubanPageStart = 0;
            
            // 检查是否是映射标签
            if (tagToCategoryMap[tag]) {
                console.log('这是映射标签，使用分类:', tagToCategoryMap[tag]);
                // 如果是映射标签，使用对应的分类加载内容
                const { type, category } = tagToCategoryMap[tag];
                
                // 如果类型与当前切换不一致，需要切换类型
                if (type !== doubanMovieTvCurrentSwitch && (type === 'movie' || type === 'tv')) {
                    doubanMovieTvCurrentSwitch = type;
                    
                    // 更新电影/电视剧切换UI
                    const movieBtn = document.getElementById('doubanMovieBtn');
                    const tvBtn = document.getElementById('doubanTvBtn');
                    
                    if (movieBtn && tvBtn) {
                        if (type === 'movie') {
                            movieBtn.classList.add('bg-pink-600', 'text-white');
                            movieBtn.classList.remove('bg-[#222]', 'text-gray-300', 'hover:bg-[#333]');
                            
                            tvBtn.classList.remove('bg-pink-600', 'text-white');
                            tvBtn.classList.add('bg-[#222]', 'text-gray-300', 'hover:bg-[#333]');
                        } else {
                            tvBtn.classList.add('bg-pink-600', 'text-white');
                            tvBtn.classList.remove('bg-[#222]', 'text-gray-300', 'hover:bg-[#333]');
                            
                            movieBtn.classList.remove('bg-pink-600', 'text-white');
                            movieBtn.classList.add('bg-[#222]', 'text-gray-300', 'hover:bg-[#333]');
                        }
                    }
                }
                
                // 使用fetchCategoryContent获取特定分类内容
                fetchCategoryContent(type, category, doubanCategories[type][category].title, true)
                    .then(data => {
                        if (data) {
                            renderDoubanCards(data, document.getElementById('douban-results'));
                        }
                    })
                    .catch(error => {
                        console.error("获取分类内容失败：", error);
                        document.getElementById('douban-results').innerHTML = `
                            <div class="col-span-full text-center py-8">
                                <div class="text-red-400">❌ 获取豆瓣数据失败，请稍后重试</div>
                                <div class="text-gray-500 text-sm mt-2">提示：使用VPN可能有助于解决此问题</div>
                            </div>
                        `;
                    });
            } else {
                console.log('这是普通标签，使用renderRecommend加载内容');
                // 如果是普通标签，使用renderRecommend加载内容
                renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
            }
        });
    });
}

// 设置换一批按钮
function setupDoubanRefreshBtn() {
    const refreshBtn = document.getElementById('doubanRefreshBtn');
    if (!refreshBtn) return;
    
    refreshBtn.addEventListener('click', function() {
        // 更新页码
        doubanPageStart += doubanPageSize;
        if (doubanPageStart > 9 * doubanPageSize) {
            doubanPageStart = 0;
        }
        
        // 检查当前标签是否是映射标签
        if (tagToCategoryMap[doubanCurrentTag]) {
            const { type, category } = tagToCategoryMap[doubanCurrentTag];
            
            // 显示加载中状态
            const container = document.getElementById('douban-results');
            if (container) {
                container.innerHTML = `
                    <div class="col-span-full flex justify-center items-center py-8">
                        <div class="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                        <span class="text-pink-500">加载中...</span>
                    </div>
                `;
            }
            
            // 使用fetchCategoryContent获取特定分类内容
            fetchCategoryContent(type, category, doubanCategories[type][category].title, true)
                .then(data => {
                    if (data) {
                        renderDoubanCards(data, document.getElementById('douban-results'));
                    }
                })
                .catch(error => {
                    console.error("获取分类内容失败：", error);
                    if (container) {
                        container.innerHTML = `
                            <div class="col-span-full text-center py-8">
                                <div class="text-red-400">❌ 获取豆瓣数据失败，请稍后重试</div>
                                <div class="text-gray-500 text-sm mt-2">提示：使用VPN可能有助于解决此问题</div>
                            </div>
                        `;
                    }
                });
        } else {
            // 如果是普通标签，使用renderRecommend加载内容
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        }
    });
}

// 显示标签管理模态框
function showTagManageModal() {
    // 确保模态框在页面上只有一个实例
    let modal = document.getElementById('tagManageModal');
    if (modal) {
        document.body.removeChild(modal);
    }
    
    // 创建模态框元素
    modal = document.createElement('div');
    modal.id = 'tagManageModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-40';
    
    // 当前使用的标签类型和默认标签
    const isMovie = doubanMovieTvCurrentSwitch === 'movie';
    const currentTags = isMovie ? movieTags : tvTags;
    const defaultTags = isMovie ? defaultMovieTags : defaultTvTags;
    
    // 模态框内容
    modal.innerHTML = `
        <div class="bg-[#191919] rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto relative">
            <button id="closeTagModal" class="absolute top-4 right-4 text-gray-400 hover:text-white text-xl">&times;</button>
            
            <h3 class="text-xl font-bold text-white mb-4">标签管理 (${isMovie ? '电影' : '电视剧'})</h3>
            
            <div class="mb-4">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="text-lg font-medium text-gray-300">标签列表</h4>
                    <button id="resetTagsBtn" class="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded">
                        恢复默认标签
                    </button>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4" id="tagsGrid">
                    ${currentTags.length ? currentTags.map(tag => {
                        // "热门"标签不能删除
                        const canDelete = tag !== '热门';
                        return `
                            <div class="bg-[#1a1a1a] text-gray-300 py-1.5 px-3 rounded text-sm font-medium flex justify-between items-center group">
                                <span>${tag}</span>
                                ${canDelete ? 
                                    `<button class="delete-tag-btn text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" 
                                        data-tag="${tag}">✕</button>` : 
                                    `<span class="text-gray-500 text-xs italic opacity-0 group-hover:opacity-100">必需</span>`
                                }
                            </div>
                        `;
                    }).join('') : 
                    `<div class="col-span-full text-center py-4 text-gray-500">无标签，请添加或恢复默认</div>`}
                </div>
            </div>
            
            <div class="border-t border-gray-700 pt-4">
                <h4 class="text-lg font-medium text-gray-300 mb-3">添加新标签</h4>
                <form id="addTagForm" class="flex items-center">
                    <input type="text" id="newTagInput" placeholder="输入标签名称..." 
                           class="flex-1 bg-[#222] text-white border border-gray-700 rounded px-3 py-2 focus:outline-none focus:border-pink-500">
                    <button type="submit" class="ml-2 bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded">添加</button>
                </form>
                <p class="text-xs text-gray-500 mt-2">提示：标签名称不能为空，不能重复，不能包含特殊字符</p>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(modal);
    
    // 关闭按钮事件
    document.getElementById('closeTagModal').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // 添加标签表单提交事件
    document.getElementById('addTagForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('newTagInput');
        const tag = input.value.trim();
        
        if (tag) {
            addTag(tag);
            input.value = '';
            
            // 刷新模态框
            showTagManageModal();
        }
    });
    
    // 删除标签按钮事件
    document.querySelectorAll('.delete-tag-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tag = this.getAttribute('data-tag');
            deleteTag(tag);
            
            // 刷新模态框
            showTagManageModal();
        });
    });
    
    // 重置标签按钮事件
    document.getElementById('resetTagsBtn').addEventListener('click', () => {
        resetTagsToDefault();
        
        // 刷新模态框
        showTagManageModal();
        
        // 重新渲染标签和内容
        renderDoubanTags();
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    });
}

// 添加标签
function addTag(tag) {
    // 安全处理标签名称
    tag = tag.trim();
    
    // 验证标签
    if (!tag || tag.length > 10) {
        showToast('标签名称不能为空或过长（最多10个字符）', 'error');
        return false;
    }
    
    // 不允许特殊字符
    if (/[^\u4e00-\u9fa5a-zA-Z0-9]/.test(tag)) {
        showToast('标签名称只能包含中文、英文和数字', 'error');
        return false;
    }
    
    // 判断当前是电影还是电视剧标签
    const isMovie = doubanMovieTvCurrentSwitch === 'movie';
    const currentTags = isMovie ? movieTags : tvTags;
    
    // 检查是否已存在
    if (currentTags.includes(tag)) {
        showToast('标签已存在', 'warning');
        return false;
    }
    
    // 添加标签
    if (isMovie) {
        movieTags.push(tag);
    } else {
        tvTags.push(tag);
    }
    
    // 保存标签
    saveUserTags();
    
    // 重新渲染标签
    renderDoubanTags();
    
    showToast('标签添加成功', 'success');
    return true;
}

// 删除标签
function deleteTag(tag) {
    // 不允许删除"热门"标签
    if (tag === '热门') {
        showToast('不能删除必需的标签', 'error');
        return false;
    }
    
    // 判断当前是电影还是电视剧标签
    const isMovie = doubanMovieTvCurrentSwitch === 'movie';
    
    // 从数组中移除标签
    if (isMovie) {
        const index = movieTags.indexOf(tag);
        if (index !== -1) {
            movieTags.splice(index, 1);
        }
    } else {
        const index = tvTags.indexOf(tag);
        if (index !== -1) {
            tvTags.splice(index, 1);
        }
    }
    
    // 保存标签
    saveUserTags();
    
    // 如果删除的是当前选中的标签，则切换到"热门"
    if (tag === doubanCurrentTag) {
        doubanCurrentTag = '热门';
        doubanPageStart = 0;
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }
    
    // 重新渲染标签
    renderDoubanTags();
    
    showToast('标签删除成功', 'success');
    return true;
}

// 重置标签到默认
function resetTagsToDefault() {
    // 判断当前是电影还是电视剧标签
    const isMovie = doubanMovieTvCurrentSwitch === 'movie';
    
    // 重置标签
    if (isMovie) {
        movieTags = [...defaultMovieTags];
    } else {
        tvTags = [...defaultTvTags];
    }
    
    // 保存标签
    saveUserTags();
    
    // 重置当前标签为热门
    doubanCurrentTag = '热门';
    doubanPageStart = 0;
    
    showToast('已恢复默认标签', 'success');
    return true;
}

// 如果ui.js未加载，提供一个简单的showToast实现
if (typeof showToast !== 'function') {
    function showToast(message, type = 'info') {
        console.log(`[${type}] ${message}`);
        
        // 创建toast元素
        const toast = document.createElement('div');
        toast.className = `fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg text-white text-sm z-50 transition-opacity duration-300`;
        
        // 根据类型设置背景色
        switch (type) {
            case 'success':
                toast.classList.add('bg-green-600');
                break;
            case 'error':
                toast.classList.add('bg-red-600');
                break;
            case 'warning':
                toast.classList.add('bg-yellow-600');
                break;
            default:
                toast.classList.add('bg-blue-600');
        }
        
        // 设置内容
        toast.textContent = message;
        
        // 添加到页面
        document.body.appendChild(toast);
        
        // 淡入效果
        setTimeout(() => {
            toast.classList.add('opacity-90');
        }, 10);
        
        // 3秒后淡出并移除
        setTimeout(() => {
            toast.classList.add('opacity-0');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    }
}

// 设置"换一批"按钮点击事件（原有功能，保留以兼容）
function setupMoreButtons() {
    // 不再需要此函数，但为了保持兼容性，保留一个空函数
    console.log("setupMoreButtons函数已弃用");
}
