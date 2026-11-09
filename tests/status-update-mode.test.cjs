const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test, before } = require('node:test');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
function statusFunction(name, next) {
  const code = read('scripts/status_logic.js');
  return code.slice(code.indexOf(`export ${name}`), code.indexOf(next, code.indexOf(`export ${name}`))).replace(/^export /, '');
}
const handleSource = statusFunction('async function handleStatusUpdate()', '\nfunction createCountdownUI(');
let modeApi;
before(async () => { modeApi = await import('../scripts/status_update_mode.js'); });

function handler(settings, message = { message_id: 2, role: 'assistant', message: '回复结束。' }) {
  const calls = { api: [], countdown: [], visible: 0, canceled: 0 };
  const sandbox = {
    console, settings, removeUIOverlay: null,
    cancelStatusTimer: () => calls.canceled++,
    getStatusSettings: () => settings,
    isManualStatusMode: settings => modeApi.isManualStatusMode(settings),
    checkReplyIntegrity: text => /[。>]$/.test(text),
    SillyTavern: { getContext: () => ({ userName: 'Player' }) },
    window: { TavernHelper: { getChatMessages: () => message ? [message] : [] }, dispatchEvent: () => calls.visible++ },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    triggerStatusUpdate: async id => calls.api.push(id),
    createCountdownUI: (seconds, run) => calls.countdown.push({ seconds, run }),
  };
  vm.createContext(sandbox);
  vm.runInContext(`${handleSource}\nthis.run = handleStatusUpdate`, sandbox);
  return { calls, run: sandbox.run };
}

for (const [name, settings, expected] of [
  ['legacy panel', { status_enabled: true, update_management: { panel_enabled: true } }, 'countdown'],
  ['explicit original', { status_enabled: true, update_management: { panel_enabled: true, update_mode: 'original' } }, 'countdown'],
  ['unknown mode', { status_enabled: true, update_management: { panel_enabled: true, update_mode: 'unknown' } }, 'countdown'],
  ['legacy auto', { status_enabled: true }, 'api'],
  ['panel disabled retains auto', { status_enabled: true, update_management: { panel_enabled: false, update_mode: 'manual' } }, 'api'],
  ['manual panel', { status_enabled: true, update_management: { panel_enabled: true, update_mode: 'manual' } }, 'visible'],
  ['master disabled', { status_enabled: false, update_management: { panel_enabled: true, update_mode: 'manual' } }, 'none'],
]) test(`${name}: preserves the requested status behavior`, async () => {
  const { calls, run } = handler(settings);
  await run();
  assert.equal(calls.countdown.length, expected === 'countdown' ? 1 : 0);
  assert.equal(calls.api.length, expected === 'api' ? 1 : 0);
  assert.equal(calls.visible, expected === 'none' ? 0 : 1);
  if (expected === 'countdown') {
    assert.equal(calls.countdown[0].seconds, 5);
    await calls.countdown[0].run();
    assert.deepEqual(calls.api, [2]);
  }
});

test('manual mode rejects user, absent and incomplete normal replies', async () => {
  for (const message of [null, { role: 'user', message: '用户。' }, { role: 'assistant', message: '未完成' }]) {
    const { calls, run } = handler({ status_enabled: true, update_management: { panel_enabled: true, update_mode: 'manual' } }, message);
    await run();
    assert.equal(calls.visible + calls.api.length + calls.countdown.length, 0);
  }
});

function watcherHarness({ mode = 'manual', tags = '<mutter>', text = '正文<mutter>' } = {}) {
  let snapshot = { chatId: 'chat', messageId: 2, swipeId: 0, role: 'assistant', text: '旧回复。' };
  let settings = { status_enabled: true, update_management: { panel_enabled: true, update_mode: mode, stop_sequence: tags } };
  let timer = null;
  const ready = [];
  const watcher = modeApi.createStoppedStatusWatcher({
    getSnapshot: () => snapshot, getSettings: () => settings, onReady: s => ready.push(s),
    setTimer: callback => { timer = callback; return 1; }, clearTimer: () => { timer = null; },
  });
  return { watcher, ready, settings, flush: () => { const run = timer; timer = null; run?.(); },
    generated: () => { snapshot = { ...snapshot, text }; },
    change: changed => { snapshot = { ...snapshot, ...changed }; },
  };
}

for (const order of ['render-first', 'end-first']) test(`stopped manual reply checks the configured ending after storage: ${order}`, () => {
  const h = watcherHarness();
  h.watcher.start();h.generated();h.watcher.stop();
  if (order === 'render-first') { h.watcher.render();h.flush();assert.equal(h.ready.length,0);h.watcher.end(); }
  else { h.watcher.end();h.watcher.render(); }
  h.flush();assert.equal(h.ready.length,1);
  h.watcher.render();h.watcher.end();h.flush();assert.equal(h.ready.length,1);
});

test('the original script can trim after generation end and a later render readies the button', () => {
  const h = watcherHarness({ text: '正文<mutter>多余文字' });
  h.watcher.start();h.generated();h.watcher.stop();h.watcher.end();h.flush();
  assert.equal(h.ready.length,0);
  h.change({ text:'正文<mutter>' });h.watcher.render();h.flush();
  assert.equal(h.ready.length,1);
});

for (const [name, options] of [
  ['original mode', {mode:'original'}], ['missing configured tag', {tags:''}],
  ['punctuation alone', {text:'被手动停止的句子。'}], ['tag only in middle', {text:'正文<mutter>多余文字'}],
]) test(`stopped reply does not gain tag compatibility: ${name}`, () => {
  const h=watcherHarness(options);h.watcher.start();h.generated();h.watcher.stop();h.watcher.end();h.flush();
  assert.equal(h.ready.length,0);
});

for (const invalid of ['chat','generation','floor','swipe','user','empty','disabled','unchanged','ordinary-end']) test(`stopped checks reject stale or invalid replies: ${invalid}`, () => {
  const h=watcherHarness();h.watcher.start();
  if(invalid!=='unchanged')h.generated();
  if(invalid!=='ordinary-end')h.watcher.stop();
  h.watcher.end();
  if(invalid==='chat'){h.change({chatId:'other'});h.watcher.reset();}
  if(invalid==='generation')h.watcher.start();
  if(invalid==='floor')h.change({messageId:3});
  if(invalid==='swipe')h.change({swipeId:1});
  if(invalid==='user')h.change({role:'user'});
  if(invalid==='empty')h.change({text:''});
  if(invalid==='disabled')h.settings.status_enabled=false;
  h.flush();assert.equal(h.ready.length,0);
});

test('ending tags preserve comma-separated literal matching and ignore trailing whitespace', () => {
  for(const [text,tags,expected] of [
    ['正文<mutter>','<mutter>',true],['正文END  ',' <mutter>， END ',true],
    ['正文[a.+]','[a.+]',true],['正文[aZZ]','[a.+]',false],
    ['正文。','',false],['正文<mutter>之后','<mutter>',false],['','<mutter>',false],
  ])assert.equal(modeApi.matchesConfiguredStatusEnd(text,{update_management:{stop_sequence:tags}}),expected);
});

test('the actual stopped-generation handler refreshes a tagged reply without entering original automation', async () => {
  const h=watcherHarness();h.watcher.start();h.generated();h.watcher.stop();
  const index=read('index.js');const start=index.indexOf('      context.eventSource.on("generation_ended",');
  const end=index.indexOf('      context.eventSource.on("message_edited",',start);let handler;
  vm.runInNewContext(index.slice(start,end),{
    context:{eventSource:{on:(_name,callback)=>{handler=callback;}}},
    stoppedStatusWatcher:h.watcher,wasGenerationStopped:true,isGenerationActive:true,
    setSwipeState(){},console:{log(){}},
  });
  await handler();h.flush();assert.equal(h.ready.length,1);
});

test('reply matching requires the current AI floor, swipe and exact stored text', () => {
  const detail={chatId:'chat',messageId:2,swipeId:1,text:'正文<mutter>'};
  const context={chatId:'chat',chat:[{},{},{swipe_id:1}]};
  const message={message_id:2,role:'assistant',message:detail.text};
  assert.equal(modeApi.matchesStatusReply(detail,context,message),true);
  for(const changed of [{messageId:1},{swipeId:0},{text:'旧正文'},{chatId:'other'},{text:''}])
    assert.equal(modeApi.matchesStatusReply({...detail,...changed},context,message),false);
});

test('manual status is consumed on success and retained on failure or abort without an automatic request', async () => {
  const code=read('scripts/status_logic.js');const start=code.indexOf('let pendingStoppedReply = null;');
  const end=code.indexOf('\n// ==========================================',start);
  for(const result of [true,false,'aborted']){
    let calls=0,events=0;
    const message={message_id:2,role:'assistant',message:'正文<mutter>'};
    const context={chatId:'chat',chat:[{},{},{swipe_id:1}]};
    const sandbox={...modeApi,console,
      getStatusSettings:()=>({status_enabled:true,update_management:{panel_enabled:true,update_mode:'manual',stop_sequence:'<mutter>'}}),
      SillyTavern:{getContext:()=>context},
      window:{TavernHelper:{getChatMessages:()=>[message]},dispatchEvent:()=>events++},
      CustomEvent:class{},cancelStatusTimer(){},getTargetAIFloor:()=>message,
      triggerStatusUpdate:async()=>{calls++;return result===true;},
    };
    vm.createContext(sandbox);
    vm.runInContext(`${code.slice(start,end).replace(/\bexport /g,'')}\nthis.api={handleStoppedStatusReady,isPendingStoppedReply,triggerManualSync};`,sandbox);
    const {api}=sandbox;
    api.handleStoppedStatusReady({chatId:'chat',messageId:2,swipeId:1,text:message.message});
    assert.equal(calls,0);assert.equal(events,1);assert.equal(api.isPendingStoppedReply(message),true);
    const succeeded=await api.triggerManualSync(result==='aborted'?{signal:{aborted:true}}:{});
    assert.equal(calls,result==='aborted'?0:1);assert.equal(succeeded,result===true);
    assert.equal(api.isPendingStoppedReply(message),result!==true);
  }
});
