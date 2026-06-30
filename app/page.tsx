"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const PALETTE: { name: string; hex: string }[] = [
  { name: "Cotton", hex: "#F5E4B2" },
  { name: "Slipper", hex: "#CDBABA" },
  { name: "Chartreuse", hex: "#C9A835" },
  { name: "Jean", hex: "#7A93A5" },
  { name: "Gym", hex: "#A2A490" },
  { name: "Cadmium", hex: "#D4502C" },
  { name: "Burgundy", hex: "#5E1E2E" },
  { name: "Black", hex: "#111111" },
];

const DEFAULT_MAT = PALETTE[0].hex;

// Cycled in the Generate button while a render is in flight.
const BUSY_MESSAGES = ["Creating POs", "Ship-bobbing", "Making a WRO", "Texting Sarah", "Calling Vince"];

type OutputFormat = "card" | "story";
type CropRect = { left: number; top: number; width: number; height: number };

// Full output canvas per format (used for the displayed pixel size).
const CANVAS_DIMS: Record<OutputFormat, { w: number; h: number }> = {
  card: { w: 1560, h: 2240 },
  story: { w: 1080, h: 1920 },
};

// Visible photo area (used for the crop frame aspect ratio).
const OUTPUT_DIMS: Record<OutputFormat, { w: number; h: number }> = {
  card: { w: 1440, h: 2120 },
  story: { w: 1080, h: 1920 },
};

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function CropEditor({
  file,
  aspect,
  initial,
  onConfirm,
  onClose,
}: {
  file: File;
  aspect: number;
  initial: CropRect | null;
  onConfirm: (crop: CropRect) => void;
  onClose: () => void;
}) {
  const FRAME_W = 300;
  const FRAME_H = Math.round(FRAME_W / aspect);

  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const baseScale = nat ? Math.max(FRAME_W / nat.w, FRAME_H / nat.h) : 1;

  function constrain(nextTx: number, nextTy: number, s: number) {
    if (!nat) return { tx: nextTx, ty: nextTy };
    const dispW = nat.w * baseScale * s;
    const dispH = nat.h * baseScale * s;
    return {
      tx: clamp(nextTx, FRAME_W - dispW, 0),
      ty: clamp(nextTy, FRAME_H - dispH, 0),
    };
  }

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const n = { w: img.naturalWidth, h: img.naturalHeight };
      setNat(n);
      const base = Math.max(FRAME_W / n.w, FRAME_H / n.h);
      if (initial) {
        const s = clamp(FRAME_W / (initial.width * base), 1, 4);
        const eff = base * s;
        const c = (() => {
          const dispW = n.w * eff;
          const dispH = n.h * eff;
          return {
            tx: clamp(-initial.left * eff, FRAME_W - dispW, 0),
            ty: clamp(-initial.top * eff, FRAME_H - dispH, 0),
          };
        })();
        setScale(s);
        setTx(c.tx);
        setTy(c.ty);
      } else {
        const dispW = n.w * base;
        const dispH = n.h * base;
        setScale(1);
        setTx((FRAME_W - dispW) / 2);
        setTy((FRAME_H - dispH) / 2);
      }
    };
    img.src = url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    const c = constrain(tx + dx, ty + dy, scale);
    setTx(c.tx);
    setTy(c.ty);
  }
  function onPointerUp() {
    drag.current = null;
  }

  function onZoom(e: React.ChangeEvent<HTMLInputElement>) {
    const s = Number(e.target.value);
    const c = constrain(tx, ty, s);
    setScale(s);
    setTx(c.tx);
    setTy(c.ty);
  }

  function confirm() {
    if (!nat) return onClose();
    const eff = baseScale * scale;
    onConfirm({
      left: Math.round(-tx / eff),
      top: Math.round(-ty / eff),
      width: Math.round(FRAME_W / eff),
      height: Math.round(FRAME_H / eff),
    });
  }

  const dispW = nat ? nat.w * baseScale * scale : FRAME_W;
  const dispH = nat ? nat.h * baseScale * scale : FRAME_H;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p className="controls-label">Crop — drag to position, slider to zoom</p>
        <div
          className="crop-frame"
          style={{ width: FRAME_W, height: FRAME_H }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={file.name}
            draggable={false}
            style={{
              position: "absolute",
              left: tx,
              top: ty,
              width: dispW,
              height: dispH,
              maxWidth: "none",
            }}
          />
        </div>
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={scale}
          onChange={onZoom}
          className="crop-zoom"
        />
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button onClick={confirm}>Apply crop</button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<OutputFormat>("card");
  const [matColor, setMatColor] = useState(DEFAULT_MAT);
  const [frameSeconds, setFrameSeconds] = useState(0.7);
  const [colors, setColors] = useState(256);
  const [scale, setScale] = useState(0.5);
  const [crops, setCrops] = useState<Map<File, CropRect>>(new Map());
  const [editing, setEditing] = useState<File | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [outputKind, setOutputKind] = useState<"gif" | "mp4">("gif");
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);

  const thumbs = useMemo(
    () => files.map((f) => ({ file: f, url: URL.createObjectURL(f), name: f.name })),
    [files],
  );

  useEffect(() => {
    return () => thumbs.forEach((t) => URL.revokeObjectURL(t.url));
  }, [thumbs]);

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => {
      setBusyMsg((i) => (i + 1) % BUSY_MESSAGES.length);
    }, 1400);
    return () => clearInterval(id);
  }, [busy]);

  const dims = OUTPUT_DIMS[format];
  const canvas = CANVAS_DIMS[format];
  const aspect = dims.w / dims.h;
  const showMat = format === "card";

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
    setCrops(new Map());
    setGifUrl(null);
    setError(null);
  }

  function onDragStart(index: number) {
    dragIndex.current = index;
  }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === index) return;
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
    dragIndex.current = index;
  }

  function onDragEnd() {
    dragIndex.current = null;
  }

  function applyCrop(file: File, crop: CropRect) {
    setCrops((prev) => {
      const next = new Map(prev);
      next.set(file, crop);
      return next;
    });
    setEditing(null);
  }

  // Compress one photo toward a byte target, keeping quality as high as
  // possible. Resolution is capped at 1600px (the card maxes out at 1560px, so
  // this is effectively lossless relative to the output) and only stepped down
  // as a last resort. Returns the best result even if it can't hit the target;
  // the caller decides whether the whole batch fits the upload budget.
  async function compressPhoto(file: File, targetBytes: number): Promise<Blob> {
    const DIMS = [1600, 1400, 1100];
    const QUALITIES = [0.88, 0.82, 0.76, 0.7];
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = async () => {
        URL.revokeObjectURL(url);
        const encode = (px: number, q: number) =>
          new Promise<Blob>((res, rej) => {
            const s = Math.min(1, px / Math.max(img.naturalWidth, img.naturalHeight));
            const w = Math.round(img.naturalWidth * s);
            const h = Math.round(img.naturalHeight * s);
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return rej(new Error("Canvas unavailable"));
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob(
              (blob) => (blob ? res(blob) : rej(new Error("Compression failed"))),
              "image/jpeg",
              q,
            );
          });
        try {
          let best: Blob | null = null;
          for (const px of DIMS) {
            for (const q of QUALITIES) {
              const blob = await encode(px, q);
              best = blob;
              if (blob.size <= targetBytes) return resolve(blob);
            }
          }
          resolve(best as Blob);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
      img.src = url;
    });
  }

  async function generate() {
    setBusy(true);
    setBusyMsg(0);
    setError(null);
    setGifUrl(null);
    const isStory = format === "story";
    try {
      // Vercel caps the function request body at 4.5MB; stay safely under it
      // (multipart overhead + other fields). Split the budget across photos so
      // each one is compressed only as hard as the batch size requires.
      const UPLOAD_BUDGET = 3.8 * 1024 * 1024;
      const targetBytes = UPLOAD_BUDGET / files.length;
      const compressed = await Promise.all(files.map((f) => compressPhoto(f, targetBytes)));
      const total = compressed.reduce((sum, b) => sum + b.size, 0);
      if (total > UPLOAD_BUDGET) {
        setError(
          `These ${files.length} photos compress to ${(total / 1024 / 1024).toFixed(1)} MB, ` +
            `over the ${(UPLOAD_BUDGET / 1024 / 1024).toFixed(1)} MB upload limit. ` +
            `Remove a few photos and try again.`,
        );
        setBusy(false);
        return;
      }

      const body = new FormData();
      files.forEach((f, i) => {
        body.append("photos", compressed[i], f.name.replace(/\.[^.]+$/, ".jpg"));
        body.append("crops", JSON.stringify(crops.get(f) ?? null));
      });
      body.append("format", format);
      body.append("matColor", matColor);
      body.append("frameHoldMs", String(Math.round(frameSeconds * 1000)));
      body.append("colors", String(colors));
      body.append("scale", String(scale));
      const res = await fetch("/api/render", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Render failed (${res.status}).`);
      }
      const blob = await res.blob();
      setOutputKind(isStory ? "mp4" : "gif");
      setGifUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const hexValid = HEX_RE.test(matColor);

  return (
    <main>
      <h1>Unterwaschine</h1>
      <p className="subtitle">v1.0</p>

      <div className="dropzone" onClick={() => inputRef.current?.click()}>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          hidden
          onChange={onPick}
        />
        <p>{files.length ? `${files.length} photo(s) selected` : "Give me your underwear."}</p>
      </div>

      {thumbs.length > 0 && (
        <ul className="thumbs">
          {thumbs.map((t, i) => (
            <li
              key={t.url}
              className="thumb-item"
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={(e) => onDragOver(e, i)}
              onDragEnd={onDragEnd}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.url} alt={t.name} />
              <span className="thumb-index">{i + 1}</span>
              <button
                type="button"
                className="thumb-crop"
                onClick={() => setEditing(t.file)}
                title="Crop"
              >
                {crops.has(t.file) ? "Cropped" : "Crop"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="controls">
        <p className="controls-label">Output format</p>
        <div className="seg">
          <button
            className="seg-btn"
            aria-pressed={format === "card"}
            onClick={() => setFormat("card")}
          >
            ARQ card
          </button>
          <button
            className="seg-btn"
            aria-pressed={format === "story"}
            onClick={() => setFormat("story")}
          >
            IG story
          </button>
        </div>
      </div>

      {showMat && (
        <div className="controls">
          <p className="controls-label">Background color</p>
          <ul className="palette">
            {PALETTE.map((swatch) => (
              <li key={swatch.hex}>
                <button
                  className="palette-swatch"
                  style={{ background: swatch.hex }}
                  aria-label={swatch.name}
                  aria-pressed={matColor.toLowerCase() === swatch.hex.toLowerCase()}
                  onClick={() => setMatColor(swatch.hex)}
                  title={swatch.name}
                />
              </li>
            ))}
          </ul>
          <div className="hex-row">
            <span className="hex-preview" style={{ background: hexValid ? matColor : "#fff" }} />
            <input
              className="hex-input"
              type="text"
              value={matColor}
              spellCheck={false}
              aria-invalid={!hexValid}
              onChange={(e) => {
                const v = e.target.value;
                setMatColor(v.startsWith("#") ? v : `#${v.replace(/#/g, "")}`);
              }}
              placeholder="#F5E4B2"
            />
          </div>
        </div>
      )}

      <div className="controls">
        <p className="controls-label">Frame duration (seconds)</p>
        <input
          className="num-input"
          type="number"
          min={0.1}
          step={0.1}
          value={frameSeconds}
          onChange={(e) => setFrameSeconds(Math.max(0.1, Number(e.target.value) || 0.1))}
        />
      </div>

      <div className="controls">
        <p className="controls-label">Compression</p>
        <div className="field">
          <label htmlFor="scale">
            Output size — {Math.round(canvas.w * scale)}×{Math.round(canvas.h * scale)}px (biggest
            effect on file size)
          </label>
          <select
            id="scale"
            className="num-input"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          >
            <option value={1}>Full (100%)</option>
            <option value={0.75}>Large (75%)</option>
            <option value={0.5}>Email (50%)</option>
            <option value={0.35}>Small (35%)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="colors">Colors</label>
          <select
            id="colors"
            className="num-input"
            value={colors}
            onChange={(e) => setColors(Number(e.target.value))}
          >
            <option value={256}>256 (best quality)</option>
            <option value={128}>128</option>
            <option value={64}>64</option>
            <option value={32}>32 (smallest file)</option>
          </select>
        </div>
      </div>

      <button onClick={generate} disabled={busy || files.length === 0}>
        {busy ? (
          // All phrases share one grid cell, so the button sizes to the widest
          // and never jumps width as the visible message cycles.
          <span style={{ display: "grid", placeItems: "center" }}>
            {BUSY_MESSAGES.map((msg, i) => (
              <span
                key={msg}
                style={{
                  gridArea: "1 / 1",
                  whiteSpace: "nowrap",
                  visibility: i === busyMsg ? "visible" : "hidden",
                }}
              >
                {msg}…
              </span>
            ))}
          </span>
        ) : format === "story" ? (
          "Generate MP4"
        ) : (
          "Generate GIF"
        )}
      </button>

      {error && <p className="error">{error}</p>}

      {gifUrl && (
        <div className="result">
          {outputKind === "mp4" ? (
            <video src={gifUrl} autoPlay loop muted playsInline controls />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={gifUrl} alt="Generated ARQ GIF card" />
          )}
          <a href={gifUrl} download={outputKind === "mp4" ? "arq.mp4" : "arq.gif"}>
            <button>Unterwäsche!</button>
          </a>
        </div>
      )}

      {editing && (
        <CropEditor
          file={editing}
          aspect={aspect}
          initial={crops.get(editing) ?? null}
          onConfirm={(crop) => applyCrop(editing, crop)}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}
