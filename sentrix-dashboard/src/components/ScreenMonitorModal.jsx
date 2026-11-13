import { useEffect, useRef, useState } from "react";
import { X, Camera, Maximize2, AlertCircle } from "lucide-react";
import { io } from "socket.io-client";

export function ScreenMonitorModal({ device, onClose }) {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const [fps, setFps] = useState(2);
  const [quality, setQuality] = useState(60);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Connecting to stream...");
  const [frameCount, setFrameCount] = useState(0);

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
    const token = localStorage.getItem("sentrix_token");
    const socketUrl = window.location.origin;

    const socket = io(socketUrl, {
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.requestFullscreen) {
      canvas.requestFullscreen();
    }
  };

  const isOnline = device.status !== "offline";

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-0 sm:p-4">
      <div className="relative flex flex-col w-full h-full sm:h-[88vh] sm:max-w-5xl rounded-none sm:rounded-lg border border-slate-800 bg-slate-900 shadow-xl overflow-hidden text-slate-100">

        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-900 gap-3 sm:gap-0">
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white flex items-center gap-2.5 truncate">
                <span className="truncate">{device.hostname}</span>
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${
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

        {/* Screen Viewer Canvas Area */}
        <div className="relative flex-1 bg-slate-950 flex items-center justify-center overflow-hidden p-2 sm:p-4">
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full object-contain rounded border border-slate-800 shadow-lg bg-black"
          />
          {!isStreaming && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-center p-6">
              <div className="h-12 w-12 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3">
                <AlertCircle size={24} strokeWidth={2} />
              </div>
              <p className="text-xs font-semibold text-slate-300">{statusMessage}</p>
            </div>
          )}
        </div>

        {/* Toolbar Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-3 border-t border-slate-800 bg-slate-900 text-xs gap-3 sm:gap-0">
          <div className="flex items-center gap-4 text-slate-400 font-medium">
            <span>Status: <strong className="text-slate-200">{statusMessage}</strong></span>
            <span>Frames: <strong className="text-slate-200">{frameCount}</strong></span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-bold uppercase text-[10px]">FPS:</span>
              <div className="flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
                {[1, 2, 5].map((f) => (
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
              <span className="text-slate-400 font-bold uppercase text-[10px]">Quality:</span>
              <div className="flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
                {[40, 60, 80].map((q) => (
                  <button
                    key={q}
                    onClick={() => handleUpdateSettings(fps, q)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition ${quality === q ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                  >
                    {q}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
