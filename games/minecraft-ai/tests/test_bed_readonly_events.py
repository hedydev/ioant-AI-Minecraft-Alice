import importlib.util,json,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('bed_readonly',Path(__file__).resolve().parents[1]/'scripts/alice-17879-bed-readonly.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class BedReadonlyEventsTest(unittest.TestCase):
    def test_current_process_events_keep_only_bounded_typed_outcomes(self):
        line='[Alice exploration] doorway approach outcome: '
        text=line+json.dumps({'reason':'approach_current_cell_unverified','attempted':False,
            'door':[9,8,7],'player':'private_name','token':'secret'})
        result=m.summarize_bed_log(text)
        self.assertEqual(result,[{'kind':'door_approach','reason':'approach_current_cell_unverified','attempted':False}])
        self.assertNotIn('secret',str(result));self.assertNotIn('private_name',str(result))
    def test_invalid_data_and_unrelated_messages_never_export(self):
        self.assertEqual(m.summarize_bed_log('[chat] private_name: token=secret'),[])
        prefix='[Alice Bedrock] verified job result: '
        rows=m.summarize_bed_log(prefix+'not-json\n'+prefix+'[]\n'+prefix+json.dumps({
            'reason':'raw private text','ok':'true','steps':True,'secret':'do_not_copy'}))
        self.assertEqual(rows,[{'kind':'job_result','reason':None}])
    def test_recent_history_has_a_strict_tail_bound(self):
        text='\n'.join('[Alice bed] explicit witnessed bed task: '+json.dumps({'reason':'stage_'+str(i)}) for i in range(30))
        out=m.summarize_bed_log(text)
        self.assertEqual(len(out),12);self.assertEqual(out[0]['reason'],'stage_18')
        compile(m.REMOTE,'<readonly>','exec')
