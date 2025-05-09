// douban.js

// 常量配置区域 
const CONFIG = {
  // API相关
  TIMEOUT: 10000,
  PAGE_SIZE: 16,
  MAX_TAG_LENGTH: 20,
  MAX_PAGE_START: 144,

  // 存储键名
  STORAGE_KEYS: {
    ENABLED: 'doubanEnabled',
    MOVIE_TAGS: 'userMovieTags',
    TV_TAGS: 'userTvTags'
  },

  // 媒体类型
  MEDIA_TYPES: {
    MOVIE: 'movie',
    TV: 'tv'
  },

  // 默认标签
  DEFAULT_TAG: '热门',

  // UI相关
  CLASSES: {
    ACTIVE: 'bg-pink-600 text-white',
    INACTIVE: 'text-gray-300',
    CARD: 'bg-[#111] hover:bg-[#222] transition-all duration-300 rounded-lg overflow-hidden flex flex-col transform hover:scale-105 shadow-md hover:shadow-lg'
  },

  // 错误信息
  MESSAGES: {
    NETWORK_ERROR: '网络连接失败，请检查网络设置',
    TIMEOUT_ERROR: '请求超时，请稍后重试',
    API_ERROR: '获取豆瓣数据失败，请稍后重试',
    TAG_EXISTS: '标签已存在',
    TAG_RESERVED: '热门标签不能删除',
    TAG_INVALID: '标签只能包含中文、英文、数字和空格',
    TAG_TOO_LONG: '标签长度不能超过20个字符'
  }
};

// 默认标签配置
const defaultMovieTags = ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '动作', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '治愈'];
const defaultTvTags = ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '港剧', '日本动画', '综艺', '纪录片'];

// 应用状态管理
let movieTags = [];
let tvTags = [];
let doubanMovieTvCurrentSwitch = CONFIG.MEDIA_TYPES.MOVIE;
let doubanCurrentTag = CONFIG.DEFAULT_TAG;
let doubanPageStart = 0;
const doubanPageSize = CONFIG.PAGE_SIZE;
// DOM 元素缓存
const cachedElements = new Map();
// 工具函数
const utils = {
  // 防抖函数
  debounce(fn, delay = 300) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  // 安全文本处理 - 增强型XSS防护
  safeText(text) {
    if (!text) return '';
    return String(text)
      .replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]);
  },

  // 验证标签格式
  validateTag(tag) {
    if (!tag?.trim()) {
      showToast('标签不能为空', 'warning');
      return false;
    }

    if (!/^[\u4e00-\u9fa5a-zA-Z0-9\s]+$/.test(tag)) {
      showToast(CONFIG.MESSAGES.TAG_INVALID, 'warning');
      return false;
    }

    if (tag.length > CONFIG.MAX_TAG_LENGTH) {
      showToast(CONFIG.MESSAGES.TAG_TOO_LONG, 'warning');
      return false;
    }

    return true;
  },

  // 获取缓存的DOM元素
  getElement(id) {
    if (!cachedElements.has(id)) {
      const element = document.getElementById(id);
      if (element) {
        cachedElements.set(id, element);
      }
    }
    return cachedElements.get(id);
  },

  // 创建loading遮罩
  createLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 bg-gray-100 bg-opacity-75 flex items-center justify-center z-10';
    overlay.innerHTML = `
      <div class="flex items-center justify-center">
        <div class="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-pink-500 ml-4">加载中...</span>
      </div>
    `;
    return overlay;
  },

  // 存储操作包装
  storage: {
    get(key, defaultValue = null) {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : defaultValue;
      } catch (e) {
        console.error(`Error reading from localStorage: ${key}`, e);
        return defaultValue;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.error(`Error writing to localStorage: ${key}`, e);
        return false;
      }
    }
  }
};

// 加载用户标签
function loadUserTags() {
  movieTags = utils.storage.get(CONFIG.STORAGE_KEYS.MOVIE_TAGS, [...defaultMovieTags]);
  tvTags = utils.storage.get(CONFIG.STORAGE_KEYS.TV_TAGS, [...defaultTvTags]);
}

// 保存用户标签
function saveUserTags() {
  const movieSaved = utils.storage.set(CONFIG.STORAGE_KEYS.MOVIE_TAGS, movieTags);
  const tvSaved = utils.storage.set(CONFIG.STORAGE_KEYS.TV_TAGS, tvTags);

  if (!movieSaved || !tvSaved) {
    showToast('保存标签失败', 'error');
  }
}


// 初始化豆瓣功能
function initDouban() {
    // 从localStorage加载标签
    const savedMovieTags = localStorage.getItem('doubanMovieTags');
    const savedTvTags = localStorage.getItem('doubanTvTags');
    
    // 初始化标签
    movieTags = savedMovieTags ? JSON.parse(savedMovieTags) : CONFIG.DEFAULT_MOVIE_TAGS;
    tvTags = savedTvTags ? JSON.parse(savedTvTags) : CONFIG.DEFAULT_TV_TAGS;
    
    // 使用AppState管理状态
    AppState.set('doubanMovieTags', movieTags);
    AppState.set('doubanTvTags', tvTags);
    AppState.set('doubanMovieTvCurrentSwitch', 'movie'); // 默认显示电影
    AppState.set('doubanCurrentTag', movieTags[0]); // 默认使用第一个标签
    AppState.set('doubanPageStart', 0); // 默认从第0页开始
    
    // 初始化UI
    initDoubanUI();
    
    // 加载推荐
    loadDoubanRecommendations();
}

// 加载豆瓣推荐
async function loadDoubanRecommendations() {
    const resultsContainer = utils.getElement('douban-results');
    if (!resultsContainer) return;
    
    // 显示加载状态
    resultsContainer.innerHTML = '<div class="douban-loading">加载中...</div>';
    
    // 从AppState获取状态
    const currentSwitch = AppState.get('doubanMovieTvCurrentSwitch');
    const currentTag = AppState.get('doubanCurrentTag');
    const pageStart = AppState.get('doubanPageStart');
    
    try {
        let items = [];
        
        if (currentSwitch === 'movie') {
            const data = await WorkspaceDoubanData.getDoubanMovieRecommendations(currentTag, pageStart);
            items = data.subjects || [];
        } else {
            const data = await WorkspaceDoubanData.getDoubanTVRecommendations(currentTag, pageStart);
            items = data.subjects || [];
        }
        
        if (items.length === 0) {
            resultsContainer.innerHTML = '<div class="douban-empty">没有找到相关内容</div>';
            return;
        }
        
        // 渲染卡片
        renderDoubanCards(items);
        
    } catch (error) {
        console.error('加载豆瓣推荐失败:', error);
        resultsContainer.innerHTML = `<div class="douban-error">加载失败: ${error.message}</div>`;
        showToast(`加载豆瓣推荐失败: ${error.message}`, 'error');
    }
}

// 切换电影/电视剧
function switchMovieTV(type) {
    if (type !== 'movie' && type !== 'tv') return;
    
    // 更新AppState
    AppState.set('doubanMovieTvCurrentSwitch', type);
    AppState.set('doubanPageStart', 0);
    
    // 更新当前标签
    const tags = type === 'movie' ? movieTags : tvTags;
    AppState.set('doubanCurrentTag', tags[0]);
    
    // 更新UI
    updateMovieTVSwitchUI(type);
    renderDoubanTags(tags, tags[0]);
    
    // 加载新内容
    loadDoubanRecommendations();
}

// 更新豆瓣区域显示状态
function updateDoubanVisibility() {
  const doubanArea = utils.getElement('doubanArea');
  if (!doubanArea) return;

  const isEnabled = utils.storage.get(CONFIG.STORAGE_KEYS.ENABLED, false) === true;
  const resultsArea = utils.getElement('resultsArea');
  const isSearching = resultsArea && !resultsArea.classList.contains('hidden');

  if (isEnabled && !isSearching) {
    doubanArea.classList.remove('hidden');
    const doubanResults = utils.getElement('douban-results');
    if (doubanResults && doubanResults.children.length === 0) {
      renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }
  } else {
    doubanArea.classList.add('hidden');
  }
}

// 填充搜索框函数
function fillSearchInput(title) {
  if (!title) return;

  const safeTitle = utils.safeText(title);
  const input = utils.getElement('searchInput');

  if (input) {
    input.value = safeTitle;
    input.focus();
    showToast('已填充搜索内容，点击搜索按钮开始搜索', 'info');
  }
}

// 填充并搜索
function fillAndSearch(title) {
  if (!title) return;

  const safeTitle = utils.safeText(title);
  const input = utils.getElement('searchInput');

  if (input) {
    input.value = safeTitle;
    if (typeof search === 'function') {
      search();
    } else {
      console.error('search函数不可用');
      showToast('搜索功能暂不可用', 'error');
    }
  }
}

// 使用豆瓣资源搜索
function fillAndSearchWithDouban(title) {
  if (!title) return;

  const safeTitle = utils.safeText(title);

  // 检查并选择豆瓣资源API
  if (typeof selectedAPIs !== 'undefined' && !selectedAPIs.includes('dbzy')) {
    const doubanCheckbox = document.querySelector('input[id="api_dbzy"]');
    if (doubanCheckbox) {
      doubanCheckbox.checked = true;

      if (typeof updateSelectedAPIs === 'function') {
        updateSelectedAPIs();
      } else {
        selectedAPIs.push('dbzy');
        utils.storage.set('selectedAPIs', selectedAPIs);

        const countEl = document.getElementById('selectedAPICount');
        if (countEl) {
          countEl.textContent = selectedAPIs.length;
        }
      }

      showToast('已自动选择豆瓣资源API', 'info');
    }
  }

  const input = utils.getElement('searchInput');
  if (input) {
    input.value = safeTitle;
    if (typeof search === 'function') {
      search();
    } else {
      console.error('search函数不可用');
      showToast('搜索功能暂不可用', 'error');
    }
  }
}


// 渲染电影/电视剧切换器
function renderDoubanMovieTvSwitch() {
  const movieToggle = utils.getElement('douban-movie-toggle');
  const tvToggle = utils.getElement('douban-tv-toggle');

  if (!movieToggle || !tvToggle) return;

  const updateToggleState = (isMovie) => {
    const newType = isMovie ? CONFIG.MEDIA_TYPES.MOVIE : CONFIG.MEDIA_TYPES.TV;
    if (doubanMovieTvCurrentSwitch === newType) return;

    const activeToggle = isMovie ? movieToggle : tvToggle;
    const inactiveToggle = isMovie ? tvToggle : movieToggle;

    activeToggle.classList.add(...CONFIG.CLASSES.ACTIVE.split(' '));
    activeToggle.classList.remove(CONFIG.CLASSES.INACTIVE);

    inactiveToggle.classList.remove(...CONFIG.CLASSES.ACTIVE.split(' '));
    inactiveToggle.classList.add(CONFIG.CLASSES.INACTIVE);

    doubanMovieTvCurrentSwitch = newType;
    doubanCurrentTag = CONFIG.DEFAULT_TAG;
    doubanPageStart = 0;

    renderDoubanTags();

    if (utils.storage.get(CONFIG.STORAGE_KEYS.ENABLED, false) === true) {
      renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }
  };

  movieToggle.addEventListener('click', () => updateToggleState(true));
  tvToggle.addEventListener('click', () => updateToggleState(false));
}

// 渲染豆瓣标签 - 使用事件委托
function renderDoubanTags(tags, currentTag) {
    const tagsContainer = utils.getElement('douban-tags');
    if (!tagsContainer) return;
    
    tagsContainer.innerHTML = '';
    
    tags.forEach(tag => {
        const button = document.createElement('button');
        button.className = `douban-tag ${tag === currentTag ? 'active' : ''}`;
        button.dataset.tag = tag;
        button.textContent = tag;
        tagsContainer.appendChild(button);
    });
    
    // 移除旧的事件监听器（如果有）
    if (tagsContainer._tagClickHandler) {
        tagsContainer.removeEventListener('click', tagsContainer._tagClickHandler);
    }
    
    // 使用事件委托添加点击事件
    const tagClickHandler = function(e) {
        const tagButton = e.target.closest('.douban-tag');
        if (!tagButton) return;
        
        const tag = tagButton.dataset.tag;
        if (!tag) return;
        
        // 更新UI
        tagsContainer.querySelectorAll('.douban-tag').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tag === tag);
        });
        
        // 加载对应标签的内容
        doubanCurrentTag = tag;
        doubanPageStart = 0;
        loadDoubanRecommendations();
    };
    
    // 保存事件处理器引用以便后续移除
    tagsContainer._tagClickHandler = tagClickHandler;
    tagsContainer.addEventListener('click', tagClickHandler);
}

// 渲染豆瓣卡片 - 使用事件委托
function renderDoubanCards(items) {
    const resultsContainer = utils.getElement('douban-results');
    if (!resultsContainer) return;
    
    // 清空容器
    resultsContainer.innerHTML = '';
    
    // 创建卡片容器
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'douban-cards-container';
    
    // 添加卡片
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'douban-card';
        card.dataset.id = item.id;
        card.dataset.title = item.title;
        
        // 使用安全的文本处理
        const safeTitle = utils.safeText(item.title);
        const safeRate = utils.safeText(item.rate);
        
        card.innerHTML = `
            <div class="douban-card-poster">
                <img src="${PROXY_URL}${encodeURIComponent(item.cover)}" alt="${safeTitle}" 
                     onerror="this.src='./img/default-poster.jpg'">
                <div class="douban-card-rate">${safeRate}</div>
            </div>
            <div class="douban-card-title">${safeTitle}</div>
        `;
        
        cardsContainer.appendChild(card);
    });
    
    resultsContainer.appendChild(cardsContainer);
    
    // 移除旧的事件监听器（如果有）
    if (resultsContainer._cardClickHandler) {
        resultsContainer.removeEventListener('click', resultsContainer._cardClickHandler);
    }
    
    // 使用事件委托添加点击事件
    const cardClickHandler = function(e) {
        const card = e.target.closest('.douban-card');
        if (!card) return;
        
        const id = card.dataset.id;
        const title = card.dataset.title;
        if (!id || !title) return;
        
        // 处理卡片点击
        fillAndSearchWithDouban(title);
    };
    
    // 保存事件处理器引用以便后续移除
    resultsContainer._cardClickHandler = cardClickHandler;
    resultsContainer.addEventListener('click', cardClickHandler);
}

// 设置换一批按钮
function setupDoubanRefreshBtn() {
  const btn = utils.getElement('douban-refresh');
  if (!btn) return;

  btn.onclick = utils.debounce(function () {
    doubanPageStart += doubanPageSize;
    if (doubanPageStart > CONFIG.MAX_PAGE_START) {
      doubanPageStart = 0;
    }
    renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
  }, 500);
}

// 获取豆瓣数据
async function fetchDoubanData(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

  const fetchOptions = {
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Referer': 'https://movie.douban.com/',
      'Accept': 'application/json, text/plain, */*',
    }
  };

  try {
    if (typeof PROXY_URL === 'undefined') {
      throw new Error('代理URL配置缺失');
    }

    const response = await fetch(PROXY_URL + encodeURIComponent(url), fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("豆瓣 API 请求失败：", err);

    if (err.name === 'AbortError') {
      throw new Error(CONFIG.MESSAGES.TIMEOUT_ERROR);
    }

    // 尝试备用接口
    try {
      const fallbackUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const fallbackResponse = await fetch(fallbackUrl);

      if (!fallbackResponse.ok) {
        throw new Error(`备用API请求失败! 状态: ${fallbackResponse.status}`);
      }

      const data = await fallbackResponse.json();
      if (data?.contents) {
        return JSON.parse(data.contents);
      }

      throw new Error("无法获取有效数据");
    } catch (fallbackErr) {
      console.error("豆瓣 API 备用请求也失败：", fallbackErr);
      throw new Error(CONFIG.MESSAGES.API_ERROR);
    }
  }
}

// 渲染推荐内容
async function renderRecommend(tag, pageLimit, pageStart) {
  const container = utils.getElement("douban-results");
  if (!container) return;

  const loadingOverlay = utils.createLoadingOverlay();
  container.classList.add("relative");
  container.appendChild(loadingOverlay);

  try {
    const target = `https://movie.douban.com/j/search_subjects?type=${doubanMovieTvCurrentSwitch}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`;
    const data = await fetchDoubanData(target);
    renderDoubanCards(data, container);
  } catch (error) {
    console.error("获取豆瓣数据失败：", error);
    container.innerHTML = `
      <div class="col-span-full text-center py-8">
        <div class="text-red-400">❌ ${CONFIG.MESSAGES.API_ERROR}</div>
        <div class="text-gray-500 text-sm mt-2">提示：使用VPN可能有助于解决此问题</div>
      </div>
    `;
  } finally {
    if (container.contains(loadingOverlay)) {
      container.removeChild(loadingOverlay);
    }
    container.classList.remove("relative");
  }
}

// 渲染豆瓣卡片
function renderDoubanCards(data, container) {
  const fragment = document.createDocumentFragment();

  if (!data?.subjects?.length) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "col-span-full text-center py-8";
    emptyEl.innerHTML = '<div class="text-pink-500">❌ 暂无数据，请尝试其他分类或刷新</div>';
    fragment.appendChild(emptyEl);
  } else {
    data.subjects.forEach(item => {
      const safeTitle = utils.safeText(item.title);
      const safeRate = utils.safeText(item.rate || "暂无");
      const safeUrl = item.url || "#";
      const originalCoverUrl = item.cover || "";
      const proxiedCoverUrl = typeof PROXY_URL !== 'undefined' ?
        PROXY_URL + encodeURIComponent(originalCoverUrl) :
        originalCoverUrl;

      const card = document.createElement("div");
      card.className = CONFIG.CLASSES.CARD;

      // 使用数据属性传递数据，而不是直接在onclick中使用
      card.setAttribute('data-title', safeTitle);

      card.innerHTML = `
        <div class="relative w-full aspect-[2/3] overflow-hidden cursor-pointer douban-card-cover">
          <img src="${originalCoverUrl}" alt="${safeTitle}"
              class="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
              onerror="this.onerror=null; this.src='${proxiedCoverUrl}'; this.classList.add('object-contain');"
              loading="lazy" referrerpolicy="no-referrer">
          <div class="absolute inset-0 bg-gradient-to-t from-black to-transparent opacity-60"></div>
          <div class="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm">
              <span class="text-yellow-400">★</span> ${safeRate}
          </div>
          <div class="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-sm hover:bg-[#333] transition-colors">
              <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="在豆瓣查看" class="douban-link">
                  🔗
              </a>
          </div>
        </div>
        <div class="p-2 text-center bg-[#111]">
          <button class="douban-search-btn text-sm font-medium text-white truncate w-full hover:text-pink-400 transition"
                  title="${safeTitle}">
              ${safeTitle}
          </button>
        </div>
      `;

      // 使用事件委托而非内联事件
      const coverEl = card.querySelector('.douban-card-cover');
      const buttonEl = card.querySelector('.douban-search-btn');
      const linkEl = card.querySelector('.douban-link');

      if (coverEl) {
        coverEl.addEventListener('click', () => fillAndSearchWithDouban(safeTitle));
      }

      if (buttonEl) {
        buttonEl.addEventListener('click', () => fillAndSearchWithDouban(safeTitle));
      }

      if (linkEl) {
        linkEl.addEventListener('click', (e) => e.stopPropagation());
      }

      fragment.appendChild(card);
    });
  }

  container.innerHTML = "";
  container.appendChild(fragment);
}

// 显示标签管理模态框
function showTagManageModal() {
    const modalContent = `
        <div class="tag-manage-container">
            <div class="tag-section">
                <h3>电影标签</h3>
                <div id="movie-tags-container" class="tags-container">
                    ${renderTagsForModal(movieTags)}
                </div>
                <div class="tag-input-group">
                    <input type="text" id="new-movie-tag" placeholder="添加新标签" class="tag-input">
                    <button id="add-movie-tag" class="tag-add-btn">添加</button>
                </div>
            </div>
            <div class="tag-section">
                <h3>电视剧标签</h3>
                <div id="tv-tags-container" class="tags-container">
                    ${renderTagsForModal(tvTags)}
                </div>
                <div class="tag-input-group">
                    <input type="text" id="new-tv-tag" placeholder="添加新标签" class="tag-input">
                    <button id="add-tv-tag" class="tag-add-btn">添加</button>
                </div>
            </div>
        </div>
    `;
    
    showModal(modalContent, '管理豆瓣标签');
    
    // 使用事件委托绑定事件
    const modal = utils.getElement('modal');
    if (!modal) return;
    
    // 移除旧的事件监听器（如果有）
    if (modal._tagManageHandler) {
        modal.removeEventListener('click', modal._tagManageHandler);
    }
    
    // 使用事件委托处理所有标签相关操作
    const tagManageHandler = function(e) {
        // 处理删除标签
        if (e.target.classList.contains('tag-delete-btn')) {
            const tagElement = e.target.closest('.tag-item');
            if (!tagElement) return;
            
            const tagType = tagElement.dataset.type;
            const tagText = tagElement.dataset.tag;
            
            if (tagType === 'movie') {
                movieTags = movieTags.filter(tag => tag !== tagText);
                localStorage.setItem('doubanMovieTags', JSON.stringify(movieTags));
                tagElement.remove();
            } else if (tagType === 'tv') {
                tvTags = tvTags.filter(tag => tag !== tagText);
                localStorage.setItem('doubanTvTags', JSON.stringify(tvTags));
                tagElement.remove();
            }
        }
        
        // 处理添加电影标签
        if (e.target.id === 'add-movie-tag') {
            const input = document.getElementById('new-movie-tag');
            if (!input) return;
            
            const newTag = input.value.trim();
            if (!newTag) return;
            
            if (!movieTags.includes(newTag)) {
                movieTags.push(newTag);
                localStorage.setItem('doubanMovieTags', JSON.stringify(movieTags));
                
                const tagsContainer = document.getElementById('movie-tags-container');
                if (tagsContainer) {
                    const tagElement = createTagElement(newTag, 'movie');
                    tagsContainer.appendChild(tagElement);
                }
            }
            
            input.value = '';
        }
        
        // 处理添加电视剧标签
        if (e.target.id === 'add-tv-tag') {
            const input = document.getElementById('new-tv-tag');
            if (!input) return;
            
            const newTag = input.value.trim();
            if (!newTag) return;
            
            if (!tvTags.includes(newTag)) {
                tvTags.push(newTag);
                localStorage.setItem('doubanTvTags', JSON.stringify(tvTags));
                
                const tagsContainer = document.getElementById('tv-tags-container');
                if (tagsContainer) {
                    const tagElement = createTagElement(newTag, 'tv');
                    tagsContainer.appendChild(tagElement);
                }
            }
            
            input.value = '';
        }
    };
    
    // 保存事件处理器引用以便后续移除
    modal._tagManageHandler = tagManageHandler;
    modal.addEventListener('click', tagManageHandler);
    
    // 为输入框添加回车键事件
    const newMovieTagInput = document.getElementById('new-movie-tag');
    if (newMovieTagInput) {
        newMovieTagInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('add-movie-tag')?.click();
            }
        });
    }
    
    const newTvTagInput = document.getElementById('new-tv-tag');
    if (newTvTagInput) {
        newTvTagInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('add-tv-tag')?.click();
            }
        });
    }
}

// 为模态框渲染标签
function renderTagsForModal(tags) {
    return tags.map(tag => {
        const safeTag = utils.safeText(tag);
        return `
            <div class="tag-item" data-tag="${safeTag}" data-type="${tags === movieTags ? 'movie' : 'tv'}">
                <span class="tag-text">${safeTag}</span>
                <button class="tag-delete-btn">×</button>
            </div>
        `;
    }).join('');
}

// 创建标签元素
function createTagElement(tag, type) {
    const safeTag = utils.safeText(tag);
    const tagElement = document.createElement('div');
    tagElement.className = 'tag-item';
    tagElement.dataset.tag = safeTag;
    tagElement.dataset.type = type;
    tagElement.innerHTML = `
        <span class="tag-text">${safeTag}</span>
        <button class="tag-delete-btn">×</button>
    `;
    return tagElement;
}

// 添加标签
function addTag(tag) {
  if (!utils.validateTag(tag)) return;

  const safeTag = utils.safeText(tag);
  const isMovie = doubanMovieTvCurrentSwitch === CONFIG.MEDIA_TYPES.MOVIE;
  const currentTags = isMovie ? movieTags : tvTags;

  if (currentTags.some(existingTag => existingTag.toLowerCase() === safeTag.toLowerCase())) {
    showToast(CONFIG.MESSAGES.TAG_EXISTS, 'warning');
    return;
  }

  if (isMovie) {
    movieTags.push(safeTag);
  } else {
    tvTags.push(safeTag);
  }

  saveUserTags();
  renderDoubanTags();
  showToast('标签添加成功', 'success');
}

// 删除标签
function deleteTag(tag) {
  if (!tag) return;

  if (tag === CONFIG.DEFAULT_TAG) {
    showToast(CONFIG.MESSAGES.TAG_RESERVED, 'warning');
    return;
  }

  const isMovie = doubanMovieTvCurrentSwitch === CONFIG.MEDIA_TYPES.MOVIE;
  const currentTags = isMovie ? movieTags : tvTags;
  const index = currentTags.indexOf(tag);

  if (index !== -1) {
    currentTags.splice(index, 1);
    saveUserTags();

    if (doubanCurrentTag === tag) {
      doubanCurrentTag = CONFIG.DEFAULT_TAG;
      doubanPageStart = 0;
      renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
    }

    renderDoubanTags();
    showToast('标签删除成功', 'success');
  }
}

// 重置为默认标签
function resetTagsToDefault() {
  const isMovie = doubanMovieTvCurrentSwitch === CONFIG.MEDIA_TYPES.MOVIE;

  if (isMovie) {
    movieTags = [...defaultMovieTags];
  } else {
    tvTags = [...defaultTvTags];
  }

  doubanCurrentTag = CONFIG.DEFAULT_TAG;
  doubanPageStart = 0;

  saveUserTags();
  renderDoubanTags();
  renderRecommend(doubanCurrentTag, doubanPageSize, doubanPageStart);
  showToast('已恢复默认标签', 'success');
}

// 重置到首页
function resetToHome() {
  if (typeof resetSearchArea === 'function') {
    resetSearchArea();
  }
  updateDoubanVisibility();
}

// 初始化：页面加载完成时执行
document.addEventListener('DOMContentLoaded', initDouban);


/**
 * 填充搜索框并执行搜索
 * @param {string} text - 要搜索的文本
 * @param {boolean} useDouban - 是否使用豆瓣API
 */
function fillAndSearch(text, useDouban = false) {
    const searchInput = DOMCache.get('searchInput') || document.getElementById('searchInput');
    if (!searchInput) return;
    
    searchInput.value = text;
    
    // 切换到搜索区域
    const searchArea = utils.getElement('searchArea');
    const doubanArea = utils.getElement('doubanArea');
    
    if (searchArea) searchArea.classList.remove('hidden');
    if (doubanArea) doubanArea.classList.add('hidden');
    
    // 执行搜索
    if (useDouban) {
        // 使用豆瓣API搜索
        const selectedAPIs = AppState.get('selectedAPIs') || [];
        if (!selectedAPIs.includes('douban')) {
            // 临时添加豆瓣API
            const tempSelectedAPIs = [...selectedAPIs, 'douban'];
            search(tempSelectedAPIs);
        } else {
            search();
        }
    } else {
        // 使用常规搜索
        search();
    }
}

// 兼容旧的函数调用
function fillAndSearchWithDouban(text) {
    fillAndSearch(text, true);
}

