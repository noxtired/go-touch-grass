import sys, os
import fitz  # PyMuPDF

pdf_path = r"C:\Users\selly\Desktop\app\component-set-up.pdf"
out_dir = r"C:\Users\selly\Desktop\app\_pdf_pages"
os.makedirs(out_dir, exist_ok=True)
doc = fitz.open(pdf_path)

mode = sys.argv[1] if len(sys.argv) > 1 else "all"

def render_full(idx, target=2000):
    page = doc[idx]
    r = page.rect
    scale = target / max(r.width, r.height)
    scale = max(0.3, min(scale, 3.0))
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
    p = os.path.join(out_dir, f"page_{idx+1:02d}.png")
    pix.save(p)
    print(f"page {idx+1}: {round(r.width)}x{round(r.height)} -> scale {scale:.3f} -> {pix.width}x{pix.height}  {p}")

def render_clip(idx, x0, y0, x1, y1, scale, name):
    page = doc[idx]
    clip = fitz.Rect(x0, y0, x1, y1)
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=clip)
    p = os.path.join(out_dir, name)
    pix.save(p)
    print(f"clip p{idx+1} [{x0},{y0},{x1},{y1}] x{scale} -> {pix.width}x{pix.height}  {p}")

if mode == "all":
    target = int(sys.argv[2]) if len(sys.argv) > 2 else 2000
    for i in range(doc.page_count):
        render_full(i, target)
elif mode == "clip":
    # py render_pdf.py clip <page1based> <x0> <y0> <x1> <y1> <scale> <name>
    idx = int(sys.argv[2]) - 1
    x0,y0,x1,y1 = map(float, sys.argv[3:7])
    scale = float(sys.argv[7]); name = sys.argv[8]
    render_clip(idx, x0,y0,x1,y1, scale, name)
