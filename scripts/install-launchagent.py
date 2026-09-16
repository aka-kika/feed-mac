#!/usr/bin/env python3
import os,pathlib,plistlib,shutil,subprocess,sys
if sys.platform!='darwin':sys.exit('Run this installer on the target Mac.')
root=pathlib.Path(__file__).resolve().parents[1]
node=shutil.which('node')
if not node:sys.exit('Install Node.js 24 LTS first.')
if int(subprocess.check_output([node,'-p','process.versions.node.split(".")[0]']).decode())<24:sys.exit('Node.js 24+ required.')
if not (root/'server/routes.mjs').exists() or not (root/'dist/index.html').exists():sys.exit('Build the app first.')
folder=pathlib.Path.home()/'Library/LaunchAgents';folder.mkdir(exist_ok=True)
label=os.environ.get('FEED_LAUNCHAGENT_LABEL','com.feed.web')
p=folder/(label+'.plist')
if p.exists():sys.exit('Feed LaunchAgent already exists. Inspect it before updating; no changes made.')
data=pathlib.Path.home()/'Library/Application Support/Feed'
if not (data/'config.json').exists():sys.exit('Run scripts/setup.py first.')
logs=data/'logs';logs.mkdir(exist_ok=True,mode=0o700)
plist={'Label':label,'ProgramArguments':[node,str(root/'server/main.mjs')],'WorkingDirectory':str(root),'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':10,'EnvironmentVariables':{'PATH':str(pathlib.Path(node).parent)+':/usr/bin:/bin:/usr/sbin:/sbin','FEED_DATA_DIR':str(data)},'StandardOutPath':str(logs/'server.log'),'StandardErrorPath':str(logs/'error.log')}
with p.open('wb')as f:plistlib.dump(plist,f)
p.chmod(0o600)
subprocess.run(['launchctl','bootstrap','gui/'+str(os.getuid()),str(p)],check=True)
print('Feed LaunchAgent installed. It starts after login, not before login.')
