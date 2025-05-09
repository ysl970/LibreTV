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
  const savedMovieTags = localStorage.getItem(CONFIG.STORAGE_KEYS.MOVIE_TAGS); // 使用 CONFIG.STORAGE_KEYS
  const savedTvTags = localStorage.getItem(CONFIG.STORAGE_KEYS.TV_TAGS);   // 使用 CONFIG.STORAGE_KEYS

  // 初始化标签 - 使用全局定义的 defaultMovieTags 和 defaultTvTags
  let currentMovieTags = savedMovieTags ? JSON.parse(savedMovieTags) : [...defaultMovieTags]; // 使用全局 defaultMovieTags
  let currentTvTags = savedTvTags ? JSON.parse(savedTvTags) : [...defaultTvTags];       // 使用全局 defaultTvTags

  // 更新文件顶部的全局 movieTags 和 tvTags 变量
  // 这些变量被文件的其他函数（如 showTagManageModal, addTag, deleteTag 等）直接使用
  movieTags = currentMovieTags; // [cite: 5]
  tvTags = currentTvTags;   // [cite: 5]

  // 使用AppState管理状态 (可选，但如果您打算这样做，请保持)
  AppState.set('doubanMovieTags', currentMovieTags);
  AppState.set('doubanTvTags', currentTvTags);
  AppState.set('doubanMovieTvCurrentSwitch', CONFIG.MEDIA_TYPES.MOVIE); // 默认显示电影, 使用 CONFIG.MEDIA_TYPES

  // 设置当前标签，确保 currentMovieTags 不是 undefined 并且有元素
  if (currentMovieTags && currentMovieTags.length > 0) {
    AppState.set('doubanCurrentTag', currentMovieTags[0]); // 默认使用第一个标签
  } else {
    // 如果 currentMovieTags 为空或 undefined，则设置一个安全的回退值或处理逻辑
    AppState.set('doubanCurrentTag', CONFIG.DEFAULT_TAG); // 使用 CONFIG.DEFAULT_TAG 作为回退
    console.warn("Movie tags are empty or undefined after initialization. Falling back to default tag.");
  }

  AppState.set('doubanPageStart', 0); // 默认从第0页开始

  // 初始化UI
  initDoubanUI(); // 确保这个函数存在并被正确调用

  // 加载推荐
  // 检查豆瓣功能是否启用
  const isDoubanEnabled = utils.storage.get(CONFIG.STORAGE_KEYS.ENABLED, true); // 默认为 true
  if (isDoubanEnabled) {
    loadDoubanRecommendations();
  } else {
    updateDoubanVisibility(); // 确保如果禁用则隐藏
  }
}

// 确保 initDoubanUI 函数也被定义和调用，它负责设置事件监听器和初始渲染
function initDoubanUI() {
  // 缓存关键DOM元素
  ['doubanToggle', 'doubanArea', 'douban-movie-toggle', 'douban-tv-toggle',
    'douban-tags', 'douban-refresh', 'douban-results', 'searchInput'].forEach(id => {
      utils.getElement(id);
    });

  const doubanToggle = utils.getElement('doubanToggle');
  if (doubanToggle) {
    const isEnabled = utils.storage.get(CONFIG.STORAGE_KEYS.ENABLED, true); // 默认为 true
    doubanToggle.checked = isEnabled;

    // 如果localStorage中没有设置过，则写入默认值
    if (localStorage.getItem(CONFIG.STORAGE_KEYS.ENABLED) === null) {
      utils.storage.set(CONFIG.STORAGE_KEYS.ENABLED, true);
    }

    // 更新开关视觉状态 (如果您的HTML结构是 input + sibling for bg + sibling for dot)
    const toggleBg = doubanToggle.nextElementSibling;
    const toggleDot = toggleBg ? toggleBg.nextElementSibling : null;
    if (toggleBg && toggleDot) {
      if (isEnabled) {
        toggleBg.classList.add('bg-pink-600'); // Or your active class
        toggleDot.classList.add('translate-x-full'); // Or your active class for dot
      } else {
        toggleBg.classList.remove('bg-pink-600');
        toggleDot.classList.remove('translate-x-full');
      }
    }


    doubanToggle.addEventListener('change', function (e) {
      const isChecked = e.target.checked;
      utils.storage.set(CONFIG.STORAGE_KEYS.ENABLED, isChecked);
      updateDoubanVisibility(); // 这个函数会根据isEnabled决定是否加载和显示豆瓣内容
      if (isChecked && utils.getElement('douban-results') && utils.getElement('douban-results').children.length === 0) {
        loadDoubanRecommendations(); // 如果启用且内容为空，则加载
      }
    });
  }

  // 初始化电影/电视剧切换按钮
  const movieToggle = utils.getElement('douban-movie-toggle');
  const tvToggle = utils.getElement('douban-tv-toggle');
  if (movieToggle && tvToggle) {
    movieToggle.addEventListener('click', () => switchMovieTV(CONFIG.MEDIA_TYPES.MOVIE));
    tvToggle.addEventListener('click', () => switchMovieTV(CONFIG.MEDIA_TYPES.TV));
    // 设置初始状态
    updateMovieTVSwitchUI(AppState.get('doubanMovieTvCurrentSwitch') || CONFIG.MEDIA_TYPES.MOVIE);
  }

  // 渲染初始标签
  const initialTags = AppState.get('doubanMovieTvCurrentSwitch') === CONFIG.MEDIA_TYPES.MOVIE ?
    (AppState.get('doubanMovieTags') || []) :
    (AppState.get('doubanTvTags') || []);
  const initialCurrentTag = AppState.get('doubanCurrentTag');
  renderDoubanTags(initialTags, initialCurrentTag);


  // 设置换一批按钮
  setupDoubanRefreshBtn();

  // 设置标签管理按钮 (如果您的HTML中有这个按钮的话)
  // 例如: utils.getElement('manage-douban-tags-btn')?.addEventListener('click', showTagManageModal);

  updateDoubanVisibility(); // 调用一次以确保初始状态正确
}

// 确保 updateMovieTVSwitchUI 函数被定义
function updateMovieTVSwitchUI(activeType) {
  const movieToggle = utils.getElement('douban-movie-toggle');
  const tvToggle = utils.getElement('douban-tv-toggle');

  if (movieToggle && tvToggle) {
    // 将类名字符串分割成数组
    const activeClasses = CONFIG.CLASSES.ACTIVE.split(' ').filter(c => c.length > 0);
    const inactiveClasses = CONFIG.CLASSES.INACTIVE.split(' ').filter(c => c.length > 0);

    if (activeType === CONFIG.MEDIA_TYPES.MOVIE) {
      // 使用 spread syntax (...) 将数组中的类名作为单独参数传递
      movieToggle.classList.add(...activeClasses);
      inactiveClasses.forEach(cls => movieToggle.classList.remove(cls)); // 或者 movieToggle.classList.remove(...inactiveClasses);

      tvToggle.classList.add(...inactiveClasses);
      activeClasses.forEach(cls => tvToggle.classList.remove(cls));     // 或者 tvToggle.classList.remove(...activeClasses);
    } else {
      tvToggle.classList.add(...activeClasses);
      inactiveClasses.forEach(cls => tvToggle.classList.remove(cls));   // 或者 tvToggle.classList.remove(...inactiveClasses);

      movieToggle.classList.add(...inactiveClasses);
      activeClasses.forEach(cls => movieToggle.classList.remove(cls));  // 或者 movieToggle.classList.remove(...activeClasses);
    }
  }
}

// 加载豆瓣推荐
async function loadDoubanRecommendations() {
  const resultsContainer = utils.getElement('douban-results');
  if (!resultsContainer) return;

  resultsContainer.innerHTML = '<div class="text-center py-4"><div class="spinner"></div><p class="mt-2 text-gray-400">正在加载豆瓣推荐...</p></div>'; // 改进加载提示

  const currentSwitch = AppState.get('doubanMovieTvCurrentSwitch');
  const currentTag = AppState.get('doubanCurrentTag');
  const pageStart = AppState.get('doubanPageStart');
  const pageLimit = CONFIG.PAGE_SIZE; // 从 CONFIG 获取

  // 构建请求 URL
  const targetUrl = `https://movie.douban.com/j/search_subjects?type=${currentSwitch}&tag=${encodeURIComponent(currentTag)}&sort=recommend&page_limit=${pageLimit}&page_start=${pageStart}`;

  try {
      const data = await fetchDoubanData(targetUrl); // 使用您已有的 fetchDoubanData 函数

      const items = data.subjects || [];

      if (items.length === 0) {
          resultsContainer.innerHTML = '<div class="text-center py-4 text-gray-400">没有找到相关内容</div>'; // 改进空状态提示
          return;
      }

      // 渲染卡片 (确保 renderDoubanCards 函数能正确处理 items)
      renderDoubanCards(items, resultsContainer); // 之前 renderDoubanCards 有两个参数

  } catch (error) {
      console.error('加载豆瓣推荐失败:', error);
      // 使用 CONFIG 中的错误消息
      resultsContainer.innerHTML = `<div class="text-center py-4 text-red-400">❌ ${CONFIG.MESSAGES.API_ERROR} (详情: ${error.message})</div>`;
      // 确保 showToast 函数是全局可用的，并且来自 ui.js
      if (typeof showToast === 'function') {
          showToast(`${CONFIG.MESSAGES.API_ERROR}: ${error.message}`, 'error');
      }
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
  const tagClickHandler = function (e) {
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
function renderDoubanCards(data, container) { // 将参数名修改为 container，或者确保不重复声明
  // 如果参数名仍为 resultsContainer，则删除下一行
  // const resultsContainer = utils.getElement('douban-results'); // <<<--- 删除或注释掉这一行

  // 直接使用传入的 container 参数
  if (!container) {
      console.error("renderDoubanCards: 传入的容器 (container) 无效");
      return;
  }

  // 清空容器
  container.innerHTML = '';

  // 创建卡片容器 (这部分逻辑可能在您的旧代码中，需要恢复或重写)
  // const cardsContainer = document.createElement('div');
  // cardsContainer.className = 'douban-cards-container'; // 或者您期望的样式

  // items 的获取方式也需要注意，data 可能是包含 subjects 的对象
  const items = data.subjects || (Array.isArray(data) ? data : []); // 兼容 data 直接是数组或包含 subjects

  if (!items || items.length === 0) {
      container.innerHTML = '<div class="col-span-full text-center py-8 text-gray-400">暂无数据，请尝试其他分类或刷新</div>';
      return;
  }
  
  const fragment = document.createDocumentFragment(); // 使用 fragment 提高性能

  items.forEach(item => {
      const card = document.createElement('div');
      // 应用旧样式或您期望的卡片样式
      card.className = 'card-hover bg-[#111] rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.02] h-full shadow-sm hover:shadow-md'; // 示例：使用旧的 card-hover 样式
      card.dataset.id = item.id;
      card.dataset.title = item.title;

      const safeTitle = utils.safeText(item.title);
      const safeRate = utils.safeText(item.rate || "暂无"); // "暂无" 作为评分的默认值
      const originalCoverUrl = item.cover || "";
      // 全局 PROXY_URL 来自 config.js
      const proxiedCoverUrl = (typeof PROXY_URL !== 'undefined' ? PROXY_URL : '') + encodeURIComponent(originalCoverUrl);


      // 这里是卡片内部 HTML 的结构，请参考老代码 (old.txt 的 index.html 中关于豆瓣卡片的样式) 或您的目标样式进行调整
      card.innerHTML = `
          <div class="relative w-full aspect-[2/3] overflow-hidden douban-card-cover">
              <img src="${originalCoverUrl}" alt="${safeTitle}"
                   class="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                   onerror="this.onerror=null; this.src='https://via.placeholder.com/200x300?text=${encodeURIComponent(safeTitle)}'; this.classList.add('object-contain');"
                   loading="lazy" referrerpolicy="no-referrer">
              <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-60"></div>
              ${safeRate !== "暂无" ? `
              <div class="absolute bottom-1 left-1.5 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded-sm">
                  <span class="text-yellow-400">★</span> ${safeRate}
              </div>` : ''}
              <div class="absolute bottom-1 right-1.5 bg-black/70 text-white text-xs px-1 py-0.5 rounded-sm hover:bg-gray-700 transition-colors" title="在豆瓣查看">
                  <a href="${utils.safeText(item.url || '#')}" target="_blank" rel="noopener noreferrer" class="douban-link block" onclick="event.stopPropagation();">
                      🔗
                  </a>
              </div>
          </div>
          <div class="p-2 text-center">
              <button class="douban-search-btn text-sm font-medium text-white truncate w-full hover:text-pink-400 transition"
                      title="${safeTitle}">
                  ${safeTitle}
              </button>
          </div>
      `;
      fragment.appendChild(card);
  });

  container.appendChild(fragment);

  // 事件委托 (如果尚未在 loadDoubanRecommendations 中处理)
  // 注意：根据您的优化 prompt，事件委托应该在父容器上设置一次
  // 这里假设 resultsContainer (即现在的 container 参数) 是那个父容器
  if (!container._cardClickHandler) {
      const cardClickHandler = function (e) {
          const cardElement = e.target.closest('.douban-card'); // 使用 .douban-card 作为目标
          if (!cardElement) return;

          // const id = cardElement.dataset.id; // id 可能不需要了
          const title = cardElement.dataset.title;
          if (!title) return;
          
          fillAndSearchWithDouban(title); // 确保此函数正确定义并可用
      };
      container.addEventListener('click', cardClickHandler);
      container._cardClickHandler = cardClickHandler; // 标记已绑定
  }
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
  const tagManageHandler = function (e) {
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
    newMovieTagInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        document.getElementById('add-movie-tag')?.click();
      }
    });
  }

  const newTvTagInput = document.getElementById('new-tv-tag');
  if (newTvTagInput) {
    newTvTagInput.addEventListener('keypress', function (e) {
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

