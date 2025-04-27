// js/live.js

/**
 * 打开/关闭 直播源 Modal
 */
function openLiveModal(e) {
  e && e.stopPropagation();
  document.getElementById('liveM3uUrl').value = '';
  document.getElementById('liveList').innerHTML = '';
  document.getElementById('liveModal').classList.remove('hidden');
}
function closeLiveModal() {
  document.getElementById('liveModal').classList.add('hidden');
}

/**
 * 通过 /proxy/ 获取并解析 M3U 内容，渲染频道列表
 */
async function loadLiveChannels() {
  const url = document.getElementById('liveM3uUrl').value.trim();
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    showToast('请输入合法的 M3U URL', 'warning');
    return;
  }
  const proxyUrl = PROXY_URL + encodeURIComponent(url);
  const liveListEl = document.getElementById('liveList');
  liveListEl.innerHTML = `<p class="text-gray-500 text-center py-4">加载中…</p>`;
  try {
    const resp = await fetch(proxyUrl);
    if (!resp.ok) throw new Error(resp.statusText);
    const txt = await resp.text();
    const lines = txt.split(/\r?\n/);
    const items = [];
    let lastMeta = null;
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line.startsWith('#EXTINF:')) {
        // e.g. #EXTINF:-1,频道名称
        const parts = line.split(',');
        lastMeta = parts.slice(1).join(',') || '未命名频道';
      } else if (!line.startsWith('#')) {
        const stream = line;
        items.push({ name: lastMeta || stream, url: stream });
        lastMeta = null;
      }
    }
    if (items.length === 0) {
      liveListEl.innerHTML = `<p class="text-gray-500 text-center py-4">未解析到任何频道</p>`;
      return;
    }
    // 渲染
    liveListEl.innerHTML = items.map((ch, idx) => `
      <div class="cursor-pointer p-2 bg-[#222] hover:bg-[#333] rounded flex justify-between items-center"
           onclick="playLiveChannel(${idx})">
        <span class="truncate">${ch.name}</span>
      </div>
    `).join('');
    // 存储到全局
    window.__LIVE_CHANNELS = items;
  } catch (e) {
    console.error('加载 M3U 失败', e);
    liveListEl.innerHTML = `<p class="text-red-500 text-center py-4">加载失败：${e.message}</p>`;
  }
}

/**
 * 点击频道后，跳转到 player.html 播放
 */
 function playLiveChannel(idx) {

  const ch = (window.__LIVE_CHANNELS||[])[idx];
   if (!ch) return;

  const title = encodeURIComponent(ch.name);
  // 1) 先拿到原始直播源
  const raw = ch.url;
  // 2) 再走 /proxy/ 代理，encodeURIComponent(raw)
  const proxied = PROXY_URL + encodeURIComponent(raw);
  // 3) 然后把代理地址当 url 参数传给 player.html
  window.location.href = `player.html?url=${encodeURIComponent(proxied)}&title=${title}&source_code=live`;
 }
