const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
assert(process.env.SILLYTAVERN_ROOT, 'Set SILLYTAVERN_ROOT for jQuery/font assets');
const assets = path.resolve(process.env.SILLYTAVERN_ROOT, 'public');
const output = process.env.ANIMA_UI_OUTPUT;
assert(process.env.ANIMA_AUTOSTOP_SCRIPT, 'Set ANIMA_AUTOSTOP_SCRIPT to the unchanged auto-stop JSON');
const autoStopScript = JSON.parse(fs.readFileSync(process.env.ANIMA_AUTOSTOP_SCRIPT, 'utf8').replace(/^\uFEFF/,'')).content;
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `Missing actual source section: ${start}`);
  return source.slice(a, b).replace(/\bexport /g, '');
}
function fixture() {
  const ui = read('scripts/status.js'), logic = read('scripts/status_logic.js');
  const template = ui.match(/const updateManagementHtml = (`[\s\S]*?`);/)[1];
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="/st/css/fontawesome.min.css"><link rel="stylesheet" href="/st/css/solid.min.css">
  <link rel="stylesheet" href="/extension/style.css">
  <style>body{margin:0;background:#111827;color:#eee;font-family:system-ui}#status-yaml-content{box-sizing:border-box;width:100%;height:100px}#anima-overlay .anima-content-area{padding:16px}#anima-floating-sync-btn{z-index:30000}</style>
  <div id="anima-overlay"><div class="anima-header-bar"><div class="anima-brand">Anima Memory System</div></div>
  <div class="anima-main-layout"><div class="anima-content-area"><div class="anima-tab-content active">
  <div id="management"></div><div class="anima-card"><span>当前状态</span><textarea id="status-yaml-content"></textarea><span id="val-source-floor-id"></span><span id="val-current-floor-id"></span><span id="val-status-char-count"></span></div>
  </div></div></div></div><div id="send_form"></div>
  <script src="/st/lib/jquery-3.5.1.min.js"></script>
  <script type="module">
  import {createStoppedStatusWatcher,isManualStatusMode,matchesStatusReply,matchesConfiguredStatusEnd} from '/extension/scripts/status_update_mode.js';
  let currentSettings=JSON.parse(localStorage.getItem('settings')||'null')||{status_enabled:true,update_management:{panel_enabled:true}};
  let floatingSyncController=null,floatingSyncPromise=null,floatingSyncCancelPrompt=null,floatingSyncCancelPromptClose=null;
  const FLOATING_SYNC_DRAG_THRESHOLD=5;
  const context={chatId:'component-test',userName:'Player',chat:[{}, {swipe_id:0}]};
  let message={message_id:1,role:'assistant',message:'这是一段已经结束的回复。'};
  let vars={},apiCalls=0,allowReply;
  const extensionSettings={},ROOT_KEY='anima_memory_system',SUB_KEY='status';
  const saveSettingsDebounced=()=>localStorage.setItem('settings',JSON.stringify(extensionSettings[ROOT_KEY][SUB_KEY]));
  const getStatusSettings=()=>currentSettings;
  window.SillyTavern={getContext:()=>context};
  window.TavernHelper={getChatMessages:()=>[message],getVariables:()=>vars};
  const getTargetAIFloor=()=>message;
  const findBaseStatus=()=>({id:0,data:{人物:'一刀',状态:'等待本轮手动更新'}});
  const scanChatForStatus=()=>[];
  const objectToYaml=obj=>Object.entries(obj).map(([k,v])=>k+': '+v).join('\\n');
  const checkReplyIntegrity=text=>/[。>]$/.test(text);
  const triggerStatusUpdate=async(id,{signal}={})=>{
    apiCalls++;
    const success=await new Promise(resolve=>{
      allowReply=()=>resolve(true);
      signal?.addEventListener('abort',()=>resolve(false),{once:true});
    });
    if(success)vars={anima_data:{人物:'一刀',状态:'本轮已同步'}};
    return success;
  };
  ${between(logic, 'export function saveStatusSettings(', '\n// ==========================================')}
  ${between(logic, 'let pendingStoppedReply = null;', '\n// ==========================================')}
  ${between(logic, 'let updateTimer = null;', '\nexport function initStatusMacro()')}
  ${between(ui, 'function escapeHtml(', '\nfunction initUpdateManagementModule()')}
  ${between(ui, 'function initUpdateManagementModule()', '\nasync function showStatusPreviewModal()')}
  ${between(ui, 'export function refreshStatusPanel()', '\nfunction showYamlFixPreviewModal(')}
  ${between(ui, 'function isAbortError(', '\n// 2. 核心检测逻辑')}
  const updateSettings=currentSettings.update_management||{};
  document.getElementById('management').innerHTML=${template};
  initUpdateManagementModule();initFloatingSyncButton();
  window.addEventListener('anima:status_updated',refreshStatusPanel);
  const watcher=createStoppedStatusWatcher({getSnapshot:getStatusReplySnapshot,getSettings:getStatusSettings,onReady:handleStoppedStatusReady});
  // Execute the user's unchanged script, including marker matching and trimming.
  const scriptHandlers=new Map();
  const eventOn=(event,fn)=>scriptHandlers.set(event,fn);
  const tavern_events={GENERATION_STARTED:'start',GENERATION_STOPPED:'stop',GENERATION_ENDED:'end',CHAT_CHANGED:'chat',STREAM_TOKEN_RECEIVED:'token',CHARACTER_MESSAGE_RENDERED:'render'};
  const getVariables=()=>({enabled:true,marker:'<mutter>',from:'</content>,<talk>',needPair:true});
  const replaceVariables=()=>{};
  const getChatMessages=()=>[message];
  const setChatMessages=async rows=>{await Promise.resolve();message.message=rows[0].message;watcher.render();await scriptHandlers.get('render')?.(rows[0].message_id);};
  const getButtonEvent=()=> 'script-button';
  const _={mapValues:(obj,fn)=>Object.fromEntries(Object.entries(obj).map(([key,value])=>[key,fn(value,key)]))};
  window.toastr={error:console.error,warning:console.warn,info(){},success(){}};
  window.SillyTavern.stopGeneration=()=>{watcher.stop();watcher.end();};
  ${autoStopScript}
  window.testHost={
    settings:()=>currentSettings,calls:()=>apiCalls,
    finish:()=>{vars={};message.message='这是一段已经结束的回复。';return handleStatusUpdate();},
    cut:async(over='多余的字')=>{
      vars={anima_data:{人物:'一刀',状态:'旧滑动页的状态'}};
      watcher.start();clearPendingStoppedReply();scriptHandlers.get('start')();
      context.chat[1].swipe_id++;
      message.message='<content>故事正文</content><mutter>'+over;
      scriptHandlers.get('token')(message.message);
      await scriptHandlers.get('render')(1);
    },
    resolve:()=>allowReply(),refresh:refreshStatusPanel,
    enableLongStatus:()=>{currentSettings.update_management.char_threshold=1;refreshStatusPanel();},
    overlay:show=>document.getElementById('anima-overlay').classList.toggle('anima-hidden',!show),
    pending:()=>isPendingStoppedReply(message),text:()=>message.message,
  };
  refreshStatusPanel();window.ready=true;
  </script>`;
}
const server = http.createServer((req,res) => {
  try {
    const url = new URL(req.url,'http://localhost').pathname;
    if(url === '/') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture());return;}
    const base = url.startsWith('/extension/') ? root : assets;
    const file = path.resolve(base,url.replace(/^\/(extension|st)\//,''));
    if(!file.startsWith(base+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
    res.end(fs.readFileSync(file));
  }catch(error){res.writeHead(500);res.end(error.stack);}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,...(process.env.ANIMA_CHROMIUM_PATH?{executablePath:process.env.ANIMA_CHROMIUM_PATH}:{})});
  const errors=[],report=[];
  try {
    if(output) fs.mkdirSync(output,{recursive:true});
    for(const width of [390,1280]){
      const page=await browser.newPage({viewport:{width,height:900}});
      await page.clock.install();
      page.on('pageerror',error=>{errors.push(String(error));console.error('Browser:',String(error));});
      page.on('console',message=>{if(message.type()==='error')console.error('Console:',message.text());});
      const response = await page.goto(`http://127.0.0.1:${server.address().port}`);
      assert.equal(response.status(),200,await response.text());
      await page.waitForFunction(()=>window.ready,null,{timeout:10000}).catch(async error=>{
        if(output){fs.writeFileSync(path.join(output,'fixture-debug.html'),fixture());await page.screenshot({path:path.join(output,'failure.png')});}
        throw error;
      });
      assert.equal(await page.locator('#status_update_mode').inputValue(),'original');
      await page.evaluate(()=>testHost.finish());
      assert.equal(await page.locator('#anima-status-countdown').count(),1);
      await page.locator('#status_stop_sequence').fill('<mutter>');
      await page.locator('#btn-save-update-config').click();
      await page.locator('#status_update_mode').selectOption('manual');
      assert.equal(await page.locator('#anima-status-countdown').count(),0,'switch cancels existing countdown');
      await page.reload();await page.waitForFunction(()=>window.ready);
      assert.equal(await page.locator('#status_update_mode').inputValue(),'manual','mode persists');
      await page.evaluate(()=>testHost.finish());
      // Advance actual browser timers past the old five-second timeout.
      await page.clock.runFor(6500);
      assert.equal(await page.evaluate(()=>testHost.calls()),0);
      assert.equal(await page.locator('#anima-status-countdown').count(),0);
      await page.locator('#anima-floating-sync-btn').waitFor({state:'visible'});
      const bounds=await page.locator('#status_update_mode').boundingBox();
      assert(bounds.x>=0 && bounds.x+bounds.width<=width,'selector stays inside viewport');
      if(output)await page.screenshot({path:path.join(output,`settings-${width}.png`),fullPage:true,animations:'disabled'});
      await page.evaluate(()=>testHost.cut());await page.clock.runFor(100);
      assert.equal(await page.evaluate(()=>testHost.text()),'<content>故事正文</content><mutter>');
      assert.equal(await page.evaluate(()=>testHost.pending()),true,'stopped swipe with old vars is pending');
      await page.clock.runFor(6500);
      assert.equal(await page.evaluate(()=>testHost.calls()),0);
      await page.evaluate(()=>testHost.enableLongStatus());
      assert.equal(await page.locator('#anima-floating-sync-btn').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(239, 68, 68)');
      await page.evaluate(()=>testHost.overlay(false));
      // Mouse drag must not send a request; the following genuine click must.
      let box=await page.locator('#anima-floating-sync-btn').boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
      await page.mouse.move(box.x+box.width/2-40,box.y+box.height/2-40);await page.mouse.up();
      assert.equal(await page.evaluate(()=>testHost.calls()),0);
      await page.locator('#anima-floating-sync-btn').click();
      assert.equal(await page.evaluate(()=>testHost.calls()),1);
      await page.locator('#anima-floating-sync-btn i.fa-spinner').waitFor();
      if(output)await page.screenshot({path:path.join(output,`manual-request-${width}.png`)});
      await page.evaluate(()=>testHost.resolve());await page.clock.runFor(300);
      assert.equal(await page.evaluate(()=>testHost.pending()),false);
      assert.equal(await page.locator('#anima-floating-sync-btn').isVisible(),false);
      // The zero-overflow stop also readies the button. Cancellation retains it.
      await page.evaluate(()=>testHost.cut(''));await page.clock.runFor(100);
      await page.locator('#anima-floating-sync-btn').click();
      await page.locator('#anima-floating-sync-btn').click();
      await page.locator('[data-action="cancel"]').click();await page.clock.runFor(300);
      assert.equal(await page.evaluate(()=>testHost.pending()),true);
      assert.equal(await page.locator('#anima-floating-sync-btn').isVisible(),true);
      await page.evaluate(()=>testHost.overlay(true));
      await page.locator('#status_panel_enabled').locator('..').click();
      assert.equal(await page.locator('#status_update_mode').isDisabled(),true);
      report.push({width,checks:'original countdown; cancel on manual selection; saved/reloaded; no countdown/API after 6.5s; unchanged original script cut and no-overflow; old swipe vars; red threshold; drag; click/loading/success/cancel; panel-disabled selector'});
      await page.close();
    }
    assert.deepEqual(errors,[]);
    if(output)fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({report,errors},null,2));
    console.log(JSON.stringify({viewports:report.length,report,errors},null,2));
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
