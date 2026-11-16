import { useEffect, useRef, useState } from "react";
import { Eye, CheckCircle2, Monitor } from "lucide-react";
import { io } from "socket.io-client";
import { getApiUrl, getAuthToken } from "../services/api.js";
import { Card } from "./Card.jsx";

export function DeviceGridCard({ device, onOpenModal }) {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Connecting...");

  const isOnline = device.status !== "offline";

  useEffect(() => {
    if (!isOnline) {
      setStatusMessage("Offline");
      return;
    }

    const token = getAuthToken();
    const socketUrl = getApiUrl();

    const socket = io(socketUrl, {
      withCredentials: true,
      query: { role: "dashboard" },
      auth: { token },
    });

    socketRef.current = socket;

    let triggerTimer = null;

    socket.on("connect", () => {
      setStatusMessage("Starting stream...");

      // Automatically trigger the start call (mimicking clicking 1 FPS & 480p)
      const triggerStart = () => {
        socket.emit("dashboard:screen:start", { agentId: device.id, fps: 1, quality: 480 }, (res) => {
          if (!res?.success) {
            setStatusMessage(res?.message || "Failed to start stream");
            setIsStreaming(false);
          } else {
            setStatusMessage("Streaming active");
          }
        });
      };

      // Trigger immediately upon socket connect
      triggerStart();

      // Trigger a follow-up kick after 1 second to ensure stream activation (just like manual button click)
      triggerTimer = setTimeout(() => {
        triggerStart();
      }, 1000);
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
        setIsStreaming(true);
        setStatusMessage("Live 1 FPS");
      };
      img.src = url;
    });

    return () => {
      if (triggerTimer) clearTimeout(triggerTimer);
      socket.emit("dashboard:screen:stop", { agentId: device.id });
      socket.disconnect();
    };
  }, [device.id, isOnline]);

  return (
    <Card
      padding="0"
      className="group overflow-hidden border-slate-200/60 bg-white transition hover:border-slate-400 hover:shadow-md cursor-pointer"
      onClick={() => onOpenModal(device)}
    >
      {/* Thumbnail Header with Live Canvas Stream */}
      <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-100">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover bg-black"
        />

        {!isStreaming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-center p-4 z-10">
            <Monitor size={28} className="mx-auto text-slate-500 mb-1" strokeWidth={1.5} />
            <p className="text-[11px] font-medium text-slate-400">{statusMessage}</p>
          </div>
        )}

        {/* Overlay Badges */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/60 p-3 flex flex-col justify-between pointer-events-none z-20">
          <div />

          <div className="flex items-center justify-between text-[10px] text-slate-200">
            <div className="flex items-center gap-1.5">
              <span className="font-mono bg-black/50 px-1.5 py-0.5 rounded">{device.ip || "Unknown IP"}</span>
              <span className="font-mono bg-black/50 px-1.5 py-0.5 rounded text-slate-300">480p</span>
            </div>
            <span className="flex items-center gap-1 text-emerald-400 font-bold bg-black/50 px-1.5 py-0.5 rounded">
              <CheckCircle2 size={12} /> {device.group || "Lab"}
            </span>
          </div>
        </div>

        {/* Hover Action Overlay */}
        <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2 backdrop-blur-[2px] z-30">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenModal(device);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900 shadow-lg transition hover:bg-slate-100 active:scale-95"
          >
            <Eye size={14} strokeWidth={2.5} /> Open Live View
          </button>
        </div>
      </div>

      {/* Card Footer Info */}
      <div className="p-3 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-xs font-bold text-slate-900 flex items-center gap-2 truncate">
              <span className="truncate">{device.hostname}</span>
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                  isOnline ? "bg-emerald-500" : "bg-rose-500"
                }`}
                title={isOnline ? "Online" : "Offline"}
              />
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
