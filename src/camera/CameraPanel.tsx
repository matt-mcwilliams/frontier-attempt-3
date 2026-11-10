import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  X,
  Camera,
  RotateCw,
  Pause,
  Play,
  RefreshCw,
  Scan,
  Upload,
  Unplug,
  Maximize2,
} from "lucide-react";
import { post } from "../api";
import { NotebookConnection } from "./connection";
import { containedRect, sourceCrop, type Rect } from "../../shared/capture";

interface Pair {
  id: string;
  url: string | null;
  expiresAt: number;
  secure: boolean;
}
export function CameraPanel({
  onClose,
  onCapture,
  onUpload,
}: {
  onClose: () => void;
  onCapture: (blob: Blob) => Promise<void>;
  onUpload: () => void;
}) {
  const [pair, setPair] = useState<Pair | null>(null);
  const [qr, setQr] = useState("");
  const [status, setStatus] = useState("Preparing your camera connection…");
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [connected, setConnected] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [capturing, setCapturing] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const connection = useRef<NotebookConnection | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const freeze = useRef(false);
  const angle = useRef(0);
  const frozenFrame = useRef<HTMLCanvasElement | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    freeze.current = frozen;
  }, [frozen]);
  useEffect(() => {
    angle.current = rotation;
    setSelection(null);
  }, [rotation]);
  async function pairCamera() {
    const gen = ++generation.current;
    connection.current?.close();
    setLive(false);
    setConnected(false);
    setQr("");
    setError("");
    setStatus("Preparing your camera connection…");
    try {
      const p = await post<Pair>("/api/camera/pair");
      if (gen !== generation.current) return;
      setPair(p);
      if (p.url)
        setQr(
          await QRCode.toDataURL(p.url, {
            width: 240,
            margin: 1,
            color: { dark: "#233f38", light: "#ffffff" },
          }),
        );
      const c = new NotebookConnection({
        id: p.id,
        role: "desktop",
        onStatus: (s) => {
          setStatus(s);
          if (s === "Live notebook") setConnected(true);
          else if (/failed|interrupted|disconnected|closed|expired/i.test(s))
            setConnected(false);
        },
        onStream: (stream) => {
          if (video.current) {
            video.current.srcObject = stream;
            void video.current
              .play()
              .then(() => {
                setLive(true);
                setFrozen(false);
                setStatus("Live notebook");
              })
              .catch(() =>
                setError("The preview could not play. Reconnect the camera."),
              );
          }
        },
      });
      connection.current = c;
      c.connect();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void pairCamera();
    return () => {
      generation.current++;
      connection.current?.close();
      void post("/api/camera/disconnect").catch(() => {});
    };
  }, []);
  useEffect(() => {
    let raf = 0;
    let lastFrameAt = 0;
    const draw = () => {
      const now = performance.now();
      if (now - lastFrameAt < 65) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastFrameAt = now;
      const v = video.current,
        c = canvas.current;
      if (v && c && v.videoWidth && v.videoHeight) {
        if (!freeze.current || !frozenFrame.current) {
          const f = frozenFrame.current ?? document.createElement("canvas");
          f.width = v.videoWidth;
          f.height = v.videoHeight;
          f.getContext("2d")!.drawImage(v, 0, 0);
          frozenFrame.current = f;
        }
        const source = frozenFrame.current;
        const rotated = angle.current % 180 !== 0;
        if (source) {
          const w = rotated ? source.height : source.width,
            h = rotated ? source.width : source.height;
          if (c.width !== w) c.width = w;
          if (c.height !== h) c.height = h;
          const ctx = c.getContext("2d")!;
          ctx.save();
          ctx.clearRect(0, 0, w, h);
          ctx.translate(w / 2, h / 2);
          ctx.rotate((angle.current * Math.PI) / 180);
          ctx.drawImage(source, -source.width / 2, -source.height / 2);
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  function point(e: React.PointerEvent) {
    const b = frame.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(b.width, e.clientX - b.left)),
      y: Math.max(0, Math.min(b.height, e.clientY - b.top)),
    };
  }
  function pointerDown(e: React.PointerEvent) {
    if (!live) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    start.current = p;
    setSelection({ x: p.x, y: p.y, width: 0, height: 0 });
    setFrozen(true);
    freeze.current = true;
  }
  function pointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    const p = point(e),
      s = start.current;
    setSelection({
      x: Math.min(p.x, s.x),
      y: Math.min(p.y, s.y),
      width: Math.abs(p.x - s.x),
      height: Math.abs(p.y - s.y),
    });
  }
  async function capture(full = false) {
    const c = canvas.current,
      b = frame.current?.getBoundingClientRect();
    if (!c || !b || !live) return;
    const display = containedRect(b.width, b.height, c.width, c.height);
    const crop = sourceCrop(
      full ? display : (selection ?? display),
      display,
      c.width,
      c.height,
    );
    if (crop.width < 32 || crop.height < 32) {
      setError(
        "Select a larger region of the notebook, or capture the full frame.",
      );
      return;
    }
    const out = document.createElement("canvas");
    out.width = crop.width;
    out.height = crop.height;
    out
      .getContext("2d")!
      .drawImage(
        c,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height,
      );
    setCapturing(true);
    setError("");
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        out.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Frame capture failed."))),
          "image/jpeg",
          0.95,
        ),
      );
      await onCapture(blob);
      setSelection(null);
      setStatus(
        `Attached ${crop.width} × ${crop.height} crop. Submit it with your message.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCapturing(false);
    }
  }
  return (
    <aside className="workspace camera-workspace" aria-label="Notebook camera">
      <header className="workspace-head">
        <div>
          <span className="eyebrow">SECOND WORKSPACE</span>
          <h2>The notebook</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close camera"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <video ref={video} autoPlay muted playsInline className="hidden-video" />
      {!live ? (
        <div className="pairing">
          <div className="pairing-symbol">
            <Camera size={23} strokeWidth={1.5} />
          </div>
          <h3>
            A little room for
            <br />
            handwritten thinking.
          </h3>
          <p>
            Scan with your phone. Place it above your notebook, then select your
            work here.
          </p>
          {qr ? (
            <>
              <div className="qr-wrap">
                <img src={qr} alt="QR code to pair your phone camera" />
              </div>
              <p className="fineprint">
                Private pairing link · valid for 10 minutes
                <br />
                Use the same Wi-Fi and a trusted HTTPS certificate.
              </p>
              <details>
                <summary>Open pairing link manually</summary>
                <a
                  className="pairing-link"
                  href={pair?.url ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  {pair?.url}
                </a>
              </details>
            </>
          ) : pair && !pair.url ? (
            <div className="setup-note">
              <h4>One-time secure camera setup</h4>
              <p>
                Set <code>PUBLIC_ORIGIN</code> to this computer’s HTTPS address
                on your Wi-Fi, and configure a trusted certificate. The README
                has the steps.
              </p>
              <p>Image upload is available now.</p>
            </div>
          ) : (
            <div className="loading-line" />
          )}
          <button className="subtle-button" onClick={onUpload}>
            <Upload size={16} />
            Upload a notebook image
          </button>
        </div>
      ) : null}
      <div className={`video-work ${live ? "" : "is-hidden"}`}>
        <div
          className="camera-frame"
          ref={frame}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={() => {
            start.current = null;
          }}
          onPointerCancel={() => {
            start.current = null;
          }}
        >
          <canvas ref={canvas} />
          {selection && (
            <div
              className="selection-box"
              style={{
                left: selection.x,
                top: selection.y,
                width: selection.width,
                height: selection.height,
              }}
            />
          )}
          <span className="frame-badge">
            {frozen
              ? "FROZEN FRAME"
              : connected
                ? "LIVE · SELECT A REGION"
                : "CHECK CAMERA CONNECTION"}
          </span>
        </div>
        <div className="camera-tools">
          <button
            aria-label={frozen ? "Resume preview" : "Freeze preview"}
            onClick={() => setFrozen((f) => !f)}
          >
            {frozen ? <Play size={17} /> : <Pause size={17} />}
          </button>
          <button
            aria-label="Rotate camera frame"
            onClick={() => setRotation((r) => (r + 90) % 360)}
          >
            <RotateCw size={17} />
          </button>
          <button
            aria-label="Reconnect camera"
            onClick={() => connection.current?.reconnect()}
          >
            <RefreshCw size={17} />
          </button>
          <button
            onClick={() => void capture(true)}
            aria-label="Capture full frame"
          >
            <Maximize2 size={17} />
          </button>
          <button
            className="capture-button"
            onClick={() => void capture()}
            disabled={capturing}
          >
            <Scan size={16} />
            {capturing
              ? "Attaching…"
              : selection
                ? "Attach selection"
                : "Attach frame"}
          </button>
        </div>
        <p className="fineprint">
          Drag to select; the frame freezes while you work. Captures keep the
          camera’s source resolution. Nothing is sent to the tutor until you
          submit.
        </p>
      </div>
      <div className="camera-bottom">
        <p className="connection-status">
          <span className={status === "Live notebook" ? "status-dot" : ""} />
          {status}
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="row">
          <button className="text-button" onClick={() => void pairCamera()}>
            <RefreshCw size={14} />
            New pairing
          </button>
          <button
            className="text-button"
            onClick={() => {
              void post("/api/camera/disconnect");
              connection.current?.close();
              setLive(false);
              setStatus("Camera disconnected. Create a new pairing to resume.");
              setQr("");
              setPair(null);
            }}
          >
            <Unplug size={14} />
            Disconnect
          </button>
        </div>
      </div>
    </aside>
  );
}
