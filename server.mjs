import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import next from "next";
import { WebSocketServer, WebSocket } from "ws";

const dev = process.env.NODE_ENV !== "production";
const host = "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname: host, port });
const handle = app.getRequestHandler();

const rooms = new Map();

function safeRoomId(value) {
  const trimmed = (value || "default").trim().slice(0, 40);
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "-") || "default";
}

function safeName(value) {
  return (value || "User").trim().slice(0, 24) || "User";
}

function safeColor(value) {
  const c = (value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#7c6eff";
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  return rooms.get(roomId);
}

function sendTo(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(roomId, payload, excludeClientId = null) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const [clientId, client] of room.entries()) {
    if (excludeClientId && clientId === excludeClientId) continue;
    sendTo(client, payload);
  }
}

function pushPresence(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const clients = [];
  for (const [clientId, client] of room.entries()) {
    clients.push({
      clientId,
      name: client.displayName,
      color: client.displayColor
    });
  }

  broadcastRoom(roomId, {
    type: "presence",
    roomId,
    clients
  });
}

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host}`);
    if (reqUrl.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, reqUrl);
    });
  });

  wss.on("connection", (ws, reqUrl) => {
    const roomId = safeRoomId(reqUrl.searchParams.get("room"));
    const clientId = randomUUID().slice(0, 8);

    ws.clientId = clientId;
    ws.roomId = roomId;
    ws.displayName = safeName(reqUrl.searchParams.get("name"));
    ws.displayColor = safeColor(reqUrl.searchParams.get("color"));

    const room = getRoom(roomId);
    room.set(clientId, ws);

    sendTo(ws, { type: "welcome", roomId, clientId });
    pushPresence(roomId);

    ws.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (!message || typeof message.type !== "string") return;

      if (message.type === "profile") {
        ws.displayName = safeName(message.name);
        ws.displayColor = safeColor(message.color);
        pushPresence(roomId);
        return;
      }

      const relay = {
        ...message,
        senderId: ws.clientId,
        senderName: ws.displayName,
        senderColor: ws.displayColor,
        roomId
      };

      broadcastRoom(roomId, relay, ws.clientId);
    });

    ws.on("close", () => {
      const currentRoom = rooms.get(roomId);
      if (!currentRoom) return;

      currentRoom.delete(clientId);
      if (currentRoom.size === 0) {
        rooms.delete(roomId);
        return;
      }

      pushPresence(roomId);
      broadcastRoom(roomId, { type: "user-left", clientId }, clientId);
    });
  });

  server.listen(port, host, () => {
    console.log(`SketchGit Next server listening on http://${host}:${port}`);
  });
});
