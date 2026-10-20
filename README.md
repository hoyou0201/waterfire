# WaterFire

"물불게임"(Fireboy & Watergirl)에서 영감을 받은 온라인 2인 협동 퍼즐 플랫포머 (웹 브라우저).

불 캐릭터는 용암을, 물 캐릭터는 물을 건널 수 있다. 서로를 도와 각자의 출구에 동시에 도착하면 클리어.
개인용(본인 + 지인 1명)이다.

- 게임 명세: [docs/SPEC.md](docs/SPEC.md)

## 구조

```
packages/shared   결정론적 시뮬레이션(물리·판정), 레벨 로더, 기록·별 등급. 서버와 클라이언트가 공유
packages/server   Colyseus 서버. 방 1개, 로비 → 카운트다운 → 플레이, 60Hz 시뮬레이션, 20Hz 스냅샷
packages/client   Vite + Canvas 2D 클라이언트. 내 입력을 즉시 반영하는 예측
levels/           레벨 JSON (tools/genlevels.py로 생성)
assets/art/v1/    아트 원본 시트
packages/client/public/art/  게임에서 쓰는 아틀라스 (tools/build-art.mjs로 생성)
```

## 개발

```bash
pnpm install
pnpm dev        # 게임 서버(:2567) + Vite(:5173)
pnpm test       # 시뮬레이션 단위 테스트
pnpm typecheck
```

`http://localhost:5173`을 브라우저 탭 두 개로 열고 각각 입장하면 혼자서도 테스트할 수 있다. 개발용 암호는 `dev`다.
로비에서 각자 캐릭터를 고르고 둘 다 "준비"를 누르면 시작한다.
같은 와이파이에 있는 사람은 `http://<내 IP>:5173`으로 접속할 수 있다.

## 이 Mac에서 서버 열기

```bash
pnpm serve
```

빌드 → 게임 서버(localhost:8080) → Cloudflare 터널 연결까지 한 번에 하고, Ctrl+C로 모두 끈다. `cloudflared`가 필요하다 (`brew install cloudflared`).

- 접속 암호는 `.env`의 `ROOM_PASSWORD`다. 처음 실행할 때 무작위로 만들어진다. `.env`는 git에 올라가지 않는다.
- `.env`에 `TUNNEL_NAME`이 없으면 **임시 주소**(`https://…trycloudflare.com`, 실행할 때마다 바뀜)로 열린다. 로그에 나온 주소를 친구에게 보내면 된다.
- 서버 하나가 빌드된 클라이언트와 WebSocket을 같은 주소에서 제공한다. `ROOM_PASSWORD`가 없으면 서버가 시작되지 않는다.

### 내 도메인으로 고정하기 (예: waterfire.hoyou.dev)

1. Cloudflare(무료)에 도메인을 추가하고, 도메인을 산 곳(가비아 등)에서 네임서버를 Cloudflare가 알려준 값으로 바꾼다.
2. 터널을 만든다 (처음 한 번):
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create waterfire
   cloudflared tunnel route dns waterfire waterfire.hoyou.dev
   ```
3. `.env`에 `TUNNEL_NAME=waterfire`를 추가하고 `pnpm serve`.

## 조작

| 동작 | 키 |
|---|---|
| 이동 | ← → 또는 A D |
| 점프 | ↑ / W / Space |
| 재시작 | R 1초 길게 누르기 |
| 메뉴 | Esc |

## 레벨 고치기

```bash
python3 tools/genlevels.py   # levels/*.json 다시 생성
pnpm test                    # 모든 레벨을 풀이 스크립트로 깨 보는 테스트 포함
```

레벨을 바꾸면 `packages/shared/src/solutions.ts`의 풀이도 맞춰야 테스트가 통과한다.

## 아트 고치기

```bash
node tools/build-art.mjs   # assets/art/v1 → packages/client/public/art
```

원본 시트는 균등 격자가 아니라서, 불투명 픽셀 덩어리를 찾아 칸별로 묶은 경계로 자른다. 프레임 이름과 순서는 `assets/art/v1/README.md`를 따른다.
