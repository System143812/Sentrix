import {
  X,
  MessageSquare,
  Monitor,
  Users,
  Globe2,
  CircleStop,
  ShieldAlert,
  LoaderCircle,
  FolderOpen,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle2,
  UploadCloud,
  FileText,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useState, useEffect } from "react";
import { BlurOverlay } from "../../BlurOverlay.jsx";
import * as clientApi from "../../../services/clientApi.js";

export function ConfirmDialog({ device, onCancel, onConfirm, loading }) {
  if (!device) return null;

  return (
    <BlurOverlay onClose={onCancel}>
      <div className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">Archive device?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This removes {device.hostname} from the registered device list.
              The device can appear again when its agent reconnects.
            </p>
          </div>
          <button
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
            onClick={onCancel}
            type="button"
            disabled={loading}
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            className="h-11 rounded-lg border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
            onClick={onCancel}
            type="button"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="relative inline-flex h-11 items-center justify-center rounded-lg bg-slate-900 px-6 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            onClick={onConfirm}
            type="button"
            disabled={loading}
          >
            <div className={`flex items-center gap-2 ${loading ? "opacity-0" : "opacity-100"}`}>
              <span>Archive Device</span>
            </div>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoaderCircle className="animate-spin" size={18} />
              </div>
            )}
          </button>
        </div>
      </div>
    </BlurOverlay>
  );
}

export function BroadcastDialog({ onCancel, onSend, device, allDevices = [] }) {
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("single");

  const groupDevices = allDevices.filter(d => d.group === device.group && d.status === "online");
  const onlineDevices = allDevices.filter(d => d.status === "online");

  const targetCount = target === "single" ? 1 : target === "group" ? groupDevices.length : onlineDevices.length;

  const targets = [
    { id: "single", label: "This Device", icon: Monitor, description: device.hostname },
    { id: "group", label: "Same Group", icon: Users, description: `${device.group || 'Unassigned'} (${groupDevices.length} online)` },
    { id: "all", label: "All Online", icon: Globe2, description: `Broadcast to ${onlineDevices.length} devices` },
  ];

  return (
    <BlurOverlay onClose={onCancel}>
      <div className="w-full max-h-[90vh] flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-5 border-b border-slate-50 bg-slate-50/30">
          <span className="grid h-11 w-11 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
            <MessageSquare size={22} strokeWidth={2.5} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Broadcast Message</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">System Notification</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Targeting Scope</p>
          <div className="grid gap-2 mb-6">
            {targets.map((t) => {
              const TargetIcon = t.icon;
              const active = target === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTarget(t.id)}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                    active 
                    ? 'border-blue-600 bg-white shadow-sm ring-4 ring-blue-50' 
                    : 'border-slate-100 bg-slate-50/30 text-slate-600 hover:border-slate-300 hover:bg-white'
                  }`}
                  type="button"
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors ${active ? 'border-blue-100 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-400'}`}>
                    <TargetIcon size={16} strokeWidth={2.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold leading-tight text-slate-900">{t.label}</p>
                    <p className="truncate text-[10px] font-medium text-slate-500 mt-0.5">{t.description}</p>
                  </div>
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${active ? 'border-blue-600 bg-blue-600' : 'border-slate-200 bg-white'}`}>
                    {active && <div className="h-1 w-1 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Message Text</p>
            <span className={`text-[10px] font-bold ${message.length > 130 ? 'text-amber-500' : 'text-slate-400'}`}>
              {message.length} / 150
            </span>
          </div>
          <textarea
            autoFocus
            maxLength={150}
            className="w-full h-28 rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-sm font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100/50 transition-all resize-none"
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Lab will close in 5 minutes. Please save your work."
            value={message}
          />
        </div>

        <div className="flex justify-end gap-2 p-4 bg-slate-50/30 border-t border-slate-50">
          <button 
            className="h-11 rounded-lg border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]" 
            onClick={onCancel} 
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
            disabled={!message.trim()}
            onClick={() => onSend(message, target)}
            type="button"
          >
            Send to {targetCount} {targetCount === 1 ? 'PC' : 'PCs'}
          </button>
        </div>
      </div>
    </BlurOverlay>
  );
}

export function ActionConfirmDialog({ action, onCancel, onConfirm, device, allDevices = [] }) {
  const [target, setTarget] = useState("single");
  if (!action) return null;
  const Icon = action.icon;

  const isDangerous = ["shutdown", "restart", "system-purge", "workspace-reset"].includes(action.id);

  const groupDevices = allDevices.filter(d => d.group === device.group && d.status === "online");
  const onlineDevices = allDevices.filter(d => d.status === "online");

  const targetCount = target === "single" ? 1 : target === "group" ? groupDevices.length : onlineDevices.length;

  const targets = [
    { id: "single", label: "This Device", icon: Monitor, description: device.hostname },
    { id: "group", label: "Same Group", icon: Users, description: `${device.group || 'Unassigned'} (${groupDevices.length} online)` },
    { id: "all", label: "All Online", icon: Globe2, description: `Broadcast to ${onlineDevices.length} devices` },
  ];

  return (
    <BlurOverlay onClose={onCancel}>
      <div className="w-full max-h-[90vh] flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-5 border-b border-slate-50 bg-slate-50/30">
          <span className={`grid h-11 w-11 place-items-center rounded-lg border shadow-sm ${isDangerous ? 'border-rose-100 bg-rose-50 text-rose-600' : 'border-blue-100 bg-blue-50 text-blue-600'}`}>
            <Icon size={22} strokeWidth={2.5} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">{action.label}</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Remote Command</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Targeting Scope</p>
          <div className="grid gap-2 mb-6">
            {targets.map((t) => {
              const TargetIcon = t.icon;
              const active = target === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTarget(t.id)}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                    active 
                    ? 'border-blue-600 bg-white shadow-sm ring-4 ring-blue-50' 
                    : 'border-slate-100 bg-slate-50/30 text-slate-600 hover:border-slate-300 hover:bg-white'
                  }`}
                  type="button"
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-colors ${active ? 'border-blue-100 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-400'}`}>
                    <TargetIcon size={16} strokeWidth={2.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold leading-tight text-slate-900">{t.label}</p>
                    <p className="truncate text-[10px] font-medium text-slate-500 mt-0.5">{t.description}</p>
                  </div>
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 ${active ? 'border-blue-600 bg-blue-600' : 'border-slate-200 bg-white'}`}>
                    {active && <div className="h-1 w-1 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
            <p className="text-xs font-medium text-slate-600 leading-relaxed">
              Confirming will <strong>{action.label.toLowerCase()}</strong> {targetCount > 1 ? `${targetCount} devices` : "this device"}. 
              <span className="block mt-1 text-slate-400 font-normal text-[10px]">{action.description}</span>
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 bg-slate-50/30 border-t border-slate-50">
          <button 
            className="h-11 rounded-lg border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]" 
            onClick={onCancel} 
            type="button"
          >
            Cancel
          </button>
          <button
            className={`h-11 rounded-lg px-8 text-sm font-semibold text-white shadow-lg transition active:scale-[0.98] ${
              isDangerous 
              ? 'bg-rose-600 shadow-rose-900/10 hover:bg-rose-700' 
              : 'bg-blue-600 shadow-blue-900/10 hover:bg-blue-700'
            }`}
            onClick={() => onConfirm(target)}
            type="button"
          >
            Confirm Execution
          </button>
        </div>
      </div>
    </BlurOverlay>
  );
}

export function ProcessEndConfirmDialog({ count, loading, onCancel, onConfirm }) {
  if (!count) return null;

  return createPortal(
    <BlurOverlay onClose={onCancel}>
      <div className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-rose-100 bg-rose-50 text-rose-600">
            <ShieldAlert size={22} />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900">End selected process{count > 1 ? "es" : ""}?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This sends a termination command to the agent. Unsaved work in the selected app may be lost.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            className="h-11 rounded-lg border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            disabled={loading}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-rose-600 px-6 text-sm font-semibold text-white shadow-lg shadow-rose-900/10 transition hover:bg-rose-700 disabled:cursor-wait disabled:opacity-70"
            disabled={loading}
            onClick={onConfirm}
            type="button"
          >
            {loading ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <CircleStop size={16} />
            )}
            {loading ? "Ending Processes..." : `End ${count} Process${count > 1 ? "es" : ""}`}
          </button>
        </div>
      </div>
    </BlurOverlay>,
    document.body,
  );
}

export function FileUploadDialog({ activePath, onCancel, onUpload, device, allDevices = [] }) {
  const [target, setTarget] = useState("single");
  const [selectedFile, setSelectedFile] = useState(null);
  const [createMissingDirs, setCreateMissingDirs] = useState(false);
  const [invalidDevices, setInvalidDevices] = useState([]);
  const [validatingPaths, setValidatingPaths] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const groupDevices = allDevices.filter(d => d.group === device.group && d.status === "online");
  const onlineDevices = allDevices.filter(d => d.status === "online");
  const targetCount = target === "single" ? 1 : target === "group" ? groupDevices.length : onlineDevices.length;

  const targetDevices = target === "single"
    ? [device]
    : target === "group"
      ? groupDevices
      : onlineDevices;

  useEffect(() => {
    let isMounted = true;
    async function checkPaths() {
      if (createMissingDirs) {
        if (isMounted) setInvalidDevices([]);
        return;
      }
      setValidatingPaths(true);

      const validationPromises = targetDevices.map(async (d) => {
        const dPath = d.activePath || (d.id === device.id ? activePath : "C:/Users/Public/Desktop");
        try {
          const res = await clientApi.sendDeviceCommand(d.id, "utility:file-validate", { path: dPath });
          if (!res?.data?.valid) {
            return { valid: false, device: d, checkedPath: dPath };
          }
          return { valid: true, device: d, checkedPath: dPath };
        } catch {
          return { valid: false, device: d, checkedPath: dPath };
        }
      });

      const results = await Promise.allSettled(validationPromises);
      const fails = [];
      for (const r of results) {
        if (r.status === "fulfilled" && !r.value.valid) {
          fails.push({ ...r.value.device, checkedPath: r.value.checkedPath });
        }
      }

      if (isMounted) {
        setInvalidDevices(fails);
        setValidatingPaths(false);
      }
    }
    checkPaths();
    return () => { isMounted = false; };
  }, [target, activePath, createMissingDirs, allDevices, device]);

  const targets = [
    { id: "single", label: "This Device", icon: Monitor, description: device.hostname },
    { id: "group", label: "Same Group", icon: Users, description: `${device.group || 'Unassigned'} (${groupDevices.length} online)` },
    { id: "all", label: "All Online", icon: Globe2, description: `Broadcast to ${onlineDevices.length} devices` },
  ];

  return (
    <BlurOverlay onClose={onCancel}>
      <div className="w-full max-h-[90vh] flex flex-col rounded-xl border border-slate-200/80 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center gap-3.5 p-5 border-b border-slate-100 bg-slate-50/50">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm">
            <FolderOpen size={22} strokeWidth={2.5} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Upload File to Active Path</h3>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">Target: <code className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{activePath}</code></p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Targeting Scope</p>
            <div className="grid gap-2">
              {targets.map((t) => {
                const TargetIcon = t.icon;
                const active = target === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTarget(t.id)}
                    className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                      active ? 'border-blue-600 bg-white shadow-sm ring-4 ring-blue-50' : 'border-slate-100 bg-slate-50/30 text-slate-600 hover:border-slate-300 hover:bg-white'
                    }`}
                    type="button"
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors ${active ? 'border-blue-100 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-400'}`}>
                      <TargetIcon size={18} strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold leading-tight text-slate-900">{t.label}</p>
                      <p className="truncate text-[10px] font-medium text-slate-500 mt-0.5">{t.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Select File to Upload</p>
              {selectedFile && (
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="text-[11px] font-semibold text-rose-600 hover:underline"
                >
                  Change File
                </button>
              )}
            </div>

            {!selectedFile ? (
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all group ${
                  isDragOver
                    ? 'border-blue-600 bg-blue-50/40 ring-4 ring-blue-50'
                    : 'border-slate-200 hover:border-blue-500 bg-slate-50/50 hover:bg-blue-50/20'
                }`}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragOver(false);
                  if (e.dataTransfer.files?.[0]) {
                    setSelectedFile(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => document.getElementById('modern-file-input').click()}
              >
                <input
                  id="modern-file-input"
                  type="file"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 mb-3 group-hover:scale-105 transition-transform shadow-sm">
                  <UploadCloud size={24} strokeWidth={2.2} />
                </div>
                <p className="text-xs font-bold text-slate-800">
                  Drag and drop your file here, or <span className="text-blue-600 underline">browse</span>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Supports any file type and size</p>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 rounded-xl border border-blue-200 bg-blue-50/40 shadow-sm">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-600">
                    <FileText size={20} strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{selectedFile.name}</p>
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                      {(selectedFile.size / 1024).toFixed(1)} KB • Ready to upload
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition"
                  title="Remove file"
                >
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>
            )}
          </div>

          {/* Create Destination Path if Missing Checkbox & Path Validation List */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={createMissingDirs}
                onChange={(e) => setCreateMissingDirs(e.target.checked)}
              />
              <div className="text-xs">
                <span className="font-bold text-slate-900 block">Create Destination Path if Missing</span>
                <span className="text-slate-500 text-[11px] leading-relaxed mt-0.5 block">
                  Automatically create missing parent directories on target PCs during upload.
                </span>
              </div>
            </label>

            {!createMissingDirs && (
              <div className="pt-3 border-t border-slate-200/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <span>Path Validation Status</span>
                    {validatingPaths && (
                      <LoaderCircle size={13} className="text-blue-600 animate-spin" />
                    )}
                  </span>
                </div>

                {invalidDevices.length > 0 ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                    <p className="font-bold mb-1.5 flex items-center gap-1.5">
                      <AlertCircle size={14} className="text-rose-600 shrink-0" />
                      <span>{invalidDevices.length} target PC(s) have invalid or non-existent paths:</span>
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-[11px] font-mono font-medium text-rose-700">
                      {invalidDevices.map(d => (
                        <li key={d.id}>
                          {d.hostname || d.ip || d.id} <span className="text-rose-500 font-normal">({d.checkedPath})</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[10px] font-medium text-rose-600">
                      Uploads will be skipped on these PCs unless "Create Destination Path if Missing" is checked.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                    <span>All Devices Paths are Valid</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 bg-slate-50/50 border-t border-slate-100">
          <button
            className="h-11 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
            disabled={!selectedFile}
            onClick={() => onUpload(selectedFile, target, createMissingDirs)}
            type="button"
          >
            Upload to {targetCount} {targetCount === 1 ? 'PC' : 'PCs'}
          </button>
        </div>
      </div>
    </BlurOverlay>
  );
}

export function FileDeleteDialog({ activePath, onCancel, onDelete, device, allDevices = [] }) {
  const [target, setTarget] = useState("single");
  const [useNewerThanFilter, setUseNewerThanFilter] = useState(true);
  const [newerThanHours, setNewerThanHours] = useState(24);
  const [useOlderThanFilter, setUseOlderThanFilter] = useState(false);
  const [olderThanHours, setOlderThanHours] = useState(24);
  const [useTypeFilter, setUseTypeFilter] = useState(false);
  const [fileTypes, setFileTypes] = useState(".tmp, .log");
  const [excludePatterns, setExcludePatterns] = useState("important*, *.docx");
  const [includeSubfolders, setIncludeSubfolders] = useState(false);

  const groupDevices = allDevices.filter(d => d.group === device.group && d.status === "online");
  const onlineDevices = allDevices.filter(d => d.status === "online");
  const targetCount = target === "single" ? 1 : target === "group" ? groupDevices.length : onlineDevices.length;

  const targets = [
    { id: "single", label: "This Device", icon: Monitor, description: device.hostname },
    { id: "group", label: "Same Group", icon: Users, description: `${device.group || 'Unassigned'} (${groupDevices.length} online)` },
    { id: "all", label: "All Online", icon: Globe2, description: `Broadcast to ${onlineDevices.length} devices` },
  ];

  return (
    <BlurOverlay onClose={onCancel}>
      <div className="w-full max-h-[90vh] flex flex-col rounded-xl border border-slate-200/80 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center gap-3.5 p-5 border-b border-rose-100/60 bg-rose-50/40">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-rose-200 bg-rose-100/70 text-rose-600 shadow-sm">
            <Trash2 size={22} strokeWidth={2.5} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Templated Filtered Cleanup (Delete)</h3>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">Safe batch deletion on <code className="font-mono text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">{activePath}</code></p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Targeting Scope</p>
            <div className="grid gap-2">
              {targets.map((t) => {
                const TargetIcon = t.icon;
                const active = target === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTarget(t.id)}
                    className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                      active ? 'border-rose-600 bg-white shadow-sm ring-4 ring-rose-50' : 'border-slate-100 bg-slate-50/30 text-slate-600 hover:border-slate-300 hover:bg-white'
                    }`}
                    type="button"
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors ${active ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-200 bg-white text-slate-400'}`}>
                      <TargetIcon size={18} strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold leading-tight text-slate-900">{t.label}</p>
                      <p className="truncate text-[10px] font-medium text-slate-500 mt-0.5">{t.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Deletion Filters & Rules</p>

            <div className="space-y-2">
              <label className="flex items-center gap-3 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useNewerThanFilter}
                  onChange={(e) => setUseNewerThanFilter(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <span>Time Filter: Newer than (hours) <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded ml-1">Default Safe</span></span>
              </label>
              {useNewerThanFilter && (
                <input
                  type="number"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-50 transition-all"
                  value={newerThanHours}
                  onChange={(e) => setNewerThanHours(e.target.value)}
                  min="1"
                />
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200/60">
              <label className="flex items-center gap-3 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useOlderThanFilter}
                  onChange={(e) => setUseOlderThanFilter(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <span>Time Filter: Older than (hours) <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 rounded ml-1">Higher Risk</span></span>
              </label>
              {useOlderThanFilter && (
                <input
                  type="number"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-50 transition-all"
                  value={olderThanHours}
                  onChange={(e) => setOlderThanHours(e.target.value)}
                  min="1"
                />
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200/60">
              <label className="flex items-center gap-3 text-xs font-bold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useTypeFilter}
                  onChange={(e) => setUseTypeFilter(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <span>File Types Filter</span>
              </label>
              <p className="text-[11px] text-slate-500 pl-7">Comma-separated extensions (e.g. .tmp, .log, .bak)</p>
              {useTypeFilter && (
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-50 transition-all ml-0"
                  value={fileTypes}
                  onChange={(e) => setFileTypes(e.target.value)}
                  placeholder=".tmp, .log, .bak"
                />
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200/60">
              <label className="block text-xs font-bold text-slate-800">
                Exclude Patterns
              </label>
              <p className="text-[11px] text-slate-500">Wildcards supported, comma-separated (e.g. important*, *.docx)</p>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-50 transition-all"
                value={excludePatterns}
                onChange={(e) => setExcludePatterns(e.target.value)}
                placeholder="important*, *.docx"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200/60">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSubfolders}
                  onChange={(e) => setIncludeSubfolders(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-900 block">Include Subfolders (Recursive Deletion)</span>
                  <span className="text-slate-500 text-[11px] leading-relaxed mt-0.5 block">
                    Recursively scan and delete matching subfolders and files within subdirectories.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 bg-slate-50/50 border-t border-slate-100">
          <button
            className="h-11 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-xl bg-rose-600 px-6 text-sm font-semibold text-white shadow-lg shadow-rose-900/10 transition hover:bg-rose-700 active:scale-[0.98]"
            onClick={() => onDelete({
              newerThanHours: useNewerThanFilter ? Number(newerThanHours) : null,
              olderThanHours: useOlderThanFilter ? Number(olderThanHours) : null,
              fileTypes: useTypeFilter ? fileTypes.split(',').map(s => s.trim()).filter(Boolean) : [],
              excludePatterns: excludePatterns.split(',').map(s => s.trim()).filter(Boolean),
              includeSubfolders,
            }, target)}
            type="button"
          >
            Preview Deletion on {targetCount} {targetCount === 1 ? 'PC' : 'PCs'}
          </button>
        </div>
      </div>
    </BlurOverlay>
  );
}

export function FileDeletePreviewModal({ previewData, loading, onCancel, onConfirm }) {
  if (!previewData) return null;
  const { items = [], totalFiles = 0, totalFolders = 0, totalSize = 0, devicesCount = 1 } = previewData;

  return (
    <BlurOverlay onClose={onCancel}>
      <div className="w-full max-h-[90vh] flex flex-col rounded-xl border border-rose-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3.5 p-5 border-b border-rose-100 bg-rose-50/70">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-rose-200 bg-rose-100 text-rose-600 shadow-sm">
            <AlertCircle size={22} strokeWidth={2.5} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Confirm Deletion Preview ({devicesCount} {devicesCount === 1 ? 'PC' : 'PCs'})</h3>
            <p className="text-[11px] font-semibold text-rose-700 mt-0.5">
              Review items marked for deletion ({totalFiles} files, {totalFolders} folders, {(totalSize / 1024 / 1024).toFixed(2)} MB total)
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
            <p className="text-xs font-bold text-rose-900 mb-1">Are you sure you want to continue?</p>
            <p className="text-[11px] text-rose-700 leading-relaxed">
              This operation will permanently remove the listed files and folders across all targeted PCs. This action cannot be undone. Please verify the list below before confirming.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Target Items ({items.length})
            </p>
            {items.length === 0 ? (
              <div className="py-12 text-center rounded-xl border border-slate-200 bg-slate-50">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                <p className="text-xs font-bold text-slate-800">No matching files or folders found</p>
                <p className="text-[11px] text-slate-400 mt-0.5">No items satisfy the selected deletion filters across targeted PCs.</p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2 space-y-1.5 custom-scrollbar">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded border ${item.isDirectory ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-rose-200 bg-rose-50 text-rose-600'}`}>
                        {item.isDirectory ? <FolderOpen size={14} /> : <FileText size={14} />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 truncate">{item.name}</p>
                          {item.deviceName && (
                            <span className="text-[10px] font-medium bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded shrink-0">
                              {item.deviceName}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-mono text-slate-400 truncate">{item.path}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-semibold text-slate-500 shrink-0 ml-2">
                      {item.isDirectory ? 'Folder' : `${(item.size / 1024).toFixed(1)} KB`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 bg-slate-50 border-t border-slate-100">
          <button
            className="h-11 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            onClick={onCancel}
            type="button"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-xl bg-rose-600 px-8 text-sm font-semibold text-white shadow-lg shadow-rose-900/10 transition hover:bg-rose-700 active:scale-[0.98] disabled:opacity-50"
            onClick={onConfirm}
            type="button"
            disabled={loading || items.length === 0}
          >
            {loading ? <LoaderCircle className="animate-spin" size={16} /> : "Proceed & Delete"}
          </button>
        </div>
      </div>
    </BlurOverlay>
  );
}

export function FileDownloadDialog({ activePath, files = [], loadingFiles, onCancel, onDownload }) {
  const [selectedFile, setSelectedFile] = useState(null);

  return (
    <BlurOverlay onClose={onCancel}>
      <div className="w-full max-h-[90vh] flex flex-col rounded-xl border border-slate-200/80 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center gap-3.5 p-5 border-b border-blue-100/60 bg-blue-50/40">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-blue-200 bg-blue-100/70 text-blue-600 shadow-sm">
            <Download size={22} strokeWidth={2.5} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Download File from Active Path</h3>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5">Source: <code className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{activePath}</code></p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
          {loadingFiles ? (
            <div className="py-16 text-center">
              <LoaderCircle className="animate-spin mx-auto text-blue-600 mb-2" size={24} />
              <p className="text-xs font-semibold text-slate-500">Loading files from active path...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="py-16 text-center">
              <FolderOpen className="mx-auto text-slate-300 mb-2" size={32} strokeWidth={1.5} />
              <p className="text-xs font-bold text-slate-700">No files found</p>
              <p className="text-[11px] text-slate-400 mt-0.5">The active path has no downloadable files.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Available Files ({files.filter(f => !f.isDirectory).length})</p>
              {files.filter(f => !f.isDirectory).map((file) => {
                const active = selectedFile === file.name;
                return (
                  <div
                    key={file.name}
                    onClick={() => setSelectedFile(active ? null : file.name)}
                    className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                      active
                        ? 'border-blue-600 bg-blue-50/50 shadow-sm ring-4 ring-blue-50'
                        : 'border-slate-100 bg-slate-50/30 text-slate-700 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-colors ${active ? 'border-blue-200 bg-blue-100 text-blue-600' : 'border-slate-200 bg-white text-slate-400'}`}>
                        <FileText size={18} strokeWidth={2.2} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-tight text-slate-900 truncate">{file.name}</p>
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all ${active ? 'border-blue-600 bg-blue-600' : 'border-slate-200 bg-white'}`}>
                      {active && <div className="h-1 w-1 rounded-full bg-white" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-4 bg-slate-50/50 border-t border-slate-100">
          <button
            className="h-11 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="h-11 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
            disabled={!selectedFile}
            onClick={() => onDownload(selectedFile)}
            type="button"
          >
            Download Selected File
          </button>
        </div>
      </div>
    </BlurOverlay>
  );
}
