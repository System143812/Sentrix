import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sentrixAgent", {
  onStatus(callback) {
    ipcRenderer.on("agent:status", (_, status) => callback(status));
  },
  getStatus() {
    return ipcRenderer.invoke("agent:get-status");
  },
  copyText(value) {
    return ipcRenderer.invoke("agent:copy-text", value);
  },
});
