chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "searchPaperPro",
    title: "🔍 PaperPro 搜索：\"%s\"",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "searchPaperPro") {
    chrome.storage.local.set({ tempQuery: info.selectionText });
    chrome.sidePanel.open({ windowId: tab.windowId });
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'TRIGGER_SEARCH', query: info.selectionText }).catch(() => {});
    }, 500);
  }
});