import unittest
from patch_nginx_proxy_timeout import patch_config

CONFIG = '''server {
    listen 443 ssl;
    server_name ide.innoprog.ru;
    location /bot-api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_read_timeout 120s;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
    }
}
server {
    listen 443 ssl;
    server_name other.test;
    location /bot-api/ { proxy_pass http://other; }
}
'''
class PatchTests(unittest.TestCase):
    def test_websocket_is_narrow_and_idempotent(self):
        options=dict(server_name='ide.innoprog.ru',location='/bot-api/',timeout='250s',websocket=True)
        patched=patch_config(CONFIG,**options)
        self.assertEqual(patch_config(patched,**options),patched)
        self.assertEqual(patched.count('proxy_set_header Upgrade $http_upgrade;'),1)
        self.assertIn('proxy_set_header Connection $connection_upgrade;',patched)
        self.assertIn('proxy_buffering off;',patched)
        self.assertIn('proxy_set_header Host $host;',patched)
        self.assertEqual(patched[patched.index('    location /api/') :],CONFIG[CONFIG.index('    location /api/') :])
    def test_duplicate_upgrade_directives_are_replaced(self):
        old=CONFIG.replace('proxy_read_timeout 120s;', 'proxy_set_header Upgrade old;\n        proxy_set_header Connection old;\n        proxy_buffering on;')
        patched=patch_config(old,server_name='ide.innoprog.ru',location='/bot-api/',timeout='250s',websocket=True)
        self.assertNotIn(' old;',patched)
        self.assertEqual(patched.count('proxy_buffering'),1)
    def test_ordinary_timeout_patch_does_not_enable_websocket(self):
        patched=patch_config(CONFIG,server_name='ide.innoprog.ru',location='/bot-api/',timeout='250s')
        self.assertNotIn('Upgrade',patched)
    def test_wrong_target_fails_closed(self):
        with self.assertRaises(ValueError):patch_config(CONFIG,server_name='missing.test',location='/bot-api/',timeout='250s',websocket=True)
if __name__=='__main__':unittest.main()
