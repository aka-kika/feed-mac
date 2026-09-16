#!/usr/bin/env python3
import os,json,getpass,secrets,hashlib,pathlib,sys
folder=pathlib.Path(os.environ.get('FEED_DATA_DIR',str(pathlib.Path.home()/'Library/Application Support/Feed')))
folder.mkdir(parents=True,exist_ok=True,mode=0o700); folder.chmod(0o700)
p=folder/'config.json'
if p.exists(): sys.exit('Configuration already exists; edit origin/port there to retain the password and sessions.')
origin=input('Private Tailscale HTTPS origin (or http://127.0.0.1:4318 for initial test): ').strip().rstrip('/')
from urllib.parse import urlparse
u=urlparse(origin)
if not (u.scheme=='https' or (u.scheme=='http' and u.hostname in ('127.0.0.1','localhost'))) or not u.hostname or u.path or u.username or u.query: sys.exit('Enter an origin only.')
password=getpass.getpass('Choose Feed password (12+ characters): ')
if len(password)<12 or password!=getpass.getpass('Repeat password: '):sys.exit('Passwords do not match or are too short.')
salt=secrets.token_hex(16)
config={'origin':origin,'port':4318,'salt':salt,'passwordHash':hashlib.scrypt(password.encode(),salt=salt.encode(),n=16384,r=8,p=1,dklen=64).hex(),'sessionSecret':secrets.token_hex(32)}
fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:json.dump(config,f,indent=2)
print('Protected local configuration created.')
