import { io, Socket } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(BACKEND_URL, {
      autoConnect: false,
      auth: () => {
        const raw = localStorage.getItem("vyaas_user");
        const token = raw ? JSON.parse(raw).token : undefined;
        return { token };
      },
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
