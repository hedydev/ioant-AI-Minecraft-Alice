'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {groupNearbyEntities}=require('../../../dashboard/world_entities.js');
const root=path.resolve(__dirname,'../../../dashboard');
test('bounded entity feed collapses arrows without claiming server totals',()=>{
  const observed=[
    {kind:'zombie',position:[7,69,-10]},
    {kind:'arrow',position:[5,69,-5]},
    {kind:'arrow',position:[8,69,-7]},
    {kind:'arrow',position:[6,69,-6]},
    {kind:'arrow',position:[10,69,-8]}
  ];
  const rows=groupNearbyEntities(observed,[6,69,-6]);
  assert.equal(rows.length,2);
  assert.deepEqual(rows[0],{kind:'zombie',itemName:null,count:1,position:[7,69,-10]});
  assert.equal(rows[1].count,4);
  assert.deepEqual(rows[1].position,[6,69,-6],'representative is closest observed arrow');
});
test('different observed drops do not combine and unknown item remains unknown',()=>{
  const rows=groupNearbyEntities([
    {kind:'item',itemName:'oak_log',position:[0,70,0]},
    {kind:'item',itemName:'oak_log',position:[1,70,0]},
    {kind:'item',itemName:'spruce_log',position:[2,70,0]},
    {kind:'item',position:[3,70,0]},
    {kind:'item',itemName:'not a valid item',position:[4,70,0]},
    {kind:'arrow',position:[4,70,1]}
  ],[0,70,0]);
  assert.equal(rows.length,4);
  assert.deepEqual(rows.map(x=>x.count),[2,1,2,1]);
  assert.equal(rows[2].itemName,null);
});
test('malformed entities cannot inject arbitrary names or coordinates into the view',()=>{
  const rows=groupNearbyEntities([
    {kind:'<script>',position:[0,0,0]},
    {kind:'arrow',position:[Infinity,0,0]},
    {kind:'arrow',position:[1,2]},
    null,
    {kind:'arrow',position:[0,0,0]}
  ],null);
  assert.equal(rows.length,1);assert.equal(rows[0].count,1);
});
test('layout keeps HUD outside canvas and puts entity list inside fixed scroll region',()=>{
  const markup=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const css=fs.readFileSync(path.join(root,'world.css'),'utf8');
  const scripts=markup.indexOf('src="./world_entities.js"');
  const renderer=markup.indexOf('src="./world.js"');
  assert(scripts>0&&scripts<renderer,'group helper loaded before renderer');
  const stage=markup.slice(markup.indexOf('<div class="world-stage">'));
  assert(stage.indexOf('class="world-hud"')<stage.indexOf('id="world-canvas"'),'HUD is before canvas');
  assert.match(css,/\.world-hud\{position:relative;/);
  assert.match(css,/\.world-entities\{[^}]*height:220px;[^}]*overflow-y:auto;/);
  assert.match(css,/\.world-entities\{[^}]*overscroll-behavior:contain;/);
});
