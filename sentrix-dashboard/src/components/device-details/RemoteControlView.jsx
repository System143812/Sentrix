import {
  Terminal,
  Power,
  RotateCw,
  Moon,
  Lock,
  Zap,
  Trash2,
  Clock as ClockIcon,
  Eraser,
  MessageSquare,
  Info,
  FolderOpen,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "../ToastProvider.jsx";
import * as clientApi from "../../services/clientApi.js";
import {
  BroadcastDialog,
  ActionConfirmDialog,
  FileUploadDialog,
  FileDeleteDialog,
  FileDeletePreviewModal,
  FileDownloadDialog,
} from "./shared/Dialogs.jsx";

export function RemoteControlView({ device, allDevices = [], utilityConfig, refresh }) {
  const [commandStatus, setCommandStatus] = useState("");
  const [loadingCommand, setLoadingCommand] = useState("");
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // File Manager State
  const activePath = device.activePath || "C:/Users/Public/Desktop";
  const [draftPath, setDraftPath] = useState(activePath);

  useEffect(() => {
    setDraftPath(device.activePath || "C:/Users/Public/Desktop");
  }, [device.id, device.activePath]);
  const [pathStatus, setPathStatus] = useState("valid"); // 'valid' | 'invalid' | 'agent-offline' | 'device-offline'
  const [validatingPath, setValidatingPath] = useState(false);
  const [fileModal, setFileModal] = useState(null); // 'upload' | 'delete' | 'download' | null
  const [downloadFiles, setDownloadFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [deletePreviewData, setDeletePreviewData] = useState(null);
  const [pendingDeletePayload, setPendingDeletePayload] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const { notify } = useToast();

  const isDeviceOffline = device?.status === "offline";
  const pathValid = pathStatus === "valid";

  const powerActions = [
    { id: "shutdown", label: "Turn off", icon: Power, hoverTone: "group-hover:text-rose-500", description: "Power off this device" },
    { id: "restart", label: "Restart", icon: RotateCw, hoverTone: "group-hover:text-amber-500", description: "Restart this device" },
    { id: "sleep", label: "Sleep", icon: Moon, hoverTone: "group-hover:text-blue-500", description: "Put this device to sleep" },
    { id: "lock", label: "Lock", icon: Lock, hoverTone: "group-hover:text-slate-900", description: "Lock the active session" },
  ];

  const utilityShortcuts = [
    { id: "network-reset", label: "Network Reset", icon: Zap, hoverTone: "group-hover:text-blue-500", description: "Flush DNS and reset IP stack" },
    { id: "system-purge", label: "System Purge", icon: Trash2, hoverTone: "group-hover:text-rose-500", description: "Clear temp files, update cache & recycle bin" },
    { id: "time-sync", label: "Clock Sync", icon: ClockIcon, hoverTone: "group-hover:text-emerald-500", description: "Force time synchronization" },
    { id: "workspace-reset", label: "Clear Workspace", icon: Eraser, hoverTone: "group-hover:text-amber-500", description: "Kill all non-system applications" },
    { id: "broadcast-message", label: "Broadcast", icon: MessageSquare, hoverTone: "group-hover:text-indigo-500", description: "Send a native screen popup" },
  ];

  const enabledShortcuts = utilityConfig?.enabledIds
    ? utilityShortcuts.filter(s => utilityConfig.enabledIds.includes(s.id))
    : utilityShortcuts;

  // Validate draft path in real-time as user types
  useEffect(() => {
    let isMounted = true;

    if (isDeviceOffline) {
      setPathStatus("device-offline");
      return;
    }

    async function validatePath() {
      if (!draftPath.trim()) {
        setPathStatus("invalid");
        return;
      }
      setValidatingPath(true);
      try {
        const res = await clientApi.sendDeviceCommand(device.id, "utility:file-validate", { path: draftPath });
        if (isMounted) {
          if (res?.data?.valid) {
            setPathStatus("valid");
          } else {
            setPathStatus("invalid");
          }
        }
      } catch (err) {
        if (isMounted) {
          const errMsg = (err?.message || "").toLowerCase();
          if (errMsg.includes("offline") || errMsg.includes("not connected")) {
            setPathStatus("agent-offline");
          }
          // Do not pessimistically overwrite to "invalid" on transient timeouts or socket lag
        }
      } finally {
        if (isMounted) {
          setValidatingPath(false);
        }
      }
    }

    validatePath();
    return () => { isMounted = false; };
  }, [draftPath, device.id, isDeviceOffline]);

  async function handleCommand(targetDevices, command, payloadFactory = {}) {
    setLoadingCommand(command);
    const count = targetDevices.length;

    if (count > 1) {
      setCommandStatus(`Executing ${command} on ${count} devices...`);
    } else {
      setCommandStatus(`Sending ${command} to ${targetDevices[0].hostname}...`);
    }

    let successCount = 0;
    let failCount = 0;
    let lastErrorMessage = "";

    for (const d of targetDevices) {
      try {
        const payload = typeof payloadFactory === "function" ? payloadFactory(d) : payloadFactory;
        await clientApi.sendDeviceCommand(d.id, command, payload);
        successCount++;
        if (count > 1) {
          setCommandStatus(`Progress: ${successCount}/${count} devices reached...`);
        }
      } catch (error) {
        failCount++;
        const rawMsg = error?.message || "Failed to send command.";
        lastErrorMessage = rawMsg.toLowerCase().includes("offline")
          ? "Agent is offline. Please try again later."
          : rawMsg;
      }
    }

    const finalMsg = count > 1
      ? `Batch finished: ${successCount} successful, ${failCount} failed.`
      : successCount > 0
        ? `${command.charAt(0).toUpperCase() + command.slice(1)} command sent.`
        : lastErrorMessage;

    setCommandStatus(finalMsg);
    notify(finalMsg, failCount === 0 ? "success" : "failed");
    setLoadingCommand("");
    setTimeout(() => setCommandStatus(""), 5000);
  }

  function getTargetDevices(scope) {
    let targetDevices = [device];
    if (scope === "group") {
      targetDevices = allDevices.filter(d => d.group === device.group && d.status === "online");
    } else if (scope === "all") {
      targetDevices = allDevices.filter(d => d.status === "online");
    }
    return targetDevices;
  }

  function onActionClick(action, type) {
    if (action.id === "broadcast-message") {
      setShowBroadcast(true);
    } else {
      setPendingAction({ ...action, type });
    }
  }

  function confirmPendingAction(scope) {
    if (!pendingAction) return;
    const command = pendingAction.type === 'utility' ? `utility:${pendingAction.id}` : pendingAction.id;
    const targetDevices = getTargetDevices(scope);
    handleCommand(targetDevices, command);
    setPendingAction(null);
  }

  async function revalidateCurrentPath(targetDevices = [device]) {
    let allValid = true;
    for (const d of targetDevices) {
      if (d.status === "offline") continue;
      const targetPath = d.id === device.id ? draftPath : (d.activePath || "C:/Users/Public/Desktop");
      try {
        const res = await clientApi.sendDeviceCommand(d.id, "utility:file-validate", { path: targetPath });
        if (res?.data?.valid) {
          d.activePath = targetPath;
          try {
            await clientApi.updateClientActivePath(d.id, targetPath);
          } catch {}
          if (d.id === device.id) {
            setPathStatus("valid");
            setDraftPath(targetPath);
          }
        } else {
          allValid = false;
          if (d.id === device.id) {
            setPathStatus("invalid");
          }
        }
      } catch {
        allValid = false;
        if (d.id === device.id) {
          setPathStatus("invalid");
        }
      }
    }
    if (fileModal === "download" && targetDevices.some(d => d.id === device.id)) {
      try {
        const listRes = await clientApi.sendDeviceCommand(device.id, "utility:file-list", { path: draftPath });
        setDownloadFiles(listRes?.data?.files || []);
      } catch {
        setDownloadFiles([]);
      }
    }
    try {
      await refresh?.();
    } catch {}

    if (targetDevices.length > 1 && !allValid) {
      notify("Some target paths remain invalid or missing.", "failed");
    }
  }

  // File Manager Handlers
  async function handleUploadSubmit(file, scope, createMissingDirs) {
    setFileModal(null);
    const targetDevices = getTargetDevices(scope);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result.split(',')[1];
      await handleCommand(targetDevices, "utility:file-upload", (d) => ({
        path: d.activePath || (d.id === device.id ? activePath : "C:/Users/Public/Desktop"),
        fileName: file.name,
        fileData: base64Data,
        createMissingDirs,
      }));
      await revalidateCurrentPath(targetDevices);
    };
    reader.readAsDataURL(file);
  }

  async function handleDeleteSubmit(filters, scope) {
    setFileModal(null);
    setPendingDeletePayload({ filters, scope });
    setLoadingPreview(true);
    try {
      const targetDevices = getTargetDevices(scope);
      const previewPromises = targetDevices.map(async (d) => {
        const targetPath = d.activePath || (d.id === device.id ? activePath : "C:/Users/Public/Desktop");
        try {
          const res = await clientApi.sendDeviceCommand(d.id, "utility:file-preview-delete", {
            path: targetPath,
            ...filters,
          });
          if (res?.success && res?.data) {
            const taggedItems = (res.data.items || []).map(item => ({
              ...item,
              deviceName: d.hostname || d.ip || d.id,
              deviceId: d.id,
            }));
            return {
              success: true,
              device: d,
              items: taggedItems,
              totalFiles: res.data.totalFiles || 0,
              totalFolders: res.data.totalFolders || 0,
              totalSize: res.data.totalSize || 0,
            };
          }
        } catch {}
        return { success: false, device: d, items: [], totalFiles: 0, totalFolders: 0, totalSize: 0 };
      });

      const results = await Promise.allSettled(previewPromises);
      let allItems = [];
      let totalFiles = 0;
      let totalFolders = 0;
      let totalSize = 0;
      let devicesCount = targetDevices.length;

      for (const r of results) {
        if (r.status === "fulfilled" && r.value.success) {
          allItems = allItems.concat(r.value.items);
          totalFiles += r.value.totalFiles;
          totalFolders += r.value.totalFolders;
          totalSize += r.value.totalSize;
        }
      }

      setDeletePreviewData({
        items: allItems,
        totalFiles,
        totalFolders,
        totalSize,
        devicesCount,
      });
    } catch (err) {
      notify(err?.message || "Failed to generate deletion preview.", "failed");
      setDeletePreviewData(null);
      setPendingDeletePayload(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function confirmAndDelete() {
    if (!pendingDeletePayload) return;
    const { filters, scope } = pendingDeletePayload;
    setDeletePreviewData(null);
    setPendingDeletePayload(null);

    const targetDevices = getTargetDevices(scope);
    await handleCommand(targetDevices, "utility:file-delete", (d) => ({
      path: d.activePath || (d.id === device.id ? activePath : "C:/Users/Public/Desktop"),
      ...filters,
    }));
    await revalidateCurrentPath(targetDevices);
  }

  async function openDownloadModal() {
    if (!pathValid) return;
    setFileModal("download");
    setLoadingFiles(true);
    try {
      const res = await clientApi.sendDeviceCommand(device.id, "utility:file-list", { path: activePath });
      setDownloadFiles(res?.data?.files || []);
    } catch (err) {
      notify(err?.message || "Failed to list files in active path.", "failed");
      setDownloadFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }

  async function handleDownloadFile(fileName) {
    setFileModal(null);
    const fullFilePath = `${activePath}\\${fileName}`;
    try {
      const res = await clientApi.sendDeviceCommand(device.id, "utility:file-download", { filePath: fullFilePath });
      const data = res?.data;
      if (data && data.fileData) {
        const byteCharacters = atob(data.fileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.fileName || fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify(`Successfully downloaded ${fileName}`, "success");
      } else {
        notify("Failed to retrieve file data.", "failed");
      }
    } catch (err) {
      notify(err?.message || "File download failed.", "failed");
    }
  }

  return (
    <div className="grid gap-6">

      {showBroadcast && (
        <BroadcastDialog
          device={device}
          allDevices={allDevices}
          onCancel={() => setShowBroadcast(false)}
          onSend={(msg, scope) => {
            setShowBroadcast(false);
            const targetDevices = getTargetDevices(scope);
            handleCommand(targetDevices, "utility:broadcast-message", { text: msg });
          }}
        />
      )}

      {pendingAction && (
        <ActionConfirmDialog
          action={pendingAction}
          device={device}
          allDevices={allDevices}
          onCancel={() => setPendingAction(null)}
          onConfirm={confirmPendingAction}
        />
      )}

      {fileModal === "upload" && (
        <FileUploadDialog
          activePath={activePath}
          device={device}
          allDevices={allDevices}
          onCancel={() => setFileModal(null)}
          onUpload={handleUploadSubmit}
        />
      )}

      {fileModal === "delete" && (
        <FileDeleteDialog
          activePath={activePath}
          device={device}
          allDevices={allDevices}
          onCancel={() => setFileModal(null)}
          onDelete={handleDeleteSubmit}
        />
      )}

      {deletePreviewData && (
        <FileDeletePreviewModal
          previewData={deletePreviewData}
          loading={loadingPreview}
          onCancel={() => {
            setDeletePreviewData(null);
            setPendingDeletePayload(null);
          }}
          onConfirm={confirmAndDelete}
        />
      )}

      {fileModal === "download" && (
        <FileDownloadDialog
          activePath={activePath}
          files={downloadFiles}
          loadingFiles={loadingFiles}
          onCancel={() => setFileModal(null)}
          onDownload={handleDownloadFile}
        />
      )}

      {/* Remote Power Controls */}
      <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 sm:p-6 shadow-inner">
        <h4 className="mb-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
          <Terminal size={18} strokeWidth={2.5} className="text-slate-400" />
          Remote Power Controls
        </h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {powerActions.map((action) => {
            const Icon = action.icon;
            const pending = loadingCommand === action.id;

            return (
              <div className="group relative" key={action.id}>
                <button
                  className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-200/60 bg-slate-50/30 text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-95 disabled:cursor-wait disabled:opacity-50"
                  disabled={Boolean(loadingCommand)}
                  onClick={() => onActionClick(action, 'power')}
                  type="button"
                >
                  <Icon
                    className={`text-slate-400 transition-colors duration-200 ${action.hoverTone} group-active:text-white ${
                      pending ? "animate-pulse" : ""
                    }`}
                    size={24}
                    strokeWidth={2.5}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                    {pending ? "Sending" : action.label}
                  </span>
                </button>
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 hidden w-44 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium leading-relaxed text-white shadow-sm group-hover:block">
                  {action.description}
                  <div className="absolute left-1/2 top-full -ml-1.5 border-[6px] border-transparent border-t-slate-900" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Admin Maintenance Tools */}
      <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 sm:p-6 shadow-inner">
        <h4 className="mb-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
          <Zap size={18} strokeWidth={2.5} className="text-slate-400" />
          Admin Maintenance Tools
        </h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {enabledShortcuts.length > 0 ? (
            enabledShortcuts.map((action) => {
              const Icon = action.icon;
              const pending = loadingCommand === `utility:${action.id}`;

              return (
                <div className="group relative" key={action.id}>
                  <button
                    className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-200/60 bg-slate-50/30 text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-95 disabled:cursor-wait disabled:opacity-50"
                    disabled={Boolean(loadingCommand)}
                    onClick={() => onActionClick(action, 'utility')}
                    type="button"
                  >
                    <Icon
                      className={`text-slate-400 transition-colors duration-200 ${action.hoverTone} group-active:text-white ${
                        pending ? "animate-pulse" : ""
                      }`}
                      size={24}
                      strokeWidth={2.5}
                    />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      {pending ? "Executing" : action.label}
                    </span>
                  </button>
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-3 hidden w-44 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] font-medium leading-relaxed text-white shadow-sm group-hover:block">
                    {action.description}
                    <div className="absolute left-1/2 top-full -ml-1.5 border-[6px] border-transparent border-t-slate-900" />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full flex flex-col items-center justify-center py-6 text-center">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-slate-300">
                <Zap size={24} strokeWidth={2} />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                No active maintenance tools
              </p>
              <p className="mt-1 text-[9px] font-medium text-slate-400">
                Configure shortcuts in system settings
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Files Management Tools */}
      <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 sm:p-6 shadow-inner">
        <h4 className="mb-5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
          <FolderOpen size={18} strokeWidth={2.5} className="text-slate-400" />
          Files Management Tools
        </h4>

        {/* Active Path Control & Status */}
        <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Active Target Path</label>
            <div className="flex items-center gap-2">
              {validatingPath ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500 animate-pulse">
                  Validating path...
                </span>
              ) : pathStatus === "valid" ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 size={13} /> Valid Path
                </span>
              ) : pathStatus === "invalid" ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                  <AlertCircle size={13} /> Invalid Path
                </span>
              ) : pathStatus === "agent-offline" ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  <AlertCircle size={13} /> Agent Offline
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  <AlertCircle size={13} /> Device Offline
                </span>
              )}
            </div>
          </div>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-3 font-mono text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
            value={draftPath}
            onChange={(e) => setDraftPath(e.target.value)}
            placeholder="C:\Users\Public\Desktop"
          />

          {draftPath !== activePath && (
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="h-8 rounded-md border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                onClick={() => setDraftPath(activePath)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-8 rounded-md bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 shadow-sm"
                onClick={async () => {
                  try {
                    await clientApi.updateClientActivePath(device.id, draftPath);
                    notify("Active target path saved successfully.", "success");
                  } catch (err) {
                    notify(err?.message || "Failed to save active path.", "failed");
                  }
                }}
              >
                Save Path
              </button>
            </div>
          )}

          {pathStatus === "invalid" && (
            <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 shadow-sm">
              <AlertCircle size={16} className="shrink-0 text-rose-500" />
              <span>Active path does not exist or is not a directory on the target PC.</span>
            </div>
          )}

          {pathStatus === "agent-offline" && (
            <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700 shadow-sm">
              <AlertCircle size={16} className="shrink-0 text-amber-500" />
              <span>Agent is not responding or currently offline. Validation cannot be completed.</span>
            </div>
          )}

          {pathStatus === "device-offline" && (
            <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600 shadow-sm">
              <AlertCircle size={16} className="shrink-0 text-slate-400" />
              <span>Device is offline. File management actions are unavailable.</span>
            </div>
          )}
        </div>

        {/* Three Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            className="group flex h-24 flex-col items-center justify-center gap-2 rounded-lg border border-slate-200/60 bg-slate-50/30 text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={validatingPath || isDeviceOffline || pathStatus === "agent-offline"}
            onClick={() => setFileModal("upload")}
            type="button"
          >
            <Upload size={24} strokeWidth={2.5} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Upload File
            </span>
          </button>

          <button
            className="group flex h-24 flex-col items-center justify-center gap-2 rounded-lg border border-slate-200/60 bg-slate-50/30 text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!pathValid || validatingPath || isDeviceOffline || pathStatus === "agent-offline"}
            onClick={() => setFileModal("delete")}
            type="button"
          >
            <Trash2 size={24} strokeWidth={2.5} className="text-slate-400 group-hover:text-rose-500 transition-colors" />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Filtered Delete
            </span>
          </button>

          <button
            className="group flex h-24 flex-col items-center justify-center gap-2 rounded-lg border border-slate-200/60 bg-slate-50/30 text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-white hover:shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!pathValid || validatingPath || isDeviceOffline || pathStatus === "agent-offline"}
            onClick={openDownloadModal}
            type="button"
          >
            <Download size={24} strokeWidth={2.5} className="text-slate-400 group-hover:text-emerald-500 transition-colors" />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Download File
            </span>
          </button>
        </div>
      </section>

      {commandStatus ? (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200/60 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700 shadow-sm">
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          {commandStatus}
        </div>
      ) : null}
    </div>
  );
}
