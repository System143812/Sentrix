import { useEffect, useRef, useState } from "react";
import { X, Camera, Maximize2, Minimize2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { io } from "socket.io-client";
import { getApiUrl, getAuthToken } from "../services/api.js";

export function ScreenMonitorModal({ device, devices = [], onSelectDevice, onClose }) {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const [fps, setFps] = useState(2);
  const [quality, setQuality] = useState(480);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Connecting to stream...");
  const [frameCount, setFrameCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef(null);

  const currentIndex = devices ? devices.findIndex((d) => d.id === device.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = devices && currentIndex >= 0 && currentIndex < devices.length - 1;

  const handlePrev = () => {
    if (hasPrev && onSelectDevice) {
      onSelectDevice(devices[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext && onSelectDevice) {
      onSelectDevice(devices[currentIndex + 1]);
    }
  };

  useEffect(() => {
    function onFullscreenChange() {
      const isFull = Boolean(document.fullscreenElement);
      setIsFullscreen(isFull);
      if (isFull) {
        setShowControls(true);
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleMouseMove = () => {
    if (!isFullscreen) return;
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (document.fullscreenElement) {
        setShowControls(false);
      }
    }, 5000);
  };

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const token = getAuthToken();
    const socketUrl = getApiUrl();

    const socket = io(socketUrl, {
      withCredentials: true,
      query: { role: "dashboard" },
      auth: { token },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setStatusMessage("Connected. Requesting screen stream...");
      setIsStreaming(true);
      socket.emit("dashboard:screen:start", { agentId: device.id, fps, quality }, (res) => {
        if (!res?.success) {
          setStatusMessage(res?.message || "Failed to start stream.");
          setIsStreaming(false);
        } else {
          setStatusMessage("Streaming active");
        }
      });
    });

    socket.on("connect_error", (err) => {
      setStatusMessage(`Connection error: ${err.message}`);
      setIsStreaming(false);
    });

    socket.on("dashboard:screen:frame", (payload) => {
      if (!payload || !payload.frame || payload.agentId !== device.id) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      const blob = new Blob([payload.frame], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      img.onload = () => {
        if (canvas.width !== img.width || canvas.height !== img.height) {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        setFrameCount((c) => c + 1);
        setStatusMessage("Streaming active");
      };
      img.src = url;
    });

    return () => {
      socket.emit("dashboard:screen:stop", { agentId: device.id });
      socket.disconnect();
    };
  }, [device.id]);

  // Watchdog timer: if connected and 0 frames received after 3.5 seconds, auto-retry stream start
  useEffect(() => {
    if (!isStreaming) return;
    const timer = setTimeout(() => {
      if (frameCount === 0 && socketRef.current && socketRef.current.connected) {
        setStatusMessage("Retrying stream connection...");
        socketRef.current.emit("dashboard:screen:start", { agentId: device.id, fps, quality });
      }
    }, 3500);
    return () => clearTimeout(timer);
  }, [isStreaming, frameCount, device.id, fps, quality]);

  const handleUpdateSettings = (newFps, newQuality) => {
    setFps(newFps);
    setQuality(newQuality);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("dashboard:screen:start", { agentId: device.id, fps: newFps, quality: newQuality });
    }
  };

  const handleSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `sentrix-screenshot-${device.hostname}-${Date.now()}.jpg`;
    link.href = canvas.toDataURL("image/jpeg", 0.9);
    link.click();
  };

  const handleFullscreen = () => {
    const modalEl = canvasRef.current?.closest(".relative.flex.flex-col");
    if (!modalEl) return;
    if (modalEl.requestFullscreen) {
      modalEl.requestFullscreen();
    }
  };

  const isOnline = device.status !== "offline";

  return (
    <div className={`fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm ${isFullscreen ? "p-0 bg-black" : "p-0 sm:p-4"}`}>
      <div className={`relative flex flex-col w-full h-full ${isFullscreen ? "rounded-none border-none bg-black max-w-none h-screen shadow-none" : "sm:h-[88vh] sm:max-w-5xl rounded-none sm:rounded-lg border border-slate-800 bg-slate-900 shadow-xl overflow-hidden text-slate-100"}`}>

        {/* Modal Header */}
        {!isFullscreen && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-900 gap-3 sm:gap-0">
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white flex items-center gap-2.5 truncate">
                  <span className="truncate">{device.hostname}</span>
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                      isOnline ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                    title={isOnline ? "Online" : "Offline"}
                  />
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  IP: <span className="font-mono text-slate-300">{device.ip || 'Unknown'}</span> • Group: <span className="text-slate-300">{device.group || 'Unassigned'}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleSnapshot}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                title="Save Snapshot"
              >
                <Camera size={14} strokeWidth={2} />
                <span className="hidden xs:inline">Snapshot</span>
              </button>
              <button
                onClick={handleFullscreen}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
                title="Fullscreen"
              >
                <Maximize2 size={14} strokeWidth={2} />
                <span className="hidden xs:inline">Fullscreen</span>
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition ml-1"
                title="Close (Esc)"
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}

        {/* Screen Viewer Canvas Area */}
        <div
          className={`relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden ${isFullscreen ? "p-0" : "p-0 sm:p-2"}`}
          onMouseMove={handleMouseMove}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain bg-black"
          />
          {(!isStreaming || (isStreaming && frameCount === 0 && !statusMessage.includes("active"))) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-center p-6 z-20">
              <div className="h-12 w-12 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3">
                <AlertCircle size={24} strokeWidth={2} />
              </div>
              <p className="text-xs font-semibold text-slate-300 mb-3">{statusMessage}</p>
              <button
                onClick={() => {
                  setFrameCount(0);
                  setStatusMessage("Requesting screen stream...");
                  setIsStreaming(true);
                  if (socketRef.current && socketRef.current.connected) {
                    socketRef.current.emit("dashboard:screen:start", { agentId: device.id, fps, quality });
                  }
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition shadow-sm"
                type="button"
              >
                Reconnect Stream
              </button>
            </div>
          )}

          {/* Floating Control Overlay (Icon-only, no parent container background, bigger icons, auto-hides after 5s) */}
          {isFullscreen && (
            <div
              className={`absolute bottom-8 left-1/2 -translate-x-1/2 transition-all duration-500 ease-in-out z-30 flex items-center gap-3 ${
                !showControls ? "opacity-0 translate-y-4 pointer-events-none" : "opacity-100 translate-y-0"
              }`}
            >
              {devices && devices.length > 1 && (
                <div className="flex items-center gap-1.5 bg-slate-900/80 rounded-2xl p-1.5 border border-white/15 shadow-2xl backdrop-blur-md">
                  <button
                    onClick={handlePrev}
                    disabled={!hasPrev}
                    className={`grid h-12 w-12 place-items-center rounded-xl transition ${
                      hasPrev ? "text-white hover:bg-white/10" : "text-slate-600 cursor-not-allowed"
                    }`}
                    title="Previous Device"
                  >
                    <ChevronLeft size={22} strokeWidth={2.5} />
                  </button>
                  <span className="px-2 text-xs font-mono font-bold text-slate-200">
                    {currentIndex + 1} / {devices.length}
                  </span>
                  <button
                    onClick={handleNext}
                    disabled={!hasNext}
                    className={`grid h-12 w-12 place-items-center rounded-xl transition ${
                      hasNext ? "text-white hover:bg-white/10" : "text-slate-600 cursor-not-allowed"
                    }`}
                    title="Next Device"
                  >
                    <ChevronRight size={22} strokeWidth={2.5} />
                  </button>
                </div>
              )}

              <button
                onClick={handleSnapshot}
                className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-slate-900/80 text-white shadow-2xl backdrop-blur-md hover:bg-slate-800 transition hover:scale-105 active:scale-95"
                title="Save Snapshot"
              >
                <Camera size={22} strokeWidth={2.5} />
              </button>

              <button
                onClick={() => {
                  if (document.fullscreenElement) {
                    document.exitFullscreen();
                  }
                }}
                className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-slate-900/80 text-white shadow-2xl backdrop-blur-md hover:bg-slate-800 transition hover:scale-105 active:scale-95"
                title="Minimize / Exit Fullscreen"
              >
                <Minimize2 size={22} strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>

        {/* Toolbar Footer */}
        {!isFullscreen && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-3 border-t border-slate-800 bg-slate-900 text-xs gap-3 sm:gap-0">
            <div className="flex items-center gap-4 text-slate-400 font-medium">
              <span>Status: <strong className="text-slate-200">{statusMessage}</strong></span>
              <span>Frames: <strong className="text-slate-200">{frameCount}</strong></span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-bold uppercase text-[10px]">FPS:</span>
                <div className="flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
                  {[1, 2, 5, 10].map((f) => (
                    <button
                      key={f}
                      onClick={() => handleUpdateSettings(f, quality)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${fps === f ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Resolution:</span>
                <div className="flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
                  {[
                    { label: "480p", value: 480 },
                    { label: "720p", value: 720 },
                    { label: "1080p", value: 1080 }
                  ].map((res) => (
                    <button
                      key={res.value}
                      onClick={() => handleUpdateSettings(fps, res.value)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${quality === res.value ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                    >
                      {res.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
