import sys, os
from PIL import Image, ImageSequence

def extract(gif_path, out_dir, k=6):
    name = os.path.splitext(os.path.basename(gif_path))[0].replace(" ", "_")
    im = Image.open(gif_path)
    frames = [f.copy().convert("RGBA") for f in ImageSequence.Iterator(im)]
    n = len(frames)
    print(f"{name}: {n} frames, size {im.size}")
    if n == 0:
        return
    idxs = [round(i * (n - 1) / (k - 1)) for i in range(k)] if n >= k else list(range(n))
    for j, idx in enumerate(idxs):
        fr = frames[idx]
        bg = Image.new("RGBA", fr.size, (255, 255, 255, 255))
        bg.alpha_composite(fr)
        p = os.path.join(out_dir, f"{name}_f{j}.png")
        bg.convert("RGB").save(p)
    print("  saved", len(idxs), "frames")

if __name__ == "__main__":
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    for g in sys.argv[2:]:
        extract(g, out_dir)
