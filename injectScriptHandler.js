(() => {
  const scriptNode = document.createElement("script");
  scriptNode.src = chrome.runtime.getURL("injectScript.js");
  (document.head || document.documentElement).appendChild(scriptNode);
})();
