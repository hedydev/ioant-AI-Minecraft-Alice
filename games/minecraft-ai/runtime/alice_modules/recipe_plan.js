// Deterministic recipe dependency inspection. A PLAN is not execution or an observed craft.
export function planMaterialNeeds(product,quantity,inventory,recipeFor,{maxDepth=8}={}){
 if(!/^[a-z0-9_]{1,80}$/.test(String(product))||!Number.isInteger(quantity)||quantity<1||quantity>128)
  throw new Error('Invalid target product or quantity');
 if(typeof recipeFor!=='function')throw new Error('Recipe resolver required');
 const stock=new Map(Object.entries(inventory||{}).filter(([,v])=>Number.isInteger(v)&&v>=0));
 const missing=new Map(),steps=[];let needTable=false;
 function requireItem(name,count,depth,ancestors){
  if(!Number.isInteger(count)||count<0||depth>maxDepth)throw new Error('Recipe dependency depth/count invalid');
  const used=Math.min(count,stock.get(name)||0);
  stock.set(name,(stock.get(name)||0)-used);
  const left=count-used;if(!left)return;
  if(ancestors.includes(name))throw new Error('Recipe cycle at '+name);
  const recipe=recipeFor(name);
  if(!recipe||!recipe.ingredients){missing.set(name,(missing.get(name)||0)+left);return;}
  const output=recipe.produced||1;
  if(!Number.isSafeInteger(output)||output<1||output>64)throw new Error('Invalid recipe output '+name);
  const times=Math.ceil(left/output);
  if(times>128)throw new Error('Recipe repetition limit '+name);
  if(recipe.requiresTable)needTable=true;
  for(const [ingredient,n] of Object.entries(recipe.ingredients)){
   if(!Number.isSafeInteger(n)||n<=0||n>64)throw new Error('Invalid recipe ingredient count '+ingredient);
   requireItem(ingredient,n*times,depth+1,[...ancestors,name]);
  }
  steps.push({item:name,times,expected:output*times,requiresTable:Boolean(recipe.requiresTable)});
  stock.set(name,(stock.get(name)||0)+(output*times-left));
 }
 requireItem(product,quantity,0,[]);
 if(needTable&&product!=='crafting_table'&&!steps.some(s=>s.item==='crafting_table')){
  const original=[...steps];steps.length=0;
  requireItem('crafting_table',1,0,[]);
  steps.push(...original);
 }
 return {product,quantity,missing:Object.fromEntries(missing),steps,
  requiresTable:needTable,materialsAvailable:missing.size===0};
}
