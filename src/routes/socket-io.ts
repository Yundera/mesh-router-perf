import { Server as SocketIOServer, Socket } from "socket.io";

interface EchoMessage {
  type: string;
  timestamp: string;
  data?: unknown;
  echo?: unknown;
}

export function setupSocketIOHandlers(io: SocketIOServer): void {
  io.on("connection", (socket: Socket) => {
    const welcome: EchoMessage = {
      type: "connected",
      timestamp: new Date().toISOString(),
      data: {
        message: "Socket.IO echo server ready",
        socketId: socket.id,
        transport: socket.conn.transport.name,
      },
    };
    socket.emit("welcome", welcome);

    socket.on("echo", (data: unknown, callback?: (response: EchoMessage) => void) => {
      const receiveTime = performance.now();
      const response: EchoMessage = {
        type: "echo",
        timestamp: new Date().toISOString(),
        echo: data,
        data: {
          server_receive_time: receiveTime,
          socketId: socket.id,
        },
      };

      if (typeof callback === "function") {
        callback(response);
      } else {
        socket.emit("echo", response);
      }
    });

    socket.on("ping", (data: unknown) => {
      socket.emit("pong", {
        type: "pong",
        timestamp: new Date().toISOString(),
        echo: data,
      });
    });

    socket.on("broadcast", (data: unknown) => {
      io.emit("broadcast", {
        type: "broadcast",
        timestamp: new Date().toISOString(),
        from: socket.id,
        data,
      });
    });

    socket.on("disconnect", (reason: string) => {
      console.log(`Socket.IO client disconnected: ${socket.id}, reason: ${reason}`);
    });

    socket.on("error", (error: Error) => {
      console.error(`Socket.IO error for ${socket.id}:`, error);
    });
  });
}
