"""
링크 공유용 미리보기 이미지(og:image, 1200 × 630) 만들기

사용: python scripts/create_og_image.py
결과: public/og-image.png  (빌드하면 dist/og-image.png 로 복사됨)

오른쪽 뷰어 그림은 테스트용 팬텀 데이터를 앱과 같은 W/L로 렌더링한 것입니다.
(환자 영상이 아닙니다.)
"""

import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1200, 630
BG_TOP = (11, 22, 43)
BG_BOTTOM = (23, 42, 77)
ACCENT = (61, 139, 253)
YELLOW = (255, 210, 63)
WHITE = (255, 255, 255)
GREY = (168, 186, 214)
PANEL = (16, 20, 26)

FONTS = "/System/Library/Fonts/Supplemental"
KOREAN = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "og-image.png")


def font(name, size, korean=False):
    for path in ([KOREAN] if korean else []) + [os.path.join(FONTS, name)]:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def background():
    img = Image.new("RGB", (W, H), BG_TOP)
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        draw.line([(0, y), (W, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    grid = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, 40):
        gd.line([(x, 0), (x, H)], fill=(30, 52, 92))
    for y in range(0, H, 40):
        gd.line([(0, y), (W, y)], fill=(30, 52, 92))
    return Image.blend(img, grid, 0.12)


# ─────────── 팬텀 슬라이스 (테스트 데이터와 같은 방식으로 생성) ───────────

def phantom_volume(n=128, nz=60):
    zz, yy, xx = np.mgrid[0:nz, 0:n, 0:n]
    vol = np.full((nz, n, n), -1000.0)
    body = ((xx - 64) ** 2 / 55**2 + (yy - 64) ** 2 / 45**2) <= 1
    vol[body] = 40
    vol[((xx - 64) ** 2 + (yy - 64) ** 2 + ((zz - 30) * 2) ** 2) < 30**2] = 400
    vol[((xx - 40) ** 2 + (yy - 50) ** 2 < 64) & body] = -700
    vol[:, 60:68, 100:115] = 1500
    return vol


def window(arr, center, width):
    lo, hi = center - width / 2, center + width / 2
    out = np.clip((arr - lo) / (hi - lo), 0, 1)
    return Image.fromarray((out * 255).astype(np.uint8), "L").convert("RGB")


def viewer_panel(size):
    """2x2 Multi View 모습 (팬텀 CT 축상/시상/관상 + 시리즈 패널)"""
    vol = phantom_volume()
    pw, ph = size
    panel = Image.new("RGB", (pw, ph), PANEL)
    d = ImageDraw.Draw(panel)

    # 상단 바
    d.rectangle([0, 0, pw, 26], fill=(18, 22, 27))
    d.ellipse([9, 9, 19, 19], outline=ACCENT, width=3)
    d.text((26, 7), "DabbaView", font=font("Helvetica.ttc", 12), fill=WHITE)
    d.text((100, 7), "Web", font=font("Helvetica.ttc", 12), fill=ACCENT)
    for i, label in enumerate(["1X1", "1X2", "2X2", "MPR"]):
        x = 150 + i * 42
        on = label == "2X2"
        d.rounded_rectangle([x, 5, x + 38, 21], 3, fill=(31, 111, 184) if on else None)
        d.text((x + 7, 8), label, font=font("Helvetica.ttc", 10), fill=WHITE if on else GREY)

    # 시리즈 패널
    sp = 92
    d.rectangle([0, 26, sp, ph], fill=(18, 22, 27))
    d.text((8, 34), "Series  4", font=font("Helvetica.ttc", 10), fill=GREY)
    for i in range(3):
        y = 50 + i * 74
        thumb = window(vol[20 + i * 12], 40, 400).resize((72, 56))
        panel.paste(thumb, (10, y))
        d.rectangle([9, y - 1, 82, y + 56], outline=YELLOW if i == 0 else (58, 66, 76))
        d.text((12, y + 58), ["CT AXIAL", "CT 5MM", "Sag T2"][i], font=font("Helvetica.ttc", 8), fill=GREY)

    # 2x2 영상
    gw, gh = (pw - sp) // 2, (ph - 26) // 2
    tiles = [
        (window(vol[30], 40, 400), "CT PHANTOM AXIAL", "Se: 2  Im: 31/60"),
        (window(vol[:, :, 64].T[::-1], 40, 400), "CT PHANTOM SAG", "Se: 3  Im: 65/128"),
        (window(vol[:, 64, :], 40, 400), "CT PHANTOM COR", "Se: 3  Im: 64/128"),
        (window(vol[44], 40, 400), "Cine SSFP 3ph", "Se: 9  Im: 8/24"),
    ]
    for i, (img, name, meta) in enumerate(tiles):
        gx, gy = sp + (i % 2) * gw, 26 + (i // 2) * gh
        cell = Image.new("RGB", (gw, gh), (0, 0, 0))
        # 원본 비율을 유지하며 칸에 맞춤
        scale = min((gw - 16) / img.width, (gh - 34) / img.height)
        fitted = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))))
        cell.paste(fitted, ((gw - fitted.width) // 2, (gh - fitted.height) // 2))
        cd = ImageDraw.Draw(cell)
        # Crosslink: 전체 범위 점선 + 현재 슬라이스 노란 실선
        if i in (1, 2):
            for k in range(24, gh - 20, 22):  # 전체 스캔 범위 (성글게)
                for x0 in range(10, gw - 10, 9):
                    cd.line([(x0, k), (x0 + 4, k)], fill=(58, 116, 168))
            cd.line([(10, gh // 2), (gw - 10, gh // 2)], fill=YELLOW)  # 현재 슬라이스
        else:
            cd.line([(gw // 2, 8), (gw // 2, gh - 22)], fill=YELLOW)
        cd.text((6, 6), "HONG GILDONG", font=font("Helvetica.ttc", 9), fill=(232, 232, 232))
        cd.text((6, gh - 20), name, font=font("Helvetica.ttc", 9), fill=(232, 232, 232))
        tw = cd.textlength(meta, font=font("Helvetica.ttc", 9))
        cd.text((gw - tw - 6, 6), meta, font=font("Helvetica.ttc", 9), fill=(232, 232, 232))
        cd.text((gw // 2 - 4, 18), "A", font=font("Helvetica.ttc", 9), fill=YELLOW)
        panel.paste(cell, (gx, gy))
        d.rectangle([gx, gy, gx + gw - 1, gy + gh - 1], outline=YELLOW if i == 0 else (48, 54, 62))
    return panel


def main():
    img = background()
    d = ImageDraw.Draw(img)

    # 로고
    d.rounded_rectangle([60, 56, 148, 144], 20, outline=(45, 86, 150), width=2, fill=(17, 31, 58))
    d.ellipse([82, 78, 126, 122], outline=ACCENT, width=4)
    d.ellipse([96, 92, 112, 108], fill=YELLOW)

    d.text((172, 62), "DabbaView", font=font("Helvetica.ttc", 62), fill=WHITE)
    d.text((512, 74), "Web", font=font("Helvetica.ttc", 46), fill=ACCENT)
    d.text((176, 140), "BROWSER-BASED  DICOM  VIEWER", font=font("Helvetica.ttc", 18), fill=ACCENT)

    d.text((60, 208), "Free, open-source DICOM viewer", font=font("Helvetica.ttc", 30), fill=WHITE)
    d.text((60, 246), "that runs in your browser", font=font("Helvetica.ttc", 30), fill=WHITE)
    d.text((60, 292), "설치 없이 브라우저에서 바로 여는 무료 오픈소스 DICOM 뷰어", font=font("", 20, korean=True), fill=GREY)

    bullets = [
        "DICOM · NIfTI · NRRD · NumPy",
        "Multi View · MPR · Crosslink · 동기 스크롤",
        "Google Drive · OneDrive · GIF/WebM 내보내기",
        "영상은 업로드되지 않고 브라우저 안에서만 처리",
    ]
    for i, text in enumerate(bullets):
        y = 348 + i * 40
        d.ellipse([62, y + 8, 72, y + 18], fill=ACCENT)
        d.text((88, y), text, font=font("", 21, korean=True), fill=(226, 234, 245))

    # 오른쪽 뷰어 그림
    panel = viewer_panel((560, 392))
    shadow = Image.new("RGBA", (panel.width + 40, panel.height + 40), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([20, 20, panel.width + 20, panel.height + 20], 10, fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(12))
    img.paste(shadow, (600, 110), shadow)
    img.paste(panel, (620, 130))
    d.rectangle([620, 130, 620 + panel.width, 130 + panel.height], outline=(70, 96, 140))

    # 푸터
    d.line([(60, 566), (W - 60, 566)], fill=(46, 72, 116))
    d.text((60, 582), "Chrome · Safari · Edge · 모바일", font=font("", 20, korean=True), fill=GREY)
    right = "github.com/Dabbabbu/DabbaView-Web"
    f = font("Helvetica.ttc", 20)
    d.text((W - 60 - d.textlength(right, font=f), 582), right, font=f, fill=ACCENT)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT)
    print(f"{OUT}  {img.size[0]}x{img.size[1]}  {os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
