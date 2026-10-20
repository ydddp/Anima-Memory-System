const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const source = path.resolve(process.env.ANIMA_SOURCE_ROOT || path.join(__dirname, '..'));
assert(process.env.SILLYTAVERN_ROOT, 'Set SILLYTAVERN_ROOT to a SillyTavern checkout (for browser assets).');
const host = path.resolve(process.env.SILLYTAVERN_ROOT);
const output = process.env.ANIMA_UI_OUTPUT;
const consumers = [
  ['summary.js', 'anima_regex_list_pre', 'regexComponentPre', 'anima_btn_open_regex_modal_pre', 'regex_strings'],
  ['summary.js', 'anima_regex_list_post', 'regexComponentPost', 'anima_btn_open_regex_modal_post', 'output_regex'],
  ['status.js', 'status_regex_list_container', 'regexComponent', 'btn-add-status-regex', 'regex_list'],
  ['rag.js', 'rag_regex_list', 'regexComponent', 'rag_btn_open_regex_modal', 'regex_strings'],
  ['bm25.js', 'bm25_regex_list', 'bm25RegexList', 'bm25_btn_open_regex_modal', 'regex_list'],
  ['status_gc_ui.js', 'gc_regex_list_container', 'gcRegexComponent', 'btn-gc-add-regex', 'regex_list'],
];
const rules = [
  { type:'extract', regex:' /<content>(.*?)<\\/content>/gs ', enabled:true, privateOption:7 },
  { type:'exclude', regex:'/<!--[\\s\\S]*?-->/g', enabled:true },
  { type:'extract', regex:'/<(正文|content|story_content)\\b[^>]*>([\\s\\S]*?)<\\/\\1>/g', enabled:false },
];
const read = file => fs.readFileSync(path.join(source,'scripts',file),'utf8').replace(/\r\n/g,'\n');
function binding(code, button) {
  const line = code.split('\n').find(line => line.includes(`#${button}`) && (line.includes('$("') || line.includes('$tab.find')));
  assert(line, `Missing add binding: ${button}`);
  const start = code.indexOf(line.trim());
  const end = code.indexOf('\n  });',start);
  assert(end > start, `Missing binding end: ${button}`);
  return code.slice(start,end+6);
}
function fixture() {
  const panels = consumers.map(([file,id],i) => {
    const code=read(file); const end=code.indexOf(`<div id="${id}"`);
    const start=code.lastIndexOf('<div class="anima-flex-row',end);
    assert(start>=0 && end>start,`Missing rule header: ${id}`);
    return `<section class="anima-card" data-panel="${i}" ${i?'hidden':''}>${code.slice(start,code.indexOf('</div>',end)+6)}</section>`;
  }).join('');
  const scripts=consumers.map(([file,id,variable,button,key],i)=>{
    const code=read(file);
    const start=code.indexOf(`${variable} = new RegexListComponent(`);
    const end=code.indexOf('\n  );',start);
    assert(start>0 && end>start,`Missing real constructor: ${id}`);
    const constructor=code.slice(start,end+6);
    const initial=i===5?rules.map(({regex,...rest})=>({...rest,content:regex})):rules;
    return `{
      const initial=${JSON.stringify(initial)};
      const settings={${key}:structuredClone(initial)};
      const currentSettings={regex_settings:settings};
      const globalSettings={content_settings:settings};
      const getGlobalBm25Settings=()=>globalSettings;
      const saveSummarySettings=()=>window.saves.push('summary');
      const saveStatusSettings=()=>window.saves.push('status');
      const renderGCPrompts=()=>window.saves.push('gc-preview');
      const rawSettings={gcConfig:{regex_list:initial}};
      ${i===5 ? code.slice(code.indexOf('  let gcSettings ='),code.indexOf('  const ensureCorePromptsExist')) : ''}
      let ${variable};
      ${constructor}
      ${variable}.render();
      const $tab=$('[data-panel="${i}"]');
      ${binding(code,button)}
      window.components.push(${variable});
      window.panels.push({get:()=>${i===5?'gcSettings.regex_list':`settings.${key}`},original:initial,raw:rawSettings});
    }`;
  }).join('\n');
  // These styles are injected by the real panels and coexist after tab switches.
  const inlineStyles = ['summary.js','rag.js','bm25.js'].map(file => read(file).match(/<style>[\s\S]*?<\/style>/)[0]).join('\n');
  const gcFunction = read('status_gc_ui.js').slice(read('status_gc_ui.js').indexOf('export function openGCManagementModal()'))
    .replace('export function','function');
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/st/css/fontawesome.min.css"><link rel="stylesheet" href="/st/css/solid.min.css">
    <link rel="stylesheet" href="/extension/style.css">${inlineStyles}<style>body{margin:0}[hidden]{display:none!important}</style>
    <div id="anima-overlay"><div class="anima-header-bar"><div class="anima-brand">Anima Memory System</div></div>
    <div class="anima-main-layout"><div class="anima-content-area"><div class="anima-tab-content active">${panels}</div></div></div></div>
    <script src="/st/lib/jquery-3.5.1.min.js"></script><script src="/st/lib/jquery-ui.min.js"></script><script src="/st/lib/jquery.ui.touch-punch.min.js"></script>
    <script type="module">import {RegexListComponent} from '/extension/scripts/regex_ui.js';
    import {applyRegexRules} from '/extension/scripts/utils.js';
    window.applyRegexRules=applyRegexRules;
    window.panels=[];window.components=[];window.saves=[];
    ${scripts}
    {
      const getGCSettings=()=>window.gcHost;
      const getContextData=()=>({charDesc:'',userPersona:''});
      const previewStatusPayload=async()=>({sourceFloorId:-1});
      const saveSettingsToCharacterCard=async payload=>window.gcSaved.push(payload);
      ${gcFunction}
      window.openRealGC=openGCManagementModal;
    }
    window.ready=true;</script>`;
}
const server=http.createServer((req,res)=>{
  try {
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture());return;}
    const root=pathname.startsWith('/extension/')?source:path.join(host,'public');
    const file=path.resolve(root,pathname.replace(/^\/(extension|st)\//,''));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    const types={'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
  }catch(error){res.writeHead(500);res.end(error.stack);}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,...(process.env.ANIMA_CHROMIUM_PATH?{executablePath:process.env.ANIMA_CHROMIUM_PATH}:{})});
  let checks=0;
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>window.ready,{},{timeout:10000});
    const snapshot=()=>page.evaluate(()=>window.panels.map(p=>p.get()));
    const original=await snapshot();
    if(output)fs.mkdirSync(output,{recursive:true});
    const shot=async name=>{if(output)await page.screenshot({path:path.join(output,name)});};
    for(const width of [320,360,390,430,768,1280]){
      await page.setViewportSize({width,height:844});
      for(const [i,[,id,,button]] of consumers.entries()){
        await page.evaluate(i=>document.querySelectorAll('[data-panel]').forEach((p,n)=>p.hidden=n!==i),i);
        const list=page.locator(`#${id}`);const row=list.locator('.anima-regex-item').first();
        assert.equal(await row.locator('.regex-text').innerText(),'<content> → </content>');
        assert.equal(await row.locator('.anima-tag').innerText(),'提取正文');
        assert.equal(await list.evaluate(el=>el.closest('.anima-content-area').scrollWidth>el.closest('.anima-content-area').clientWidth+1),false,`${id}: body overflow ${width}`);
        await row.locator('.btn-edit').click();
        assert.equal(await row.locator('.rule-start').inputValue(),'<content>');
        assert.equal(await row.locator('.rule-end').inputValue(),'</content>');
        assert.equal(await row.locator('.edit-type').isVisible(),false);
        assert(await row.locator('.rule-operation').evaluate(el=>el.getBoundingClientRect().height)>=42,`${id}: readable operation selector`);
        assert.equal(await row.locator('.rule-operation option').allTextContents().then(a=>a.join('|')),'提取正文|删除整块|移除标签之前|移除标签之后');
        assert.equal(await row.evaluate(el=>{
          const box=el.getBoundingClientRect();return [...el.querySelectorAll('input,select,textarea,button')].some(child=>{
            const r=child.getBoundingClientRect();return r.width&&(r.right>box.right+1||r.left<box.left-1);
          });
        }),false,`${id}: editor overflow ${width}`);
        await row.locator('.rule-start').fill('<changed>');await row.locator('.btn-cancel').click();
        assert.deepEqual(await snapshot(),original,'cancel must preserve every setting');
        await page.locator(`#${button}`).click();
        const modal=page.locator('.anima-rule-modal');
        assert(await modal.isVisible(),`${id}: real add binding`);
        assert.equal(await modal.evaluate(el=>{
          const content=el.querySelector('.anima-modal-content').getBoundingClientRect();
          return content.left<0||content.right>innerWidth+1||content.top<0||content.bottom>innerHeight+1;
        }),false,`${id}: modal outside viewport ${width}`);
        for (const operation of ['before','after']) {
          await modal.locator('.rule-operation').selectOption(operation);
          assert(await modal.locator('.rule-tag').isVisible(),`${id}: single label input`);
          assert.equal(await modal.locator('.rule-start').isVisible(),false);
          assert.equal(await modal.locator('.rule-end').isVisible(),false);
          assert.equal(await modal.locator('.rule-tags input:visible').count(),1);
        }
        await modal.locator('.anima-modal-footer .anima-close-regex-modal').click();
        checks++;
      }
    }
    assert.deepEqual(await snapshot(),original,'render/open/cancel must not migrate legacy records');
    // Exercise actual add callbacks and save callbacks, including summary postprocessing.
    for(const [i,[,id,,button]] of consumers.entries()){
      await page.evaluate(i=>document.querySelectorAll('[data-panel]').forEach((p,n)=>p.hidden=n!==i),i);
      const list=page.locator(`#${id}`);const row=list.locator('.anima-regex-item').first();
      await row.locator('.btn-edit').click();await row.locator('.btn-save').click();
      assert.deepEqual((await snapshot())[i],original[i],'unchanged save keeps exact regex, flags and unknown fields');
      assert.equal(await row.locator('.view-mode').isVisible(),true,`save callback succeeded: ${id}`);
      await page.locator(`#${button}`).click();
      const modal=page.locator('.anima-rule-modal');
      await modal.locator('.rule-confirm').click();
      assert(await modal.locator('.rule-error').isVisible(),'missing labels must not create a rule');
      assert.equal((await snapshot())[i].length,3);
      await modal.locator('.rule-operation').selectOption('exclude');
      await modal.locator('.rule-start').fill('<think>');await modal.locator('.rule-end').fill('</think>');
      await modal.locator('.rule-confirm').click();
      assert.equal(await modal.count(),0);
      const added=(await snapshot())[i].at(-1);
      assert.equal(added.type,'exclude');assert.equal(added[i===5?'content':'regex'],'/<think>[\\s\\S]*?<\\/think>/g');
      assert.equal(await list.locator('.anima-tag').last().innerText(),'删除整块');
      await list.locator('.btn-del').last().click();
      for (const operation of ['before','after']) {
        await page.locator(`#${button}`).click();
        await modal.locator('.rule-operation').selectOption(operation);
        await modal.locator('.rule-confirm').click();
        assert(await modal.locator('.rule-error').isVisible(),'single label cannot be empty');
        await modal.locator('.rule-tag').fill('<mark>');
        await modal.locator('.rule-confirm').click();
        const single=(await snapshot())[i].at(-1);
        assert.equal(single.type,'exclude','single label rules must remove text, not extract it');
        const result=await page.evaluate(({single,i})=>window.applyRegexRules('left<mark>middle<mark>right',
          [{regex:single[i===5?'content':'regex'],type:single.type}]),{single,i});
        assert.equal(result,operation==='before'?'middle<mark>right':'left');
        const addedRow=list.locator('.anima-regex-item').last();
        assert.equal(await addedRow.locator('.anima-tag').innerText(),operation==='before'?'移除标签之前':'移除标签之后');
        assert.equal(await addedRow.locator('.regex-text').innerText(),'<mark>');
        await addedRow.locator('.btn-edit').click();
        assert.equal(await addedRow.locator('.rule-operation').inputValue(),operation);
        assert.equal(await addedRow.locator('.rule-tag').inputValue(),'<mark>');
        await addedRow.locator('.rule-mode-toggle').click();
        assert.equal(await addedRow.locator('.edit-type').inputValue(),'exclude');
        await addedRow.locator('.rule-mode-toggle').click();
        await addedRow.locator('.btn-save').click();
        assert.deepEqual((await snapshot())[i].at(-1),single,'custom/tag roundtrip preserves single-label rule');
        await addedRow.locator('.btn-del').click();
      }
      await row.locator('.btn-edit').click();await row.locator('.rule-start').fill('<正文>');await row.locator('.rule-end').fill('</正文>');
      await row.locator('.btn-save').click();
      assert.equal((await snapshot())[i][0].privateOption,7);
      const custom=list.locator('.anima-regex-item').nth(2);
      await custom.locator('.btn-edit').click();
      assert.equal(await custom.locator('.edit-input').inputValue(),rules[2].regex);
      assert(await custom.locator('.edit-type').evaluate(el=>el.getBoundingClientRect().height)>=42,'custom selector remains usable on touch screens');
      await custom.locator('.rule-mode-toggle').click();
      assert(await custom.locator('.rule-error').isVisible());
      assert.equal(await custom.locator('.edit-input').inputValue(),rules[2].regex,'unconvertible custom must not be lost');
      await custom.locator('.edit-input').fill('/custom/g');await custom.locator('.edit-type').selectOption('exclude');
      await custom.locator('.btn-save').click();
      assert.equal((await snapshot())[i][2][i===5?'content':'regex'],'/custom/g');
      if(i<5){await row.locator('.anima-switch').tap();assert.equal((await snapshot())[i][0].enabled,false);}
      await page.evaluate(i=>{
        const c=window.components[i],list=c.$container;list.prepend(list.children().last());list.sortable('option','stop').call(list[0],{},{});
      },i);
      assert.equal((await snapshot())[i][0][i===5?'content':'regex'],'/custom/g');
    }
    assert.deepEqual(await page.evaluate(()=>window.panels[5].raw.gcConfig.regex_list),original[5],'GC changes stay in its local draft');
    assert.deepEqual(errors,[]);
    // A custom edit followed by switching back to tags must preserve the edited flags.
    await page.evaluate(()=>document.querySelectorAll('[data-panel]').forEach((p,n)=>p.hidden=n!==1));
    const roundtrip=page.locator('#anima_regex_list_post .anima-regex-item').nth(1);
    await roundtrip.locator('.btn-edit').click();
    await roundtrip.locator('.rule-mode-toggle').click();
    const exact='/<new>([\\s\\S]*?)<\\/new>/g';
    await roundtrip.locator('.edit-input').fill(exact);
    await roundtrip.locator('.rule-mode-toggle').click();await roundtrip.locator('.btn-save').click();
    assert.equal((await snapshot())[1][1].regex,exact);
    // Distinct panels own distinct add dialogs and callbacks.
    await page.evaluate(()=>{window.components[0].openAddModal();window.components[4].openAddModal();});
    assert.equal(await page.locator('.anima-rule-modal').count(),2);
    assert.equal(await page.locator('[id="anima_regex_list_pre-rule-modal"]').count(),1);
    await page.locator('#bm25_regex_list-rule-modal .rule-start').fill('<bm25>');
    await page.locator('#bm25_regex_list-rule-modal .rule-end').fill('</bm25>');
    await page.locator('#bm25_regex_list-rule-modal .rule-confirm').click();
    assert.equal((await snapshot())[0].length,3);assert.equal((await snapshot())[4].length,4);
    await page.locator('#anima_regex_list_pre-rule-modal .anima-modal-footer .anima-close-regex-modal').click();
    // Screenshots of real legacy hydration, normal edit, and the add form.
    await page.evaluate(()=>{window.panels[0].get().splice(0,99,...structuredClone(window.panels[0].original));window.components[0].render();
      document.querySelectorAll('[data-panel]').forEach((p,n)=>p.hidden=n!==0);});
    await page.setViewportSize({width:390,height:844});await shot('tag-list-mobile.png');
    await page.locator('#anima_regex_list_pre .btn-edit').first().click();await shot('tag-edit-mobile.png');
    await page.locator('.btn-cancel').first().click();await page.locator('#anima_btn_open_regex_modal_pre').click();
    await page.locator('.anima-rule-modal .rule-start').fill('<content>');await page.locator('.anima-rule-modal .rule-end').fill('</content>');
    await shot('tag-add-mobile.png');await page.keyboard.press('Escape');
    await page.setViewportSize({width:1280,height:844});await shot('tag-list-desktop.png');
    await page.setViewportSize({width:390,height:844});
    for (const operation of ['before','after']) {
      await page.locator('#anima_btn_open_regex_modal_pre').click();
      await page.locator('.anima-rule-modal .rule-operation').selectOption(operation);
      await page.locator('.anima-rule-modal .rule-tag').fill('<content>');
      await shot(`tag-remove-${operation}-mobile.png`);
      await page.keyboard.press('Escape');
    }
    // Run the entire GC modal at its actual body mount, including cancel and persistence boundary.
    await page.evaluate(()=>{
      document.querySelector('[data-panel="5"]').remove();
      window.gcSaved=[];
      window.gcHost={gcConfig:{reuse_regex:false,regex_list:structuredClone(window.panels[5].original)},gcPrompts:[]};
      window.openRealGC();
    });
    await page.setViewportSize({width:390,height:844});
    const gc=page.locator('#anima-gc-management-modal');
    await gc.locator('.btn-edit').first().click();
    await gc.locator('.rule-start').first().fill('<draft>');
    await gc.locator('.btn-save').first().click();
    await gc.locator('#btn-gc-add-regex').click();
    await page.locator('#gc_regex_list_container-rule-modal .rule-start').fill('<hidden>');
    await page.locator('#gc_regex_list_container-rule-modal .rule-end').fill('</hidden>');
    await page.locator('#gc_regex_list_container-rule-modal .rule-operation').selectOption('exclude');
    await page.locator('#gc_regex_list_container-rule-modal .rule-confirm').click();
    assert.deepEqual(await page.evaluate(()=>window.gcSaved),[],'editing a GC draft must not persist');
    await shot('tag-gc-mobile.png');
    await gc.locator('.anima-modal-footer .anima-close-gc-modal').click();
    await gc.waitFor({state:'detached'});
    await page.evaluate(()=>window.openRealGC());
    assert.equal(await gc.locator('.regex-text').first().innerText(),'<content> → </content>','GC cancel restores saved labels');
    assert.equal(await gc.locator('.anima-regex-item.is-row').count(),3,'GC cancel discards added rules');
    await gc.locator('.btn-edit').first().click();await gc.locator('.rule-start').first().fill('<saved>');await gc.locator('.btn-save').first().click();
    await gc.locator('#btn-gc-save-config').click();
    const payload=await page.evaluate(()=>window.gcSaved.at(-1));
    assert(payload.anima_gc_settings.regex_list[0].content.startsWith('/<saved>'));
    assert.equal(Object.hasOwn(payload.anima_gc_settings.regex_list[0],'regex'),false,'GC keeps original storage field');
    await gc.locator('.anima-modal-footer .anima-close-gc-modal').click();await gc.waitFor({state:'detached'});
    assert.deepEqual(errors,[]);
    console.log(`PASS: ${checks} real consumer/viewport combinations; single-label removal before/after including tags, literal engine output, legacy no-op/cancel, actual add/save callbacks, custom edit, toggle/delete/sort, GC draft, dialog isolation; no page errors.`);
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
