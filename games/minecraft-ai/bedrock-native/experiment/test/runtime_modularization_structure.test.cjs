'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'../src')
const features=path.join(root,'features')
const lines=file=>fs.readFileSync(file,'utf8').split(/\r?\n/).length
function modules(dir,found=[]){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,entry.name)
  if(entry.isDirectory())modules(full,found)
  else if(entry.isFile()&&entry.name.endsWith('.cjs'))found.push(full)
 }
 return found
}
test('core runtime stays below a one-thousand-line orchestration budget',()=>{
 const n=lines(path.join(root,'runtime.cjs'))
 assert(n<=1000,'runtime.cjs grew to '+n+' lines: extract cohesive feature methods')
})
test('feature files stay within eight hundred lines, not new monoliths',()=>{
 const entries=modules(features)
 assert(entries.length>=10,'required feature modules are missing')
 for(const file of entries){
  const n=lines(file)
  assert(n<=800,path.relative(root,file)+' grew to '+n+' lines: split cohesive responsibilities')
 }
})
test('named domain folders and architecture ownership guide are tracked',()=>{
 for(const name of ['autonomy','bed','commands','door','navigation','safety','tasks']){
  assert(fs.statSync(path.join(features,name)).isDirectory(),name)
 }
 assert(fs.statSync(path.join(features,'README.md')).isFile())
})
