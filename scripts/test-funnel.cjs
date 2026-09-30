// Run against a local server. All external requests are blocked; no real leads or email.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.PTI_TEST_URL || 'http://127.0.0.1:8765';
const screenshots = process.env.PTI_SCREENSHOTS || '/private/tmp/pti-funnel-previews';
fs.mkdirSync(screenshots,{recursive:true});
const firebaseMock = `
window.__writes=[];
const firestore = function(){return {collection(name){return {add(payload){window.__writes.push({name,payload});return window.__saveFails ? Promise.reject(new Error('offline')) : Promise.resolve({id:'test'});}}}}};
firestore.FieldValue={serverTimestamp:()=>123};
const check = function(){return {activate(){}}};check.ReCaptchaEnterpriseProvider=function(){};
window.firebase={apps:[],initializeApp(){this.apps.push({});},appCheck:check,firestore};
`;
(async()=>{
 const browser = await chromium.launch();
 const errors=[];
 const ctx=await browser.newContext();
 await ctx.route('**/*',route=>{
   const url=route.request().url();
   if(url.startsWith(base)) return route.continue();
   if(url.includes('firebase-app-compat.js')) return route.fulfill({contentType:'text/javascript',body:firebaseMock});
   return route.abort();
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const width of [375,1440]){
   await page.setViewportSize({width,height:950});
   for(const path of ['/','/pricing/','/landlord-hours-audit/','/tenants/','/blog/first-rental-property-checklist/','/blog/atlanta-eviction-crisis-black-renters/','/resources/section-8/']){
     await page.goto(base+path);await page.waitForTimeout(100);
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
     assert.equal(overflow,false,`Horizontal overflow ${path} at ${width}`);
     assert.equal(await page.locator('h1').count(),1,`h1 ${path}`);
     if(await page.locator('#nav').count()) {
       assert(await page.locator('#nav a').first().isVisible(),`Logo missing ${path}`);
       assert(await page.locator('#nav .nav-cta').isVisible(),`CTA missing ${path}`);
     }
     await page.screenshot({path:screenshots+'/'+(path==='/'?'home':path.split('/').filter(Boolean).join('-'))+'-'+width+'.png',fullPage:true});
   }
 }
 await page.goto(base+'/pricing/?plan=summit#pricing-waitlist');
 assert.equal(await page.locator('[name=plan]').inputValue(),'summit');
 for(const path of ['/','/pricing/?plan=summit','/landlord-hours-audit/']){
   await page.goto(base+path);
   await page.locator('form[data-waitlist] [name=email]').fill('test@example.com');
   await page.locator('form[data-waitlist] [name=units]').selectOption({label:'6–20 units'});
   await page.evaluate(()=>window.__saveFails=true);
   await page.locator('form[data-waitlist] button').click();
   await page.waitForFunction(()=>document.querySelector('[data-form-status]').textContent.includes('not saved'));
   assert.equal(await page.evaluate(()=>dataLayer.filter(x=>x[0]==='event'&&x[1]==='signed_up').length),0);
   assert(await page.locator('form[data-waitlist] button').isEnabled());
   await page.evaluate(()=>window.__saveFails=false);
   await page.locator('form[data-waitlist] button').click();
   await page.waitForFunction(()=>document.querySelector('[data-form-status]').textContent.includes('signup is saved'));
   assert.equal(await page.evaluate(()=>dataLayer.filter(x=>x[0]==='event'&&x[1]==='signed_up').length),1);
   assert(await page.locator('form[data-waitlist] button').isDisabled());
   const payload=await page.evaluate(()=>__writes.filter(x=>x.name==='waitlist_submissions').at(-1).payload);
   assert.equal(payload.email,'test@example.com');
   if(path.includes('pricing'))assert.equal(payload.selectedPlan,'summit');
 }
 await page.goto(base+'/landlord-hours-audit/');
 assert(await page.locator('#calculator').isVisible());
 assert.notEqual(await page.locator('#r-hrs').textContent(),'—');
 const first=await page.locator('#r-hrs').textContent();
 await page.locator('#s-units').fill('12');await page.locator('#s-units').dispatchEvent('input');
 assert.notEqual(await page.locator('#r-hrs').textContent(),first);
 // Legacy forms: a blocked EmailJS script cannot invalidate a saved signup.
 for(const [path,id,success] of [['tenants','tenantWaitlistForm','tenantSuccess'],['merchants','merchantWaitlistForm','merchantSuccess'],['service-providers','spWaitlistForm','spSuccess'],['swarm-boss','swarmWaitlistForm','swarmSuccess']]){
  await page.goto(base+'/'+path+'/');
  const form=page.locator('#'+id);
  for(const field of await form.locator('input').all()){
   const type=await field.getAttribute('type');
   if(type==='url')await field.fill('https://example.com');
   else if(type==='email')await field.fill('test@example.com');
   else if(['checkbox','radio'].includes(type))await field.check();
   else if(type!=='hidden')await field.fill('Test');
  }
  for(const select of await form.locator('select').all()) {const value=await select.locator('option').evaluateAll(opts=>opts.find(x=>x.value&&!x.disabled)?.value);if(value)await select.selectOption(value);}
  await form.locator('button[type=submit]').click();
  await page.waitForFunction(id=>document.getElementById(id).style.display==='block',success);
  assert.equal(await page.evaluate(()=>dataLayer.filter(x=>x[0]==='event'&&x[1]==='signed_up').length),1);
 }
 // Total SDK failure must leave the audit functional and signup unsuccessful.
 await ctx.route('**/*firebase-app-compat.js',route=>route.abort());
 await page.goto(base+'/landlord-hours-audit/');
 assert(await page.locator('#calculator').isVisible());
 await page.locator('[name=email]').fill('test@example.com');await page.locator('[name=units]').selectOption({label:'1–5 units'});
 await page.locator('form[data-waitlist] button').click();
 assert((await page.locator('[data-form-status]').textContent()).includes('not saved'));
 assert.equal(await page.evaluate(()=>dataLayer.filter(x=>x[0]==='event'&&x[1]==='signed_up').length),0);
 // Every article header changed: exercise scrolling, which triggers legacy nav handlers.
 const overflows=[];
 for(const slug of (process.env.PTI_FLOWS_ONLY ? [] : fs.readdirSync('blog')).filter(x=>fs.existsSync('blog/'+x+'/index.html'))){
   await page.setViewportSize({width:375,height:812});
   const response=await page.goto(base+'/blog/'+slug+'/');
   assert.equal(response.status(),200,'Article response: '+slug);
   assert.equal(await page.locator('#nav').count(),1,'Article header: '+slug);
   await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
   await page.waitForTimeout(35);
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) overflows.push({slug,elements:await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(el=>el.getBoundingClientRect().right>innerWidth+2).slice(0,5).map(el=>({tag:el.tagName,cls:el.className,right:el.getBoundingClientRect().right}))) });
 }
 if(overflows.length) console.log(JSON.stringify(overflows,null,2));
 assert.deepEqual(overflows,[]);
 assert.deepEqual(errors,[]);
 console.log('PASS: mobile/desktop, headers, audit, plan handoff, saved/failed signups, unavailable Firebase and blocked EmailJS.');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
