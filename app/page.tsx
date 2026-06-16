"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const thumbs = useMemo(
    () => files.map((f) => ({ url: URL.createObjectURL(f), name: f.name })),
    [files],
  );

  useEffect(() => {
    return () => thumbs.forEach((t) => URL.revokeObjectURL(t.url));
  }, [thumbs]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
    setGifUrl(null);
    setError(null);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setGifUrl(null);
    try {
      const body = new FormData();
      files.forEach((f) => body.append("photos", f));
      const res = await fetch("/api/render", { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Render failed (${res.status}).`);
      }
      const blob = await res.blob();
      setGifUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>ARQ GIF Maker</h1>
      <p className="subtitle">Upload product photos to build a branded GIF card.</p>

      <div className="dropzone" onClick={() => inputRef.current?.click()}>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          hidden
          onChange={onPick}
        />
        <p>{files.length ? `${files.length} photo(s) selected` : "Click to choose photos"}</p>
      </div>

      {thumbs.length > 0 && (
        <ul className="thumbs">
          {thumbs.map((t) => (
            <li key={t.url}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.url} alt={t.name} />
            </li>
          ))}
        </ul>
      )}

      <button onClick={generate} disabled={busy || files.length === 0}>
        {busy ? "Generating…" : "Generate GIF"}
      </button>

      {error && <p className="error">{error}</p>}

      {gifUrl && (
        <div className="result">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gifUrl} alt="Generated ARQ GIF card" />
          <a href={gifUrl} download="arq.gif">
            <button>Download GIF</button>
          </a>
        </div>
      )}
    </main>
  );
}
