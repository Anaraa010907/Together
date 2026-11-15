import sys
from PIL import Image, ImageDraw
out=sys.argv[1]; files=sys.argv[2:]
ims=[Image.open(f).convert('RGB').resize((390,844)) for f in files]
W=390*len(ims)+12*(len(ims)-1)
sheet=Image.new('RGB',(W,844+28),(40,40,40))
d=ImageDraw.Draw(sheet)
for i,(im,f) in enumerate(zip(ims,files)):
    x=i*(390+12); sheet.paste(im,(x,28)); d.text((x+6,6),f.split('/')[-1],fill=(255,255,255))
sheet.save(out)
