import sys, shutil, json, time, httpx
from gradio_client import Client, handle_file
BODY='C:/Users/Surface Laptop 4/Desktop/AI Office/art-src/body/'
OUT='C:/Users/Surface Laptop 4/Desktop/AI Office/art-src/models/'
import os
TOK='C:/Users/Surface Laptop 4/Desktop/AI Office/secrets/hf.token'
tok=open(TOK).read().strip() if os.path.exists(TOK) else None
kw0={'token': tok} if tok else {}
c=Client(sys.argv[2] if len(sys.argv)>2 else 'tencent/Hunyuan3D-2', verbose=False, httpx_kwargs={'timeout': httpx.Timeout(300.0)}, **kw0)
for id in sys.argv[1].split(','):
    t=time.time()
    try:
        kw=dict(image=handle_file(BODY+id+'_s.png'), mv_image_front=None, mv_image_back=None, mv_image_left=None, mv_image_right=None, steps=30, guidance_scale=5.0, seed=1234, octree_resolution=256, check_box_rembg=True, num_chunks=8000, randomize_seed=False, api_name='/shape_generation')
        if 'Hunyuan3D-2' == (sys.argv[2] if len(sys.argv)>2 else 'tencent/Hunyuan3D-2').split('/')[-1]: kw['caption']=None
        r=c.predict(**kw)
        f=r[0]; f=f.get('value') or f.get('path') if isinstance(f,dict) else f; print(str(r[0])[:200]); shutil.copy(f, OUT+id+'_shape.glb'); print(id,'ok',json.dumps(r[2])[:200], flush=True)
    except Exception as ex: print(id,'ERR',str(ex)[:300], flush=True)
    print(id,'secs',int(time.time()-t), flush=True)
