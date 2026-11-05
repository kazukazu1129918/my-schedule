// 通知の受信専用。予定データやページをキャッシュしない。
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
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
