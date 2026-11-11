// Common module: keep-alive ports and utilities

export const PORTS = {
  KEEP_ALIVE: 'KEEP_ALIVE_PORT',
  ATS_STATUS: 'ATS_STATUS_PORT',
} as const;

export class CommonModule {
  private keepAlivePorts = new Map<number, chrome.runtime.Port>();

  createKeepAlivePort(port: chrome.runtime.Port): void {
    const tabId = port.sender?.tab?.id;
    if (tabId) {
      this.keepAlivePorts.set(tabId, port);
      port.onDisconnect.addListener(() => {
        // Consume the error so Chrome doesn't log "Unchecked runtime.lastError"
        void chrome.runtime.lastError;
        this.keepAlivePorts.delete(tabId);
      });
    }
  }

  processMessage(_message: unknown, _sender: chrome.runtime.MessageSender, _sendResponse: (response?: unknown) => void): boolean {
    // No sync messages here
    return false;
  }
}
