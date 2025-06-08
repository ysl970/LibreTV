// 豆瓣卡片UI渲染

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
        card.className = 'bg-[#111] hover:bg-[#222] transition-all duration-300 rounded-lg overflow-hidden flex flex-col transform hover:scale-105 shadow-md hover:shadow-lg douban-card-small';
        
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
        
        // 构建卡片HTML - 修改为点击时自动搜索
        card.innerHTML = `
            <div class="relative w-full aspect-[2/3] overflow-hidden cursor-pointer" onclick="fillAndSearchWithDouban('${safeTitle}')">
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
}

// 加载所有分类内容
async function loadAllCategoryContent() {
    // 加载电影分类
    for (const [key, value] of Object.entries(window.doubanAPI.categories.movie)) {
        const data = await window.doubanAPI.fetchCategoryContent('movie', key);
        if (data) {
            const container = document.querySelector(`.douban-movie-${key}`);
            if (container) {
                renderCategoryContent(data, container);
            }
        }
    }
    
    // 加载电视剧分类
    const tvData = await window.doubanAPI.fetchCategoryContent('tv', 'hot');
    if (tvData) {
        const container = document.querySelector('.douban-tv-hot');
        if (container) {
            renderCategoryContent(tvData, container);
        }
    }
    
    // 加载综艺分类
    const varietyData = await window.doubanAPI.fetchCategoryContent('variety', 'hot');
    if (varietyData) {
        const container = document.querySelector('.douban-variety-hot');
        if (container) {
            renderCategoryContent(varietyData, container);
        }
    }
}

// 设置"更多"按钮点击事件
function setupMoreButtons() {
    // 获取所有"更多"按钮
    const moreButtons = document.querySelectorAll('#doubanArea a[href="#"]');
    
    // 为每个按钮添加点击事件
    moreButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            
            // 获取分类信息（从data属性）
            const category = this.getAttribute('data-category');
            const type = this.getAttribute('data-type');
            
            if (!category || !type) {
                console.error('按钮缺少必要的data属性');
                return;
            }
            
            // 获取分类的搜索词
            const categoryInfo = window.doubanAPI.categories[type][category];
            if (!categoryInfo) {
                console.error(`未找到分类信息: ${type}-${category}`);
                return;
            }
            
            const searchTerm = categoryInfo.searchTerm;
            console.log(`点击了"更多"按钮: ${type}-${category}, 搜索词: ${searchTerm}`);
            
            // 填充搜索框并执行搜索
            if (searchTerm) {
                fillAndSearch(searchTerm);
            }
        });
    });
}

// 导出函数
window.doubanCardsUI = {
    renderCategoryContent: renderCategoryContent,
    loadAllCategoryContent: loadAllCategoryContent,
    setupMoreButtons: setupMoreButtons
}; 
