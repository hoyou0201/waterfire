"""레벨 생성기. levels/*.json은 이 파일에서 만들어진다.

레벨을 고칠 때는 이 파일을 고친 뒤 다시 실행하고, packages/shared/src/solutions.ts의 풀이도 맞춘다.
    python3 tools/genlevels.py
"""

import json, sys, os

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "levels")
W, H = 30, 17


class M:
    def __init__(self, id, name, hint, target, w=W, h=H):
        self.id, self.name, self.hint, self.target = id, name, hint, target
        self.w, self.h = w, h
        self.g = [["." for _ in range(w)] for _ in range(h)]
        self.fill(0, 0, w - 1, 0)
        self.fill(0, h - 1, w - 1, h - 1)
        self.fill(0, 0, 0, h - 1)
        self.fill(w - 1, 0, w - 1, h - 1)
        self.objects = []
        self.spawns = {}

    def fill(self, x0, y0, x1, y1, ch="#"):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.g[y][x] = ch
        return self

    def set(self, x, y, ch):
        self.g[y][x] = ch
        return self

    def spawn(self, el, x, y):
        self.spawns[el] = [x, y]
        return self

    def exit(self, el, x, y):
        self.objects.append({"type": "exit", "color": el, "pos": [x, y]})
        return self

    def gem(self, el, x, y):
        self.objects.append({"type": "gem", "color": el, "pos": [x, y]})
        return self

    def box(self, x, y):
        self.objects.append({"type": "box", "pos": [x, y]})
        return self

    def button(self, ch, x, y):
        self.objects.append({"type": "button", "channel": ch, "pos": [x, y]})
        return self

    def lever(self, ch, x, y, initial="left"):
        self.objects.append({"type": "lever", "channel": ch, "pos": [x, y], "initial": initial})
        return self

    def platform(self, ch, frm, to, size, speed=None):
        o = {"type": "platform", "channel": ch, "from": frm, "to": to, "size": size}
        if speed:
            o["speed"] = speed
        self.objects.append(o)
        return self

    def save(self):
        data = {
            "id": self.id,
            "name": self.name,
            "hint": self.hint,
            "targetTime": self.target,
            "tiles": ["".join(r) for r in self.g],
            "spawns": self.spawns,
            "objects": self.objects,
        }
        with open(os.path.join(OUT, self.id + ".json"), "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(self.id)


FLOOR = 16  # 바닥 행. 캐릭터는 15행에 선다

# 1. 첫걸음: 이동, 점프, 자기 웅덩이
m = M("01-first-steps", "첫걸음", "불은 용암, 물은 물을 건널 수 있어요. 각자 색깔 문으로!", 25)
m.fill(6, FLOOR, 7, FLOOR, "L").fill(11, FLOOR, 12, FLOOR, "W")
m.fill(17, 14, 28, 15)  # 2칸 턱
m.fill(22, 12, 28, 13)  # 한 번 더 2칸
m.spawn("fire", 2, 15).spawn("water", 3, 15)
m.exit("fire", 24, 11).exit("water", 26, 11)
m.gem("fire", 7, 15).gem("water", 12, 15).gem("fire", 19, 12).gem("water", 20, 12)
m.save()

# 2. 독 웅덩이: 둘 다 피해야 하는 초록 독 + 지그재그로 올라가기
m = M("02-poison", "독 웅덩이", "초록 독은 둘 다 위험해요. 뛰어넘으세요!", 45)
m.fill(7, FLOOR, 8, FLOOR, "G").fill(11, FLOOR, 12, FLOOR, "L").fill(15, FLOOR, 16, FLOOR, "W").fill(19, FLOOR, 20, FLOOR, "G")
m.fill(23, 14, 26, 15)  # P1
m.fill(27, 12, 28, 13)  # P2
m.fill(22, 10, 24, 10)  # P3
m.fill(17, 8, 19, 8)  # P4
m.fill(1, 6, 14, 6)  # 꼭대기 선반
m.spawn("fire", 2, 15).spawn("water", 3, 15)
m.exit("water", 3, 5).exit("fire", 6, 5)
m.gem("fire", 12, 15).gem("water", 16, 15).gem("fire", 23, 9).gem("water", 18, 7)
m.save()

# 3. 버튼: 밟고 있는 동안만 열리는 문
m = M("03-buttons", "누르고 지나가기", "버튼은 밟고 있는 동안만 문을 열어요. 서로 눌러 주세요", 30)
m.fill(14, 1, 14, 7)  # 문 위쪽 벽
m.platform("yellow", [14, 12], [14, 8], [1, 4], 5)
m.button("yellow", 11, 15).button("yellow", 18, 15)
m.fill(20, FLOOR, 21, FLOOR, "L")
m.fill(24, 14, 28, 15)
m.spawn("fire", 5, 15).spawn("water", 3, 15)
m.exit("water", 25, 13).exit("fire", 27, 13)
m.gem("water", 7, 13).gem("fire", 21, 15).gem("water", 23, 12)
m.save()

# 4. 엘리베이터: 버튼을 누르면 내려오는 엘리베이터
m = M("04-elevator", "엘리베이터", "엘리베이터는 버튼을 누르는 동안 내려와요", 50)
m.fill(15, 8, 28, 15)  # 오른쪽 큰 블록 (윗면 = 8행 → 7행에 선다)
m.platform("purple", [12, 8], [12, 15], [3, 1], 4)
m.button("purple", 8, 15).button("purple", 18, 7)
m.fill(4, FLOOR, 5, FLOOR, "W")
m.spawn("fire", 2, 15).spawn("water", 10, 15)
m.exit("fire", 24, 7).exit("water", 26, 7)
m.gem("water", 5, 15).gem("fire", 10, 13).gem("water", 21, 5).gem("fire", 22, 5)
m.save()

# 5. 상자: 버튼 누르기 + 디딤돌
m = M("05-boxes", "상자 밀기", "상자로 버튼을 눌러 두거나 디딤돌로 써요", 35)
m.fill(15, 1, 15, 7)
m.platform("green", [15, 12], [15, 8], [1, 4], 5)
m.box(6, 15).button("green", 11, 15)
m.box(19, 15)
m.fill(23, 13, 28, 15)  # 3칸 턱: 상자 없이는 혼자 못 올라감
m.spawn("fire", 2, 15).spawn("water", 3, 15)
m.exit("fire", 25, 12).exit("water", 27, 12)
m.gem("fire", 9, 13).gem("water", 13, 15).gem("fire", 22, 11).gem("water", 24, 10)
m.save()

# 6. 어깨 빌려주기: 상대를 밟고 3칸 벽 넘기 + 레버로 계단 만들기
m = M("06-shoulders", "어깨 빌려주기", "상대 머리 위에 올라서면 더 높이 뛸 수 있어요", 35)
m.fill(14, 13, 28, 15)  # 3칸 턱
m.lever("cyan", 18, 12)
m.platform("cyan", [11, 16], [11, 15], [2, 1], 2)  # 바닥에서 솟아오르는 디딤돌
m.fill(20, 11, 20, 12, "#").set(20, 11, ".")  # 낮은 턱
m.fill(22, 10, 28, 12)  # 한 칸 더 위 (3칸 턱 위에 2칸)
m.spawn("fire", 3, 15).spawn("water", 6, 15)
m.exit("fire", 26, 9).exit("water", 24, 9)
m.gem("fire", 16, 10).gem("water", 8, 15).gem("fire", 17, 12).gem("water", 23, 7)
m.save()

# 7. 경사로: 비탈과 골짜기 웅덩이
m = M("07-slopes", "비탈길", "비탈을 달려 내려가며 웅덩이를 뛰어넘어요", 30)
f = FLOOR - 1  # 15행
m.set(4, f, "/").fill(5, f, 6, f).set(7, f, "\\")  # 작은 언덕
m.fill(9, FLOOR, 10, FLOOR, "L")
m.set(12, f, "/").set(13, f - 1, "/").set(13, f, "#").fill(14, f - 1, 16, f).set(17, f - 1, "\\").set(17, f, "#").set(18, f, "\\")  # 큰 언덕
m.fill(20, FLOOR, 21, FLOOR, "W")
m.set(22, f, "/").set(23, f - 1, "/").set(23, f, "#").set(24, f - 2, "/").fill(24, f - 1, 24, f).fill(25, f - 2, 28, f)  # 오르막과 고원
m.spawn("fire", 2, 15).spawn("water", 1, 15)
m.exit("water", 25, 12).exit("fire", 27, 12)
m.gem("fire", 10, 15).gem("water", 21, 15).gem("fire", 15, 11).gem("water", 5, 12)
m.save()

# 8. 업고 건너기: 너무 넓은 웅덩이는 상대 위에 타고 건넌다
m = M("08-piggyback", "업고 건너기", "너무 넓은 웅덩이는 서로 업어서 건너요", 25)
m.fill(5, FLOOR, 9, FLOOR, "W").fill(15, FLOOR, 19, FLOOR, "L")
m.fill(23, 14, 28, 15)
m.spawn("fire", 2, 15).spawn("water", 3, 15)
m.exit("fire", 25, 13).exit("water", 27, 13)
m.gem("water", 7, 15).gem("fire", 17, 15).gem("fire", 7, 13).gem("water", 17, 13)
m.save()

# 9. 두 개의 레버: 서로의 길에 있는 레버로 상대의 문을 연다
m = M("09-two-levers", "두 개의 레버", "레버는 한 번 밀면 그대로 있어요. 상대의 문은 내 길에 있어요", 30)
m.fill(1, 8, 28, 8)  # 위·아래 길을 나누는 판
m.fill(6, 8, 7, 8, "L").fill(17, 8, 18, 8, "L")  # 위(불) 길의 용암
m.fill(6, FLOOR, 7, FLOOR, "W").fill(17, FLOOR, 18, FLOOR, "W")  # 아래(물) 길의 물
m.lever("pink", 10, 7).platform("pink", [13, 12], [13, 9], [1, 4], 5)  # 위 레버 → 아래 문
m.lever("orange", 10, 15).platform("orange", [13, 4], [13, 1], [1, 4], 5)  # 아래 레버 → 위 문
m.spawn("fire", 2, 7).spawn("water", 2, 15)
m.exit("fire", 26, 7).exit("water", 26, 15)
m.gem("fire", 7, 7).gem("water", 7, 15).gem("fire", 21, 5).gem("water", 21, 13)
m.save()

# 10. 마지막 사원: 업고 건너기 + 상자 + 엘리베이터
m = M("10-final", "마지막 사원", "지금까지 배운 걸 모두 써 보세요", 75)
m.fill(4, FLOOR, 8, FLOOR, "W")  # 넓은 물: 물이 불을 업고 건넌다
m.box(11, 15).button("yellow", 14, 15)
m.fill(17, 7, 17, 7)  # 문 위 벽
m.platform("yellow", [17, 12], [17, 8], [1, 4], 5)  # 상자로 열어 두는 문
m.button("purple", 20, 15)
m.fill(22, FLOOR, 23, FLOOR, "L")
m.platform("purple", [25, 15], [25, 6], [3, 1], 4)  # 버튼을 누르는 동안 올라가는 엘리베이터
m.fill(1, 6, 24, 6)  # 위층 바닥
m.fill(14, 6, 15, 6, "G").fill(8, 6, 9, 6, "L")
m.button("purple", 21, 5)
m.spawn("fire", 2, 15).spawn("water", 3, 15)
m.exit("fire", 3, 5).exit("water", 6, 5)
m.gem("fire", 6, 13).gem("water", 7, 15).gem("fire", 22, 15).gem("water", 25, 9).gem("water", 11, 4).gem("fire", 18, 4)
m.save()
