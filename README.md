# WaterFire

"물불게임"(Fireboy & Watergirl)에서 영감을 받은 온라인 2인 협동 퍼즐 플랫포머 (웹 브라우저).

불 캐릭터는 용암을, 물 캐릭터는 물을 건널 수 있다. 서로를 도와 각자의 출구에 동시에 도착하면 클리어.
개인용(본인 + 지인 1명)이다.

- 게임 명세: [docs/SPEC.md](docs/SPEC.md)

## 구조

```
packages/shared   결정론적 시뮬레이션(물리·판정)과 레벨 로더. 서버와 클라이언트가 공유
packages/server   Colyseus 서버. 방 1개, 60Hz 시뮬레이션, 20Hz 스냅샷
packages/client   Vite + Canvas 2D 클라이언트
levels/           레벨 JSON
```

## 개발

```bash
pnpm install
pnpm dev        # 게임 서버(:2567) + Vite(:5173)
pnpm test       # 시뮬레이션 단위 테스트
pnpm typecheck
```

`http://localhost:5173`을 브라우저 탭 두 개로 열고 각각 입장하면 혼자서도 테스트할 수 있다. 개발용 암호는 `dev`다.
같은 와이파이에 있는 사람은 `http://<내 IP>:5173`으로 접속할 수 있다.

## 운영 실행

```bash
pnpm build
ROOM_PASSWORD=<암호> PORT=8080 pnpm start
```

서버 하나가 빌드된 클라이언트와 WebSocket을 같은 주소에서 제공한다. `ROOM_PASSWORD`를 설정하지 않으면 서버가 시작되지 않는다.

## 조작

| 동작 | 키 |
|---|---|
| 이동 | ← → 또는 A D |
| 점프 | ↑ / W / Space |
| 재시작 | R 1초 길게 누르기 |
