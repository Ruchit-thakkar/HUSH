"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Pen,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Minus,
  Square,
  Circle,
  Type,
  AlertTriangle,
  X,
  Check,
} from "lucide-react";

const COLOR_PRESETS = [
  { label: "White", value: "#ffffff" },
  { label: "Black", value: "#000000" },
  { label: "Gray", value: "#737373" },
  { label: "Red", value: "#ef4444" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Green", value: "#10b981" },
  { label: "Yellow", value: "#f59e0b" },
];

const STROKE_WIDTHS = [
  { label: "Thin", value: 2 },
  { label: "Medium", value: 4 },
  { label: "Thick", value: 8 },
];

export function Whiteboard({
  operations = [],
  myUserId = "",
  onSendOperation,
  onUndoOperation,
  onRedoOperation,
  onClearWhiteboard,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Tool state
  const [activeTool, setActiveTool] = useState("pen"); // 'pen' | 'eraser' | 'line' | 'rect' | 'circle' | 'text'
  const [selectedColor, setSelectedColor] = useState("#ffffff");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  // Local text placement state
  const [textPrompt, setTextPrompt] = useState(null); // { x, y, text }

  // Local drawing state
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef([]);
  const startPosRef = useRef({ x: 0, y: 0 });
  const localRedoStackRef = useRef([]);

  // Redraw entire canvas whenever operations change
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const op of operations) {
      if (!op) continue;

      if (op.type === "draw") {
        if (!op.points || op.points.length < 2) continue;
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = op.color || "#ffffff";
        ctx.lineWidth = op.width || 4;
        ctx.beginPath();
        ctx.moveTo(op.points[0].x, op.points[0].y);
        for (let i = 1; i < op.points.length; i++) {
          ctx.lineTo(op.points[i].x, op.points[i].y);
        }
        ctx.stroke();
      } else if (op.type === "erase") {
        if (!op.points || op.points.length < 2) continue;
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = op.width || 20;
        ctx.beginPath();
        ctx.moveTo(op.points[0].x, op.points[0].y);
        for (let i = 1; i < op.points.length; i++) {
          ctx.lineTo(op.points[i].x, op.points[i].y);
        }
        ctx.stroke();
      } else if (op.type === "line") {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = op.color || "#ffffff";
        ctx.lineWidth = op.width || 4;
        ctx.beginPath();
        ctx.moveTo(op.startX, op.startY);
        ctx.lineTo(op.endX, op.endY);
        ctx.stroke();
      } else if (op.type === "rect") {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = op.color || "#ffffff";
        ctx.lineWidth = op.width || 4;
        const x = Math.min(op.startX, op.endX);
        const y = Math.min(op.startY, op.endY);
        const w = Math.abs(op.endX - op.startX);
        const h = Math.abs(op.endY - op.startY);
        ctx.beginPath();
        ctx.strokeRect(x, y, w, h);
      } else if (op.type === "circle") {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = op.color || "#ffffff";
        ctx.lineWidth = op.width || 4;
        ctx.beginPath();
        ctx.arc(op.centerX, op.centerY, Math.max(1, op.radius), 0, Math.PI * 2);
        ctx.stroke();
      } else if (op.type === "text") {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = op.color || "#ffffff";
        ctx.font = `${op.fontSize || 16}px monospace`;
        ctx.fillText(op.text || "", op.x, op.y);
      }
    }

    ctx.restore();
  }, [operations]);

  // Adjust canvas size to match container with high-DPI scaling
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    redrawCanvas();
  }, [redrawCanvas]);

  useEffect(() => {
    handleResize();
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [handleResize]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Coordinates helper
  const getCanvasPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Pointer Down
  const handlePointerDown = (e) => {
    // If text prompt active, do nothing
    if (textPrompt) return;

    const pos = getCanvasPos(e);
    if (activeTool === "text") {
      setTextPrompt({ x: pos.x, y: pos.y, text: "" });
      return;
    }

    try {
      e.target.setPointerCapture(e.pointerId);
    } catch {}

    isDrawingRef.current = true;
    startPosRef.current = pos;
    currentPointsRef.current = [pos];
  };

  // Pointer Move
  const handlePointerMove = (e) => {
    if (!isDrawingRef.current) return;
    const pos = getCanvasPos(e);
    currentPointsRef.current.push(pos);

    // Live preview on canvas
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    // For shapes, redraw base canvas and draw preview
    if (activeTool === "line" || activeTool === "rect" || activeTool === "circle") {
      redrawCanvas();
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const start = startPosRef.current;
      if (activeTool === "line") {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      } else if (activeTool === "rect") {
        const x = Math.min(start.x, pos.x);
        const y = Math.min(start.y, pos.y);
        const w = Math.abs(pos.x - start.x);
        const h = Math.abs(pos.y - start.y);
        ctx.beginPath();
        ctx.strokeRect(x, y, w, h);
      } else if (activeTool === "circle") {
        const radius = Math.hypot(pos.x - start.x, pos.y - start.y);
        ctx.beginPath();
        ctx.arc(start.x, start.y, Math.max(1, radius), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Freehand pen or eraser immediate preview
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const pts = currentPointsRef.current;
      if (pts.length >= 2) {
        const prev = pts[pts.length - 2];
        if (activeTool === "eraser") {
          ctx.globalCompositeOperation = "destination-out";
          ctx.lineWidth = 20;
        } else {
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = selectedColor;
          ctx.lineWidth = strokeWidth;
        }
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  // Pointer Up
  const handlePointerUp = (e) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch {}

    const endPos = getCanvasPos(e);
    const startPos = startPosRef.current;
    const opId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    let newOp = null;

    if (activeTool === "pen") {
      if (currentPointsRef.current.length > 1) {
        newOp = {
          id: opId,
          userId: myUserId,
          type: "draw",
          points: currentPointsRef.current,
          color: selectedColor,
          width: strokeWidth,
        };
      }
    } else if (activeTool === "eraser") {
      if (currentPointsRef.current.length > 1) {
        newOp = {
          id: opId,
          userId: myUserId,
          type: "erase",
          points: currentPointsRef.current,
          width: 20,
        };
      }
    } else if (activeTool === "line") {
      newOp = {
        id: opId,
        userId: myUserId,
        type: "line",
        startX: startPos.x,
        startY: startPos.y,
        endX: endPos.x,
        endY: endPos.y,
        color: selectedColor,
        width: strokeWidth,
      };
    } else if (activeTool === "rect") {
      newOp = {
        id: opId,
        userId: myUserId,
        type: "rect",
        startX: startPos.x,
        startY: startPos.y,
        endX: endPos.x,
        endY: endPos.y,
        color: selectedColor,
        width: strokeWidth,
      };
    } else if (activeTool === "circle") {
      const radius = Math.hypot(endPos.x - startPos.x, endPos.y - startPos.y);
      newOp = {
        id: opId,
        userId: myUserId,
        type: "circle",
        centerX: startPos.x,
        centerY: startPos.y,
        radius,
        color: selectedColor,
        width: strokeWidth,
      };
    }

    if (newOp) {
      localRedoStackRef.current = [];
      onSendOperation?.(newOp);
    }

    currentPointsRef.current = [];
    redrawCanvas();
  };

  // Submit Text Op
  const handleConfirmText = () => {
    if (!textPrompt || !textPrompt.text.trim()) {
      setTextPrompt(null);
      return;
    }
    const opId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `op_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const textOp = {
      id: opId,
      userId: myUserId,
      type: "text",
      x: textPrompt.x,
      y: textPrompt.y,
      text: textPrompt.text.trim(),
      color: selectedColor,
      fontSize: 18,
    };

    localRedoStackRef.current = [];
    onSendOperation?.(textOp);
    setTextPrompt(null);
  };

  // Undo (Affects local user's most recent operation)
  const handleUndo = () => {
    const myOps = operations.filter((op) => op.userId === myUserId);
    if (myOps.length === 0) return;
    const lastOp = myOps[myOps.length - 1];

    localRedoStackRef.current.push(lastOp);
    onUndoOperation?.(lastOp.id, myUserId);
  };

  // Redo
  const handleRedo = () => {
    if (localRedoStackRef.current.length === 0) return;
    const opToRedo = localRedoStackRef.current.pop();
    onRedoOperation?.(opToRedo);
  };

  // Clear
  const handleConfirmClear = () => {
    setIsClearModalOpen(false);
    localRedoStackRef.current = [];
    onClearWhiteboard?.();
  };

  const myOperationsCount = operations.filter((op) => op.userId === myUserId).length;
  const canUndo = myOperationsCount > 0;
  const canRedo = localRedoStackRef.current.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-neutral-900 select-none overflow-hidden relative">
      {/* Whiteboard Floating / Docked Toolbar */}
      <div className="shrink-0 p-2 sm:p-2.5 bg-neutral-950/90 border-b border-neutral-800 backdrop-blur-md flex flex-wrap items-center justify-between gap-2 z-10">
        {/* Left Tools Group */}
        <div className="flex items-center gap-1">
          {/* Pen */}
          <button
            type="button"
            onClick={() => setActiveTool("pen")}
            title="Pen (Freehand)"
            className={`p-2 rounded-xl border text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTool === "pen"
                ? "bg-neutral-100 text-neutral-950 border-neutral-100 font-semibold"
                : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200 hover:bg-neutral-800"
            }`}
          >
            <Pen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pen</span>
          </button>

          {/* Eraser */}
          <button
            type="button"
            onClick={() => setActiveTool("eraser")}
            title="Eraser"
            className={`p-2 rounded-xl border text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTool === "eraser"
                ? "bg-neutral-100 text-neutral-950 border-neutral-100 font-semibold"
                : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200 hover:bg-neutral-800"
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Eraser</span>
          </button>

          {/* Line */}
          <button
            type="button"
            onClick={() => setActiveTool("line")}
            title="Line"
            className={`p-2 rounded-xl border text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer ${
              activeTool === "line"
                ? "bg-neutral-100 text-neutral-950 border-neutral-100 font-semibold"
                : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200 hover:bg-neutral-800"
            }`}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Rectangle */}
          <button
            type="button"
            onClick={() => setActiveTool("rect")}
            title="Rectangle"
            className={`p-2 rounded-xl border text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer ${
              activeTool === "rect"
                ? "bg-neutral-100 text-neutral-950 border-neutral-100 font-semibold"
                : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200 hover:bg-neutral-800"
            }`}
          >
            <Square className="w-3.5 h-3.5" />
          </button>

          {/* Circle */}
          <button
            type="button"
            onClick={() => setActiveTool("circle")}
            title="Circle"
            className={`p-2 rounded-xl border text-xs font-mono flex items-center gap-1 transition-colors cursor-pointer ${
              activeTool === "circle"
                ? "bg-neutral-100 text-neutral-950 border-neutral-100 font-semibold"
                : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200 hover:bg-neutral-800"
            }`}
          >
            <Circle className="w-3.5 h-3.5" />
          </button>

          {/* Text */}
          <button
            type="button"
            onClick={() => setActiveTool("text")}
            title="Text (Click canvas to place)"
            className={`p-2 rounded-xl border text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTool === "text"
                ? "bg-neutral-100 text-neutral-950 border-neutral-100 font-semibold"
                : "bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200 hover:bg-neutral-800"
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Text</span>
          </button>
        </div>

        {/* Color Palette & Width */}
        {activeTool !== "eraser" && (
          <div className="flex items-center gap-2">
            {/* Colors */}
            <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
              {COLOR_PRESETS.map((col) => (
                <button
                  key={col.value}
                  type="button"
                  onClick={() => setSelectedColor(col.value)}
                  title={col.label}
                  className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                    selectedColor === col.value
                      ? "ring-2 ring-white scale-110"
                      : "opacity-80 hover:opacity-100"
                  }`}
                  style={{ backgroundColor: col.value }}
                />
              ))}
            </div>

            {/* Width Picker */}
            <div className="hidden md:flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
              {STROKE_WIDTHS.map((sw) => (
                <button
                  key={sw.value}
                  type="button"
                  onClick={() => setStrokeWidth(sw.value)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-mono transition-colors cursor-pointer ${
                    strokeWidth === sw.value
                      ? "bg-neutral-800 text-neutral-100 font-semibold"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {sw.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* History Actions: Undo, Redo, Clear */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo your latest drawing"
            className="p-2 rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo"
            className="p-2 rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsClearModalOpen(true)}
            title="Clear Whiteboard for Everyone"
            className="p-2 rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full relative bg-[#121214] touch-none cursor-crosshair overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="absolute inset-0 block touch-none"
        />

        {/* Floating Text Input Box */}
        {textPrompt && (
          <div
            className="absolute z-20 flex items-center gap-1.5 p-1.5 rounded-xl bg-neutral-900 border border-neutral-700 shadow-2xl animate-in fade-in zoom-in-95"
            style={{
              left: `${Math.min(textPrompt.x, (containerRef.current?.clientWidth || 300) - 220)}px`,
              top: `${Math.max(10, Math.min(textPrompt.y - 40, (containerRef.current?.clientHeight || 300) - 60))}px`,
            }}
          >
            <input
              type="text"
              autoFocus
              value={textPrompt.text}
              onChange={(e) =>
                setTextPrompt((prev) => (prev ? { ...prev, text: e.target.value } : null))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirmText();
                if (e.key === "Escape") setTextPrompt(null);
              }}
              placeholder="Type text..."
              className="bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500 font-mono w-40"
            />
            <button
              type="button"
              onClick={handleConfirmText}
              className="p-1 rounded-lg bg-neutral-100 text-neutral-900 hover:bg-neutral-200 transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTextPrompt(null)}
              className="p-1 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Clear Confirmation Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-800 p-5 shadow-2xl text-left animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-amber-400 mb-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-semibold text-sm text-neutral-100">
                Clear the whiteboard?
              </h3>
            </div>
            <p className="text-xs text-neutral-400 mb-5 leading-relaxed">
              This will clear the current whiteboard drawing for everyone in the room. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-neutral-800 text-neutral-300 text-xs font-medium hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
