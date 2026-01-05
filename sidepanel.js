// 默认配置
const DEFAULT_MIRROR = "https://scholar.google.com";
let currentMirror = DEFAULT_MIRROR;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 1. 加载保存的镜像地址
  const storage = await chrome.storage.local.get(['customMirror', 'tempQuery']);
  if (storage.customMirror) {
    currentMirror = storage.customMirror;
    document.getElementById('mirrorUrl').value = currentMirror;
  } else {
    document.getElementById('mirrorUrl').value = DEFAULT_MIRROR;
  }

  // 2. 检查是否有待搜索的内容
  if (storage.tempQuery) {
    document.getElementById('searchInput').value = storage.tempQuery;
    handleSearch(storage.tempQuery);
    chrome.storage.local.remove('tempQuery'); // 清除缓存
  }

  // 3. 绑定事件
  bindEvents();
});

// 监听来自 Background 的消息（针对侧边栏已打开的情况）
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TRIGGER_SEARCH') {
    document.getElementById('searchInput').value = msg.query;
    handleSearch(msg.query);
  }
});

function bindEvents() {
  const searchBtn = document.getElementById('searchBtn');
  const searchInput = document.getElementById('searchInput');
  const toggleSettings = document.getElementById('toggleSettings');
  const saveSettings = document.getElementById('saveSettings');

  searchBtn.addEventListener('click', () => handleSearch(searchInput.value));
  searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSearch(searchInput.value) });

  toggleSettings.addEventListener('click', () => {
    document.getElementById('settingsPanel').classList.toggle('active');
  });

  saveSettings.addEventListener('click', () => {
    let url = document.getElementById('mirrorUrl').value.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    // 移除末尾的斜杠以统一格式
    if (url.endsWith('/')) url = url.slice(0, -1);
    
    currentMirror = url;
    chrome.storage.local.set({ customMirror: url });
    document.getElementById('settingsPanel').classList.remove('active');
    showStatus("设置已保存", false);
  });
}

// ------------------------------------------
// 核心搜索逻辑
// ------------------------------------------
async function handleSearch(query) {
  if (!query || query.trim().length < 2) return;
  
  const resultsArea = document.getElementById('resultsArea');
  const statusArea = document.getElementById('statusArea');
  
  resultsArea.innerHTML = '';
  showStatus("正在检索各大数据库 (S2, CrossRef)...", false);

  try {
    // 策略：主要使用 Semantic Scholar API，因为它覆盖了 arXiv, IEEE, Springer 等
    // fields: 指定需要的字段以减少流量
    const apiUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=8&fields=title,authors,year,venue,journal,publicationTypes,externalIds,url,abstract`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      if (response.status === 429) throw new Error("请求太频繁，请稍后再试");
      throw new Error("服务暂时不可用");
    }
    
    const data = await response.json();

    statusArea.innerHTML = ''; // 清除Loading

    // 如果没有数据
    if (!data.data || data.data.length === 0) {
      renderNoResultFallback(query);
      return;
    }

    // 渲染结果
    data.data.forEach(paper => {
      resultsArea.appendChild(createPaperCard(paper));
    });

    // 底部追加一个通用链接
    appendFooterLink(query);

  } catch (error) {
    statusArea.innerHTML = `<span class="error-msg">${error.message}</span>`;
    renderNoResultFallback(query); // 即使报错也提供镜像站跳转
  }
}

// ------------------------------------------
// UI 生成逻辑
// ------------------------------------------
function createPaperCard(paper) {
  const card = document.createElement('div');
  card.className = 'card';

  // 生成标准 GB/T 7714 字符串
  const gbString = generateGBT7714(paper);
  
  // 标签处理
  let typeTag = '<span class="tag">Other</span>';
  if (paper.publicationTypes && paper.publicationTypes.includes('JournalArticle')) {
    typeTag = '<span class="tag journal">Journal</span>';
  } else if (paper.publicationTypes && paper.publicationTypes.includes('Conference')) {
    typeTag = '<span class="tag conf">Conference</span>';
  }

  // 来源展示
  const venue = paper.journal ? paper.journal.name : (paper.venue || 'Unknown Venue');

  card.innerHTML = `
    <a href="${paper.url || '#'}" target="_blank" class="paper-title">${paper.title}</a>
    <div class="paper-meta">
      ${typeTag}
      <span>${paper.year || 'N/A'}</span>
      <span>•</span>
      <span>${venue}</span>
    </div>
    
    <div class="citation-area">${gbString}</div>
    
    <div class="actions">
      <button class="btn-outline btn-copy">
        📄 复制引用
      </button>
      <button class="btn-outline btn-mirror">
        🔎 镜像搜索
      </button>
    </div>
  `;

  // 绑定按钮事件
  const copyBtn = card.querySelector('.btn-copy');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(gbString);
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = "✅ 已复制";
    copyBtn.style.borderColor = "#10b981";
    copyBtn.style.color = "#10b981";
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
      copyBtn.style = "";
    }, 2000);
  });

  card.querySelector('.btn-mirror').addEventListener('click', () => {
    openMirrorSearch(paper.title);
  });

  return card;
}

function renderNoResultFallback(query) {
  const resultsArea = document.getElementById('resultsArea');
  const div = document.createElement('div');
  div.className = 'card';
  div.style.textAlign = 'center';
  div.style.padding = '20px';
  div.innerHTML = `
    <div style="margin-bottom:10px; color:#666;">API 未找到精确结果</div>
    <button id="fallbackBtn" class="btn-primary" style="width:100%">前往镜像站搜索</button>
  `;
  div.querySelector('#fallbackBtn').addEventListener('click', () => openMirrorSearch(query));
  resultsArea.appendChild(div);
}

function appendFooterLink(query) {
  const resultsArea = document.getElementById('resultsArea');
  const div = document.createElement('div');
  div.style.textAlign = 'center';
  div.style.marginTop = '15px';
  div.innerHTML = `<a href="#" id="footerLink" style="color:#666; font-size:12px;">结果不满意？去镜像站看看 ></a>`;
  div.querySelector('#footerLink').addEventListener('click', (e) => {
    e.preventDefault();
    openMirrorSearch(query);
  });
  resultsArea.appendChild(div);
}

function openMirrorSearch(query) {
  const targetUrl = `${currentMirror}/scholar?q=${encodeURIComponent(query)}`;
  window.open(targetUrl, '_blank');
}

function showStatus(text, isError) {
  const el = document.getElementById('statusArea');
  el.className = isError ? 'status-msg error-msg' : 'status-msg';
  el.textContent = text;
}

// ------------------------------------------
// 核心算法：GB/T 7714-2015 生成器
// ------------------------------------------
function generateGBT7714(paper) {
  // 1. 作者处理：姓全大写，名首字母大写，不超过3人
  let authors = "佚名";
  if (paper.authors && paper.authors.length > 0) {
    const formattedAuthors = paper.authors.map(author => {
      const parts = author.name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].toUpperCase();
      const lastName = parts[parts.length - 1].toUpperCase();
      const firstInitial = parts[0][0].toUpperCase();
      return `${lastName} ${firstInitial}`;
    });

    if (formattedAuthors.length > 3) {
      authors = formattedAuthors.slice(0, 3).join(", ") + ", 等"; // 中文用", 等"，英文用", et al."。这里暂统用中文标准
    } else {
      authors = formattedAuthors.join(", ");
    }
  }

  // 2. 文献类型标识
  // [J] 期刊, [C] 会议, [D] 学位, [M] 图书, [A] 论文集析出
  let type = "[J]"; // 默认
  let publication = "";
  
  if (paper.publicationTypes) {
    if (paper.publicationTypes.includes("Conference")) {
      type = "[C]";
      publication = paper.venue || "Conference Proceedings";
    } else if (paper.publicationTypes.includes("JournalArticle")) {
      type = "[J]";
      publication = paper.journal ? paper.journal.name : (paper.venue || "");
    }
  }
  
  // 如果是 arXiv，通常视作 [A] 或 [J] (预印本处理较模糊，GB通常建议标明URL)
  if (paper.externalIds && paper.externalIds.ArXiv) {
    publication = `arXiv preprint arXiv:${paper.externalIds.ArXiv}`;
    type = "[J]"; // 许多国内规范将预印本归为J或EB
  }

  // 3. 拼接
  // 格式：作者. 题名[文献类型标志]. 刊名, 年, 卷(期): 页码.
  let citation = `${authors}. ${paper.title}${type}. ${publication}`;
  
  if (paper.year) citation += `, ${paper.year}`;
  
  // S2 API 有时返回 volume/pages 信息在 journal 对象里，有时没有，这里做简化处理
  if (paper.journal && paper.journal.volume) {
    citation += `, ${paper.journal.volume}`;
    if (paper.journal.pages) citation += `: ${paper.journal.pages}`;
  }
  
  citation += ".";
  return citation;
}