import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { DesktopAPI } from "../shared/model.js";
const api: DesktopAPI = {
  command: (name, args) => ipcRenderer.invoke("command", name, args),
  chooseImport: (folder) => ipcRenderer.invoke("choose-import", folder),
  chooseDirectory: () => ipcRenderer.invoke("choose-directory"),
  chooseRelink: () => ipcRenderer.invoke("choose-relink"),
  preview: (id, recipe, maxDimension) =>
    ipcRenderer.invoke("preview", id, recipe, maxDimension),
  assetUrl: (id, revision) =>
    `lumaflux://asset/${encodeURIComponent(id)}?revision=${revision}`,
  pathsForFiles: (files) =>
    files.map((file) => webUtils.getPathForFile(file)).filter(Boolean),
  onChange: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("catalog-change", handler);
    return () => ipcRenderer.removeListener("catalog-change", handler);
  },
  settings: () => ipcRenderer.invoke("agent-settings"),
  updateSettings: (enabled, roots) =>
    ipcRenderer.invoke("update-agent-settings", enabled, roots),
};
contextBridge.exposeInMainWorld("lumaflux", api);
