#!/usr/bin/env python3
"""Publish a report with credentials read from the macOS Keychain.

Usage: python3 scripts/publish-keychain.py SOURCE /absolute/path/report.json

The Keychain item is a generic password in the service named by
FEED_KEYCHAIN_SERVICE, else by the file <data folder>/keychain-service,
else "com.feed.agent-keys". Its account is SOURCE and its password is
JSON: {"url": "http://127.0.0.1:4318", "agent_key": "feed_..."}.
The values reach the Node helper through the environment, never argv.
"""
import json,os,pathlib,subprocess,sys,shutil
if len(sys.argv)!=3:sys.exit('Pass source account and a payload JSON file.')
data=pathlib.Path(os.environ.get('FEED_DATA_DIR') or pathlib.Path.home()/'Library/Application Support/Feed')
def service():
 if os.environ.get('FEED_KEYCHAIN_SERVICE'):return os.environ['FEED_KEYCHAIN_SERVICE']
 f=data/'keychain-service'
 return f.read_text().strip() if f.exists() and f.read_text().strip() else 'com.feed.agent-keys'
try:
 result=subprocess.run(['/usr/bin/security','find-generic-password','-s',service(),'-a',sys.argv[1],'-w'],capture_output=True,check=True)
 config=json.loads(result.stdout)
 env={**os.environ,'FEED_URL':config['url'],'FEED_AGENT_KEY':config['agent_key']}
 node=shutil.which('node')
 if not node:raise ValueError()
 result=subprocess.run([node,str(pathlib.Path(__file__).with_name('publish-report.mjs')),str(pathlib.Path(sys.argv[2]).resolve())],env=env)
 sys.exit(result.returncode)
except Exception:sys.exit('Could not load the local publishing connection. Check the Keychain item and scheduled access.')
