import { waitForItemIncrease } from './task_observation.js';
import * as mc from '../../utils/mcdata.js';
import * as skills from '../library/skills.js';

// Recipes are authoritative Minecraft knowledge. Alice learns which paths actually
// work in her inventory/world and records the measured outcome, never arbitrary JS.
export function discoverRecipe(itemName, inventory = {}) {
  const recipes=mc.getItemCraftingRecipes(itemName) || [];
  if (!recipes.length) return null;
  const ranked=recipes.map(([ingredients,result])=>{
    const missing=Object.entries(ingredients).reduce((sum,[name,count])=>
      sum+Math.max(0,count-(inventory[name]||0)),0);
    return {ingredients, produced:result?.craftedCount||1, missing};
  }).sort((a,b)=>a.missing-b.missing);
  return {itemName, ...ranked[0], alternatives:recipes.length};
}

export async function craftAndLearn(agent, itemName, times=1) {
  const bot=agent.bot, inventory={};
  for (const item of bot.inventory.items()) inventory[item.name]=(inventory[item.name]||0)+item.count;
  const recipe=discoverRecipe(itemName,inventory);
  if (!recipe) {
    console.warn('[Alice craft] unknown recipe for '+itemName);
    return false;
  }
  console.log('[Alice craft] discovered '+itemName+' recipe: '+JSON.stringify(recipe.ingredients)+
    '; missing='+recipe.missing+'; alternatives='+recipe.alternatives);
  const before=inventory[itemName]||0;
  let success=false;
  try {
    const action=await skills.craftRecipe(bot,itemName,times);
    // Inventory slot updates can arrive after Mineflayer's craft promise resolves.
    // Wait briefly for an observable product rather than learning from text output.
    const actual=await waitForItemIncrease(bot,itemName,before);
    success=Boolean(action && actual>before && bot.health>0);
    console.log('[Alice craft] '+itemName+' result='+(success?'verified':'unverified')+
      ' before='+before+' after='+actual);
  } catch(err) {
    console.warn('[Alice craft] '+itemName+' failed: '+String(err));
  }
  agent.aliceCore?.learning?.recordKnowledge('recipe_'+itemName,success,{
    ingredients:recipe.ingredients,alternatives:recipe.alternatives,missingAtStart:recipe.missing
  });
  return success;
}
