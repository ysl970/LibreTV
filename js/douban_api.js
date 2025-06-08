// 豆瓣API请求和搜索功能

// 定义不同类型的内容分类及其对应的搜索关键词
const doubanCategories = {
    movie: {
        comedy: { name: '喜剧', searchTerm: '喜剧电影' },
        action: { name: '动作', searchTerm: '动作电影' },
        scifi: { name: '科幻', searchTerm: '科幻电影' },
        romance: { name: '爱情', searchTerm: '爱情电影' },
        drama: { name: '剧情', searchTerm: '剧情电影' }
    },
    tv: {
        hot: { name: '热门', searchTerm: '热门电视剧' },
        cn: { name: '国产剧', searchTerm: '国产电视剧' },
        kr: { name: '韩剧', searchTerm: '韩国电视剧' },
        jp: { name: '日剧', searchTerm: '日本电视剧' },
        us: { name: '美剧', searchTerm: '美国电视剧' }
    },
    variety: {
        hot: { name: '热门', searchTerm: '热门综艺' },
        cn: { name: '中国', searchTerm: '中国综艺' },
        kr: { name: '韩国', searchTerm: '韩国综艺' },
        jp: { name: '日本', searchTerm: '日本综艺' }
    }
};

// 定义每个分类显示的数量
const doubanPageSize = 6; 

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
        // 尝试直接访问（通过代理）
        const response = await fetch(PROXY_URL + encodeURIComponent(url), fetchOptions);
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        return await response.json();
    } catch (err) {
        console.error("豆瓣 API 请求失败（直接代理）：", err);
        
        // 失败后尝试备用方法
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

// 获取特定分类的内容
async function fetchCategoryContent(type, category) {
    const containerClass = `douban-${type}-${category}`;
    const container = document.querySelector(`.${containerClass}`);
    if (!container) {
        console.error(`找不到容器: .${containerClass}`);
        return;
    }
    
    try {
        // 显示加载中状态
        container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">加载中...</div>';
        
        // 获取分类名称
        const categoryInfo = doubanCategories[type][category];
        if (!categoryInfo) {
            throw new Error(`未找到分类信息: ${type}-${category}`);
        }
        
        const categoryName = categoryInfo.name;
        
        // 构建API请求URL
        let apiUrl = '';
        if (type === 'movie') {
            apiUrl = `https://movie.douban.com/j/search_subjects?type=movie&tag=${encodeURIComponent(categoryName)}&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
        } else if (type === 'tv') {
            apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=${encodeURIComponent(categoryName)}&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
        } else if (type === 'variety') {
            // 修复综艺内容获取，使用正确的tag参数
            apiUrl = `https://movie.douban.com/j/search_subjects?type=tv&tag=${encodeURIComponent('综艺')}&sort=recommend&page_limit=${doubanPageSize}&page_start=0`;
        }
        
        console.log(`正在获取 ${type}-${category} 内容，URL: ${apiUrl}`);
        
        // 获取数据
        const data = await fetchDoubanData(apiUrl);
        
        return data;
    } catch (error) {
        console.error(`获取${type}-${category}内容失败:`, error);
        container.innerHTML = `<div class="col-span-full text-center py-8 text-red-500">加载失败，请稍后再试</div>`;
        return null;
    }
}

// 导出函数和变量
window.doubanAPI = {
    categories: doubanCategories,
    pageSize: doubanPageSize,
    fetchData: fetchDoubanData,
    fetchCategoryContent: fetchCategoryContent
}; 
