import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from threading import Thread
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

remote=load('remote_logs',ROOT/'dashboard'/'remote_logs.py')
server=load('dashboard_server',ROOT/'dashboard'/'server.py')
world=load('dashboard_remote_world',ROOT/'dashboard'/'remote_world.py')

class NginxLanBindingTests(unittest.TestCase):
    def test_launcher_bash_syntax(self):
        import shutil
        import subprocess
        if not shutil.which('bash'):
            self.skipTest('bash unavailable')
        result=subprocess.run(['bash','-n',str(ROOT/'scripts'/'run-dashboard.sh')],
                              capture_output=True,text=True,timeout=8)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_public_nginx_frontend_and_local_only_backend(self):
        script=(ROOT/'scripts'/'run-dashboard.sh').read_text()
        self.assertIn('listen 0.0.0.0:$WEB_PORT;',script)
        self.assertIn('server_name _;',script)
        self.assertIn('proxy_pass http://127.0.0.1:$API_PORT;',script)
        self.assertIn('proxy_set_header Host 127.0.0.1:$API_PORT;',script)
        self.assertNotIn('auth_basic ',script)
        # macOS Bash 3.2 with set -u can treat adjacent non-ASCII
        # punctuation as part of an unbraced parameter name.
        self.assertIn('0.0.0.0:${WEB_PORT}；',script)
        self.assertIn('127.0.0.1:${API_PORT}。',script)
        self.assertNotIn('$WEB_PORT；',script)
        self.assertNotIn('$API_PORT。',script)
        backend=(ROOT/'dashboard'/'server.py').read_text()
        self.assertIn('ThreadingHTTPServer(("127.0.0.1", port), Handler)',backend)

class RemoteLogTests(unittest.TestCase):
    def test_list_tail_download_and_reject_traversal(self):
        with tempfile.TemporaryDirectory() as d:
            directory=Path(d)
            old=directory/'run-20261018T050000Z.log'
            new=directory/'run-20261018T060000Z.log'
            old.write_bytes(b'older')
            new.write_bytes(b'newest\n')
            (directory/'secret.json').write_text('SENSITIVE')
            logs=json.loads(remote.handle('list',directory=directory))['logs']
            self.assertEqual([a['name'] for a in logs],[new.name,old.name])
            self.assertEqual(remote.handle('download',new.name,directory),'newest\n'.encode())
            self.assertEqual(json.loads(remote.handle('tail',new.name,directory))['text'],'newest\n')
            with self.assertRaisesRegex(ValueError,'Invalid log name'):
                remote.handle('download','../../secret.json',directory)
            external=Path(d).parent/'unsafe-link-alice-test.log'
            try:
                link=directory/'run-20261018T070000Z.log'
                link.symlink_to(external)
                with self.assertRaisesRegex(ValueError,'unsafe path'):
                    remote.handle('tail',link.name,directory)
            finally:
                if external.exists(): external.unlink()


class ObservedWorldCoverageTests(unittest.TestCase):
    def test_world_labels_actual_mint_radius_and_scanned_including_air(self):
        html=(ROOT/'dashboard'/'index.html').read_text()
        script=(ROOT/'dashboard'/'world.js').read_text()
        self.assertIn('id="world-sample-detail"',html)
        self.assertIn('采样 / 非空气方块',html)
        self.assertIn('side*side*layers',script)
        self.assertIn('scanned===expected',script)
        self.assertIn('radius<15',script)
        self.assertIn('Mint 仍在使用旧采样器',script)
        self.assertIn('scout_bds_position_unavailable',script)
        # Sampling coverage is independent of Canvas styling. The visual
        # regression below intentionally rejects the removed edge-mask fade.
        self.assertNotIn('horizontalFade',script)
        self.assertNotIn('bottomFade',script)

class FollowWebRefreshTests(unittest.TestCase):
    def test_refresh_restores_verified_live_follow_not_browser_session(self):
        script=(ROOT/'dashboard'/'world.js').read_text()
        html=(ROOT/'dashboard'/'index.html').read_text()
        self.assertIn("players.includes(run.followTarget)?run.followTarget:null",script)
        self.assertIn("else if(followed)select.value=followed;",script)
        self.assertIn("if(players.includes(current))select.value=current;",script)
        self.assertIn("setText('world-current-follow'",script)
        self.assertIn('id="world-current-follow"',html)
        self.assertIn('实际移动尚未通过 BDS 验证',script)
        self.assertNotIn("localStorage.setItem('world-command-target'",script)

class ExpandedWorldTransportTests(unittest.TestCase):

    def test_expanded_world_transport_bounds_match_native_snapshot(self):
        native=(ROOT/'bedrock-native'/'experiment'/'src'/'world_view.cjs').read_text()
        reader=(ROOT/'dashboard'/'remote_world.py').read_text()
        backend=(ROOT/'dashboard'/'server.py').read_text()
        self.assertIn('RADIUS=15,BELOW=6,ABOVE=5,MAX_BYTES=512*1024',native)
        self.assertIn('LIMIT = 512 * 1024',reader)
        self.assertIn('len(data["voxels"]) > 12000',reader)
        self.assertIn("len(result.stdout) > 512 * 1024",backend)


class BedrockAcceptanceExportTests(unittest.TestCase):
    def sample_zip(self, hours=3):
        import io
        import zipfile
        stream=io.BytesIO()
        with zipfile.ZipFile(stream,'w') as z:
            z.writestr('manifest.json',json.dumps({'requestedHours':hours}))
            z.writestr('events.jsonl','{"kind":"sample"}\\n')
        return stream.getvalue()

    def test_bedrock_export_rejects_unsafe_requests_and_validates_zip(self):
        from types import SimpleNamespace
        with self.assertRaisesRegex(ValueError,'Invalid export time'):
            server.remote_acceptance(0)
        sample=self.sample_zip()
        calls=[]
        def fake(args, **kwargs):
            calls.append((args,kwargs))
            return SimpleNamespace(returncode=0,stdout=sample)
        self.assertEqual(server.remote_acceptance(3,runner=fake),sample)
        self.assertEqual(calls[0][0][-1],'python3 - --hours 3')
        self.assertIn(b'create_archive',calls[0][1]['input'])
        def bad(args,**kwargs):
            return SimpleNamespace(returncode=0,stdout=b'NOT_A_ZIP')
        with self.assertRaisesRegex(ValueError,'Invalid Bedrock acceptance ZIP'):
            server.remote_acceptance(3,runner=bad)
        with self.assertRaisesRegex(ValueError,'Mismatched acceptance ZIP'):
            server.remote_acceptance(6,runner=fake)

    def test_nginx_restricts_bedrock_zip_to_mac_loopback(self):
        script=(ROOT/'scripts'/'run-dashboard.sh').read_text()
        self.assertIn('location ~ ^/api/acceptance/',script)
        self.assertIn('allow 127.0.0.1;',script)
        self.assertIn('limit_except GET { deny all; }',script)

class APITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.thread=Thread(target=cls.http.serve_forever,daemon=True)
        cls.thread.start()
        cls.base='http://127.0.0.1:'+str(cls.http.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()

    def request(self,path,method='GET',host=None):
        req=Request(self.base+path,method=method,headers={'Host':host or '127.0.0.1:'+str(self.http.server_port)})
        try:
            with urlopen(req,timeout=2) as resp:
                return resp.status,resp.read()
        except HTTPError as err:
            with err:
                return err.code,err.read()

    def test_health_catalog_and_block_write(self):
        self.assertEqual(self.request('/api/health')[0],200)
        code,data=self.request('/api/catalog')
        self.assertEqual(code,200)
        self.assertGreaterEqual(len(json.loads(data)['commands']),10)
        self.assertEqual(self.request('/api/health','POST')[0],405)
        self.assertEqual(self.request('/api/health',host='evil.example')[0],403)

    def test_world_get_is_read_only_and_no_published_state_stays_unknown(self):
        data=b'{"online":false,"ageMs":null,"view":null}'
        with patch.object(server,'remote_world',return_value=data) as tool:
            status,body=self.request('/api/world')
            self.assertEqual(status,200)
            self.assertEqual(json.loads(body)['view'],None)
            tool.assert_called_once_with()
        self.assertEqual(self.request('/api/world','POST')[0],405)
        self.assertEqual(self.request('/api/world?path=/etc/passwd')[0],400)

    def test_log_whitelist_and_ssh_error_is_bounded(self):
        self.assertEqual(self.request('/api/logs/secrets.json/download')[0],400)
        self.assertEqual(self.request('/api/logs/run-20261018T060000Z.log/download?path=foo')[0],400)
        with patch.object(server,'remote_read',side_effect=ConnectionError('SSH unavailable')):
            code,response=self.request('/api/logs')
            self.assertEqual(code,502)
            self.assertIn('SSH unavailable',json.loads(response)['error'])

    def test_mock_ssh_command_is_only_read_access(self):
        class Result:
            returncode=0
            stdout=b'{"logs":[]}'
            stderr=b''
        calls=[]
        def fake(args,**kwargs):
            calls.append((args,kwargs))
            return Result()
        data=server.remote_read('list',runner=fake)
        self.assertEqual(json.loads(data),{'logs':[]})
        args,kwargs=calls[0]
        self.assertEqual(args[0],'ssh')
        self.assertIn('BatchMode=yes',args)
        self.assertEqual(args[-1],'python3 - list --instance mindcraft-alice')
        self.assertIn(b'Read-only Mint log access',kwargs['input'])
        with self.assertRaises(ValueError):
            server.remote_read('download','../../private.key',runner=fake)
        self.assertEqual(len(calls),1)
        with patch.object(server,'INSTANCE','../other'):
            with self.assertRaisesRegex(ValueError,'instance name'):
                server.remote_read('list',runner=fake)
        self.assertEqual(len(calls),1)


control=load('remote_control', ROOT/'dashboard'/'remote_control.py')

class RemoteLiveControlTests(unittest.TestCase):
    def test_only_approved_settings_and_atomic_revisioned_merge(self):
        with tempfile.TemporaryDirectory() as directory:
            d=Path(directory)
            self.assertEqual(control.config(d)['settings']['followDistance'],3)
            self.assertEqual(control.config(d)['settings']['agentMode'],'companion')
            legacy={'revision':12,'settings':{'followDistance':3,'occludedDistance':4,'autonomyEnabled':True}}
            (d/'settings.json').write_text(json.dumps(legacy))
            self.assertEqual(control.config(d)['settings']['agentMode'],'companion')
            (d/'settings.json').unlink()
            x=control.patch_settings({'followDistance':2},d)
            self.assertEqual(x['revision'],1)
            self.assertEqual(x['settings']['occludedDistance'],4)
            self.assertEqual(control.patch_settings({'followDistance':2},d)['revision'],1)
            self.assertEqual(control.patch_settings({'autonomyEnabled':False},d)['revision'],2)
            self.assertEqual(control.config(d)['settings']['autonomyEnabled'],False)
            self.assertEqual(control.patch_settings({'agentMode':'autonomous'},d)['revision'],3)
            self.assertEqual(control.config(d)['settings']['agentMode'],'autonomous')
            self.assertEqual((d/'settings.json').stat().st_mode&0o777,0o600)
            for invalid in ({'safetyEnabled':False},{'followDistance':True},
                            {'followDistance':13},{'occludedDistance':1},
                            {'autonomyEnabled':'false'},{'agentMode':'rogue'},{}):
                with self.assertRaises(ValueError):
                    control.patch_settings(invalid,d)
            self.assertEqual(control.config(d)['revision'],3)
            # A process that has not written a current heartbeat is NEVER claimed online.
            self.assertFalse(control.status(d)['online'])
            (d/'status.json').write_text(json.dumps({'updatedAt':0,'connected':True,'revision':2}))
            self.assertFalse(control.status(d)['online'])

    def test_connection_history_never_exposes_account_or_credential_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            d=Path(directory)
            self.assertEqual(control.connection_history(d)["runs"], [])
            payload=[
                {"startedAt":1792360000000,"mode":"legacy-chat-only","phase":"spawn_confirmed",
                 "result":"spawned","XUID":"PRIVATE_XUID","token":"private_jwt",
                 "login":{"deviceOS":12,"gameVersion":"1.26.51",
                          "userChainNameMatches":True,"certificatePublicKeyMatches":True,
                          "userChainHeaderKeyMatches":True,"xuid":"private_xuid"}},
                {"startedAt":1792360000500,"mode":"legacy-native-injected","phase":"login_sent",
                 "result":"server_id_conflict","reason":"server_id_conflict",
                 "login":{"deviceOS":2,"gameVersion":"1.26.51",
                          "userChainNameMatches":True,"certificatePublicKeyMatches":False,
                          "userChainHeaderKeyMatches":False,"cert":"private_token"}}
            ]
            (d/'connection-audit.json').write_text(json.dumps(payload))
            history=control.connection_history(d)
            self.assertEqual(len(history["runs"]),2)
            self.assertEqual(history["latestChange"],[
                "deviceOS","certificatePublicKeyMatches","userChainHeaderKeyMatches"])
            raw=json.dumps(history)
            self.assertNotIn("PRIVATE_XUID",raw)
            self.assertNotIn("private_xuid",raw)
            self.assertNotIn("private_jwt",raw)
            self.assertNotIn("private_token",raw)
            self.assertEqual(json.loads(control.handle("history",root=d)),history)
            with self.assertRaises(ValueError):
                control.handle("history","forbidden-arg",d)

    def test_remote_base64_payload_never_becomes_a_command(self):
        import base64
        with tempfile.TemporaryDirectory() as directory:
            d=Path(directory)
            raw=base64.urlsafe_b64encode(b'{"followDistance":3}').decode().rstrip('=')
            value=json.loads(control.handle('set',raw,d))
            self.assertEqual(value['saved']['revision'],0)
            self.assertEqual(json.loads(control.handle('status',root=d))['configured']['revision'],0)
            with self.assertRaises(ValueError):
                control.handle('set','not?base64',d)
            with self.assertRaises(ValueError):
                control.handle('restart',root=d)
            with self.assertRaises(ValueError):
                control.patch_settings({'followDistance':4,'arbitrary':'/etc/passwd'},d)

    def test_ssh_invocation_contains_only_approved_action_and_encoded_json(self):
        class Result:
            returncode=0
            stdout=b'{"configured":{"revision":0}}'
            stderr=b''
        calls=[]
        def fake(args,**kwargs):
            calls.append((args,kwargs))
            return Result()
        data=server.remote_control('status',runner=fake)
        self.assertEqual(json.loads(data)['configured']['revision'],0)
        server.remote_control('history',runner=fake)
        self.assertEqual(calls[-1][0][-1],'python3 - history')
        server.remote_control('set',{'followDistance':3},runner=fake)
        self.assertTrue(calls[-1][0][-1].startswith('python3 - set '))
        # Verify the approved, fixed SSH script is supplied verbatim.
        # Do not bind the test to a mutable prose sentence or field count.
        self.assertEqual(calls[-1][1]['input'], (ROOT/'dashboard'/'remote_control.py').read_bytes())
        server.remote_control('set',{'agentMode':'autonomous'},runner=fake)
        self.assertTrue(calls[-1][0][-1].startswith('python3 - set '))
        self.assertNotIn('autonomous',calls[-1][0][-1], 'mode travels only as base64 JSON, never shell syntax')
        with self.assertRaises(ValueError):
            server.remote_control('set',{'safetyEnabled':False},runner=fake)
        self.assertEqual(len(calls),4)

class LiveControlAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.thread=Thread(target=cls.http.serve_forever,daemon=True)
        cls.thread.start()
        cls.base='http://127.0.0.1:'+str(cls.http.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join()

    def post(self,origin,body,content_type='application/json'):
        data=json.dumps(body).encode()
        req=Request(self.base+'/api/control/settings',data=data,method='POST',
                    headers={'Origin':origin,'Content-Type':content_type})
        try:
            with urlopen(req,timeout=2) as response:
                return response.status,response.read()
        except HTTPError as error:
            with error:
                return error.code,error.read()

    def test_bedrock_login_history_get_is_read_only(self):
        data=b'{"runs":[],"hasSuccessfulBaseline":false,"latestChange":[]}'
        with patch.object(server,'remote_control',return_value=data) as tool:
            with urlopen(self.base+'/api/control/history',timeout=2) as resp:
                self.assertEqual(resp.status,200)
                self.assertEqual(json.loads(resp.read())['runs'],[])
            tool.assert_called_once_with('history')
    def test_origin_content_type_and_no_raw_command_endpoints(self):
        with patch.object(server,'remote_control',return_value=b'{"saved":{"revision":1}}') as tool:
            code,_=self.post('https://hostile.example',{'followDistance':2})
            self.assertEqual(code,403)
            code,_=self.post('http://127.0.0.1:8788',{'followDistance':2},'text/plain')
            self.assertEqual(code,415)
            invalid=[
                {'safetyEnabled':False},
                {'followDistance':1},
                {'followDistance':13},
                {'occludedDistance':0},
                {'followDistance':2.5},
                {'followDistance':True},
                {'followDistance':'3'},
                {'autonomyEnabled':'false'},
                {'autonomyEnabled':1},
                {'agentMode':'unsafe'},
                {'agentMode':True},
                {'agentMode':3},
                {'followDistance':3,'safetyEnabled':False},
                {},
                ['followDistance',3],
                None,
            ]
            for payload in invalid:
                with self.subTest(payload=payload):
                    code,_=self.post('http://127.0.0.1:8788',payload)
                    self.assertEqual(code,400)
                    self.assertEqual(tool.call_count,0,'invalid input must not reach SSH')
            code,body=self.post('http://127.0.0.1:8788',{'followDistance':2})
            self.assertEqual(code,200)
            self.assertEqual(json.loads(body)['saved']['revision'],1)
            tool.assert_called_once_with('set',{'followDistance':2})
            tool.reset_mock()
            code,body=self.post('http://127.0.0.1:8788',{'agentMode':'autonomous'})
            self.assertEqual(code,200)
            self.assertEqual(json.loads(body)['saved']['revision'],1)
            tool.assert_called_once_with('set',{'agentMode':'autonomous'})


class WorldViewTests(unittest.TestCase):
    def test_read_only_world_snapshot_freshness_and_local_path_only(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            self.assertFalse(world.read(root, clock=lambda: 10000)['online'])
            path=root/'world-view.json'
            data={'version':1,'connected':True,'observedAt':9500,'origin':[1,70,3],
                  'alice':{'local':[1.1,70,3.1],'server':None},
                  'palette':['air','stone'],'voxels':[[0,-1,0,1]],'entities':[],'events':[]}
            path.write_text(json.dumps(data))
            self.assertTrue(world.read(root,clock=lambda:10000)['online'])
            self.assertEqual(world.read(root,clock=lambda:10000)['ageMs'],500)
            self.assertFalse(world.read(root,clock=lambda:25000)['online'])
            data['connected']=False;path.write_text(json.dumps(data))
            self.assertFalse(world.read(root,clock=lambda:10000)['online'])
            path.unlink()
            target=root/'actual'
            target.write_text(json.dumps(data))
            path.symlink_to(target)
            with self.assertRaisesRegex(ValueError,'Unsafe'):
                world.read(root,clock=lambda:10000)

    def test_world_ssh_bridge_has_fixed_read_only_command(self):
        class Result:
            returncode=0
            stdout=b'{"online":false,"view":null}'
            stderr=b''
        calls=[]
        def runner(args,**kwargs):
            calls.append((args,kwargs))
            return Result()
        response=server.remote_world(runner=runner)
        self.assertEqual(json.loads(response)['online'],False)
        self.assertEqual(calls[0][0][-1],'python3 -')
        self.assertIn(b'No path arguments',calls[0][1]['input'])
        self.assertEqual(len(calls),1)

class ConsoleCommandBridgeTests(unittest.TestCase):
    def test_no_player_identity_in_console_and_strict_commands(self):
        import base64
        for input_text in ('跟着我','跟随我','保护我'):
            result=control.parse_command({'text':input_text})
            self.assertEqual(result['status'],'rejected')
            self.assertEqual(result['reason'],'missing_target')
        self.assertEqual(control.parse_command({'text':'跟随 Steve'}),
                         {'action':'follow','target':'Steve'})
        self.assertEqual(control.parse_command({'text':'保护 MolarParsley191'}),
                         {'action':'guard','target':'MolarParsley191'})
        self.assertEqual(control.parse_command({'text':'收集3个木头'}),
                         {'action':'gather_wood','count':3})
        self.assertEqual(control.parse_command({'text':'停止'}),{'action':'stop'})
        self.assertEqual(control.parse_command({'text':'制作木剑'}),{'action':'craft_sword'})
        self.assertEqual(control.parse_command({'text':'吃东西'}),{'action':'eat'})
        self.assertEqual(control.parse_command({'text':'安全试走'}),{'action':'probe_step'})
        self.assertEqual(control.parse_command({'text':'跟随 ../../root'})['reason'],'unsupported_command')
        self.assertEqual(control.parse_command({'text':'/op Steve'})['status'],'rejected')
        with self.assertRaises(ValueError):
            control.parse_command({'text':'跟随 Steve','script':'rm -rf /'})
        with tempfile.TemporaryDirectory() as directory:
            d=Path(directory)
            rejected=json.loads(control.handle('command',base64.urlsafe_b64encode(
                json.dumps({'text':'跟着我'}).encode()).decode().rstrip('='),d))
            self.assertEqual(rejected['reason'],'missing_target')
            self.assertFalse((d/'command.json').exists())

    def test_only_live_process_accepts_queued_command_then_receipt(self):
        import time
        with tempfile.TemporaryDirectory() as directory:
            d=Path(directory)
            offline=control.queue_command({'text':'停止'},d)
            self.assertEqual(offline['reason'],'alice_offline')
            self.assertFalse((d/'command.json').exists())
            (d/'status.json').write_text(json.dumps({'updatedAt':int(time.time()*1000),
                                                      'connected':True}))
            queued=control.queue_command({'text':'跟随 Steve'},d)
            self.assertEqual(queued['status'],'queued')
            self.assertEqual(len(queued['id']),32)
            self.assertEqual(json.loads((d/'command.json').read_text())['target'],'Steve')
            self.assertEqual((d/'command.json').stat().st_mode&0o777,0o600)
            blocked=control.queue_command({'text':'收集3个木头'},d)
            self.assertEqual(blocked['reason'],'command_pending')
            # An emergency STOP must supersede a queued command immediately.
            urgent=control.queue_command({'text':'停止'},d)
            self.assertEqual(urgent['status'],'queued')
            self.assertNotEqual(urgent['id'],queued['id'])
            (d/'command-result.json').write_text(json.dumps({
                'id':urgent['id'],'action':'stop','status':'completed',
                'reason':'follow_intent_set','message':'not server proof',
                'updatedAt':int(time.time()*1000)}))
            self.assertEqual(control.status(d)['commandResult']['status'],'completed')
            self.assertEqual(control.queue_command({'text':'停止'},d)['status'],'queued')

    def test_ssh_payloads_are_typed_encoded_and_no_player_impersonation(self):
        class Result:
            returncode=0
            stdout=b'{"status":"rejected","reason":"missing_target"}'
            stderr=b''
        calls=[]
        def runner(args,**kw):
            calls.append(args)
            return Result()
        result=server.remote_control('command',{'text':'跟着我'},runner=runner)
        self.assertEqual(json.loads(result)['reason'],'missing_target')
        self.assertIn('python3 - command ',calls[0][-1])
        self.assertNotIn('跟着我',calls[0][-1])
        with self.assertRaises(ValueError):
            server.remote_control('command',{'shell':'shutdown'},runner=runner)
        self.assertEqual(len(calls),1)

    def test_console_write_stays_loopback_only_and_same_origin(self):
        from urllib.error import HTTPError
        from urllib.request import Request,urlopen
        http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        thread=Thread(target=http.serve_forever,daemon=True);thread.start()
        base='http://127.0.0.1:'+str(http.server_port)
        def post(origin,payload):
            req=Request(base+'/api/control/command',method='POST',
                        data=json.dumps(payload).encode(),
                        headers={'Origin':origin,'Content-Type':'application/json'})
            try:
                with urlopen(req,timeout=2) as resp:return resp.status
            except HTTPError as e:return e.code
        try:
            with patch.object(server,'remote_control',
                              return_value=b'{"status":"rejected","reason":"missing_target"}') as bridge:
                self.assertEqual(post('https://evil.example',{'text':'跟着我'}),403)
                self.assertEqual(post('http://127.0.0.1:8788',{'command':'rm'}),400)
                self.assertEqual(post('http://127.0.0.1:8788',{'text':'跟着我'}),200)
                bridge.assert_called_once_with('command',{'text':'跟着我'})
            nginx=(ROOT/'scripts'/'run-dashboard.sh').read_text()
            self.assertIn('location = /api/control/command {',nginx)
            self.assertIn('allow 127.0.0.1;',nginx)
        finally:
            http.shutdown();http.server_close();thread.join()

if __name__=='__main__':unittest.main()

class WorldViewportClarityTests(unittest.TestCase):
    def test_3d_viewport_has_bounded_aspect_ratio_and_no_terrain_edge_mask(self):
        css=(ROOT/'dashboard'/'world.css').read_text()
        js=(ROOT/'dashboard'/'world.js').read_text()
        self.assertIn('aspect-ratio:16/10',css)
        self.assertIn('max-height:620px',css)
        self.assertIn('aspect-ratio:4/3',css)
        self.assertIn('const alpha=isSoft(name)?0.7:1',js)
        self.assertNotIn('horizontalFade',js)
        self.assertIn('formatVital(lifeValue)',js)
        self.assertIn('formatVital(foodValue)',js)


class WorldIdleTruthTests(unittest.TestCase):
    def test_navigation_block_preserves_factual_idle_and_no_fake_movement(self):
        ui=(ROOT/'dashboard'/'world.js').read_text()
        self.assertIn("positionBlocked=run?.state==='IDLE'",ui)
        self.assertIn("位置安全阻塞 · 等待独立 BDS 见证",ui)
        self.assertIn("setText('world-state',view.alice.state||'IDLE')",ui)
        self.assertIn("holdAge<180000",ui)
        self.assertNotIn("setText('world-state','MOVING')",ui)

class HomeObservationDashboardTests(unittest.TestCase):
    def test_transient_shelter_and_persistent_home_are_separate(self):
        html=(ROOT/'dashboard'/'index.html').read_text()
        js=(ROOT/'dashboard'/'world.js').read_text()
        for key in ('world-home-observed','world-home-observed-detail',
                    'world-home-established','world-home-route',
                    'world-bed-reach','world-bed-gate'):
            self.assertIn('id="'+key+'"',html)
            self.assertIn("setText('"+key+"'",js)
        self.assertIn("home.lastSurvey==='observed_indoor_home_candidate'",js)
        self.assertIn('age<=45000',js)
        self.assertIn("home.status==='observed_candidate_not_route_verified'",js)
        self.assertIn('home.exitVerified===true&&home.returnVerified===true',js)
        self.assertIn('attempt.positionGate',js)
        self.assertIn('attempt.bedReach',js)

class BedApproachReadOnlyDashboardTests(unittest.TestCase):
    def test_never_promote_observed_route_to_verified_movement(self):
        html=(ROOT/'dashboard'/'index.html').read_text()
        js=(ROOT/'dashboard'/'world.js').read_text()
        self.assertIn('id="world-bed-approach"',html)
        self.assertIn('id="world-bed-approach-detail"',html)
        self.assertIn("bedPlan.status==='observed_route_candidate'",js)
        self.assertIn('仍需每段独立BDS位置验证',js)
