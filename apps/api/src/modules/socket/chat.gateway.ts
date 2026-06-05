import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";

import { Server, Socket } from "socket.io";

@WebSocketGateway({
  cors: {
    origin: "http://localhost:3000",
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    console.log("Connected:", client.id);
  }

  handleDisconnect(client: Socket) {
    console.log("Disconnected:", client.id);
  }
}