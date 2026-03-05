import type { WebSocket } from "ws";

interface WsMessage {
  type: string;
  timestamp: string;
  data?: unknown;
  echo?: unknown;
}

export function handleWebSocket(socket: WebSocket): void {
  const welcome: WsMessage = {
    type: "connected",
    timestamp: new Date().toISOString(),
    data: {
      message: "WebSocket echo server ready",
    },
  };
  socket.send(JSON.stringify(welcome));

  socket.on("message", (message: Buffer | string) => {
    const receiveTime = performance.now();

    if (Buffer.isBuffer(message)) {
      socket.send(message);
      return;
    }

    try {
      const parsed = JSON.parse(message.toString());
      const response: WsMessage = {
        type: "echo",
        timestamp: new Date().toISOString(),
        echo: parsed,
        data: {
          server_receive_time: receiveTime,
          original_size: message.toString().length,
        },
      };
      socket.send(JSON.stringify(response));
    } catch {
      socket.send(message);
    }
  });

  socket.on("close", () => {
    console.log("WebSocket connection closed");
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
}
