import { fileURLToPath } from "node:url";
import { Server, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_NAME } from "@waterfire/shared";
import express from "express";
import { GameRoom, type GameRoomOptions } from "./GameRoom.ts";

const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 2567);
const password = process.env.ROOM_PASSWORD ?? (isProd ? undefined : "dev");
if (!password) {
  console.error("ROOM_PASSWORD 환경변수를 설정해야 합니다.");
  process.exit(1);
}

const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));

const server = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    // 운영에서는 빌드된 클라이언트도 같은 주소에서 제공한다
    if (isProd) app.use(express.static(clientDist));
  },
});

server.define(ROOM_NAME, GameRoom);
await server.listen(port);

const options: GameRoomOptions = { password };
await matchMaker.createRoom(ROOM_NAME, options);

console.log(`WaterFire server listening on :${port}${isProd ? "" : " (dev password: dev)"}`);
