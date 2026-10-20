# WaterFire 그래픽 팩 v1

제작일: 2026-10-21 (Asia/Seoul)  
제작 도구: 내장 image_gen  
범위: 현재 MVP용 그래픽 원본. 10개 새 PNG와 기존 캐릭터 원본 2개.

기존 불·물 캐릭터와 같은 그림체로 제작했다. 밝은 원소 캐릭터, 어두운 석조 사원, 낮은 채도의 청록 식물, 노랑·보라 퍼즐 채널을 사용한다.

## 파일 목록

| 파일 | 시트 구성 | 그림/포즈 수 |
|---|---|---|
| [불 캐릭터 동작](characters/fire-motion.png) | 4열 × 3행 | 12 |
| [물 캐릭터 동작](characters/water-motion.png) | 4열 × 3행 | 12 |
| [지형](world/terrain.png) | 4열 × 4행 | 16 |
| [용암·물·독](world/liquids.png) | 4열 × 3행 | 12 |
| [보석·출구](objects/collectibles-exits.png) | 4열 × 2행 | 8 |
| [퍼즐 장치](objects/mechanisms.png) | 4열 × 3행 | 12 |
| [UI 아이콘](ui/icons.png) | 4열 × 4행 | 16 |
| [이벤트 효과](effects/events.png) | 4열 × 5행 | 20 |
| [사원 배경](world/temple-background.png) | 단일 배경 | 1 |
| [배경 장식](world/decorations.png) | 4열 × 2행 | 8 |

기존 캐릭터 단일 원본은 [불](characters/fire-idle.png), [물](characters/water-idle.png)이다.

## 사용 상태와 검증 범위

- 모든 새 원본을 육안으로 확인했다. PNG 서명·크기·알파와 복사 전후 SHA-256은 `manifest.json`에 기록했다.
- 배경은 불투명, 나머지는 투명 영역을 갖는 PNG이다. 일부 원소 이미지에는 부드러운 반투명 빛 번짐이 남아 있다.
- 생성된 시트는 아트 원본이다. **정확한 픽셀 그리드, 프레임별 발 위치, 타일 이음새를 검증한 런타임 아틀라스가 아니다.**
- 아래 프레임 순서는 육안으로 확인한 내용 순서다. 일괄 등분 크롭 좌표로 사용하지 말고 실제 그림 경계를 측정해 잘라야 한다.
- 게임 코드 연결, 24×40px 축소 가독성, 애니메이션 재생, 32px 타일 반복 이음새, 충돌 영역 정합은 **NOT RUN**이다.
- 게이트는 닫힌 상태 원본이며 열린 상태는 렌더링 생략/이동으로 표현할 수 있다. 레버·버튼은 양 상태 원본이 있다.
- UI 문구·숫자·패널은 기존 HTML/CSS/Canvas에서 그리는 것을 전제로 한다. 글자를 그림에 굽지 않았다.
- 사운드·음악은 이번 그래픽 팩에 포함되지 않는다.
- 다른 작업에서 변경 중인 게임 소스는 수정하지 않았다.

[전체 미리보기](preview.html) · [파일 메타데이터](manifest.json) · [생성 및 수정 프롬프트](prompts.json)

## 프레임 순서

왼쪽에서 오른쪽, 위에서 아래 순서다. 캐릭터 왼쪽 이동은 오른쪽 포즈를 좌우 반전하는 것을 전제로 한다.

### 불 캐릭터 동작

파일: `characters/fire-motion.png`

1행: idle-a · idle-b · run-a · run-b

2행: run-c · run-d · jump · fall

3행: land · push · hurt · victory

### 물 캐릭터 동작

파일: `characters/water-motion.png`

1행: idle-a · idle-b · run-a · run-b

2행: run-c · run-d · jump · fall

3행: land · push · hurt · victory

### 지형

파일: `world/terrain.png`

1행: top-left · top-center · top-right · interior

2행: left-wall · right-wall · bottom-edge · isolated-block

3행: slope-up · slope-down · platform-left · platform-right

4행: moss-top · cracked-interior · pillar-cap · pillar-body

### 용암·물·독

파일: `world/liquids.png`

1행: lava-1 · lava-2 · lava-3 · lava-4

2행: water-1 · water-2 · water-3 · water-4

3행: poison-1 · poison-2 · poison-3 · poison-4

### 보석·출구

파일: `objects/collectibles-exits.png`

1행: fire-gem · water-gem · fire-exit-idle · water-exit-idle

2행: fire-gem-glint · water-gem-glint · fire-exit-active · water-exit-active

### 퍼즐 장치

파일: `objects/mechanisms.png`

1행: yellow-lever-off · yellow-lever-on · yellow-button-up · yellow-button-down

2행: purple-lever-off · purple-lever-on · purple-button-up · purple-button-down

3행: wooden-crate · yellow-platform · purple-platform · gate-closed

### UI 아이콘

파일: `ui/icons.png`

1행: fire · water · clock · restart

2행: menu · sound-on · sound-off · ready

3행: connected · disconnected · locked · unlocked

4행: star-full · star-empty · back · next

### 이벤트 효과

파일: `effects/events.png`

1행: fire-out-1 · fire-out-2 · fire-out-3 · fire-out-4

2행: water-out-1 · water-out-2 · water-out-3 · water-out-4

3행: poison-out-1 · poison-out-2 · poison-out-3 · poison-out-4

4행: gem-sparkle-1 · gem-sparkle-2 · gem-sparkle-3 · gem-sparkle-4

5행: land-dust-1 · land-dust-2 · land-dust-3 · land-dust-4

### 배경 장식

파일: `world/decorations.png`

1행: vine-upper-left · vine-upper-right · fern-left · fern-right

2행: mossy-rock-a · mossy-rock-b · broken-column · roots

## 배경 배치

`world/temple-background.png`는 화면을 채우는 뒤쪽 배경이며 충돌 지형이 아니다. 장식 시트도 비충돌 요소다. 실제 플레이 지형과 퍼즐 장치는 그 위에 별도로 그려야 한다.

