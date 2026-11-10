export class NotebookConnection {
  socket?: WebSocket;
  peer?: RTCPeerConnection;
  private closed = false;
  private ice: RTCIceCandidateInit[] = [];
  constructor(
    private options: {
      id: string;
      role: "desktop" | "phone";
      token?: string;
      stream?: MediaStream;
      onStream?: (stream: MediaStream) => void;
      onStatus: (status: string) => void;
    },
  ) {}
  connect() {
    this.closed = false;
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/signal`,
    );
    this.socket = ws;
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: "join",
          id: this.options.id,
          role: this.options.role,
          token: this.options.token,
        }),
      );
    ws.onmessage = (e) => {
      if (this.socket !== ws || this.closed) return;
      void this.receive(JSON.parse(e.data)).catch(() =>
        this.options.onStatus(
          "Connection negotiation failed. Try reconnecting both devices.",
        ),
      );
    };
    ws.onerror = () =>
      this.options.onStatus(
        "Signaling is unavailable. Check HTTPS and the local server.",
      );
    ws.onclose = (e) => {
      if (this.socket !== ws) return;
      const wasClosed = this.closed;
      this.closed = true;
      // Pair revocation must end media, not just its signaling channel.
      this.peer?.close();
      if (!wasClosed)
        this.options.onStatus(
          e.code === 1008
            ? "Pairing expired or a device is already connected. Create a new QR code."
            : "Connection closed. Reconnect to continue.",
        );
    };
  }
  private send(type: string, payload?: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type, payload }));
  }
  private async receive(message: {
    type: string;
    payload?: unknown;
    iceServers?: RTCIceServer[];
  }) {
    if (message.type === "joined") {
      this.peer?.close();
      this.ice = [];
      const pc = new RTCPeerConnection({
        iceServers: message.iceServers ?? [],
      });
      this.peer = pc;
      pc.onicecandidate = (e) => {
        if (e.candidate) this.send("ice", e.candidate.toJSON());
      };
      pc.ontrack = (e) => {
        if (e.streams[0]) this.options.onStream?.(e.streams[0]);
      };
      pc.onconnectionstatechange = () => {
        if (this.closed || this.peer !== pc) return;
        const s = pc.connectionState;
        this.options.onStatus(
          s === "connected"
            ? "Live notebook"
            : s === "failed"
              ? "Video connection failed. Use the same Wi-Fi or configure an ICE/TURN server."
              : s === "disconnected"
                ? "Camera interrupted. Tap Reconnect."
                : "Connecting camera…",
        );
      };
      for (const track of this.options.stream?.getTracks() ?? [])
        pc.addTrack(track, this.options.stream!);
      this.options.onStatus("Waiting for the other device…");
      return;
    }
    const pc = this.peer;
    if (!pc) return;
    if (message.type === "peer-ready" && this.options.role === "phone") {
      await pc.setLocalDescription(await pc.createOffer());
      this.send("offer", pc.localDescription);
    }
    if (message.type === "offer" && this.options.role === "desktop") {
      await pc.setRemoteDescription(
        message.payload as RTCSessionDescriptionInit,
      );
      await this.flushIce();
      await pc.setLocalDescription(await pc.createAnswer());
      this.send("answer", pc.localDescription);
    }
    if (message.type === "answer" && this.options.role === "phone") {
      await pc.setRemoteDescription(
        message.payload as RTCSessionDescriptionInit,
      );
      await this.flushIce();
    }
    if (message.type === "ice") {
      if (pc.remoteDescription)
        await pc.addIceCandidate(message.payload as RTCIceCandidateInit);
      else this.ice.push(message.payload as RTCIceCandidateInit);
    }
    if (message.type === "restart" && this.options.role === "phone") {
      pc.restartIce();
      await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
      this.send("offer", pc.localDescription);
    }
    if (message.type === "peer-left")
      this.options.onStatus(
        "The other device disconnected. Reconnect when ready.",
      );
  }
  private async flushIce() {
    for (const candidate of this.ice)
      await this.peer!.addIceCandidate(candidate);
    this.ice = [];
  }
  reconnect() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send("restart");
      if (this.options.role === "phone") {
        this.peer?.restartIce();
        void this.peer
          ?.createOffer({ iceRestart: true })
          .then(async (offer) => {
            await this.peer?.setLocalDescription(offer);
            this.send("offer", this.peer?.localDescription);
          })
          .catch(() =>
            this.options.onStatus(
              "Reconnect failed. Create a new pairing if the network is available.",
            ),
          );
      }
    } else {
      this.close();
      this.connect();
    }
  }
  close() {
    this.closed = true;
    this.peer?.close();
    this.socket?.close();
  }
}
