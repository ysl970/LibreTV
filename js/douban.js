// 豆瓣热门电影电视剧推荐功能

// 豆瓣标签列表 - 默认标签
const defaultMovieTags = ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '动作', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '治愈'];
const defaultTvTags = ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '港剧', '日本动画', '综艺', '纪录片'];

// 用户标签列表 - 存储用户实际使用的标签（包含保留的系统标签和用户添加的自定义标签）
let movieTags = [];
let tvTags = [];

// 全局状态变量
let doubanMovieTvCurrentSwitch = 'movie';
let doubanCurrentTag = '热门';
let doubanPageStart = 0;
const doubanPageSize = 16; // 一次显示的项目数量

// 用于本地存储的键名
const STORAGE_KEYS = {
  DOUBAN_ENABLED: 'doubanEnabled',
  USER_MOVIE_TAGS: 'userMovieTags',
  USER_TV_TAGS: 'userTvTags'
};

/**
 * 加载用户标签
 * 从localStorage加载用户保存的标签或使用默认标签
 */
function loadUserTags() {
  try {
    // 尝试从本地存储加载用户保存的标签
    const savedMovieTags = localStorage.getItem(STORAGE_KEYS.USER_MOVIE_TAGS);
    const savedTvTags = localStorage.getItem(STORAGE_KEYS.USER_TV_TAGS);

    // 如果本地存储中有标签数据，则使用它
    movieTags = savedMovieTags ? JSON.parse(savedMovieTags) : [...defaultMovieTags];
    tvTags = savedTvTags ? JSON.parse(savedTvTags) : [...defaultTvTags];
  } catch (e) {
    console.error('加载标签失败：', e);
    // 初始化为默认值，防止错误
    movieTags = [...defaultMovieTags];
    tvTags = [...defaultTvTags];
  }
}

/**
 * 保存用户标签到localStorage
 */
function saveUserTags() {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_MOVIE_TAGS, JSON.stringify(movieTags));
    localStorage.setItem(STORAGE_KEYS.USER_TV_TAGS, JSON.stringify(tvTags));
  } catch (e) {
    console.error('保存标签失败：', e);
    showToast('保存标签失败', 'error');
  }
}

/**
 * 初始化豆瓣功能
 * 设置事件监听器和初始状态
 */
function initDouban() {
  initToggleSwitch();
  loadUserTags();
  renderDoubanMovieTvSwitch();
  renderDoubanTags();
  setupDoubanRefreshBtn();

  // 初始加载热门内容
  if (localStorage.getItem(STORAGE_KEYS.DOUBAN_ENABLED) === 'true') {
    renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
  }
}

/**
 * 初始化豆瓣开关
 */
function initToggleSwitch() {
  const doubanToggle = document.getElementById('doubanToggle');
  if (!doubanToggle) return;

  const isEnabled = localStorage.getItem(STORAGE_KEYS.DOUBAN_ENABLED) === 'true';
  doubanToggle.checked = isEnabled;

  // 设置开关外观
  const toggleBg = doubanToggle.nextElementSibling;
  const toggleDot = toggleBg?.nextElementSibling;
  
  if (toggleBg && toggleDot) {
    if (isEnabled) {
      toggleBg.classList.add('bg-pink-600');
      toggleDot.classList.add('translate-x-6');
    }

    // 添加事件监听
    doubanToggle.addEventListener('change', function(e) {
      const isChecked = e.target.checked;
      localStorage.setItem(STORAGE_KEYS.DOUBAN_ENABLED, isChecked);

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
  }

  // 初始更新显示状态
  updateDoubanVisibility();
}

/**
 * 根据设置更新豆瓣区域的显示状态
 */
function updateDoubanVisibility() {
  const doubanArea = document.getElementById('doubanArea');
  if (!doubanArea) return;

  const isEnabled = localStorage.getItem(STORAGE_KEYS.DOUBAN_ENABLED) === 'true';
  const resultsArea = document.getElementById('resultsArea');
  const isSearching = resultsArea && !resultsArea.classList.contains('hidden');

  // 只有在启用且没有搜索结果显示时才显示豆瓣区域
  if (isEnabled && !isSearching) {
    doubanArea.classList.remove('hidden');
    
    // 检查是否需要加载数据
    const doubanResults = document.getElementById('douban-results');
    if (doubanResults && doubanResults.children.length === 0) {
      renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }
  } else {
    doubanArea.classList.add('hidden');
  }
}

/**
 * 安全处理文本，防止XSS
 * @param {string} text - 待处理的文本
 * @returns {string} - 处理后的安全文本
 */
function sanitizeText(text) {
  if (!text) return '';
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 只填充搜索框，不执行搜索
 * @param {string} title - 要填充的标题
 */
function fillSearchInput(title) {
  if (!title) return;

  const safeTitle = sanitizeText(title);
  const input = document.getElementById('searchInput');
  
  if (input) {
    input.value = safeTitle;
    input.focus();
    showToast('已填充搜索内容，点击搜索按钮开始搜索', 'info');
  }
}

/**
 * 填充搜索框并执行搜索
 * @param {string} title - 要填充的标题
 */
function fillAndSearch(title) {
  if (!title) return;

  const safeTitle = sanitizeText(title);
  const input = document.getElementById('searchInput');
  
  if (input) {
    input.value = safeTitle;
    if (typeof search === 'function') {
      search(); // 使用已有的search函数执行搜索
    }
  }
}

/**
 * 填充搜索框，确保豆瓣资源API被选中，然后执行搜索
 * @param {string} title - 要填充的标题
 */
function fillAndSearchWithDouban(title) {
  if (!title) return;

  const safeTitle = sanitizeText(title);

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
    if (typeof search === 'function') {
      search(); // 使用已有的search函数执行搜索
    }
  }
}

/**
 * 渲染电影/电视剧切换器
 */
function renderDoubanMovieTvSwitch() {
  const movieToggle = document.getElementById('douban-movie-toggle');
  const tvToggle = document.getElementById('douban-tv-toggle');

  if (!movieToggle || !tvToggle) return;

  // 移除现有的事件监听器，避免重复绑定
  const newMovieToggle = movieToggle.cloneNode(true);
  const newTvToggle = tvToggle.cloneNode(true);
  
  movieToggle.parentNode.replaceChild(newMovieToggle, movieToggle);
  tvToggle.parentNode.replaceChild(newTvToggle, tvToggle);

  // 电影按钮点击事件
  newMovieToggle.addEventListener('click', function() {
    if (doubanMovieTvCurrentSwitch !== 'movie') {
      switchMediaType('movie', newMovieToggle, newTvToggle);
    }
  });

  // 电视剧按钮点击事件
  newTvToggle.addEventListener('click', function() {
    if (doubanMovieTvCurrentSwitch !== 'tv') {
      switchMediaType('tv', newTvToggle, newMovieToggle);
    }
  });

  // 初始化状态
  const activeBtn = doubanMovieTvCurrentSwitch === 'movie' ? newMovieToggle : newTvToggle;
  const inactiveBtn = doubanMovieTvCurrentSwitch === 'movie' ? newTvToggle : newMovieToggle;
  
  activeBtn.classList.add('bg-pink-600', 'text-white');
  activeBtn.classList.remove('text-gray-300');
  
  inactiveBtn.classList.remove('bg-pink-600', 'text-white');
  inactiveBtn.classList.add('text-gray-300');
}

/**
 * 切换媒体类型（电影/电视剧）
 * @param {string} type - 媒体类型('movie'或'tv')
 * @param {HTMLElement} activeBtn - 激活的按钮
 * @param {HTMLElement} inactiveBtn - 非激活的按钮
 */
function switchMediaType(type, activeBtn, inactiveBtn) {
  // 更新按钮样式
  activeBtn.classList.add('bg-pink-600', 'text-white');
  activeBtn.classList.remove('text-gray-300');

  inactiveBtn.classList.remove('bg-pink-600', 'text-white');
  inactiveBtn.classList.add('text-gray-300');

  doubanMovieTvCurrentSwitch = type;
  doubanCurrentTag = '热门';
  doubanPageStart = 0;

  // 重新加载豆瓣内容
  renderDoubanTags();
  
  // 如果启用了豆瓣，则加载热门内容
  if (localStorage.getItem(STORAGE_KEYS.DOUBAN_ENABLED) === 'true') {
    renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
  }
}

/**
 * 渲染豆瓣标签选择器
 */
function renderDoubanTags() {
  const tagContainer = document.getElementById('douban-tags');
  if (!tagContainer) return;

  // 使用文档片段减少DOM操作
  const fragment = document.createDocumentFragment();
  
  // 确定当前应该使用的标签列表
  const currentTags = doubanMovieTvCurrentSwitch === 'movie' ? movieTags : tvTags;

  // 添加标签管理按钮
  const manageBtn = document.createElement('button');
  manageBtn.className = 'py-1.5 px-3.5 rounded text-sm font-medium transition-all duration-300 bg-[#1a1a1a] text-gray-300 hover:bg-pink-700 hover:text-white';
  manageBtn.innerHTML = '<span class="flex items-center"><svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>管理标签</span>';
  manageBtn.onclick = showTagManageModal;
  fragment.appendChild(manageBtn);

  // 添加所有标签
  currentTags.forEach(tag => {
    const btn = document.createElement('button');

    // 设置样式
    let btnClass = 'py-1.5 px-3.5 rounded text-sm font-medium transition-all duration-300 ';

    // 当前选中的标签使用高亮样式
    btnClass += tag === doubanCurrentTag 
      ? 'bg-pink-600 text-white shadow-md'
      : 'bg-[#1a1a1a] text-gray-300 hover:bg-pink-700 hover:text-white';

    btn.className = btnClass;
    btn.textContent = tag;

    btn.onclick = function() {
      if (doubanCurrentTag !== tag) {
        doubanCurrentTag = tag;
        doubanPageStart = 0;
        renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
        renderDoubanTags();
      }
    };

    fragment.appendChild(btn);
  });

  // 清空并添加所有新元素
  tagContainer.innerHTML = '';
  tagContainer.appendChild(fragment);
}

/**
 * 设置换一批按钮事件
 */
function setupDoubanRefreshBtn() {
  const btn = document.getElementById('douban-refresh');
  if (!btn) return;

  // 移除现有的事件监听器，避免重复绑定
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.onclick = function() {
    doubanPageStart += doubanPageSize;
    // 最多翻10页，然后回到第一页
    if (doubanPageStart > 9 * doubanPageSize) {
      doubanPageStart = 0;
    }
    renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
  };
}

/**
 * 获取豆瓣标签列表
 * 注：此函数在原代码中未被调用，保留以备将来使用
 */
function fetchDoubanTags() {
  const movieTagsTarget = `https://movie.douban.com/j/search_tags?type=movie`;
  fetchDoubanData(movieTagsTarget)
    .then(data => {
      if (data && data.tags) {
        movieTags = data.tags;
        if (doubanMovieTvCurrentSwitch === 'movie') {
          renderDoubanTags();
        }
      }
    })
    .catch(error => {
      console.error("获取豆瓣热门电影标签失败：", error);
    });
    
  const tvTagsTarget = `https://movie.douban.com/j/search_tags?type=tv`;
  fetchDoubanData(tvTagsTarget)
    .then(data => {
      if (data && data.tags) {
        tvTags = data.tags;
        if (doubanMovieTvCurrentSwitch === 'tv') {
          renderDoubanTags();
        }
      }
    })
    .catch(error => {
      console.error("获取豆瓣热门电视剧标签失败：", error);
    });
}

/**
 * 渲染热门推荐内容
 * @param {string} tag - 当前选中的标签
 * @param {number} pageLimit - 每页显示数量
 * @param {number} pageStart - 起始位置
 */
function renderRecommend(tag, pageLimit, pageStart) {
  const container = document.getElementById("douban-results");
  if (!container) return;

  // 创建并添加加载状态
  const loadingOverlay = createLoadingOverlay();
  
  // 添加相对定位，方便覆盖加载状态
  container.classList.add("relative");
  container.appendChild(loadingOverlay);

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

/**
 * 创建加载覆盖层
 * @returns {HTMLElement} - 加载覆盖层元素
 */
function createLoadingOverlay() {
  const loadingOverlay = document.createElement("div");
  loadingOverlay.classList.add(
    "absolute",
    "inset-0",
    "bg-gray-100",
    "bg-opacity-75",
    "flex",
    "items-center",
    "justify-center",
    "z-10"
  );

  loadingOverlay.innerHTML = `
    <div class="flex items-center justify-center">
      <div class="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin inline-block"></div>
      <span class="text-pink-500 ml-4">加载中...</span>
    </div>
  `;
  
  return loadingOverlay;
}

/**
 * 从豆瓣API获取数据，带有错误处理和备用方法
 * @param {string} url - 请求URL
 * @returns {Promise<Object>} - 响应数据
 */
async function fetchDoubanData(url) {
  // 添加缓存以减少重复请求
  const cacheKey = `douban_cache_${url}`;
  const cachedData = sessionStorage.getItem(cacheKey);
  const cacheTime = sessionStorage.getItem(`${cacheKey}_time`);
  
  // 如果有缓存且缓存时间不超过5分钟，直接返回缓存数据
  const CACHE_DURATION = 5 * 60 * 1000; // 5分钟
  if (cachedData && cacheTime && (Date.now() - parseInt(cacheTime)) < CACHE_DURATION) {
    return JSON.parse(cachedData);
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
    // 尝试直接访问（豆瓣API可能允许部分CORS请求）
    const response = await fetch(PROXY_URL + encodeURIComponent(url), fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    
    // 缓存结果
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      sessionStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    } catch (cacheErr) {
      console.warn('缓存豆瓣数据失败:', cacheErr);
      // 缓存失败不影响正常功能，继续执行
    }
    
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
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
        const parsedData = JSON.parse(data.contents);
        
        // 缓存结果
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(parsedData));
          sessionStorage.setItem(`${cacheKey}_time`, Date.now().toString());
        } catch (cacheErr) {
          console.warn('缓存豆瓣数据失败:', cacheErr);
        }
        
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

/**
 * 渲染豆瓣卡片
 * @param {Object} data - 豆瓣API返回的数据
 * @param {HTMLElement} container - 容器元素
 */
function renderDoubanCards(data, container) {
  // 创建文档片段以提高性能
  const fragment = document.createDocumentFragment();

  // 如果没有数据
  if (!data || !data.subjects || data.subjects.length === 0) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "col-span-full text-center py-8";
    emptyEl.innerHTML = `
      <div class="text-pink-500">❌ 暂无数据，请尝试其他分类或刷新</div>
    `;
    fragment.appendChild(emptyEl);
  } else {
    // 循环创建每个影视卡片
    data.subjects.forEach(item => {
      if (!item) return; // 跳过空项目
      
      const card = createDoubanCard(item);
      fragment.appendChild(card);
    });
  }

  // 清空并添加所有新元素
  container.innerHTML = "";
  container.appendChild(fragment);
}

/**
 * 创建单个豆瓣卡片
 * @param {Object} item - 单个电影/电视剧数据
 * @returns {HTMLElement} - 卡片元素
 */
function createDoubanCard(item) {
  const card = document.createElement("div");
  card.className = "bg-[#111] hover:bg-[#222] transition-all duration-300 rounded-lg overflow-hidden flex flex-col transform hover:scale-105 shadow-md hover:shadow-lg";

  // 生成卡片内容，确保安全显示（防止XSS）
  const safeTitle = sanitizeText(item.title || '');
  const safeRate = sanitizeText(item.rate || '暂无');

  // 处理图片URL
  const originalCoverUrl = item.cover || '';
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
      ${item.url ? `
      <div class="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm hover:bg-[#333] transition-colors">
          <a href="${item.url}" target="_blank" rel="noopener noreferrer" title="在豆瓣查看">
              🔗
          </a>
      </div>
      ` : ''}
    </div>
    <div class="p-2 text-center bg-[#111]">
      <button on
