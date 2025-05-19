只部署在cloudflare pages，方法见[上游](https://github.com/LibreSpark/LibreTV)

- 同页播放
- 绑定kv spacename：LIBRETV_PROXY_KV

与[上游](https://github.com/LibreSpark/LibreTV)差异
- 预加载集数开关
- 代码优化/瘦身，重构
- cloudflare pages 和 播放 优化。
- 播放页：记住每集进度
- 播放页：修复某些浏览器点播其它集数不能自动播放的问题。
- 首页集数弹窗，播放同样可以按每集进度进入
- 重写去广告，但效果差不多
- 播放器双击：暂停/播放
- 豆瓣热门推荐的搜索结果，不计入搜索历史。
