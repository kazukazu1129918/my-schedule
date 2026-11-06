// アプリの画面と接続用ライブラリだけをキャッシュする。
// 予定データ・認証APIの応答はキャッシュせず、画面側でアカウント別に保存する。
const APP_CACHE = 'kazu-schedule-shell-v1';
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const HOME = new URL('./', self.registration.scope).href;
const INDEX = new URL('index.html', self.registration.scope).href;
async function shellFetch(input, init = {}) {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
 try { return await fetch(input,{...init,signal:controller.signal}); } finally {clearTimeout(timer);}
}
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(APP_CACHE);
  const response = await shellFetch(INDEX, {cache:'reload'});
  if (!response.ok) throw new Error('APP_SHELL_UNAVAILABLE');
  await cache.put(INDEX, response);
  // 補助ファイルの失敗で画面の保存を止めない。
  await Promise.allSettled([SDK_URL, ...['manifest.webmanifest','icon-192.png','icon-512.png'].map(p=>new URL(p,HOME).href)].map(async url => {
    const response = await shellFetch(url, {cache:'reload'});
    if(response.ok) await cache.put(url,response);
  }));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys()) if(name.startsWith('kazu-schedule-shell-') && name!==APP_CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url), scope=new URL(self.registration.scope);
  const documentRequest=request.mode==='navigate' && url.origin===scope.origin &&
    (url.pathname===scope.pathname || url.pathname===new URL(INDEX).pathname);
  const staticRequest=request.url===SDK_URL || url.origin===scope.origin &&
    ['manifest.webmanifest','icon-192.png','icon-512.png'].some(p=>url.pathname===new URL(p,HOME).pathname);
  if(!documentRequest && !staticRequest)return;
  event.respondWith((async()=>{
    const cache=await caches.open(APP_CACHE);
    const key=documentRequest?INDEX:request.url;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(request,{signal:controller.signal});
      if(!response.ok)throw new Error('FETCH_FAILED');
      // URLのクエリには通知から開く日付等があるので、画面は同じキーで保存。
      await cache.put(key,response.clone());
      return response;
    }catch{
      const saved=await cache.match(key);
      return saved || new Response('通信中に一度予定表を開いてから、もう一度お試しください。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }finally{clearTimeout(timer);}
  })());
});

function notificationURL(value){
  const scope=new URL(self.registration.scope);
  try{
    const url=new URL(value||'./',scope);
    if(url.origin===scope.origin&&url.pathname.startsWith(scope.pathname))return url.href;
  }catch{}
  return scope.href;
}
self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{};}catch{}
  const title=typeof payload.title==='string'?payload.title.slice(0,100):'自分の予定表';
  const body=typeof payload.body==='string'?payload.body.slice(0,1500):'予定表からお知らせがあります。';
  event.waitUntil(self.registration.showNotification(title,{
    body,tag:typeof payload.tag==='string'?payload.tag:'schedule-notice',
    icon:new URL('icon-192.png',self.registration.scope).href,
    data:{url:notificationURL(payload.url)}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=notificationURL(event.notification.data?.url);
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if(client.url===target&&'focus'in client)return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
