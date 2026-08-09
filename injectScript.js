(() => {
  if (window) {
    window.jollyR = {
      isInstalled: true,
      lastAccessDate: Date.now(),
      version: "2.0.0",
    };
    window.dispatchEvent(new CustomEvent("jollyR:installed"));
  }
})();
