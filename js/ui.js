// UI 模块 - 处理所有用户界面交互
const UI = (function() {
    // 缓存常用 DOM 元素
    const elements = {
      settingsPanel: null,
      historyPanel: null,
      searchInput: null,
      // 其他常用元素将在初始化时添加
    };
  
    // 初始化函数 - 在页面加载时调用
    function init() {
      // 缓存常用 DOM 元素
      elements.settingsPanel = utils.getElement('#settings-panel');
      elements.historyPanel = utils.getElement('#history-panel');
      elements.searchInput = utils.getElement('#search-input');
      
      // 设置事件监听器
      setupEventListeners();
    }
  
    // 设置所有事件监听器
    function setupEventListeners() {
      // 设置面板事件
      utils.getElement('#settings-button').addEventListener('click', () => togglePanel('settings'));
      utils.getElement('#history-button').addEventListener('click', () => togglePanel('history'));
      utils.getElement('#close-settings').addEventListener('click', () => closePanel('settings'));
      utils.getElement('#close-history').addEventListener('click', () => closePanel('history'));
      
      // 搜索历史容器事件委托
      utils.getElement('#history-container').addEventListener('click', handleHistoryContainerClick);
      
      // 观看历史容器事件委托
      utils.getElement('#viewing-history-container').addEventListener('click', handleViewingHistoryClick);
      
      // 标签管理相关事件
      utils.getElement('#manage-tags-button').addEventListener('click', showTagManageModal);
      utils.getElement('#tag-modal-close').addEventListener('click', hideTagManageModal);
      utils.getElement('#tag-container').addEventListener('click', handleTagContainerClick);
      
      // 其他事件监听器...
    }
    
    // 面板切换通用函数
    function togglePanel(panelType) {
      const isSettings = panelType === 'settings';
      const panel = isSettings ? elements.settingsPanel : elements.historyPanel;
      const otherPanel = isSettings ? elements.historyPanel : elements.settingsPanel;
      
      // 检查密码保护
      if ((isSettings && isPasswordProtected('settings')) || 
          (!isSettings && isPasswordProtected('history'))) {
        
        if (!isPasswordVerified()) {
          promptPassword(() => togglePanel(panelType));
          return;
        }
      }
      
      // 关闭其他面板
      if (otherPanel.classList.contains('show')) {
        closePanel(isSettings ? 'history' : 'settings');
      }
      
      // 切换当前面板
      if (panel.classList.contains('show')) {
        closePanel(panelType);
      } else {
        openPanel(panelType);
      }
    }
    
    // 打开面板
    function openPanel(panelType) {
      const panel = panelType === 'settings' ? elements.settingsPanel : elements.historyPanel;
      panel.classList.add('show');
      panel.setAttribute('aria-hidden', 'false');
      
      // 如果是历史面板，加载历史数据
      if (panelType === 'history') {
        loadSearchHistory();
        loadViewingHistory();
      }
    }
    
    // 关闭面板
    function closePanel(panelType) {
      const panel = panelType === 'settings' ? elements.settingsPanel : elements.historyPanel;
      panel.classList.remove('show');
      panel.setAttribute('aria-hidden', 'true');
    }
    
    // 处理历史容器点击事件
    function handleHistoryContainerClick(event) {
      const target = event.target;
      
      // 处理历史项点击
      if (target.classList.contains('history-item')) {
        const query = target.dataset.query;
        if (query) {
          elements.searchInput.value = query;
          search(query);
        }
      }
      
      // 处理删除按钮点击
      if (target.classList.contains('delete-history')) {
        event.stopPropagation();
        const item = target.closest('.history-item');
        if (item) {
          const query = item.dataset.query;
          deleteHistoryItem(query);
        }
      }
    }
    
    // 处理观看历史容器点击事件
    function handleViewingHistoryClick(event) {
      const target = event.target;
      
      // 处理观看历史项点击
      if (target.classList.contains('history-item')) {
        const videoId = target.dataset.id;
        const source = target.dataset.source;
        if (videoId && source) {
          playVideo(videoId, source);
        }
      }
      
      // 处理删除按钮点击
      if (target.classList.contains('delete-history')) {
        event.stopPropagation();
        const item = target.closest('.history-item');
        if (item) {
          const videoId = item.dataset.id;
          deleteViewingHistoryItem(videoId);
        }
      }
    }
    
    // 处理标签容器点击事件
    function handleTagContainerClick(event) {
      const target = event.target;
      
      if (target.classList.contains('tag-item')) {
        const tagName = target.dataset.tag;
        toggleTagSelection(tagName, target);
      }
      
      if (target.classList.contains('delete-tag')) {
        event.stopPropagation();
        const tagItem = target.closest('.tag-item');
        const tagName = tagItem.dataset.tag;
        deleteTag(tagName);
      }
    }
    
    // 加载搜索历史
    function loadSearchHistory() {
      const historyContainer = utils.getElement('#history-container');
      const searchHistory = getSearchHistory();
      
      // 清空容器
      historyContainer.innerHTML = '';
      
      if (searchHistory.length === 0) {
        historyContainer.innerHTML = '<p class="text-gray-400">暂无搜索历史</p>';
        return;
      }
      
      // 使用 DocumentFragment 优化 DOM 操作
      const fragment = document.createDocumentFragment();
      
      searchHistory.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.dataset.query = item.query;
        
        // 安全处理查询文本，防止 XSS
        const safeQuery = utils.escapeHTML(item.query);
        
        historyItem.innerHTML = `
          <span class="history-text">${safeQuery}</span>
          <span class="history-time">${formatTime(item.time)}</span>
          <button class="delete-history" aria-label="删除历史记录项">×</button>
        `;
        
        fragment.appendChild(historyItem);
      });
      
      historyContainer.appendChild(fragment);
    }
    
    // 加载观看历史
    function loadViewingHistory() {
      const historyContainer = utils.getElement('#viewing-history-container');
      const viewingHistory = getViewingHistory();
      
      // 清空容器
      historyContainer.innerHTML = '';
      
      if (viewingHistory.length === 0) {
        historyContainer.innerHTML = '<p class="text-gray-400">暂无观看历史</p>';
        return;
      }
      
      // 使用 DocumentFragment 优化 DOM 操作
      const fragment = document.createDocumentFragment();
      
      viewingHistory.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.dataset.id = item.id;
        historyItem.dataset.source = item.source;
        
        // 安全处理标题文本，防止 XSS
        const safeTitle = utils.escapeHTML(item.title);
        
        historyItem.innerHTML = `
          <div class="history-thumbnail">
            <img src="${item.thumbnail || 'img/default-thumbnail.jpg'}" alt="缩略图">
          </div>
          <div class="history-info">
            <div class="history-title">${safeTitle}</div>
            <div class="history-meta">
              <span class="history-source">${item.source}</span>
              <span class="history-time">${formatTime(item.time)}</span>
            </div>
          </div>
          <button class="delete-history" aria-label="删除历史记录项">×</button>
        `;
        
        fragment.appendChild(historyItem);
      });
      
      historyContainer.appendChild(fragment);
    }
    
    // 保存搜索历史
    function saveSearchHistory(query) {
      if (!query.trim()) return;
      
      // 安全处理查询文本
      const safeQuery = utils.escapeHTML(query);
      
      let history = getSearchHistory();
      
      // 移除相同查询（如果存在）
      history = history.filter(item => item.query !== safeQuery);
      
      // 添加到历史开头
      history.unshift({
        query: safeQuery,
        time: Date.now()
      });
      
      // 限制历史记录数量
      if (history.length > 50) {
        history = history.slice(0, 50);
      }
      
      localStorage.setItem('searchHistory', JSON.stringify(history));
      
      // 如果历史面板打开，刷新显示
      if (elements.historyPanel.classList.contains('show')) {
        loadSearchHistory();
      }
    }
    
    // 添加到观看历史
    function addToViewingHistory(videoData) {
      if (!videoData || !videoData.id) return;
      
      // 安全处理标题文本
      if (videoData.title) {
        videoData.title = utils.escapeHTML(videoData.title);
      }
      
      let history = getViewingHistory();
      
      // 移除相同视频（如果存在）
      history = history.filter(item => item.id !== videoData.id);
      
      // 添加到历史开头
      history.unshift({
        id: videoData.id,
        title: videoData.title || '未知标题',
        source: videoData.source || '未知来源',
        thumbnail: videoData.thumbnail || '',
        time: Date.now()
      });
      
      // 限制历史记录数量
      if (history.length > 100) {
        history = history.slice(0, 100);
      }
      
      localStorage.setItem('viewingHistory', JSON.stringify(history));
      
      // 如果历史面板打开，刷新显示
      if (elements.historyPanel.classList.contains('show')) {
        loadViewingHistory();
      }
    }
    
    // 删除搜索历史项
    function deleteHistoryItem(query) {
      let history = getSearchHistory();
      history = history.filter(item => item.query !== query);
      localStorage.setItem('searchHistory', JSON.stringify(history));
      
      // 刷新显示
      loadSearchHistory();
      showToast('已删除搜索记录');
    }
    
    // 删除观看历史项
    function deleteViewingHistoryItem(videoId) {
      let history = getViewingHistory();
      history = history.filter(item => item.id !== videoId);
      localStorage.setItem('viewingHistory', JSON.stringify(history));
      
      // 刷新显示
      loadViewingHistory();
      showToast('已删除观看记录');
    }
    
    // 清空搜索历史
    function clearSearchHistory() {
      if (confirm('确定要清空所有搜索历史吗？')) {
        localStorage.setItem('searchHistory', JSON.stringify([]));
        loadSearchHistory();
        showToast('已清空搜索历史');
      }
    }
    
    // 清空观看历史
    function clearViewingHistory() {
      if (confirm('确定要清空所有观看历史吗？')) {
        localStorage.setItem('viewingHistory', JSON.stringify([]));
        loadViewingHistory();
        showToast('已清空观看历史');
      }
    }
    
    // 获取搜索历史
    function getSearchHistory() {
      try {
        const history = localStorage.getItem('searchHistory');
        return history ? JSON.parse(history) : [];
      } catch (e) {
        console.error('获取搜索历史出错:', e);
        return [];
      }
    }
    
    // 获取观看历史
    function getViewingHistory() {
      try {
        const history = localStorage.getItem('viewingHistory');
        return history ? JSON.parse(history) : [];
      } catch (e) {
        console.error('获取观看历史出错:', e);
        return [];
      }
    }
    
    // 显示标签管理模态框
    function showTagManageModal() {
      const modal = utils.getElement('#tag-manage-modal');
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
      
      // 实现焦点陷阱
      trapFocus(modal);
      
      // 加载标签
      loadTags();
    }
    
    // 隐藏标签管理模态框
    function hideTagManageModal() {
      const modal = utils.getElement('#tag-manage-modal');
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      
      // 释放焦点陷阱
      releaseFocus();
    }
    
    // 加载标签
    function loadTags() {
      const tagContainer = utils.getElement('#tag-container');
      const tags = getTags();
      
      // 清空容器
      tagContainer.innerHTML = '';
      
      if (tags.length === 0) {
        tagContainer.innerHTML = '<p class="text-gray-400">暂无标签</p>';
        return;
      }
      
      // 使用 DocumentFragment 优化 DOM 操作
      const fragment = document.createDocumentFragment();
      
      tags.forEach(tag => {
        const tagItem = document.createElement('div');
        tagItem.className = 'tag-item';
        tagItem.dataset.tag = tag.name;
        
        // 安全处理标签名，防止 XSS
        const safeTagName = utils.escapeHTML(tag.name);
        
        tagItem.innerHTML = `
          <span class="tag-name">${safeTagName}</span>
          <button class="delete-tag" aria-label="删除标签">×</button>
        `;
        
        fragment.appendChild(tagItem);
      });
      
      tagContainer.appendChild(fragment);
    }
    
    // 添加标签
    function addTag(tagName) {
      if (!tagName.trim()) return;
      
      // 安全处理标签名
      const safeTagName = utils.escapeHTML(tagName);
      
      let tags = getTags();
      
      // 检查标签是否已存在
      if (tags.some(tag => tag.name === safeTagName)) {
        showToast('标签已存在');
        return;
      }
      
      // 添加新标签
      tags.push({
        name: safeTagName,
        created: Date.now()
      });
      
      localStorage.setItem('tags', JSON.stringify(tags));
      
      // 刷新显示
      loadTags();
      showToast('已添加标签');
    }
    
    // 删除标签
    function deleteTag(tagName) {
      if (confirm(`确定要删除标签"${tagName}"吗？`)) {
        let tags = getTags();
        tags = tags.filter(tag => tag.name !== tagName);
        localStorage.setItem('tags', JSON.stringify(tags));
        
        // 刷新显示
        loadTags();
        showToast('已删除标签');
      }
    }
    
    // 获取标签
    function getTags() {
      try {
        const tags = localStorage.getItem('tags');
        return tags ? JSON.parse(tags) : [];
      } catch (e) {
        console.error('获取标签出错:', e);
        return [];
      }
    }
    
    // 显示 Toast 通知
    function showToast(message, duration = 3000) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = message;
      
      document.body.appendChild(toast);
      
      // 强制重绘以应用过渡效果
      setTimeout(() => {
        toast.classList.add('show');
      }, 10);
      
      // 自动关闭
      setTimeout(() => {
        toast.classList.remove('show');
        
        // 移除元素
        setTimeout(() => {
          document.body.removeChild(toast);
        }, 300); // 与 CSS 过渡时间匹配
      }, duration);
    }
    
    // 格式化时间
    function formatTime(timestamp) {
      const date = new Date(timestamp);
      const now = new Date();
      const diff = now - date;
      
      // 一小时内
      if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} 分钟前`;
      }
      
      // 一天内
      if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} 小时前`;
      }
      
      // 一周内
      if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days} 天前`;
      }
      
      // 其他情况显示完整日期
      return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
    }
    
    // 数字补零
    function padZero(num) {
      return num < 10 ? `0${num}` : num;
    }
    
    // 实现焦点陷阱
    function trapFocus(element) {
      // 获取所有可聚焦元素
      const focusableElements = element.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusableElements.length === 0) return;
      
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      
      // 聚焦第一个元素
      firstElement.focus();
      
      // 设置键盘事件监听器
      element.addEventListener('keydown', handleTrapFocus);
      
      function handleTrapFocus(e) {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            // Shift + Tab
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            // Tab
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        }
        
        // Escape 键关闭模态框
        if (e.key === 'Escape') {
          hideTagManageModal();
        }
      }
    }
    
    // 释放焦点陷阱
    function releaseFocus() {
      const modal = utils.getElement('#tag-manage-modal');
      modal.removeEventListener('keydown', handleTrapFocus);
    }
    
    // 检查是否密码保护
    function isPasswordProtected(feature) {
      const settings = getSettings();
      return settings[`${feature}PasswordProtect`] === true;
    }
    
    // 检查密码是否已验证
    function isPasswordVerified() {
      const verifiedUntil = parseInt(sessionStorage.getItem('passwordVerified') || '0');
      return verifiedUntil > Date.now();
    }
    
    // 提示输入密码
    function promptPassword(callback) {
      const password = prompt('请输入密码:');
      
      if (!password) return;
      
      const settings = getSettings();
      
      if (password === settings.password) {
        // 验证成功，设置 30 分钟有效期
        sessionStorage.setItem('passwordVerified', (Date.now() + 1800000).toString());
        
        if (typeof callback === 'function') {
          callback();
        }
      } else {
        alert('密码错误');
      }
    }
    
    // 获取设置
    function getSettings() {
      try {
        const settings = localStorage.getItem('settings');
        return settings ? JSON.parse(settings) : {};
      } catch (e) {
        console.error('获取设置出错:', e);
        return {};
      }
    }
    
    // 公开 API
    return {
      init,
      showToast,
      saveSearchHistory,
      addToViewingHistory,
      clearSearchHistory,
      clearViewingHistory,
      showTagManageModal,
      hideTagManageModal,
      addTag,
      isPasswordProtected,
      isPasswordVerified,
      promptPassword
    };
  })();
  
  // 页面加载完成后初始化 UI
  document.addEventListener('DOMContentLoaded', UI.init);