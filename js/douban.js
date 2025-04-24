// 豆瓣热门电影电视剧推荐功能

// 豆瓣标签列表 (保持不变)
let movieTags = ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '动作', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '治愈'];
let tvTags = ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '港剧', '日本动画', '综艺', '纪录片'];
let doubanMovieTvCurrentSwitch = 'movie';
let doubanCurrentTag = '热门';
let doubanPageStart = 0;
const doubanPageSize = 16;

// --- 新增: Intersection Observer 相关变量 ---
let doubanObserver = null;
let doubanContainerObserved = false; // 标记容器是否已被观察并触发加载

// 初始化豆瓣功能
function initDouban() {
    // 设置豆瓣开关的初始状态 (保持不变)
    const doubanToggle = document.getElementById('doubanToggle');
    if (doubanToggle) {
        // ... (开关逻辑保持不变) ...
        doubanToggle.addEventListener('change', function(e) {
            const isChecked = e.target.checked;
            localStorage.setItem('doubanEnabled', isChecked);
            // ... (更新开关外观) ...
            updateDoubanVisibility(); // 触发显隐逻辑
        });
        // 初始更新显示状态，这会决定是否设置观察者
        updateDoubanVisibility();
    }

    // 获取豆瓣热门标签 (异步获取，不阻塞)
    fetchDoubanTags();

    // 渲染电影/电视剧切换 (保持不变)
    renderDoubanMovieTvSwitch();

    // 渲染豆瓣标签 (保持不变，初始渲染用默认movieTags)
    renderDoubanTags();

    // 换一批按钮事件监听 (保持不变)
    setupDoubanRefreshBtn();

    // --- 移除初始加载 ---
    // 不再在此处直接调用 renderRecommend
    // if (localStorage.getItem('doubanEnabled') === 'true') {
    //     renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    // }
}

// 根据设置更新豆瓣区域的显示状态 (核心修改点)
function updateDoubanVisibility() {
    const doubanArea = document.getElementById('doubanArea');
    const doubanResultsContainer = document.getElementById('douban-results');
    if (!doubanArea || !doubanResultsContainer) return;

    const isEnabled = localStorage.getItem('doubanEnabled') === 'true';
    const isSearching = document.getElementById('resultsArea') &&
        !document.getElementById('resultsArea').classList.contains('hidden');

    if (isEnabled && !isSearching) {
        doubanArea.classList.remove('hidden');

        // --- 惰性加载逻辑 ---
        // 如果容器内容为空 且 从未被观察加载过
        if (doubanResultsContainer.children.length === 0 && !doubanContainerObserved) {
             // 添加占位符或提示，告知用户滚动加载
             doubanResultsContainer.innerHTML = `
                <div class="col-span-full text-center py-10 text-gray-500">
                    滚动到此处加载豆瓣推荐...
                </div>
             `;
            setupDoubanIntersectionObserver(doubanResultsContainer);
        }
        // 如果之前被隐藏（例如搜索），现在重新显示，并且内容为空（可能因为出错），则重新尝试设置观察者
        else if (doubanResultsContainer.children.length === 0 && doubanContainerObserved) {
             // 重置状态，允许再次观察
             doubanContainerObserved = false;
             doubanResultsContainer.innerHTML = `
                <div class="col-span-full text-center py-10 text-gray-500">
                    滚动到此处加载豆瓣推荐...
                </div>
             `;
             setupDoubanIntersectionObserver(doubanResultsContainer);
        }
        // 如果已有内容，则确保观察者已断开
        else if (doubanResultsContainer.children.length > 0) {
            disconnectDoubanObserver();
        }

    } else {
        doubanArea.classList.add('hidden');
        // 隐藏时断开观察者，并重置观察状态
        disconnectDoubanObserver();
        doubanContainerObserved = false; // 允许下次显示时重新观察
    }
}

// --- 新增: 设置 Intersection Observer ---
function setupDoubanIntersectionObserver(targetElement) {
    // 如果已有观察者，先断开
    disconnectDoubanObserver();

    const options = {
        root: null, // 相对于视口
        rootMargin: '0px',
        threshold: 0.1 // 元素可见10%时触发
    };

    doubanObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            // 当目标元素进入视口时
            if (entry.isIntersecting) {
                console.log("Douban section intersecting, loading data...");
                // 标记已观察并加载
                doubanContainerObserved = true;
                // 加载内容
                renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
                // 触发加载后立即停止观察该元素，避免重复加载
                observer.unobserve(entry.target);
                // 清理 observer 实例
                disconnectDoubanObserver();
            }
        });
    }, options);

    // 开始观察目标元素
    doubanObserver.observe(targetElement);
}

// --- 新增: 断开 Intersection Observer ---
function disconnectDoubanObserver() {
    if (doubanObserver) {
        console.log("Disconnecting Douban observer.");
        doubanObserver.disconnect();
        doubanObserver = null;
    }
}

// 填充搜索框 (保持不变)
function fillSearchInput(title) { /* ... */ }
function fillAndSearch(title) { /* ... */ }
function fillAndSearchWithDouban(title) { /* ... */ }

// 渲染电影/电视剧切换器 (修改：切换时需要立即加载)
function renderDoubanMovieTvSwitch() {
    const movieToggle = document.getElementById('douban-movie-toggle');
    const tvToggle = document.getElementById('douban-tv-toggle');
    if (!movieToggle || !tvToggle) return;

    const handleToggle = (switchToType) => {
        const currentType = doubanMovieTvCurrentSwitch;
        if (currentType !== switchToType) {
            // 更新按钮样式 (保持不变)
            // ... (样式切换代码) ...

            doubanMovieTvCurrentSwitch = switchToType;
            doubanCurrentTag = '热门'; // 重置为热门
            doubanPageStart = 0; // 重置分页

            // --- 立即加载 ---
            disconnectDoubanObserver(); // 确保旧观察者断开
            doubanContainerObserved = true; // 标记为主动加载，不再需要惰性加载
            renderDoubanTags(switchToType === 'movie' ? movieTags : tvTags); // 渲染新标签
            renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart); // 立即渲染内容
        }
    };

    movieToggle.addEventListener('click', () => handleToggle('movie'));
    tvToggle.addEventListener('click', () => handleToggle('tv'));

     // --- 初始化样式 ---
     if (doubanMovieTvCurrentSwitch === 'movie') {
        movieToggle.classList.add('bg-pink-600', 'text-white');
        movieToggle.classList.remove('text-gray-300');
        tvToggle.classList.remove('bg-pink-600', 'text-white');
        tvToggle.classList.add('text-gray-300');
    } else {
        tvToggle.classList.add('bg-pink-600', 'text-white');
        tvToggle.classList.remove('text-gray-300');
        movieToggle.classList.remove('bg-pink-600', 'text-white');
        movieToggle.classList.add('text-gray-300');
    }
}

// 渲染豆瓣标签选择器 (修改：点击标签时需要立即加载)
function renderDoubanTags(tags = movieTags) {
    const tagContainer = document.getElementById('douban-tags');
    if (!tagContainer) return;
    tagContainer.innerHTML = '';

    tags.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'py-1.5 px-3.5 rounded text-sm font-medium transition-all duration-300 ' +
            (tag === doubanCurrentTag ?
                'bg-pink-600 text-white shadow-md' :
                'bg-[#1a1a1a] text-gray-300 hover:bg-pink-700 hover:text-white');
        btn.textContent = tag;

        btn.onclick = function() {
            if (doubanCurrentTag !== tag) {
                // --- 立即加载 ---
                disconnectDoubanObserver(); // 确保旧观察者断开
                doubanContainerObserved = true; // 标记为主动加载
                doubanCurrentTag = tag;
                doubanPageStart = 0; // 重置分页
                renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart); // 立即加载
                renderDoubanTags(tags); // 重新渲染标签以更新样式
            }
        };
        tagContainer.appendChild(btn);
    });
}

// 设置换一批按钮事件 (修改：点击时需要立即加载)
function setupDoubanRefreshBtn() {
    const btn = document.getElementById('douban-refresh');
    if (!btn) return;

    btn.onclick = function() {
        // --- 立即加载 ---
        disconnectDoubanObserver(); // 确保旧观察者断开
        doubanContainerObserved = true; // 标记为主动加载

        doubanPageStart += doubanPageSize;
        // 豆瓣API似乎最多返回10页左右，做一个循环
        if (doubanPageStart >= 10 * doubanPageSize) { // 假设最多10页有效
            doubanPageStart = 0;
            showToast('已回到第一页', 'info');
        }
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart); // 立即加载
    };
}

// 获取豆瓣标签 (保持不变)
function fetchDoubanTags() { /* ... */ }

// 渲染热门推荐内容 (保持不变，但现在由观察者或用户操作触发)
function renderRecommend(tag, pageLimit, pageStart) {
    const container = document.getElementById("douban-results");
    if (!container) return;

    // 显示加载状态 (保持不变)
    container.innerHTML = `
        <div class="col-span-full text-center py-10">
            <div class="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mr-2 inline-block"></div>
            <span class="text-pink-500">加载中...</span>
        </div>
    `;

    const target = `https://movie.douban.com/j/search_subjects?type=${doubanMovieTvCurrentSwitch}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`;

    fetchDoubanData(target)
        .then(data => {
            renderDoubanCards(data, container);
        })
        .catch(error => {
            console.error("获取豆瓣数据失败：", error);
            // 显示更友好的错误信息
             container.innerHTML = `
                <div class="col-span-full text-center py-8">
                    <div class="text-red-400 text-lg">😢</div>
                    <div class="text-red-400 mt-2">加载豆瓣推荐失败</div>
                    <div class="text-gray-500 text-sm mt-1">可能是网络问题或豆瓣接口限制</div>
                    <button onclick="retryDoubanLoad()" class="mt-3 px-4 py-1 bg-pink-600 text-white text-sm rounded hover:bg-pink-700 transition">重试</button>
                </div>
            `;
            // 出错时允许重试，重置观察状态
            doubanContainerObserved = false;
        });
}

// --- 新增: 重试加载函数 ---
function retryDoubanLoad() {
    const container = document.getElementById("douban-results");
    if (container) {
        // 标记为需要重新加载（如果用户滚动可见）或直接加载（如果区域已可见）
        doubanContainerObserved = false;
        updateDoubanVisibility(); // 让 update 函数决定是设置观察者还是立即加载
        // 如果区域当前可见，updateDoubanVisibility 会设置观察者
        // 如果希望点击重试按钮立即加载，可以这样做：
        // renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        // doubanContainerObserved = true; // 标记已主动加载
    }
}


// 异步获取豆瓣数据 (保持不变)
async function fetchDoubanData(url) { /* ... */ }

// 渲染豆瓣卡片 (保持不变，但注意 loading="lazy" 的使用)
function renderDoubanCards(data, container) {
    const fragment = document.createDocumentFragment();
    if (!data.subjects || data.subjects.length === 0) {
        // ... (无数据处理保持不变) ...
    } else {
        data.subjects.forEach(item => {
            const card = document.createElement("div");
            card.className = "bg-[#111] hover:bg-[#222] transition-all duration-300 rounded-lg overflow-hidden flex flex-col transform hover:scale-105 shadow-md hover:shadow-lg";
            const safeTitle = item.title.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            const safeRate = (item.rate || "暂无").replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const originalCoverUrl = item.cover;
            const proxiedCoverUrl = PROXY_URL + encodeURIComponent(originalCoverUrl);

            // 注意：img 标签的 loading="lazy" 属性是浏览器级别的图片懒加载
            // 它与我们实现的 *容器* 懒加载是两个层面的优化，可以并存。
            // 浏览器会在图片接近视口时才加载，进一步优化性能。
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
                        <a href="${item.url}" target="_blank" rel="noopener noreferrer" title="在豆瓣查看">🔗</a>
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
    container.innerHTML = ""; // 清空加载状态或旧内容
    container.appendChild(fragment);
}

// 重置到首页 (修改：确保重置时处理观察者状态)
function resetToHome() {
    resetSearchArea(); // 假设这个函数会隐藏搜索结果区
    // resetSearchArea 后，调用 updateDoubanVisibility 会自动处理显隐和观察者逻辑
    updateDoubanVisibility();
}

// 加载豆瓣首页内容 (保持不变)
document.addEventListener('DOMContentLoaded', initDouban);

// --- 可能需要的辅助函数 (如果 resetSearchArea 不存在) ---
function resetSearchArea() {
    const resultsArea = document.getElementById('resultsArea');
    if (resultsArea) {
        resultsArea.classList.add('hidden');
        resultsArea.innerHTML = '';
    }
    // 可能还需要清空搜索框等
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }
}

// --- 可能需要的全局变量 (确保 PROXY_URL 已定义) ---
// const PROXY_URL = 'YOUR_PROXY_URL_HERE'; // 例如 'https://cors-anywhere.herokuapp.com/' 或你自己的代理
// 确保你的 HTML 或另一个 JS 文件中定义了 PROXY_URL

// --- 可能需要的全局变量 (确保 selectedAPIs, search, showToast 已定义) ---
// let selectedAPIs = [];
// function search() { console.log('Searching...'); }
// function showToast(message, type) { console.log(`Toast (${type}): ${message}`); }
// function updateSelectedAPIs() { console.log('Updating selected APIs...'); }
// 确保这些函数和变量在全局作用域或通过模块导入可用
