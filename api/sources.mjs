// /api/sources.mjs - Vercel Serverless Function (ES Module)

// 定义可用的API源
const API_SOURCES = [
    {
        code: 'default',
        name: '默认源',
        description: '默认视频源'
    },
    {
        code: 'backup1',
        name: '备用源1',
        description: '备用视频源1'
    },
    {
        code: 'backup2',
        name: '备用源2',
        description: '备用视频源2'
    }
];

export default async function handler(req, res) {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理OPTIONS请求
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 只允许GET请求
    if (req.method !== 'GET') {
        res.status(405).json({ error: '方法不允许' });
        return;
    }

    try {
        // 返回API源列表
        res.status(200).json(API_SOURCES);
    } catch (error) {
        console.error('获取API源列表失败:', error);
        res.status(500).json({ error: '获取API源列表失败' });
    }
} 
