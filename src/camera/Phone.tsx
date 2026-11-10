import { useEffect, useRef, useState } from "react";
import {
  Camera,
  RotateCw,
  RefreshCw,
  VideoOff,
  ArrowUpRight,
} from "lucide-react";
import { NotebookConnection } from "./connection";

export function Phone() {
  const pairing = useRef(location.hash.slice(1).split("."));
  const video = useRef<HTMLVideoElement>(null);
  const connection = useRef<NotebookConnection | null>(null);
  const media = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState("Your notebook, connected.");
  const [active, setActive] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    history.replaceState(null, "", location.pathname);
    return () => {
      connection.current?.close();
      media.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function start(nextFacing = facing) {
    setError("");
    if (!isSecureContext) {
      setError(
        "Camera access requires trusted HTTPS. Install the local certificate on this phone and reopen the QR link.",
      );
      return;
    }
    if (!pairing.current[0] || !pairing.current[1]) {
      setError("Open a fresh pairing QR code from Margin on your computer.");
      return;
    }
    connection.current?.close();
    media.current?.getTracks().forEach((t) => t.stop());
    setActive(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 2560 },
          height: { ideal: 1920 },
          frameRate: { ideal: 15, max: 24 },
        },
      });
      media.current = stream;
      if (video.current) {
        video.current.srcObject = stream;
        await video.current.play();
      }
      const c = new NotebookConnection({
        id: pairing.current[0],
        token: pairing.current[1],
        role: "phone",
        stream,
        onStatus: setStatus,
      });
      connection.current = c;
      c.connect();
      setActive(true);
      const wake = navigator as Navigator & {
        wakeLock?: {
          request: (type: string) => Promise<{ release: () => Promise<void> }>;
        };
      };
      void wake.wakeLock?.request("screen").catch(() => {});
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in this browser’s site settings, then try again."
          : e instanceof DOMException && e.name === "NotFoundError"
            ? "No camera is available. Try a different browser or use image upload on the desktop."
            : "The camera could not start. Close other camera apps and try again.",
      );
    }
  }
  function stop() {
    connection.current?.close();
    media.current?.getTracks().forEach((t) => t.stop());
    media.current = null;
    setActive(false);
    setStatus("Camera stopped.");
  }
  return (
    <main className="phone-app">
      <header>
        <span className="brand-mark">M</span>
        <span className="brand">Margin</span>
        <span className="eyebrow">NOTEBOOK CAMERA</span>
      </header>
      <div className="phone-view">
        <video
          ref={video}
          playsInline
          muted
          autoPlay
          style={{ transform: `rotate(${rotation}deg)` }}
        />
        {!active && (
          <div className="phone-welcome">
            <Camera size={40} strokeWidth={1} />
            <h1>
              Your thinking.
              <br />
              In your own hand.
            </h1>
            <p>
              Position your phone above your notebook. Your desktop controls
              which frames are captured.
            </p>
          </div>
        )}
      </div>
      <div className="phone-controls">
        <p className="connection-status">
          <span className={active ? "status-dot" : ""} />
          {status}
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {active ? (
          <>
            <div className="phone-buttons">
              <button onClick={() => connection.current?.reconnect()}>
                <RefreshCw size={17} />
                Reconnect
              </button>
              <button
                aria-label="Rotate phone preview"
                onClick={() => setRotation((r) => (r + 90) % 360)}
              >
                <RotateCw size={18} />
              </button>
              <button
                aria-label="Switch camera"
                onClick={() => {
                  const f = facing === "environment" ? "user" : "environment";
                  setFacing(f);
                  void start(f);
                }}
              >
                <Camera size={18} />
              </button>
              <button aria-label="Stop camera" onClick={stop}>
                <VideoOff size={18} />
              </button>
            </div>
            <p className="fineprint">
              Keep this page open. Rotate the captured image on your desktop.
              Video is never sent to the tutor.
            </p>
          </>
        ) : (
          <button className="primary" onClick={() => void start()}>
            Enable notebook camera <ArrowUpRight size={18} />
          </button>
        )}
      </div>
    </main>
  );
}
